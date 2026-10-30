// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultReviewSettings } from "../interaction/reviewFields";
import { HighlightSettings } from "./HighlightSettings";

let anchor: HTMLButtonElement | undefined;
afterEach(() => { cleanup(); anchor?.remove(); anchor = undefined; });

function setup(threshold = 0.7) {
    anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onChange = vi.fn(), onClose = vi.fn();
    const view = render(<HighlightSettings anchor={anchor} settings={{ ...defaultReviewSettings, threshold }}
        onChange={onChange} onClose={onClose} />);
    return { ...view, onChange, onClose };
}

describe("prototype-aligned highlighting controls", () => {
    it("keeps the focused numeric threshold and switches without a duplicate legend or footer reassurance", () => {
        setup(0.699);
        const threshold = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Confidence threshold" });
        expect(threshold.value).toBe("0.699");
        expect(threshold.min).toBe("0");
        expect(threshold.max).toBe("1");
        expect(threshold.step).toBe("0.01");
        expect(document.activeElement).toBe(threshold);
        expect(screen.getByText("0.699", { selector: "strong" })).toBeTruthy();
        expect(document.querySelector(".cu-setting-hint")?.textContent).toBe("Values below 0.699 receive low-confidence highlight.");
        expect(screen.getAllByRole("switch")).toHaveLength(3);
        expect(screen.getByRole("switch", { name: "Show low confidence highlight" })).toBeTruthy();
        expect(screen.queryByRole("switch", { name: "Highlight low confidences" })).toBeNull();
        expect(screen.queryByText("Legend")).toBeNull();
        expect(document.querySelectorAll(".cu-legend-swatch")).toHaveLength(0);
        expect(screen.queryByText("Highlighting never changes the extracted data.")).toBeNull();
        expect(document.querySelector(".cu-panel-footnote")).toBeNull();
    });

    it("keeps the last valid threshold on empty or out-of-range input and surfaces errors", () => {
        const { onChange } = setup();
        const threshold = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Confidence threshold" });
        expect(threshold.value).toBe("0.70");
        fireEvent.change(threshold, { target: { value: "" } });
        expect(screen.getByRole("alert").textContent).toContain("Enter a confidence threshold");
        fireEvent.change(threshold, { target: { value: "1.01" } });
        expect(screen.getByRole("alert").textContent).toContain("finite");
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.change(threshold, { target: { value: "0.675" } });
        expect(onChange).toHaveBeenCalledWith({ ...defaultReviewSettings, threshold: 0.675 });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(threshold.getAttribute("aria-invalid")).toBe("false");
    });

    it("retains accessible switch labels and reports each independent flag", () => {
        const { onChange } = setup();
        for (const [label, key] of [
            ["Show field highlights", "showFields"], ["Show table highlights", "showTables"], ["Show low confidence highlight", "highlightLow"],
        ] as const) {
            fireEvent.click(screen.getByRole("switch", { name: label }));
            expect(onChange).toHaveBeenLastCalledWith({ ...defaultReviewSettings, [key]: false });
        }
    });

    it("closes with focus restoration on Escape and without restoration on outside pointer input", () => {
        const { onClose } = setup();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(onClose).toHaveBeenLastCalledWith(true);
        fireEvent.pointerDown(document.body);
        expect(onClose).toHaveBeenLastCalledWith(false);
    });
});
