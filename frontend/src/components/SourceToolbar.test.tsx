// @vitest-environment jsdom
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { defaultReviewSettings, defaultSourceCategories } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { SourceToolbar } from "./SourceToolbar";

afterEach(cleanup);

function toolbarProps(settings: ReviewSettings = defaultReviewSettings): Parameters<typeof SourceToolbar>[0] {
    return {
        source: null, pageNumber: 1, zoom: 1, minZoom: 0.25, maxZoom: 3, ready: false, fit: "page",
        toolbarRef: createRef<HTMLElement>(), settings, summaryId: "source-summary",
        onSettings: vi.fn(), onPage: vi.fn(), onZoom: vi.fn(), onFit: vi.fn(), onRotate: vi.fn(),
        onResetLayout: vi.fn(), onControlFocus: vi.fn(),
    };
}

function setup(settings: ReviewSettings = defaultReviewSettings) {
    const props = toolbarProps(settings), outerKeyDown = vi.fn();
    const view = render(<div className="cu-viewer" onKeyDown={outerKeyDown}>
        <section className="cu-source-pane"><SourceToolbar {...props} /></section>
        <button type="button">Outside</button>
    </div>);
    return { ...view, props, outerKeyDown };
}

const palette = ["rgb(232, 245, 233)", "rgb(232, 241, 255)", "rgb(252, 232, 230)",
    "rgb(255, 232, 236)", "rgb(241, 243, 245)"];

function openLegend() {
    const trigger = screen.getByRole("button", { name: "Highlighting legend" });
    fireEvent.click(trigger);
    return { trigger, panel: screen.getByRole("dialog", { name: "Legend" }) };
}

describe("responsive source-toolbar legend", () => {
    it("provides complete semantic labels independently of a loaded source", () => {
        const { props } = setup();
        const { panel, trigger } = openLegend();
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
        expect(within(panel).getAllByRole("listitem")).toHaveLength(5);
        for (const label of ["Field value", "Table value", "Low-confidence field",
            "Low-confidence table value", "Confidence unavailable"]) expect(within(panel).getByText(label)).toBeTruthy();
        expect(within(panel).getAllByText("At or above threshold")).toHaveLength(2);
        expect(within(panel).getAllByText("Below threshold")).toHaveLength(2);
        expect(within(panel).getByText("No score was supplied")).toBeTruthy();
        expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Close legend" }));
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it.each([0, 0.341, 1])("retains all five legend colors at threshold %s with visibility flags off", threshold => {
        const { props } = setup({ ...defaultReviewSettings, threshold, showFields: false, showTables: false, highlightLow: false });
        const { panel } = openLegend();
        const colors = [...panel.querySelectorAll<HTMLElement>(".cu-legend-swatch")].map(swatch => swatch.style.backgroundColor);
        expect(colors).toEqual(palette);
        expect(within(panel).getAllByText("All scored values while low-confidence emphasis is off")).toHaveLength(2);
        expect(within(panel).queryByText("At or above threshold")).toBeNull();
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it("toggles one category at a time in the complete legend without changing masters or losing focus", () => {
        const props = toolbarProps(), onSettings = vi.fn();
        function Controlled() {
            const [settings, setSettings] = useState<ReviewSettings>({ ...defaultReviewSettings });
            return <div className="cu-viewer"><section className="cu-source-pane"><SourceToolbar {...props} settings={settings}
                onSettings={next => { onSettings(next); setSettings(next); }} /></section></div>;
        }
        render(<Controlled />);
        const { panel } = openLegend();
        for (const [category, label] of [["field", "Field value"], ["table", "Table value"],
            ["lowField", "Low-confidence field"], ["lowTable", "Low-confidence table value"],
            ["unavailable", "Confidence unavailable"]] as const) {
            const button = within(panel).getByRole("button", { name: label });
            button.focus();
            fireEvent.click(button);
            expect(button.getAttribute("aria-pressed")).toBe("false");
            expect(button.querySelector<HTMLElement>(".cu-legend-swatch")?.style.backgroundColor).toBe("transparent");
            expect(onSettings).toHaveBeenLastCalledWith({
                ...defaultReviewSettings, sourceCategories: { ...defaultSourceCategories, [category]: false },
            });
            expect(document.activeElement).toBe(button);
            expect(within(panel).getAllByRole("button", { pressed: false })).toHaveLength(1);
            fireEvent.click(button);
            expect(button.getAttribute("aria-pressed")).toBe("true");
            expect(onSettings).toHaveBeenLastCalledWith(defaultReviewSettings);
        }
    });

    it.each([
        ["field", "Field value", { showFields: false }, "Show field highlights"],
        ["lowField", "Low-confidence field", { showFields: false }, "Show field highlights"],
        ["table", "Table value", { showTables: false }, "Show table highlights"],
        ["lowTable", "Low-confidence table value", { showTables: false }, "Show table highlights"],
        ["lowField", "Low-confidence field", { highlightLow: false }, "Highlight low confidences"],
        ["lowTable", "Low-confidence table value", { highlightLow: false }, "Highlight low confidences"],
        ["unavailable", "Confidence unavailable", { showFields: false, showTables: false }, "field or table"],
    ] as const)("keeps %s disabled under its master with an explicit reason", (_category, label, flags, reason) => {
        const { props } = setup({ ...defaultReviewSettings, ...flags });
        const { panel } = openLegend();
        const button = within(panel).getByRole<HTMLButtonElement>("button", { name: label });
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(button.textContent).toContain(reason);
        fireEvent.click(button);
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it.each(["Escape", "close button", "trigger Escape"])("closes via %s and restores only Legend focus", method => {
        const { outerKeyDown, props } = setup();
        const { panel, trigger } = openLegend();
        if (method === "close button") fireEvent.click(within(panel).getByRole("button", { name: "Close legend" }));
        else if (method === "trigger Escape") {
            trigger.focus();
            fireEvent.keyDown(trigger, { key: "Escape" });
        } else fireEvent.keyDown(panel, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(outerKeyDown).not.toHaveBeenCalled();
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it("keeps Legend, settings and More mutually exclusive without duplicating Legend in settings", () => {
        setup();
        openLegend();
        const settings = screen.getByRole("button", { name: "Highlighting settings" });
        fireEvent.pointerDown(settings); fireEvent.click(settings);
        const panel = screen.getByRole("dialog", { name: "Highlighting" });
        expect(screen.queryByRole("dialog", { name: "Legend" })).toBeNull();
        expect(within(panel).getAllByRole("switch")).toHaveLength(3);
        expect(within(panel).queryByText("Legend")).toBeNull();
        expect(document.activeElement).toBe(within(panel).getByRole("spinbutton"));
        const trigger = screen.getByRole("button", { name: "Highlighting legend" });
        fireEvent.pointerDown(trigger); fireEvent.click(trigger);
        expect(screen.queryByRole("dialog", { name: "Highlighting" })).toBeNull();
        const more = screen.getByRole("button", { name: "More document actions" });
        fireEvent.pointerDown(more); fireEvent.click(more);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("menu", { name: "Document actions" })).toBeTruthy();
    });

    it("dismisses on outside input or keyboard departure without stealing the next control focus", () => {
        setup();
        const { trigger } = openLegend();
        const outside = screen.getByRole("button", { name: "Outside" });
        fireEvent.pointerDown(outside); outside.focus();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(outside);
        fireEvent.click(trigger);
        const close = screen.getByRole("button", { name: "Close legend" });
        const more = screen.getByRole("button", { name: "More document actions" });
        fireEvent.blur(close, { relatedTarget: more }); more.focus();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(more);
    });

    it("keeps independent toolbar ids and never restores focus to a different viewer", () => {
        const first = { ...toolbarProps(), summaryId: "first-summary" }, second = { ...toolbarProps(), summaryId: "second-summary" };
        render(<div className="cu-viewer">
            <section className="cu-source-pane"><SourceToolbar {...first} /></section>
            <section className="cu-source-pane"><SourceToolbar {...second} /></section>
        </div>);
        const [one, two] = screen.getAllByRole("button", { name: "Highlighting legend" });
        if (!one || !two) throw new Error("Both toolbar triggers are required.");
        fireEvent.click(one);
        const previous = screen.getByRole("dialog").id;
        fireEvent.pointerDown(two); fireEvent.click(two);
        const panel = screen.getByRole("dialog");
        expect(panel.id).not.toBe(previous);
        expect(two.getAttribute("aria-controls")).toBe(panel.id);
        fireEvent.keyDown(panel, { key: "Escape" });
        expect(document.activeElement).toBe(two);
    });
});
