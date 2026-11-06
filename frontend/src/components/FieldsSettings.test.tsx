// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { defaultReviewSettings } from "../interaction/reviewFields";
import { FieldsSettings } from "./FieldsSettings";

let anchor: HTMLButtonElement | undefined;
afterEach(() => { cleanup(); anchor?.remove(); anchor = undefined; });

function setup(resetOrderDisabledReason: string | null = null) {
    anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const props = {
        id: "fields-settings", anchor, settings: { ...defaultReviewSettings, threshold: 0.699 },
        onSettings: vi.fn(), onResetOrder: vi.fn(), resetOrderDisabledReason,
        onObjectExpansion: vi.fn(), objectExpansionDisabledReason: null, onClose: vi.fn(),
    };
    render(<FieldsSettings {...props} />);
    return props;
}

describe("bottom Fields settings", () => {
    it("uses one checkbox for the Confidence column without altering other settings", () => {
        const props = setup();
        const confidence = screen.getByRole<HTMLInputElement>("checkbox", { name: "Show Confidence" });
        expect(confidence.checked).toBe(false);
        expect(document.activeElement).toBe(confidence);
        fireEvent.click(confidence);
        expect(props.onSettings).toHaveBeenCalledWith({ ...props.settings, columns: 3 });
        expect(screen.queryByRole("button", { name: "2 columns" })).toBeNull();
        expect(screen.queryByRole("button", { name: "3 columns" })).toBeNull();
        expect(screen.queryByRole("switch", { name: "Hide missing fields" })).toBeNull();
    });

    it("contains no low-confidence filter, helper text or browser preference message", () => {
        const { onSettings } = setup();
        const panel = screen.getByRole("dialog", { name: "Fields settings" });
        expect(within(panel).getAllByRole("checkbox")).toHaveLength(1);
        expect(within(panel).getAllByRole("button")).toHaveLength(4);
        expect(within(panel).queryByRole("button", { name: /Low confidence/ })).toBeNull();
        expect(screen.queryByText(/Show only values below confidence/)).toBeNull();
        expect(screen.queryByText("Preferences stay in this browser.")).toBeNull();
        expect(screen.getByRole("dialog").querySelector("p")).toBeNull();
        expect(onSettings).not.toHaveBeenCalled();
    });

    it("resets only the field order without changing settings or dismissing the panel", () => {
        const props = setup();
        const reset = screen.getByRole<HTMLButtonElement>("button", { name: "Reset order" });
        expect(reset.disabled).toBe(false);
        fireEvent.click(reset);
        expect(props.onResetOrder).toHaveBeenCalledOnce();
        expect(props.onSettings).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it("changes object expansion independently of field-order permissions and settings", () => {
        const props = setup("Field order is read-only.");
        const collapse = screen.getByRole("button", { name: "Collapse all object fields" });
        const expand = screen.getByRole("button", { name: "Expand all object values" });
        for (const button of [collapse, expand]) {
            expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
            expect(button.firstElementChild?.querySelector("rect")).toBeTruthy();
            expect(button.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
        }
        fireEvent.click(collapse);
        fireEvent.click(expand);
        expect(props.onObjectExpansion.mock.calls).toEqual([[false], [true]]);
        expect(props.onResetOrder).not.toHaveBeenCalled();
        expect(props.onSettings).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it.each(["Field order is read-only.", "Show all fields before reordering."])(
        "disables Reset order with its reason (%s) without disabling Confidence", reason => {
            const props = setup(reason);
            const reset = screen.getByRole<HTMLButtonElement>("button", { name: "Reset order" });
            expect(reset.disabled).toBe(true);
            expect(reset.title).toBe(reason);
            fireEvent.click(reset);
            expect(props.onResetOrder).not.toHaveBeenCalled();
            const confidence = screen.getByRole<HTMLInputElement>("checkbox", { name: "Show Confidence" });
            expect(confidence.disabled).toBe(false);
            fireEvent.click(confidence);
            expect(props.onSettings).toHaveBeenCalledWith({ ...props.settings, columns: 3 });
        },
    );

    it("preserves close/Escape focus restoration and does not steal focus on outside input", () => {
        const props = setup();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(props.onClose).toHaveBeenLastCalledWith(true);
        fireEvent.click(screen.getByRole("button", { name: "Close fields settings" }));
        expect(props.onClose).toHaveBeenLastCalledWith(true);
        fireEvent.pointerDown(document.body);
        expect(props.onClose).toHaveBeenLastCalledWith(false);
        fireEvent.blur(screen.getByRole("checkbox"), { relatedTarget: document.body });
        expect(props.onClose).toHaveBeenLastCalledWith(false);
    });
});
