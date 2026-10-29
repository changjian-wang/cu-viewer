// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { ResultsPane } from "./ResultsPane";
import { parseCuResult } from "../model/parseCuResult";
import type { CuApiVersion, CuContent, CuField, CuRegion } from "../model/types";
import { availableResultTabs } from "../model/resultViews";
import type { ResultView } from "../model/resultViews";
import { useValueWorkflow } from "../interaction/useValueWorkflow";
import { matchTableFields } from "../interaction/tableFields";

function TestPane(props: Omit<Parameters<typeof ResultsPane>[0], "view" | "onViewChange" | "hideMissing" | "onHideMissingChange" | "previewId" | "workflow">) {
    const [requested, setView] = useState<ResultView | undefined>("fields");
    const [hideMissing, setHideMissing] = useState(true);
    const workflow = useValueWorkflow(props.content ?? props);
    const tabs = availableResultTabs(props.content, props.result, props.apiVersion);
    const view = (tabs.find(tab => tab.id === requested) ?? tabs[0])?.id;
    useEffect(() => {
        if (view !== requested) setView(view);
    }, [view, requested]);
    return <ResultsPane {...props} view={view} onViewChange={setView} hideMissing={hideMissing}
        onHideMissingChange={setHideMissing} previewId="test-preview" workflow={workflow} />;
}

function region(pageNumber: number): CuRegion {
    return { pageNumber, polygon: [
        { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 },
    ] };
}

function scalar(id: string, name: string, value: string, pageNumber?: number): CuField {
    return {
        id, path: `/result${id}`, name, type: "string", hasValue: true, value,
        children: [], regions: pageNumber === undefined ? [] : [region(pageNumber)],
    };
}

function structuredContent(): { content: CuContent; rows: CuField; first: CuField; firstLabel: CuField; second: CuField } {
    const rowsId = "/contents/0/fields/Rows";
    const firstLabel = scalar(`${rowsId}/valueArray/0/valueObject/Label`, "Label", "First", 1);
    const secondLabel = scalar(`${rowsId}/valueArray/1/valueObject/Label`, "Label", "Second", 2);
    const first: CuField = {
        id: `${rowsId}/valueArray/0`, path: "/result/contents/0/fields/Rows/valueArray/0",
        name: "0", type: "object", hasValue: true, value: { Label: "First" },
        regions: [], children: [firstLabel],
    };
    const second: CuField = {
        id: `${rowsId}/valueArray/1`, path: "/result/contents/0/fields/Rows/valueArray/1",
        name: "1", type: "object", hasValue: true, value: { Label: "Second" },
        regions: [], children: [secondLabel],
    };
    const rows: CuField = {
        id: rowsId, path: "/result/contents/0/fields/Rows", name: "Rows",
        type: "array", hasValue: true, value: [first.value, second.value],
        regions: [], children: [first, second],
    };
    return {
        rows, first, firstLabel, second,
        content: {
            id: "/contents/0", kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }, { pageNumber: 2, width: 100, height: 100 }],
            fields: [rows],
        },
    };
}

function renderPane(content: CuContent, selected: CuField | null = null,
    isPageAvailable: (pageNumber: number) => boolean = () => true,
    result: unknown = { apiVersion: "2025-11-01", rawOnly: "preserved" },
    context: { apiVersion?: CuApiVersion } = {}) {
    const onSelect = vi.fn();
    const props = {
        result, content, contents: [content], contentIndex: 0, issues: [], error: null,
        selected, hovered: null, sourceReady: true, isPageAvailable,
        onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect, onClear: vi.fn(),
        ...context,
    };
    const view = render(<TestPane {...props} />);
    // These interaction cases start folded; the default expansion policy has separate coverage.
    const collapse = screen.queryByRole("button", { name: "Collapse Rows" });
    if (collapse) fireEvent.click(collapse);
    return { ...view, onSelect, rerenderContent: (next: CuContent) => view.rerender(<TestPane {...props} content={next} />) };
}

// Cold chunk loading has browser/resource gates; these tests exercise real view composition.
beforeAll(async () => { await Promise.all([import("./MarkdownPane"), import("./JsonPane")]); }, 15000);

beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        disconnect() {}
    });
});

afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
});

describe("structured Fields presentation", () => {
    it("restores pre-scope expansion and both scroll positions without modifying the content", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
            fields: { Rows: { type: "array", valueArray: [{ type: "string", valueString: "Row value" }] },
                Total: { type: "object", valueObject: { Amount: { type: "number", valueNumber: 10, source: "D(1,20,20,10,5)" },
                    Currency: { type: "string", valueString: "USD" } } },
                Outside: { type: "string", valueString: "Outside" } },
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,10,10,50,40)", cells: [] }],
        }] }).contents[0]!;
        const table = content.tables![0]!.field, location = { table, match: matchTableFields(content, table) };
        const props = { result: {}, content, contents: [content], contentIndex: 0, issues: [], error: null,
            hovered: null, sourceReady: true, isPageAvailable: () => true,
            onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), onClear: vi.fn(),
            onShowAllFields: vi.fn() };
        const original = JSON.stringify(content);
        const view = render(<TestPane {...props} selected={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Total" }));
        const scroll = view.container.querySelector<HTMLElement>(".cu-fields-scroll")!;
        scroll.scrollTop = 120;
        view.container.querySelector<HTMLElement>("[data-array-id]")!.scrollLeft = 150;
        view.rerender(<TestPane {...props} selected={table} tableScope={location} tableLocation={location} />);
        expect(screen.queryByRole("button", { name: "Outside" })).toBeNull();
        expect(screen.getByRole("button", { name: "Show all fields" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Expand Total" }));
        scroll.scrollTop = 20;
        fireEvent.click(screen.getByRole("button", { name: "Show all fields" }));
        expect(props.onShowAllFields).toHaveBeenCalledOnce();
        view.rerender(<TestPane {...props} selected={table} tableScope={null} tableLocation={location} />);
        expect(screen.getByRole("button", { name: "Expand Total" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Outside" })).toBeTruthy();
        expect(scroll.scrollTop).toBe(120);
        expect(view.container.querySelector<HTMLElement>("[data-array-id]")!.scrollLeft).toBe(150);
        expect(JSON.stringify(content)).toBe(original);
    });

    it("keeps explicit search and confidence-filter edits when leaving a temporary related range", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
            fields: { Amount: { type: "number", valueNumber: 10, confidence: 0.2, source: "D(1,20,20,10,5)" },
                Outside: { type: "string", valueString: "Outside" } },
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,10,10,50,40)", cells: [] }],
        }] }).contents[0]!;
        const table = content.tables![0]!.field, location = { table, match: matchTableFields(content, table) };
        const props = { result: {}, content, contents: [content], contentIndex: 0, issues: [], error: null,
            hovered: null, sourceReady: true, isPageAvailable: () => true,
            onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), onClear: vi.fn(),
            onShowAllFields: vi.fn() };
        const view = render(<TestPane {...props} selected={null} />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Amount" } });
        fireEvent.click(screen.getByRole("button", { name: /Low confidence/ }));
        view.rerender(<TestPane {...props} selected={table} tableScope={location} tableLocation={location} />);
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("Amount");
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "10" } });
        view.rerender(<TestPane {...props} selected={table} tableScope={null} tableLocation={location} />);
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("10");
        expect(screen.getByRole("button", { name: /Low confidence/ }).getAttribute("aria-pressed")).toBe("true");
    });

    it("locates existing Fields once per source-table request without adding native tables", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document",
            unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
            fields: { Keep: { type: "string", valueString: "Field value", source: "D(1,20,20,10,5)" } },
            tables: [
                { rowCount: 1, columnCount: 1, source: "D(1,50,50,40,40)", cells: [{ rowIndex: 0, columnIndex: 0, content: "First table" }] },
                { rowCount: 1, columnCount: 1, source: "D(1,10,10,30,30)", cells: [{ rowIndex: 0, columnIndex: 0, content: "Second table" }] },
            ],
        }] }).contents[0]!;
        const selected = content.tables![1]!.field;
        const props = { result: {}, content, contents: [content], contentIndex: 0, issues: [], error: null,
            selected, hovered: null, sourceReady: true, isPageAvailable: () => true,
            onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), onClear: vi.fn(),
            sourceTableSelection: true, selectionRequest: 1, tableLocation: { table: selected, match: matchTableFields(content, selected) } };
        const view = render(<TestPane {...props} />);
        expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
        expect(screen.getAllByRole("status").map(item => item.textContent).join(" ")).toContain("1 related fields located in Fields");
        expect(screen.queryByRole("tab", { name: "Tables" })).toBeNull();
        expect(screen.queryByText("Second table")).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(props.onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("tab", { name: "Result" }));
        view.rerender(<TestPane {...props} />);
        expect(screen.getByRole("tab", { name: "Result" }).getAttribute("aria-selected")).toBe("true");
        view.rerender(<TestPane {...props} selectionRequest={2} />);
        expect(screen.getByRole("tab", { name: "Fields" }).getAttribute("aria-selected")).toBe("true");
    });

    it("explains table-only results without creating Fields data or a Document Tables group", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", tables: [1, 2].map(number => ({
            rowCount: 1, columnCount: 1, cells: [{ rowIndex: 0, columnIndex: 0, content: `Table ${number} value` }],
        })) }] }).contents[0]!;
        const props = { result: {}, content, contents: [content], contentIndex: 0, issues: [], error: null,
            hovered: null, sourceReady: true, isPageAvailable: () => true,
            onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), onClear: vi.fn(),
            sourceTableSelection: true, selectionRequest: 1 };
        const selected = content.tables![1]!.field;
        const view = render(<TestPane {...props} selected={selected} tableLocation={{ table: selected, match: matchTableFields(content, selected) }} />);
        expect(screen.getByRole("heading", { name: "No extracted fields" })).toBeTruthy();
        expect(screen.getAllByRole("status").map(item => item.textContent).join(" ")).toContain("no corresponding extracted fields");
        expect(screen.queryByRole("tab", { name: "Tables" })).toBeNull();
        expect(screen.queryByText(/Document Tables/)).toBeNull();
        view.rerender(<TestPane {...props} sourceTableSelection={false} selected={null} />);
        expect(screen.queryByText(/no corresponding extracted fields/)).toBeNull();
    });

    it("automatically opens the initial array without requiring an explicit selection", () => {
        const { content } = structuredContent();
        render(<TestPane result={{}} content={content} contents={[content]} contentIndex={0} issues={[]} error={null}
            selected={null} hovered={null} sourceReady onContentChange={vi.fn()} isPageAvailable={() => true}
            onHover={vi.fn()} onLeave={vi.fn()} onSelect={vi.fn()} onClear={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Collapse Rows" })).toBeTruthy();
        expect(screen.getByRole("table", { name: "Rows values" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Select value of Rows / Item 1 / Label" })).toBeTruthy();
    });

    it("retains field-level F2 inspection without a selected-value toolbar shortcut or another selection", () => {
        const { content, firstLabel } = structuredContent();
        const { container, onSelect } = renderPane(content, firstLabel);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(screen.queryByRole("button", { name: "View selected value" })).toBeNull();
        const navigation = container.querySelector(".cu-field-navigation");
        expect(navigation?.querySelector("span")?.textContent).toBe("2 / 2 fields");
        expect(navigation?.querySelectorAll("button")).toHaveLength(2);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Previous field" }).disabled).toBe(false);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next field" }).disabled).toBe(false);
        const field = screen.getByRole("button", { name: "Select value of Rows / Item 1 / Label" });
        field.focus();
        fireEvent.keyDown(field, { key: "F2" });
        const details = screen.getByRole("region", { name: "Full value and confidence" });
        expect(details.textContent).toContain("First");
        expect(document.activeElement).toBe(field);
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.keyDown(details, { key: "Escape" });
        expect(screen.queryByRole("region", { name: "Full value and confidence" })).toBeNull();
        expect(document.activeElement).toBe(field);
    });

    it("shows a real collapsed object summary and opens the complete value without selecting or expanding it", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
            ArbitraryTotal: { type: "object", valueObject: {
                Number: { type: "number", valueNumber: 610 }, Code: { type: "string", valueString: "USD" },
            } },
        } }] }).contents[0]!;
        const field = content.fields[0]!;
        const { container, onSelect } = renderPane(content, field);
        fireEvent.click(screen.getByRole("button", { name: "Collapse ArbitraryTotal" }));
        const summary = screen.getByRole("button", { name: "View full value of ArbitraryTotal" });
        expect(summary.textContent).toBe("610 USD");
        expect(container.querySelector(".cu-group-selection-count")).toBeNull();
        expect(container.querySelector(".is-group-selected")).toBeTruthy();
        fireEvent.click(summary);
        expect(screen.getByLabelText("Full extracted value").textContent).toBe(JSON.stringify(field.value, null, 2));
        expect(document.activeElement).toBe(screen.getByLabelText("Full extracted value"));
        expect(screen.getByRole("button", { name: "Expand ArbitraryTotal" })).toBeTruthy();
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Close full value details" }));
        const name = screen.getByRole("button", { name: "ArbitraryTotal" });
        expect(document.activeElement).toBe(name);
        fireEvent.keyDown(name, { key: "F2" });
        expect(screen.getByLabelText("Full extracted value").textContent).toBe(JSON.stringify(field.value, null, 2));
        expect(screen.getByRole("button", { name: "Expand ArbitraryTotal" })).toBeTruthy();
    });

    it("keeps collapsed array counts and full long object values separate from their display summaries", () => {
        const { content, rows } = structuredContent();
        const { unmount } = renderPane(content);
        const summary = screen.getByRole("button", { name: "View full value of Rows" });
        expect(summary.textContent).toBe("2 items");
        fireEvent.click(summary);
        expect(screen.getByLabelText("Full extracted value").textContent).toBe(JSON.stringify(rows.value, null, 2));
        unmount();
        const long = `${"long value ".repeat(1000)}FULL END`;
        const next = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
            Long: { type: "object", valueObject: { Text: { type: "string", valueString: long } } },
        } }] }).contents[0]!;
        renderPane(next);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Long" }));
        const full = screen.getByRole("button", { name: "View full value of Long" });
        expect(full.textContent).toBe(long);
        fireEvent.click(full);
        expect(screen.getByLabelText("Full extracted value").textContent).toBe(JSON.stringify(next.fields[0]!.value, null, 2));
    });

    it("shows a nested array count only in Value while keeping names, business rows and full-value access", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
            Nested: { type: "object", valueObject: { Inner: { type: "array", valueArray: [
                { type: "integer", valueInteger: 0 }, { type: "boolean", valueBoolean: false },
                { type: "string", valueString: null },
            ] } } },
        } }] }).contents[0]!;
        const { container } = renderPane(content);
        const name = screen.getByRole("button", { name: "Inner" });
        const row = name.closest("tr")!;
        expect(row.querySelector(".cu-summary-value")?.textContent).toBe("3 items");
        expect(row.querySelector("td")?.textContent).toBe("Inner");
        expect(container.querySelector(".cu-field-count")).toBeNull();
        fireEvent.click(name);
        expect(row.querySelector(".cu-summary-value")?.textContent).toBe("3 items");
        expect(screen.getByRole("table").querySelectorAll("tbody > tr")).toHaveLength(3);
        fireEvent.click(name);
        fireEvent.click(row.querySelector<HTMLButtonElement>(".cu-summary-value")!);
        expect(screen.getByLabelText("Full extracted value").textContent)
            .toBe(JSON.stringify(content.fields[0]!.children[0]!.value, null, 2));
    });

    it("omits the selected-value toolbar shortcut for empty and group selections and leaves group confidence blank", () => {
        const { content, rows } = structuredContent();
        const empty = renderPane(content);
        expect(screen.queryByRole("button", { name: "View selected value" })).toBeNull();
        expect(empty.container.querySelectorAll(".cu-field-navigation button")).toHaveLength(2);
        cleanup();
        const { container } = renderPane(content, rows);
        expect(screen.queryByRole("button", { name: "View selected value" })).toBeNull();
        expect(container.querySelectorAll(".cu-field-navigation button")).toHaveLength(2);
        expect(container.querySelector(".cu-group-selection-count")).toBeNull();
        expect(container.querySelector(".is-group-selected")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "3 columns" }));
        expect(container.querySelector(".is-group-selected .cu-confidence")?.textContent).toBe("");
    });

    it("marks the selected inline cell and its business row and column without selecting its neighbors", () => {
        const { content, firstLabel } = structuredContent();
        const { container } = renderPane(content, firstLabel);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        const grid = screen.getByRole("table", { name: "Rows values" });
        expect(grid.querySelectorAll("td.is-selected-cell")).toHaveLength(1);
        expect(grid.querySelector("th.is-location-row")?.textContent).toBe("1");
        expect(grid.querySelector("th.is-location-column")?.textContent).toBe("Label");
        expect(container.querySelector(`[data-field-id="${firstLabel.id}"]`)?.closest("td")?.classList.contains("is-selected-cell")).toBe(true);
    });

    it("keeps whole-array selection on the group instead of outlining every cell", () => {
        const { content, rows } = structuredContent();
        const { container } = renderPane(content, rows);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(container.querySelector(".is-group-selected")?.getAttribute("data-field-id")).toBe(rows.id);
        expect(container.querySelectorAll(".is-selected-cell, .is-location-row, .is-location-column")).toHaveLength(0);
    });

    it("never marks absent projection cells as selected when there is no selection", () => {
        const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
            Rows: { type: "array", valueArray: [
                { type: "object", valueObject: { Label: { type: "string", valueString: "First" } } },
                { type: "object", valueObject: { Other: { type: "string", valueString: "Second" } } },
            ] },
        } }] }).contents[0]!;
        const { container } = renderPane(content);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(screen.getAllByText("No cell returned")).toHaveLength(2);
        expect(container.querySelectorAll(".is-selected-cell, .is-location-row, .is-location-column")).toHaveLength(0);
    });

    it("projects object arrays into business-order grids with stable numeric source identities", () => {
        const { content, firstLabel } = structuredContent();
        const { container, onSelect } = renderPane(content);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(screen.getByRole("table", { name: "Rows values" })).toBeTruthy();
        expect(screen.getByRole("rowheader", { name: "1" })).toBeTruthy();
        expect(screen.getByRole("rowheader", { name: "2" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Select value of Rows / Item 1 / Label" }));
        expect(onSelect).toHaveBeenCalledWith(firstLabel);
        expect(container.querySelector(`[data-field-id="${firstLabel.id}"]`)).toBeTruthy();
        expect(container.querySelector('[data-field-type="array"]')).toBeTruthy();
        expect(screen.getByRole("button", { name: "Select value of Rows / Item 2 / Label" })).toBeTruthy();
    });

    it("keeps a hidden selected descendant visible through its collapsed parent state", () => {
        const { content, rows, firstLabel } = structuredContent();
        const { container } = renderPane(content, firstLabel);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(screen.getByRole("button", { name: "Select value of Rows / Item 1 / Label" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Collapse Rows" }));
        expect(screen.queryByRole("button", { name: "Select value of Rows / Item 1 / Label" })).toBeNull();
        expect(container.querySelector(`[data-field-id="${rows.id}"]`)?.classList.contains("is-selected")).toBe(true);
        expect(screen.getByRole("status").textContent).toBe("Pinned: Rows / Item 1 / Label");
    });

    it("derives a group page badge from real descendants and disables unavailable navigation", () => {
        const { content } = structuredContent();
        renderPane(content, null, pageNumber => pageNumber === 1);
        const badge = screen.getByRole<HTMLButtonElement>("button", { name: "Locate Rows on page 1, 2 source pages" });
        expect(badge.disabled).toBe(false);
        cleanup();
        renderPane(content, null, () => false);
        const unavailable = screen.getByRole<HTMLButtonElement>("button", { name: "Locate Rows on page 1, 2 source pages" });
        expect(unavailable.disabled).toBe(true);
        expect(unavailable.getAttribute("title")).toContain("Page 1 is not present");
    });

    it("switches real result views with tab semantics without losing Fields expansion state", async () => {
        const fixture = structuredContent();
        fixture.content.markdown = "# Extracted title";
        renderPane(fixture.content);

        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
        expect(await screen.findByRole("heading", { name: "Extracted title" }, { timeout: 5000 })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Markdown" }).getAttribute("aria-selected")).toBe("true");

        fireEvent.keyDown(screen.getByRole("tab", { name: "Markdown" }), { key: "ArrowRight" });
        expect(await screen.findByRole("tree", { name: "Original Analyze result JSON" }, { timeout: 5000 })).toBeTruthy();
        expect(screen.getByText(/rawOnly/)).toBeTruthy();

        fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "Home" });
        expect(screen.getByRole("button", { name: "Collapse Rows" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Fields" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.queryByRole("tab", { name: "Paragraphs" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Tables" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Code" })).toBeNull();
    }, 15000);

    it("renders only available Studio tabs and uses keyboard order without disabled placeholders", async () => {
        const { content } = structuredContent();
        const details = parseCuResult({
            apiVersion: "2026-06-01-preview",
            contents: [{
                kind: "document", paragraphs: [{ content: "Saved paragraph" }],
                tables: [{ rowCount: 1, columnCount: 1, cells: [] }],
                figures: [{ id: "figure-1" }], signatures: [{ id: "signature-1" }],
            }],
        }).contents[0];
        if (!details) throw new Error("Detail fixture is unavailable.");
        Object.assign(content, {
            markdown: "# Saved",
            paragraphs: details.paragraphs, tables: details.tables,
            figures: details.figures, signatures: details.signatures,
            metadata: { Author: "Contoso" },
        });
        const { container } = renderPane(content, null, () => true, { rawOnly: "preserved" },
            { apiVersion: "2026-06-01-preview" });
        expect(screen.getAllByRole("tab").map(tab => tab.textContent))
            .toEqual(["Fields", "Markdown", "Paragraphs", "Figures", "Signatures", "Metadata", "Result"]);
        expect(container.querySelectorAll('[role="tab"][disabled]')).toHaveLength(0);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Fields" }), { key: "End" });
        expect(screen.getByRole("tab", { name: "Result" }).getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Result" }));
        expect(await screen.findByRole("tree", { name: "Original Analyze result JSON" })).toBeTruthy();
        expect(screen.getByText(/rawOnly/)).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "ArrowLeft" });
        expect(await screen.findByRole("table", { name: "Returned metadata" })).toBeTruthy();
    });

    it("retains an applicable view on content changes and selects a stable fallback when its data disappears", async () => {
        const { content } = structuredContent();
        content.markdown = "# First content";
        const { rerenderContent } = renderPane(content);
        fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
        expect(await screen.findByRole("heading", { name: "First content" })).toBeTruthy();
        rerenderContent({ ...content, id: "/contents/1", markdown: "# Second content" });
        expect(await screen.findByRole("heading", { name: "Second content" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Markdown" }).getAttribute("aria-selected")).toBe("true");
        rerenderContent({ ...content, id: "/contents/2", markdown: "" });
        expect(screen.queryByRole("tab", { name: "Markdown" })).toBeNull();
        expect(screen.getByRole("tab", { name: "Fields" }).getAttribute("aria-selected")).toBe("true");
        rerenderContent({ ...content, id: "/contents/1" });
        expect(screen.getByRole("tab", { name: "Fields" }).getAttribute("aria-selected")).toBe("true");
    });

    it("does not show a Fields tab for contents with no fields", async () => {
        const content: CuContent = { id: "/contents/0", kind: "document", pages: [], fields: [], markdown: " \n" };
        renderPane(content);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Result"]);
        expect(await screen.findByRole("tree", { name: "Original Analyze result JSON" })).toBeTruthy();
        expect(screen.queryByRole("switch", { name: "Hide missing fields" })).toBeNull();
    });
});
