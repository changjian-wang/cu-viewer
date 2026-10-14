// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { SourcePopover } from "./SourcePopover";
import type { CuField } from "../internal/types";

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(330);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(field: CuField) {
    const viewport = createRef<HTMLDivElement>(), paper = createRef<HTMLDivElement>();
    const onEnter = vi.fn(), onLeave = vi.fn();
    const element = document.createElement("div");
    Object.defineProperties(element, {
        clientWidth: { value: 600 }, clientHeight: { value: 400 },
        getBoundingClientRect: { value: () => new DOMRect(0, 0, 600, 400) },
    });
    viewport.current = element;
    paper.current = element;
    render(<SourcePopover id="source-preview" field={field} color="#8cbd18"
        points={[{ x: 50, y: 200 }, { x: 150, y: 200 }, { x: 150, y: 220 }, { x: 50, y: 220 }]}
        pan={{ x: 0, y: 0 }} viewport={viewport} paper={paper} onEnter={onEnter} onLeave={onLeave} />);
    return { onEnter, onLeave };
}

const field: CuField = { id: "/contents/0/fields/Zero", path: "/contents/0/fields/Zero",
    name: "Zero", type: "integer", hasValue: true, value: 0, confidence: 0, children: [], regions: [] };

describe("Studio source preview content", () => {
    it("shows returned field name/value/confidence including real zero and remains hoverable", () => {
        const { onEnter, onLeave } = setup(field);
        const popup = screen.getByRole("tooltip", { name: "Field preview" });
        expect(popup.textContent).toContain("ZeroValue0Confidence0.00%");
        expect(popup.style.left).toBe("50px");
        expect(popup.style.top).toBe("90px");
        fireEvent.mouseEnter(popup); fireEvent.mouseLeave(popup);
        expect(onEnter).toHaveBeenCalledOnce();
        expect(onLeave).toHaveBeenCalledOnce();
    });
    it("omits confidence when it was not returned", () => {
        const withoutConfidence = { ...field };
        delete withoutConfidence.confidence;
        setup(withoutConfidence);
        expect(screen.queryByText("Confidence")).toBeNull();
    });
    it("shows only paragraph Content and escapes returned markup", () => {
        setup({ ...field, detailView: "paragraphs", value: "<script>bad()</script>" });
        const popup = screen.getByRole("tooltip", { name: "Paragraph preview" });
        expect(popup.textContent).toBe("Content<script>bad()</script>");
        expect(popup.querySelector("script")).toBeNull();
        expect(screen.queryByText("Confidence")).toBeNull();
        expect(screen.queryByText("Value")).toBeNull();
    });
});
