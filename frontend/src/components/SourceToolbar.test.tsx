// @vitest-environment jsdom
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { defaultReviewSettings } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import type { LoadedSource } from "../source/source";
import { SourceToolbar } from "./SourceToolbar";
import { SourceDocumentControls } from "./SourceDocumentControls";

afterEach(cleanup);

function toolbarProps(settings: ReviewSettings = defaultReviewSettings): Parameters<typeof SourceToolbar>[0] {
    return {
        source: null,
        toolbarRef: createRef<HTMLElement>(), settings, summaryId: "source-summary",
        onSettings: vi.fn(), onControlFocus: vi.fn(),
    };
}

function setup(settings: ReviewSettings = defaultReviewSettings, ready = false) {
    const props = toolbarProps(settings), outerKeyDown = vi.fn(), onFit = vi.fn(), onRotate = vi.fn();
    const view = render(<div className="cu-viewer" onKeyDown={outerKeyDown}>
        <section className="cu-source-pane"><SourceToolbar {...props}>
            <SourceDocumentControls source={props.source} pageNumber={1} zoom={1} minZoom={0.25} maxZoom={3}
                ready={ready} fit="page" controlsRef={createRef<HTMLDivElement>()}
                onPage={vi.fn()} onZoom={vi.fn()} onFit={onFit} onRotate={onRotate} onControlFocus={props.onControlFocus} />
        </SourceToolbar></section>
        <button type="button">Outside</button>
    </div>);
    return { ...view, props, outerKeyDown, onFit, onRotate };
}

describe("source file information", () => {
    it.each([
        ["pdf", "report.pdf", "PDF \u00b7 4 pages", "filePdf"],
        ["pdf", "report-without-extension", "PDF \u00b7 4 pages", "file"],
        ["image", "receipt.png", "1743 \u00d7 878 px", "fileImage"],
        ["image", "receipt-without-extension", "1743 \u00d7 878 px", "file"],
        ["pdf", "source.DOCX", "PDF \u00b7 4 pages", "fileDocument"],
    ] as const)("shows %s filename %s without button-like decorations", (kind, name, details, expectedIcon) => {
        const width = kind === "pdf" ? 612 : 1743, height = kind === "pdf" ? 792 : 878;
        const renderSource = vi.fn<LoadedSource["render"]>().mockResolvedValue({ width, height });
        const disposeSource = vi.fn<LoadedSource["dispose"]>().mockResolvedValue(undefined);
        const source: LoadedSource = {
            kind, name,
            pages: Array.from({ length: kind === "pdf" ? 4 : 1 }, (_, index) => ({ pageNumber: index + 1, width, height })),
            render: renderSource, dispose: disposeSource,
        };
        const { container } = render(<SourceToolbar {...toolbarProps()} source={source} />);
        const file = container.querySelector<HTMLElement>(".cu-file-name");
        if (!file) throw new Error("The source filename is missing.");
        const summary = `${name} \u00b7 ${details}`;
        const identity = container.querySelector(".cu-source-identity");
        expect(identity?.textContent).toBe(name);
        expect(container.querySelector(".cu-source-file-info")?.children).toHaveLength(1);
        expect(identity?.querySelector("button, input, select")).toBeNull();
        expect(file.children).toHaveLength(2);
        expect(file.firstElementChild?.tagName).toBe("SPAN");
        expect(file.lastElementChild?.tagName).toBe("STRONG");
        expect(file.textContent).toBe(name);
        expect(within(file).getByText(name).getAttribute("title")).toBe(summary);
        const icon = file.querySelector(".cu-file-icon");
        expect(icon?.getAttribute("aria-hidden")).toBe("true");
        expect(icon?.getAttribute("data-file-icon")).toBe(expectedIcon);
        expect(icon?.querySelector("svg")?.getAttribute("focusable")).toBe("false");
        expect(within(file).queryByRole("img")).toBeNull();
        expect(file.querySelector("button, a, [role='button'], [tabindex]")).toBeNull();
        expect(container.querySelector(".cu-kind-badge")).toBeNull();
        expect(screen.queryByRole("group", { name: "Source selection and location" })).toBeNull();
        expect(screen.getByLabelText("Source information").textContent).toBe(summary);
        expect(renderSource).not.toHaveBeenCalled();
        expect(disposeSource).not.toHaveBeenCalled();
    });

    it("does not invent a PDF badge before a source is loaded", () => {
        const { container } = setup();
        expect(container.querySelector(".cu-file-name")?.textContent).toBe("Source document");
        expect(screen.getByLabelText("Source information").textContent).toBe("Source document");
        expect(container.querySelector(".cu-file-icon")?.getAttribute("aria-hidden")).toBe("true");
        expect(container.querySelector(".cu-file-icon")?.getAttribute("data-file-icon")).toBe("file");
        expect(container.querySelector(".cu-kind-badge")).toBeNull();
        expect(screen.queryByText("PDF")).toBeNull();
    });
});

describe("direct document controls without overflow", () => {
    it("composes one bottom toolbar without selection status or persistent legend chips", () => {
        const { container, props } = setup();
        const toolbar = screen.getByRole("group", { name: "Source document toolbar" });
        expect(toolbar.tagName).toBe("FOOTER");
        expect(toolbar).toBe(props.toolbarRef.current);
        expect(container.querySelector(".cu-source-pane > header")).toBeNull();
        expect(container.querySelectorAll(".cu-source-toolbar")).toHaveLength(1);
        expect(within(toolbar).getByRole("group", { name: "Document navigation and zoom" })).toBeTruthy();
        expect(within(toolbar).queryByRole("group", { name: "Source selection and location" })).toBeNull();
        expect(screen.queryByRole("list", { name: "Highlighting legend summary" })).toBeNull();
        expect(container.querySelector(".cu-legend-inline")).toBeNull();
        openLegend();
        expect(screen.getByRole("dialog", { name: "Legend" }).querySelectorAll(".cu-legend-swatch")).toHaveLength(4);
    });

    it.each([false, true])("omits More and layout reset while source readiness is %s", ready => {
        setup(defaultReviewSettings, ready);
        expect(screen.queryByRole("button", { name: "More document actions" })).toBeNull();
        expect(screen.queryByRole("menu", { name: "Document actions" })).toBeNull();
        expect(screen.queryByText("Reset layout widths")).toBeNull();
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Rotate 90°" }).disabled).toBe(!ready);
    });

    it("keeps rotation and both fit callbacks directly available", () => {
        const { onFit, onRotate } = setup(defaultReviewSettings, true);
        const zoom = screen.getByRole("combobox", { name: "Zoom" });
        expect(within(zoom).getByRole("option", { name: "Fit page" })).toBeTruthy();
        expect(within(zoom).getByRole("option", { name: "Fit width" })).toBeTruthy();
        fireEvent.change(zoom, { target: { value: "width" } });
        expect(onFit).toHaveBeenLastCalledWith("width");
        fireEvent.change(zoom, { target: { value: "page" } });
        expect(onFit).toHaveBeenLastCalledWith("page");
        fireEvent.click(screen.getByRole("button", { name: "Rotate 90°" }));
        expect(onRotate).toHaveBeenCalledTimes(1);
    });
});

const palette = ["rgb(232, 245, 233)", "rgb(232, 241, 255)", "rgb(252, 232, 230)",
    "rgb(246, 197, 204)"];

function openLegend() {
    const trigger = screen.getByRole("button", { name: "Highlighting legend" });
    fireEvent.click(trigger);
    return { trigger, panel: screen.getByRole("dialog", { name: "Legend" }) };
}

describe("responsive source-toolbar legend", () => {
    it("integrates the three accessible switches with their color descriptions and changes one flag at a time", () => {
        const { props } = setup({ ...defaultReviewSettings, threshold: 0.699 });
        const { panel } = openLegend();
        const entries = within(panel).getByRole("list", { name: "Highlighting legend entries" });
        expect(within(entries).getAllByRole("switch")).toHaveLength(3);
        expect(within(panel).queryByText("Options")).toBeNull();
        expect(panel.querySelector(".cu-highlight-options")).toBeNull();
        expect(panel.querySelector('[data-setting="showFields"] [data-legend-category="field"]')).toBeTruthy();
        expect(panel.querySelector('[data-setting="showTables"] [data-legend-category="table"]')).toBeTruthy();
        expect(panel.querySelectorAll('[data-setting="highlightLow"] .cu-legend-swatch')).toHaveLength(2);
        const lowGroup = panel.querySelector<HTMLElement>(".cu-legend-low-group");
        if (!lowGroup) throw new Error("The shared low-confidence group is missing.");
        expect(within(lowGroup).getByRole("heading", { name: "Low confidence Fields & tables" })).toBeTruthy();
        expect(within(lowGroup).getAllByRole("switch")).toHaveLength(1);
        expect(lowGroup.querySelectorAll(".cu-legend-item")).toHaveLength(2);
        for (const [label, key] of [
            ["Show field highlights", "showFields"], ["Show table highlights", "showTables"], ["Show low confidence highlight", "highlightLow"],
        ] as const) {
            fireEvent.click(within(entries).getByRole("switch", { name: label }));
            expect(props.onSettings).toHaveBeenLastCalledWith({ ...props.settings, [key]: false });
        }
        expect(screen.getByRole("dialog", { name: "Legend" })).toBe(panel);
        fireEvent.click(screen.getByRole("button", { name: "Source settings" }));
        const settings = screen.getByRole("dialog", { name: "Source settings" });
        expect(within(settings).queryAllByRole("switch")).toHaveLength(0);
        expect(within(settings).getByRole<HTMLInputElement>("spinbutton").value).toBe("0.699");
    });

    it("keeps switch focus and passive colors while toggling source visibility", () => {
        const props = toolbarProps();
        function Controlled() {
            const [settings, setSettings] = useState<ReviewSettings>({ ...defaultReviewSettings });
            return <SourceToolbar {...props} settings={settings} onSettings={setSettings} />;
        }
        render(<Controlled />);
        const { panel, trigger } = openLegend();
        const fields = within(panel).getByRole("switch", { name: "Show field highlights" });
        fields.focus();
        fireEvent.click(fields);
        expect(document.activeElement).toBe(fields);
        expect(within(panel).getByRole<HTMLInputElement>("switch", { name: "Show field highlights" }).checked).toBe(false);
        expect([...panel.querySelectorAll<HTMLElement>(".cu-legend-swatch")].map(swatch => swatch.style.backgroundColor)).toEqual(palette);
        fireEvent.click(fields);
        expect(within(panel).getByRole<HTMLInputElement>("switch", { name: "Show field highlights" }).checked).toBe(true);
        fireEvent.keyDown(fields, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it("provides complete semantic labels independently of a loaded source", () => {
        const { props } = setup();
        const { panel, trigger } = openLegend();
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
        expect(panel.querySelectorAll(".cu-legend-item")).toHaveLength(4);
        for (const label of ["Field value", "Table value", "Low-confidence field",
            "Low-confidence table value"]) expect(within(panel).getByText(label)).toBeTruthy();
        expect(within(panel).getAllByText("At or above threshold")).toHaveLength(2);
        expect(within(panel).getAllByText("Below threshold")).toHaveLength(2);
        expect(within(panel).queryByText("Confidence unavailable")).toBeNull();
        expect(within(panel).queryByText("No score was supplied")).toBeNull();
        expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Close legend" }));
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it.each([0, 0.341, 1])("retains all four legend colors at threshold %s with visibility flags off", threshold => {
        const { props } = setup({ ...defaultReviewSettings, threshold, showFields: false, showTables: false, highlightLow: false });
        const { panel } = openLegend();
        const colors = [...panel.querySelectorAll<HTMLElement>(".cu-legend-swatch")].map(swatch => swatch.style.backgroundColor);
        expect(colors).toEqual(palette);
        expect(within(panel).getAllByText("All scored values while low-confidence highlight is off")).toHaveLength(2);
        expect(within(panel).queryByText("At or above threshold")).toBeNull();
        expect(props.onSettings).not.toHaveBeenCalled();
    });

    it("keeps all four color descriptions inert, unfocusable and outside switch labels", () => {
        const { props } = setup();
        const { panel } = openLegend();
        const focused = document.activeElement;
        for (const entry of panel.querySelectorAll<HTMLElement>(".cu-legend-item")) {
            expect(entry.querySelector("button, input, a, [tabindex], [aria-pressed]")).toBeNull();
            expect(entry.closest("button, label")).toBeNull();
            expect(entry.querySelector(".cu-legend-swatch")?.getAttribute("aria-hidden")).toBe("true");
            fireEvent.click(entry);
            fireEvent.click(entry.querySelector(".cu-legend-swatch")!);
            expect(document.activeElement).toBe(focused);
        }
        expect(within(panel).getAllByRole("button")).toHaveLength(1);
        expect(within(panel).getAllByRole("switch")).toHaveLength(3);
        expect(props.onSettings).not.toHaveBeenCalled();
        fireEvent.blur(within(panel).getByRole("button", { name: "Close legend" }), { relatedTarget: null });
        expect(screen.getByRole("dialog", { name: "Legend" })).toBe(panel);
    });

    it("leaves all three switches available for recovery when every highlight option is off", () => {
        const { props } = setup({ ...defaultReviewSettings, showFields: false, showTables: false, highlightLow: false });
        const { panel } = openLegend();
        for (const control of within(panel).getAllByRole<HTMLInputElement>("switch")) {
            expect(control.checked).toBe(false);
            expect(control.disabled).toBe(false);
        }
        fireEvent.click(within(panel).getByRole("switch", { name: "Show field highlights" }));
        expect(props.onSettings).toHaveBeenLastCalledWith({ ...props.settings, showFields: true });
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

    it("keeps Legend and settings mutually exclusive without a document overflow menu", () => {
        setup();
        openLegend();
        const settings = screen.getByRole("button", { name: "Source settings" });
        expect(settings.getAttribute("title")).toBe("Source settings");
        fireEvent.pointerDown(settings); fireEvent.click(settings);
        const panel = screen.getByRole("dialog", { name: "Source settings" });
        expect(within(panel).getByRole("heading", { name: "Settings" })).toBeTruthy();
        expect(screen.queryByRole("dialog", { name: "Legend" })).toBeNull();
        expect(within(panel).queryAllByRole("switch")).toHaveLength(0);
        expect(within(panel).queryByText("Legend")).toBeNull();
        expect(document.activeElement).toBe(within(panel).getByRole("spinbutton"));
        const trigger = screen.getByRole("button", { name: "Highlighting legend" });
        fireEvent.pointerDown(trigger); fireEvent.click(trigger);
        expect(screen.queryByRole("dialog", { name: "Source settings" })).toBeNull();
        expect(screen.getByRole("dialog", { name: "Legend" })).toBeTruthy();
        expect(within(screen.getByRole("dialog", { name: "Legend" })).getAllByRole("switch")).toHaveLength(3);
        expect(screen.queryByRole("button", { name: "More document actions" })).toBeNull();
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
        const settings = screen.getByRole("button", { name: "Source settings" });
        fireEvent.blur(close, { relatedTarget: settings }); settings.focus();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(settings);
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
