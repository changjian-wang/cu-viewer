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

function Harness({ source, onRenderReady, pageNumber = 1, zoom = 1, rotation = 0, loading = false, error = null }: {
    source: LoadedSource | null; onRenderReady: (ready: boolean) => void; pageNumber?: number;
    zoom?: number; rotation?: number; loading?: boolean; error?: string | null;
}) {
    const rendering = useSourceRendering({
        source, page: source?.pages.find(page => page.pageNumber === pageNumber),
        pageNumber, zoom, rotation, available, loading, error, onRenderReady,
    });
    return <><div ref={rendering.renderedPage} data-testid="frame" data-ready={rendering.ready}
        data-preview={rendering.hasPreview} data-layers={rendering.layersReady}
        style={{ width: rendering.size?.width, height: rendering.size?.height, visibility: rendering.hasPreview ? "visible" : "hidden" }}>
        <canvas ref={rendering.canvas} data-testid="canvas" />
    </div>
        {rendering.renderError && <span role="alert">{rendering.renderError}</span>}
    </>;
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
    it("keeps the previous painted raster during zoom while aborting obsolete work and waiting for current layers", async () => {
        const jobs: { signal: AbortSignal; canvas: HTMLCanvasElement; finish: () => void }[] = [];
        const loaded = source((_page, canvas, zoom, _rotation, signal) => {
            canvas.width = 200 * zoom;
            canvas.height = 100 * zoom;
            return new Promise(resolve => {
                jobs.push({ signal, canvas, finish: () => resolve({ width: 100 * zoom, height: 50 * zoom }) });
            });
        });
        const onRenderReady = vi.fn();
        const { rerender } = render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(jobs).toHaveLength(1));
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("false");
        await act(async () => { jobs[0]!.finish(); await Promise.resolve(); });
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("true"));
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true");
        expect(screen.getByTestId("canvas").getAttribute("width")).toBe("200");
        rerender(<Harness source={loaded} zoom={2} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(jobs).toHaveLength(2));
        expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("false");
        expect(screen.getByTestId("frame").getAttribute("data-layers")).toBe("false");
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true");
        expect(screen.getByTestId("frame").style.visibility).toBe("visible");
        expect(screen.getByTestId("canvas").getAttribute("width")).toBe("200");
        expect(onRenderReady).toHaveBeenLastCalledWith(false);
        rerender(<Harness source={loaded} zoom={3} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(jobs).toHaveLength(3));
        expect(jobs[1]!.signal.aborted).toBe(true);
        await act(async () => { jobs[1]!.finish(); await Promise.resolve(); });
        expect(drawImage).toHaveBeenCalledOnce();
        expect(screen.getByTestId("canvas").getAttribute("width")).toBe("200");
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true");
        expect(jobs[1]!.canvas.width).toBe(0);
        await act(async () => { jobs[2]!.finish(); await Promise.resolve(); });
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("true"));
        expect(screen.getByTestId("frame").getAttribute("data-layers")).toBe("true");
        expect(screen.getByTestId("canvas").getAttribute("width")).toBe("600");
        expect(drawImage).toHaveBeenCalledTimes(2);
        expect(onRenderReady).toHaveBeenLastCalledWith(true);
        expect(jobs.every(job => job.canvas.width === 0 && job.canvas.height === 0)).toBe(true);
    });

    it.each(["source", "page", "rotation"] as const)("never retains an incompatible %s preview", async change => {
        let first = true;
        const loaded = source((_page, canvas) => {
            canvas.width = 200; canvas.height = 100;
            if (!first) return new Promise(() => {});
            first = false;
            return Promise.resolve({ width: 100, height: 50 });
        });
        loaded.pages.push({ pageNumber: 2, width: 100, height: 50 });
        const replacement = source(() => new Promise(() => {}));
        const onRenderReady = vi.fn();
        const { rerender } = render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true"));
        rerender(<Harness source={change === "source" ? replacement : loaded}
            pageNumber={change === "page" ? 2 : 1} rotation={change === "rotation" ? 90 : 0} onRenderReady={onRenderReady} />);
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("false");
        expect(screen.getByTestId("frame").style.visibility).toBe("hidden");
        expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("false");
        expect(onRenderReady).toHaveBeenLastCalledWith(false);
        expect(drawImage).toHaveBeenCalledOnce();
    });

    it.each(["loading", "error"] as const)("hides an existing preview during explicit source %s", async state => {
        const loaded = source((_page, canvas) => {
            canvas.width = 200; canvas.height = 100;
            return Promise.resolve({ width: 100, height: 50 });
        });
        const onRenderReady = vi.fn();
        const { rerender } = render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true"));
        rerender(<Harness source={loaded} loading={state === "loading"} error={state === "error" ? "Source failed" : null}
            onRenderReady={onRenderReady} />);
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("false");
        expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("false");
        expect(screen.getByTestId("frame").style.visibility).toBe("hidden");
    });

    it("surfaces a failed zoom and does not resurrect its retained raster on retry", async () => {
        let calls = 0;
        const loaded = source((_page, canvas) => {
            calls++;
            if (calls === 2) return Promise.reject(new Error("Zoom render failed"));
            if (calls > 2) return new Promise(() => {});
            canvas.width = 200; canvas.height = 100;
            return Promise.resolve({ width: 100, height: 50 });
        });
        const onRenderReady = vi.fn();
        const { rerender } = render(<Harness source={loaded} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("true"));
        rerender(<Harness source={loaded} zoom={2} onRenderReady={onRenderReady} />);
        expect((await screen.findByRole("alert")).textContent).toBe("Zoom render failed");
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("false");
        expect(onRenderReady).toHaveBeenLastCalledWith(false);
        rerender(<Harness source={loaded} zoom={3} onRenderReady={onRenderReady} />);
        await waitFor(() => expect(calls).toBe(3));
        expect(screen.getByTestId("frame").getAttribute("data-preview")).toBe("false");
        expect(screen.getByTestId("frame").getAttribute("data-ready")).toBe("false");
        expect(drawImage).toHaveBeenCalledOnce();
        expect(onRenderReady.mock.calls.filter(([ready]) => ready)).toHaveLength(1);
    });

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
