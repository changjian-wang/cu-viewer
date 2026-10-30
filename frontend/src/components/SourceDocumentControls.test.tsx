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
    it("hosts selection controls in the existing row and captures their focus without changing their actions", () => {
        const callbacks = props(), navigate = vi.fn();
        render(<SourceDocumentControls {...callbacks}>
            <button type="button" onClick={navigate}>Next source region</button>
        </SourceDocumentControls>);
        const selection = screen.getByRole("group", { name: "Source selection and location" });
        const button = screen.getByRole("button", { name: "Next source region" });
        expect(selection.contains(button)).toBe(true);
        expect(callbacks.controlsRef.current?.firstElementChild).toBe(selection);
        fireEvent.click(button);
        expect(navigate).toHaveBeenCalledOnce();
        expect(callbacks.onControlFocus).toHaveBeenCalledOnce();
        expect(callbacks.onPage).not.toHaveBeenCalled();
        expect(callbacks.onZoom).not.toHaveBeenCalled();
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
