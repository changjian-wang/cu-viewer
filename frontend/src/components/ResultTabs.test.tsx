// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { RESULT_TABS } from "../model/resultViews";
import type { ResultTab, ResultView } from "../model/resultViews";
import { ResultTabs } from "./ResultTabs";

let availableWidth: number;
let tabWidth: number;
const observers = new Set<() => void>();

function TestTabs({ tabs = RESULT_TABS }: { tabs?: readonly ResultTab[] }) {
    const [requested, setView] = useState<ResultView>("fields");
    const view = (tabs.find(tab => tab.id === requested) ?? tabs[0])?.id;
    return <>
        <style>{".cu-result-tabs { column-gap: 4px; }"}</style>
        <ResultTabs tabs={tabs} view={view} baseId="tabs" panelId="panel" onViewChange={setView} />
        <div id="panel" role="tabpanel" aria-labelledby={view ? `tabs-${view}` : undefined}>{view}</div>
        <button type="button">Outside</button>
    </>;
}

function resize(width: number): void {
    act(() => {
        availableWidth = width;
        for (const callback of [...observers]) callback();
    });
}

beforeEach(() => {
    availableWidth = 330;
    tabWidth = 80;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.stubGlobal("ResizeObserver", class {
        constructor(private callback: () => void) { observers.add(callback); }
        observe() {}
        disconnect() { observers.delete(this.callback); }
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const width = this.classList.contains("cu-result-tabs") ? availableWidth :
            this.getAttribute("role") === "tab" ? tabWidth :
                this.classList.contains("cu-result-tab-more") ? 40 : 0;
        return DOMRect.fromRect({ width, height: 38 });
    });
});

afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    observers.clear();
});

describe("responsive result tabs", () => {
    it("shows all tabs at the exact fit threshold and reserves the menu width below it", () => {
        availableWidth = 668;
        render(<TestTabs />);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(RESULT_TABS.map(tab => tab.label));
        expect(screen.queryByRole("button", { name: "More result views" })).toBeNull();
        resize(667);
        expect(screen.getAllByRole("tab")).toHaveLength(7);
        expect(screen.getByRole("button", { name: "More result views" }).getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(screen.getByRole("button", { name: "More result views" }));
        expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Result"]);
    });

    it("lists only overflow tabs in order and promotes a selected item without losing panel links", () => {
        render(<TestTabs />);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Fields", "Markdown", "Paragraphs"]);
        const more = screen.getByRole("button", { name: "More result views" });
        fireEvent.click(more);
        expect(more.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getAllByRole("menuitem").map(item => item.textContent))
            .toEqual(["Tables", "Figures", "Signatures", "Metadata", "Result"]);
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tables" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Metadata" }));
        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Fields", "Markdown", "Metadata"]);
        const metadata = screen.getByRole("tab", { name: "Metadata" });
        expect(document.activeElement).toBe(metadata);
        expect(metadata.getAttribute("aria-selected")).toBe("true");
        expect(metadata.getAttribute("aria-controls")).toBe(screen.getByRole("tabpanel").id);
        expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(metadata.id);
        fireEvent.click(more);
        expect(screen.getAllByRole("menuitem").map(item => item.textContent))
            .toEqual(["Paragraphs", "Tables", "Figures", "Signatures", "Result"]);
    });

    it("keeps every view reachable through arrows, Home and End with a single tab stop", () => {
        render(<TestTabs />);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Fields" }), { key: "End" });
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Result" }));
        expect(screen.getAllByRole("tab").filter(tab => tab.tabIndex === 0)).toHaveLength(1);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "Home" });
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Fields" }));
        fireEvent.keyDown(screen.getByRole("tab", { name: "Fields" }), { key: "ArrowLeft" });
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Result" }));
        fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "ArrowRight" });
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Fields" }));
    });

    it("supports menu arrow navigation, Home, End and Escape without selecting on focus", () => {
        render(<TestTabs />);
        const more = screen.getByRole("button", { name: "More result views" });
        fireEvent.keyDown(more, { key: "ArrowDown" });
        const tables = screen.getByRole("menuitem", { name: "Tables" });
        expect(document.activeElement).toBe(tables);
        fireEvent.keyDown(tables, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Figures" }));
        fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Result" }));
        fireEvent.keyDown(document.activeElement!, { key: "Home" });
        expect(document.activeElement).toBe(tables);
        fireEvent.keyDown(tables, { key: "ArrowUp" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Result" }));
        expect(screen.getByRole("tab", { name: "Fields" }).getAttribute("aria-selected")).toBe("true");
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(more);
        fireEvent.keyDown(more, { key: "ArrowUp" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Result" }));
        act(() => more.focus());
        fireEvent.keyDown(more, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tables" }));
        act(() => more.focus());
        fireEvent.keyDown(more, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(more);
    });

    it("dismisses on outside pointer and focus changes without stealing focus", () => {
        render(<TestTabs />);
        const more = screen.getByRole("button", { name: "More result views" });
        fireEvent.click(more);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
        fireEvent.click(more);
        const outside = screen.getByRole("button", { name: "Outside" });
        act(() => outside.focus());
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(outside);
    });

    it("retains the selected view through resize and restores focus when an open menu is no longer needed", () => {
        render(<TestTabs />);
        fireEvent.click(screen.getByRole("button", { name: "More result views" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Metadata" }));
        resize(250);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Fields", "Metadata"]);
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Metadata" }));
        fireEvent.click(screen.getByRole("button", { name: "More result views" }));
        resize(668);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.queryByRole("button", { name: "More result views" })).toBeNull();
        expect(screen.getAllByRole("tab")).toHaveLength(8);
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Metadata" }));
        expect(screen.getByRole("tabpanel").textContent).toBe("metadata");
    });

    it("recalculates when tab widths change and disconnects observers on unmount", () => {
        const { unmount } = render(<TestTabs />);
        tabWidth = 110;
        resize(330);
        expect(screen.getAllByRole("tab")).toHaveLength(2);
        unmount();
        expect(observers.size).toBe(0);
    });

    it("updates an open menu when available tabs disappear", () => {
        const { rerender } = render(<TestTabs />);
        fireEvent.click(screen.getByRole("button", { name: "More result views" }));
        rerender(<TestTabs tabs={RESULT_TABS.slice(0, 3)} />);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.queryByRole("button", { name: "More result views" })).toBeNull();
        expect(screen.getAllByRole("tab")).toHaveLength(3);
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Fields" }));
    });

    it("handles empty and initially hidden containers before measuring their visible width", () => {
        availableWidth = 0;
        const { rerender } = render(<TestTabs tabs={[]} />);
        expect(screen.queryAllByRole("tab")).toHaveLength(0);
        expect(screen.queryByRole("button", { name: "More result views" })).toBeNull();
        rerender(<TestTabs />);
        resize(330);
        expect(screen.getAllByRole("tab")).toHaveLength(3);
    });
});
