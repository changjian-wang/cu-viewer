// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { LoadedSource } from "./source";
import { useSourceRendering } from "./useSourceRendering";

const available = { width: 800, height: 650 };
const canvasContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
const drawImage = vi.fn();

function source(render: LoadedSource["render"]): LoadedSource {
    return {
        kind: "image", name: "test.png", pages: [{ pageNumber: 1, width: 100, height: 50 }],
        render, dispose: vi.fn().mockResolvedValue(undefined),
    };
}

function Harness({ source, onRenderReady, pageNumber = 1 }: {
    source: LoadedSource | null; onRenderReady: (ready: boolean) => void; pageNumber?: number;
}) {
    const rendering = useSourceRendering({
        source, page: source?.pages.find(page => page.pageNumber === pageNumber),
        pageNumber, zoom: 1, rotation: 0, available, loading: false, error: null, onRenderReady,
    });
    return <div ref={rendering.renderedPage} data-testid="frame" data-ready={rendering.ready}
        style={{ width: rendering.size?.width, height: rendering.size?.height }}>
        <canvas ref={rendering.canvas} data-testid="canvas" />
        {rendering.renderError && <span role="alert">{rendering.renderError}</span>}
    </div>;
}

beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage }) });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: 100, height: 50 }));
});

afterEach(() => {
    cleanup();
    if (canvasContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", canvasContext);
    vi.restoreAllMocks();
    drawImage.mockClear();
});

describe("source rendering ownership", () => {
    it("commits the rendered raster and releases its scratch canvas", async () => {
        const onRenderReady = vi.fn();
        let scratch: HTMLCanvasElement | undefined;
        const loaded = source((_page, canvas) => {
            scratch = canvas;
            canvas.width = 200;
            canvas.height = 100;
            return Promise.resolve({ width: 100, height: 50 });
        });
        render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("true"));
        expect(screen.getByTestId("canvas").getAttribute("width")).toBe("200");
        expect(drawImage).toHaveBeenCalledOnce();
        expect(onRenderReady.mock.calls).toEqual([[false], [true]]);
        expect(scratch?.width).toBe(0);
        expect(scratch?.height).toBe(0);
    });

    it("cancels obsolete work and never commits a stale source completion", async () => {
        const onRenderReady = vi.fn();
        let signal: AbortSignal | undefined;
        let complete!: (value: { width: number; height: number }) => void;
        const first = source((_page, _canvas, _zoom, _rotation, renderSignal) => {
            signal = renderSignal;
            return new Promise(resolve => { complete = resolve; });
        });
        const second = source((_page, canvas) => {
            canvas.width = 200;
            canvas.height = 100;
            return Promise.resolve({ width: 100, height: 50 });
        });
        const { rerender } = render(<Harness source={first} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(signal).toBeDefined());
        rerender(<Harness source={second} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("true"));
        expect(signal?.aborted).toBe(true);
        await act(async () => { complete({ width: 300, height: 400 }); await Promise.resolve(); });
        expect(screen.getByTestId("frame").style.width).toBe("100px");
        expect(drawImage).toHaveBeenCalledOnce();
        expect(onRenderReady.mock.calls.filter(([ready]) => ready)).toHaveLength(1);
    });

    it("aborts pending work on unmount without reporting success", async () => {
        let signal: AbortSignal | undefined;
        const loaded = source((_page, _canvas, _zoom, _rotation, renderSignal) => {
            signal = renderSignal;
            return new Promise(() => {});
        });
        const onRenderReady = vi.fn();
        const { unmount } = render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(signal).toBeDefined());
        unmount();
        expect(signal?.aborted).toBe(true);
        expect(onRenderReady).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("surfaces render failures and keeps the raster unavailable", async () => {
        const onRenderReady = vi.fn();
        const loaded = source(() => Promise.reject(new Error("Render failed")));
        render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        expect((await screen.findByRole("alert")).textContent).toBe("Render failed");
        expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("false");
        expect(onRenderReady.mock.calls.some(([ready]) => ready)).toBe(false);
    });

    it("reports a missing page rather than starting a render", async () => {
        const renderSource = vi.fn();
        render(<Harness source={source(renderSource)} pageNumber={2} onRenderReady={vi.fn()} />);
        expect((await screen.findByRole("alert")).textContent).toBe("The requested page is not present in this source.");
        expect(renderSource).not.toHaveBeenCalled();
    });
});
