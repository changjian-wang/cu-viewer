// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WordLayer } from "./WordLayer";

const originalContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
afterEach(() => {
    cleanup(); vi.restoreAllMocks();
    if (originalContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalContext);
});

const words = [{ key: "word", polygon: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 30 }, { x: 10, y: 30 }] }];

function context() {
    const value = { clearRect: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0 };
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => value });
    return value;
}

describe("independent OCR word canvas", () => {
    it("draws original projected polygons with Studio fill and1px stroke at the actual raster/CSS ratio", () => {
        const drawing = context();
        render(<WordLayer words={words} size={{ width: 100.25, height: 100 }} pageNumber={1} contentId="/contents/0" dpr={2} />);
        const canvas = screen.getByTestId<HTMLCanvasElement>("word-overlay");
        expect(canvas.width).toBe(201);
        expect(canvas.height).toBe(200);
        expect(drawing.setTransform).toHaveBeenCalledWith(201 / 100.25, 0, 0, 2, 0, 0);
        expect(drawing.fillStyle).toBe("#FAFF7F40");
        expect(drawing.strokeStyle).toBe("#FAFF7F40");
        expect(drawing.lineWidth).toBe(1);
        expect(drawing.moveTo).toHaveBeenCalledWith(10, 20);
        expect(drawing.lineTo.mock.calls).toEqual([[40, 20], [40, 30], [10, 30]]);
        expect(drawing.fill).toHaveBeenCalledOnce();
        expect(drawing.stroke).toHaveBeenCalledOnce();
        expect(canvas.getAttribute("aria-hidden")).toBe("true");
        expect(canvas.getAttribute("data-word-count")).toBe("1");
    });

    it("clears backing storage on unmount without owning the source raster", () => {
        context();
        const view = render(<WordLayer words={words} size={{ width: 100, height: 100 }} pageNumber={1} contentId="/contents/0" dpr={1} />);
        const canvas = screen.getByTestId<HTMLCanvasElement>("word-overlay");
        view.unmount();
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it("reports context failures explicitly rather than returning a blank success layer", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
        render(<WordLayer words={words} size={{ width: 100, height: 100 }} pageNumber={1} contentId="/contents/0" dpr={1} />);
        expect(screen.getByRole("alert").textContent).toContain("OCR word layer rendering is unavailable");
        expect(screen.getByTestId<HTMLCanvasElement>("word-overlay").width).toBe(0);
    });
});
