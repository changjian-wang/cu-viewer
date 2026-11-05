// @vitest-environment jsdom
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SourceDocumentControls } from "./SourceDocumentControls";

afterEach(cleanup);

function props(): Parameters<typeof SourceDocumentControls>[0] {
    return {
        source: { kind: "pdf", name: "source.pdf", pages: [
            { pageNumber: 1, width: 612, height: 792 }, { pageNumber: 2, width: 612, height: 792 },
        ], render: vi.fn(), dispose: vi.fn() },
        pageNumber: 1, zoom: 1, minZoom: 0.25, maxZoom: 3, ready: true, fit: "page",
        controlsRef: createRef<HTMLDivElement>(),
        onPage: vi.fn(), onZoom: vi.fn(), onFit: vi.fn(), onRotate: vi.fn(), onControlFocus: vi.fn(),
    };
}

describe("bottom document controls", () => {
    it("contains document navigation and zoom without a selection-status slot", () => {
        render(<SourceDocumentControls {...props()} />);
        expect(screen.queryByRole("group", { name: "Source selection and location" })).toBeNull();
        expect(screen.getByRole("group", { name: "Document navigation and zoom" })).toBeTruthy();
    });

    it("validates page input and retains Enter and blur navigation", () => {
        const callbacks = props();
        render(<SourceDocumentControls {...callbacks} />);
        const input = screen.getByRole("textbox", { name: "Page number" });
        fireEvent.change(input, { target: { value: "3" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(screen.getByRole("alert").textContent).toBe("Enter an existing page number.");
        expect(callbacks.onPage).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: "2" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(callbacks.onPage).toHaveBeenLastCalledWith(2);
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.change(input, { target: { value: "1" } });
        fireEvent.blur(input);
        expect(callbacks.onPage).toHaveBeenLastCalledWith(1);
    });

    it("cycles page-action callbacks and tooltips at both boundaries without navigating on hover", () => {
        const callbacks = props(), source = callbacks.source;
        if (!source) throw new Error("A source fixture is required.");
        const threePageSource = { ...source, pages: [...source.pages, { pageNumber: 3, width: 612, height: 792 }] };
        const { rerender } = render(<SourceDocumentControls {...callbacks} source={threePageSource} pageNumber={2} />);
        const previous = screen.getByRole<HTMLButtonElement>("button", { name: "Previous page" });
        const next = screen.getByRole<HTMLButtonElement>("button", { name: "Next page" });
        expect(previous.title).toBe("Previous page");
        expect(next.title).toBe("Next page");
        expect(previous.disabled).toBe(false);
        expect(next.disabled).toBe(false);
        fireEvent.mouseOver(previous);
        fireEvent.mouseOver(next);
        expect(callbacks.onPage).not.toHaveBeenCalled();
        fireEvent.click(previous);
        expect(callbacks.onPage).toHaveBeenLastCalledWith(1);
        fireEvent.click(next);
        expect(callbacks.onPage).toHaveBeenLastCalledWith(3);
        rerender(<SourceDocumentControls {...callbacks} source={threePageSource} pageNumber={1} />);
        expect(previous.title).toBe("Previous page (last page)");
        expect(previous.disabled).toBe(false);
        expect(next.title).toBe("Next page");
        fireEvent.click(previous);
        expect(callbacks.onPage).toHaveBeenLastCalledWith(3);
        rerender(<SourceDocumentControls {...callbacks} source={threePageSource} pageNumber={3} />);
        expect(previous.title).toBe("Previous page");
        expect(next.title).toBe("Next page (first page)");
        expect(next.disabled).toBe(false);
        fireEvent.click(next);
        expect(callbacks.onPage).toHaveBeenLastCalledWith(1);
        rerender(<SourceDocumentControls {...callbacks} source={threePageSource} pageNumber={3} ready={false} />);
        expect(previous.title).toBe("Source not ready");
        expect(next.title).toBe("Source not ready");
        expect(previous.disabled).toBe(true);
        expect(next.disabled).toBe(true);
        fireEvent.click(previous);
        fireEvent.click(next);
        expect(callbacks.onPage).toHaveBeenCalledTimes(4);
    });

    it("keeps single-page PDF arrows disabled and page-number input strictly within range", () => {
        const callbacks = props(), source = callbacks.source;
        if (!source) throw new Error("A source fixture is required.");
        render(<SourceDocumentControls {...callbacks} source={{ ...source, pages: source.pages.slice(0, 1) }} />);
        for (const name of ["Previous page", "Next page"]) {
            const button = screen.getByRole<HTMLButtonElement>("button", { name });
            expect(button.disabled).toBe(true);
            expect(button.title).toBe("Single-page document");
            fireEvent.click(button);
        }
        expect(callbacks.onPage).not.toHaveBeenCalled();
        const input = screen.getByRole("textbox", { name: "Page number" });
        for (const value of ["0", "2"]) {
            fireEvent.change(input, { target: { value } });
            fireEvent.keyDown(input, { key: "Enter" });
            expect(screen.getByRole("alert").textContent).toBe("Enter an existing page number.");
            expect(callbacks.onPage).not.toHaveBeenCalled();
        }
        fireEvent.change(input, { target: { value: "1" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(callbacks.onPage).toHaveBeenLastCalledWith(1);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("retains zoom, fit and rotation callbacks", () => {
        const callbacks = props();
        render(<SourceDocumentControls {...callbacks} />);
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(callbacks.onZoom).toHaveBeenLastCalledWith(1.25);
        fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(callbacks.onZoom).toHaveBeenLastCalledWith(0.8);
        fireEvent.change(screen.getByRole("combobox", { name: "Zoom" }), { target: { value: "width" } });
        expect(callbacks.onFit).toHaveBeenLastCalledWith("width");
        fireEvent.change(screen.getByRole("combobox", { name: "Zoom" }), { target: { value: "150" } });
        expect(callbacks.onZoom).toHaveBeenLastCalledWith(1.5);
        fireEvent.click(screen.getByRole("button", { name: "Rotate 90°" }));
        expect(callbacks.onRotate).toHaveBeenCalledTimes(1);
    });

    it("keeps image navigation single-page and honors readiness and zoom limits", () => {
        const callbacks = props(), source = callbacks.source;
        if (!source) throw new Error("A source fixture is required.");
        const { rerender } = render(<SourceDocumentControls {...callbacks}
            source={{ ...source, kind: "image", name: "image.png", pages: source.pages.slice(0, 1) }} zoom={3} />);
        expect(screen.queryByRole("textbox", { name: "Page number" })).toBeNull();
        expect(screen.getByText("Image · single page")).toBeTruthy();
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zoom in" }).disabled).toBe(true);
        rerender(<SourceDocumentControls {...callbacks} ready={false} />);
        for (const button of screen.getAllByRole<HTMLButtonElement>("button")) expect(button.disabled).toBe(true);
        expect(screen.getByRole<HTMLSelectElement>("combobox").disabled).toBe(true);
    });
});
