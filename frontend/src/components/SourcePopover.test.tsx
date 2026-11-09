// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { SourcePopover } from "./SourcePopover";
import type { CuField } from "../model/types";

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(330);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(field: CuField, summaryFieldIds?: ReadonlySet<string>) {
    const viewport = createRef<HTMLDivElement>(), paper = createRef<HTMLDivElement>();
    const element = document.createElement("div");
    Object.defineProperties(element, {
        clientWidth: { value: 600 }, clientHeight: { value: 400 },
        getBoundingClientRect: { value: () => new DOMRect(0, 0, 600, 400) },
    });
    viewport.current = element;
    paper.current = element;
    render(<SourcePopover id="source-preview" field={field} summaryFieldIds={summaryFieldIds}
        points={[{ x: 50, y: 200 }, { x: 150, y: 200 }, { x: 150, y: 220 }, { x: 50, y: 220 }]}
        pan={{ x: 0, y: 0 }} viewport={viewport} paper={paper} />);
}

const field: CuField = { id: "/contents/0/fields/Zero", path: "/contents/0/fields/Zero",
    name: "Zero", type: "integer", hasValue: true, value: 0, confidence: 0, children: [], regions: [] };
const amount: CuField = { ...field, id: "/contents/0/fields/AmountDue/valueObject/Amount",
    name: "Amount", value: 610 };
const currency: CuField = { ...field, id: "/contents/0/fields/AmountDue/valueObject/Currency",
    name: "Currency", type: "string", value: "USD" };
const object: CuField = { ...field, id: "/contents/0/fields/AmountDue", name: "AmountDue",
    type: "object", value: { Amount: 610, Currency: "USD" }, children: [amount, currency] };

describe("Studio source preview content", () => {
    it("shows an object's returned value summary without inheriting or fabricating group confidence", () => {
        const before = JSON.stringify(object);
        setup(object);
        const popup = screen.getByRole("tooltip", { name: "Field preview" });
        expect(popup.querySelector(".cu-popover-heading")?.textContent).toBe("AmountDue");
        expect(popup.querySelector(".cu-flyover-value dd")?.textContent).toBe("610 USD");
        expect(screen.queryByText("Confidence")).toBeNull();
        expect(popup.querySelector(".cu-flyover-confidence")).toBeNull();
        expect(JSON.stringify(object)).toBe(before);
    });

    it("uses the same scoped object summary as Fields instead of showing unrelated values", () => {
        setup(object, new Set([currency.id]));
        expect(screen.getByRole("tooltip").querySelector(".cu-flyover-value dd")?.textContent).toBe("USD");
    });

    it("shows returned field name/value/confidence including real zero", () => {
        setup(field);
        const popup = screen.getByRole("tooltip", { name: "Field preview" });
        expect(popup.textContent).toContain("ZeroValue0Confidence0.00");
        expect(popup.style.left).toBe("50px");
        expect(popup.style.top).toBe("232px");
    });
    it("marks unavailable confidence without inventing a zero or showing a Gauge", () => {
        const withoutConfidence = { ...field };
        delete withoutConfidence.confidence;
        setup(withoutConfidence);
        expect(screen.getByText("N/A")).toBeTruthy();
        expect(screen.getByRole("tooltip").querySelector("svg")).toBeNull();
    });
    for (const table of [false, true]) {
        it.each([0, 0.95, undefined])(`does not apply confidence color to ${table ? "array" : "field"} value text at confidence %s`, confidence => {
            const current = { ...field };
            if (table) current.id = current.path = "/contents/0/fields/LineItems/valueArray/0/valueObject/Name";
            if (confidence === undefined) delete current.confidence;
            else current.confidence = confidence;
            setup(current);
            const popup = screen.getByRole("tooltip", { name: "Field preview" });
            expect(popup.querySelector<HTMLElement>(".cu-flyover-value dd")?.style.color).toBe("");
            expect(popup.querySelector<HTMLElement>(".cu-flyover-confidence")?.style.color).toBe(
                confidence === undefined ? "rgb(55, 65, 81)" : confidence === 0 ? "rgb(155, 28, 28)" :
                    table ? "rgb(30, 64, 175)" : "rgb(30, 58, 42)");
        });
    }
    it("keeps paragraph Content on the shared value-text style and escapes returned markup", () => {
        setup({ ...field, detailView: "paragraphs", value: "<script>bad()</script>" });
        const popup = screen.getByRole("tooltip", { name: "Paragraph preview" });
        expect(popup.textContent).toBe("Content<script>bad()</script>");
        expect(popup.querySelector("script")).toBeNull();
        expect(screen.queryByText("Confidence")).toBeNull();
        expect(screen.queryByText("Value")).toBeNull();
        expect(popup.querySelector<HTMLElement>(".cu-flyover-value dd")?.style.color).toBe("");
    });
});
