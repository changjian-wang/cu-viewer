// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { JsonPane, MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "./JsonPane";
import { parseCuResult } from "../model/parseCuResult";

afterEach(cleanup);

describe("original JSON result presentation", () => {
    it("shows the original object and lets nested objects and arrays expand", () => {
        render(<JsonPane value={{
            status: "Succeeded",
            rawOnly: { values: ["first", "second"] },
        }} />);

        expect(screen.getByRole("tree", { name: "Original Analyze result JSON" })).toBeTruthy();
        expect(screen.getByText(/rawOnly/)).toBeTruthy();
        expect(screen.queryByText("\"first\"")).toBeNull();
        fireEvent.click(screen.getAllByRole("button", { name: "Expand JSON node" })[0]!);
        fireEvent.click(screen.getAllByRole("button", { name: "Expand JSON node" })[0]!);
        expect(screen.getByText("\"first\"")).toBeTruthy();
        expect(screen.getByText("\"second\"")).toBeTruthy();
    });

    it("rejects circular/non-JSON values and enforces an explicit size limit", () => {
        const circular: { self?: unknown } = {};
        circular.self = circular;
        const { rerender } = render(<JsonPane value={circular} />);
        expect(screen.getByRole("alert").textContent).toContain("JSON could not be displayed");

        rerender(<JsonPane value={{ value: undefined }} />);
        expect(screen.getByRole("alert").textContent).toContain("non-JSON undefined");

        rerender(<JsonPane value={{ value: "x".repeat(MAX_JSON_CHARACTERS + 1) }} />);
        expect(screen.getByRole("alert").textContent).toContain("JSON is too large to render");

        rerender(<JsonPane value={{ values: Array.from({ length: MAX_JSON_VALUES + 1 }, () => 0) }} />);
        expect(screen.getByRole("alert").textContent).toContain(`${MAX_JSON_VALUES.toLocaleString("en-US")}-value limit`);
    });

    it("locates repeated key names by path without filtering JSON or searching values", () => {
        const value = {
            source: "root source",
            result: { fields: { "a/b~": { source: "field source" } }, items: [{ source: "array source" }], valueString: "source" },
        };
        const original = JSON.stringify(value);
        const { container } = render(<JsonPane value={value} />);
        const search = screen.getByRole("searchbox", { name: "Search JSON keys" });
        const position = screen.getByLabelText("Current JSON key position");
        const next = screen.getByRole("button", { name: "Next JSON key" });
        const previous = screen.getByRole("button", { name: "Previous JSON key" });
        fireEvent.change(search, { target: { value: " SoUrCe " } });

        expect(position.textContent).toContain("1 / 3 keys");
        expect(container.querySelectorAll(".cu-json-match")).toHaveLength(3);
        expect(screen.getByText("valueString:")).toBeTruthy();
        expect(screen.getByText('"source"')).toBeTruthy();
        expect(document.activeElement).not.toBe(next);
        fireEvent.click(next);
        expect(position.textContent).toContain("2 / 3 keys");
        const nested = container.querySelector('[data-json-path="/result/fields/a~1b~0/source"]');
        expect(nested?.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(nested);
        fireEvent.click(next);
        expect(container.querySelector('[data-json-path="/result/items/0/source"]')?.getAttribute("aria-selected")).toBe("true");
        fireEvent.click(next);
        expect(position.textContent).toContain("1 / 3 keys");
        fireEvent.click(previous);
        expect(position.textContent).toContain("3 / 3 keys");
        fireEvent.keyDown(search, { key: "Enter" });
        expect(position.textContent).toContain("1 / 3 keys");
        fireEvent.keyDown(search, { key: "Enter", shiftKey: true });
        expect(position.textContent).toContain("3 / 3 keys");

        fireEvent.change(search, { target: { value: "not-a-key" } });
        expect(position.textContent).toContain("\u2014 / 0 keys");
        expect(screen.getByRole("status").textContent).toBe("No matching JSON keys.");
        expect(next.hasAttribute("disabled")).toBe(true);
        expect(previous.hasAttribute("disabled")).toBe(true);
        fireEvent.change(search, { target: { value: "" } });
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByText('"field source"')).toBeNull();
        expect(JSON.stringify(value)).toBe(original);
    });

    it("navigates every object property, reveals collapsed ancestors, and retains tree keyboard controls", () => {
        const { container } = render(<JsonPane value={{ nested: { child: 1 }, items: [{ child: 2 }] }} />);
        const position = screen.getByLabelText("Current JSON key position");
        expect(position.textContent).toContain("\u2014 / 4 keys");
        fireEvent.click(screen.getByRole("button", { name: "Previous JSON key" }));
        const last = container.querySelector('[data-json-path="/items/0/child"]');
        expect(position.textContent).toContain("4 / 4 keys");
        expect(document.activeElement).toBe(last);
        fireEvent.click(screen.getByRole("button", { name: "Next JSON key" }));
        const nested = screen.getByRole("treeitem", { name: "nested" });
        expect(position.textContent).toContain("1 / 4 keys");
        fireEvent.keyDown(nested, { key: "ArrowRight" });
        expect(nested.getAttribute("aria-expanded")).toBe("true");
        fireEvent.keyDown(nested, { key: "ArrowRight" });
        const child = container.querySelector('[data-json-path="/nested/child"]')!;
        expect(document.activeElement).toBe(child);
        fireEvent.keyDown(child, { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: "items" }));
        fireEvent.keyDown(document.activeElement!, { key: "Home" });
        expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: "JSON root" }));
        fireEvent.keyDown(document.activeElement!, { key: "End" });
        expect(document.activeElement).toBe(last);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "child" } });
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
        expect(nested.getAttribute("aria-expanded")).toBe("true");
    });

    it("retains a visible tree tab stop when clearing search folds the selected property", () => {
        const { container } = render(<JsonPane value={{ nested: { source: "Saved source" } }} />);
        const search = screen.getByRole("searchbox", { name: "Search JSON keys" });
        fireEvent.change(search, { target: { value: "source" } });
        expect(screen.getByRole("treeitem", { name: "source" }).tabIndex).toBe(0);
        fireEvent.change(search, { target: { value: "" } });
        expect(screen.queryByRole("treeitem", { name: "source" })).toBeNull();
        const parent = screen.getByRole("treeitem", { name: "nested" });
        expect(parent.tabIndex).toBe(0);
        expect(container.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
        fireEvent.keyDown(parent, { key: "ArrowRight" });
        expect(screen.getByRole("treeitem", { name: "source" })).toBeTruthy();
    });

    it("expands JSON and collapses nested containers without changing selection or closing settings", () => {
        const value = { nested: { items: [{ child: { text: "Retained value" } }] } };
        const original = JSON.stringify(value), onKeyDown = vi.fn();
        render(<div onKeyDown={onKeyDown}><JsonPane value={value} /><button type="button">Outside</button></div>);
        fireEvent.click(screen.getByRole("button", { name: "Next JSON key" }));
        const position = screen.getByLabelText("Current JSON key position").textContent;
        const trigger = screen.getByRole("button", { name: "Result settings" });
        fireEvent.click(trigger);
        const collapse = screen.getByRole("button", { name: "Collapse all JSON" });
        expect(document.activeElement).toBe(collapse);
        fireEvent.click(screen.getByRole("button", { name: "Expand all JSON" }));
        expect(screen.getByText('"Retained value"')).toBeTruthy();
        expect(screen.queryAllByRole("button", { name: "Expand JSON node" })).toHaveLength(0);
        expect(screen.getByRole("dialog", { name: "Result settings" })).toBeTruthy();
        expect(screen.getByLabelText("Current JSON key position").textContent).toBe(position);
        fireEvent.click(collapse);
        expect(screen.getAllByRole("treeitem")).toHaveLength(2);
        const root = screen.getByRole("treeitem", { name: "JSON root" });
        expect(root.getAttribute("aria-expanded")).toBe("true");
        const nested = screen.getByRole("treeitem", { name: "nested" });
        expect(nested.getAttribute("aria-expanded")).toBe("false");
        expect(nested.tabIndex).toBe(0);
        expect(screen.getByLabelText("Current JSON key position").textContent).toBe(position);
        expect(screen.getByRole("dialog", { name: "Result settings" })).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(onKeyDown).not.toHaveBeenCalled();
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole("button", { name: "Close result settings" }));
        expect(document.activeElement).toBe(trigger);
        fireEvent.click(trigger);
        const outside = screen.getByRole("button", { name: "Outside" });
        fireEvent.pointerDown(outside);
        outside.focus();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(outside);
        expect(JSON.stringify(value)).toBe(original);
    });

    it.each(["envelope", "inner result"])("collapses %s contents while keeping metadata and usage tokens expanded", shape => {
        const result = {
            analyzerId: "saved-analyzer", apiVersion: "2025-11-01", warnings: [],
            contents: [{ kind: "document", fields: { Name: { type: "string", valueString: "Saved field" } } }],
        };
        const usage = { documentPagesStandard: 4, contextualizationTokens: 4000, tokens: { input: 13076, output: 1171 } };
        const envelope = shape === "envelope";
        const value = envelope ? { id: "saved-operation", status: "Succeeded", result, usage } : { ...result, usage };
        render(<JsonPane value={value} />);
        fireEvent.click(screen.getByRole("button", { name: "Result settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand all JSON" }));
        fireEvent.click(screen.getByRole("button", { name: "Collapse all JSON" }));
        const prefix = envelope ? "/result" : "";
        expect(screen.getAllByRole("treeitem").map(element => element.dataset.jsonPath)).toEqual([
            "", ...(envelope ? ["/id", "/status", "/result"] : []),
            `${prefix}/analyzerId`, `${prefix}/apiVersion`, `${prefix}/warnings`, `${prefix}/contents`,
            "/usage", "/usage/documentPagesStandard", "/usage/contextualizationTokens", "/usage/tokens",
            "/usage/tokens/input", "/usage/tokens/output",
        ]);
        for (const name of ["JSON root", "usage", "tokens", ...(envelope ? ["result"] : [])]) {
            expect(screen.getByRole("treeitem", { name }).getAttribute("aria-expanded")).toBe("true");
        }
        expect(screen.getByRole("treeitem", { name: "contents" }).getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(screen.getByRole("button", { name: "Expand all JSON" }));
        expect(screen.getByRole("treeitem", { name: "Name" })).toBeTruthy();
    });

    it("disables bulk JSON expansion while searching or when there are no expandable nodes", () => {
        const { rerender } = render(<JsonPane value={{ nested: { leaf: "Retained" } }} />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "leaf" } });
        fireEvent.click(screen.getByRole("button", { name: "Result settings" }));
        for (const name of ["Collapse all JSON", "Expand all JSON"]) {
            const action = screen.getByRole<HTMLButtonElement>("button", { name });
            expect(action.disabled).toBe(true);
            expect(action.title).toBe("Clear search before expanding or collapsing JSON.");
            fireEvent.click(action);
        }
        expect(screen.getByText('"Retained"')).toBeTruthy();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close result settings" }));
        rerender(<JsonPane value={{}} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
        fireEvent.click(screen.getByRole("button", { name: "Result settings" }));
        for (const name of ["Collapse all JSON", "Expand all JSON"]) {
            const action = screen.getByRole<HTMLButtonElement>("button", { name });
            expect(action.disabled).toBe(true);
            expect(action.title).toBe("No JSON nodes to expand or collapse.");
        }
    });

    it("locates exact source regions in envelopes, including a different content and non-field properties", () => {
        const value = { status: "Succeeded", result: { apiVersion: "2025-11-01", contents: [
            { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
                fields: { Name: { type: "string", valueString: "Saved", source: "D(1,1,2,10,5)" } } },
            { kind: "document", unit: "pixel", pages: [{ pageNumber: 2, width: 100, height: 100 }],
                paragraphs: [{ content: "Saved paragraph", source: "D(2,20,30,10,10);D(2,40,30,5,10)" }] },
        ] } };
        const original = JSON.stringify(value), onLocateSource = vi.fn();
        render(<JsonPane value={value} contents={parseCuResult(value).contents}
            sourceReady isPageAvailable={() => true} onLocateSource={onLocateSource} />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "source" } });
        fireEvent.click(screen.getByRole("button", { name: "Locate source /result/contents/1/paragraphs/0/source" }));
        expect(onLocateSource).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            id: "/json/result/contents/1/paragraphs/0/source", path: "/result/contents/1/paragraphs/0",
            regions: [
                { pageNumber: 2, polygon: [{ x: 20, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 40 }, { x: 20, y: 40 }] },
                { pageNumber: 2, polygon: [{ x: 40, y: 30 }, { x: 45, y: 30 }, { x: 45, y: 40 }, { x: 40, y: 40 }] },
            ],
        }), 1);
        expect(JSON.stringify(value)).toBe(original);
    });

    it("explains unavailable source links and resets search and navigation for a new result", () => {
        const value = { apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
            extra: [{ source: "D(1,1,2,10,5)" }, { source: "D(2,1,2,10,5)" }, { source: "invalid" }],
        }] };
        const contents = parseCuResult(value).contents, onLocateSource = vi.fn();
        const { rerender } = render(<JsonPane value={value} contents={contents}
            sourceReady={false} isPageAvailable={() => true} onLocateSource={onLocateSource} />);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "source" } });
        const valid = screen.getByRole("button", { name: "Locate source /contents/0/extra/0/source" });
        expect(valid.hasAttribute("disabled")).toBe(true);
        expect(valid.title).toBe("Source is not ready for navigation.");
        rerender(<JsonPane value={value} contents={contents} sourceReady isPageAvailable={() => false} onLocateSource={onLocateSource} />);
        expect(valid.hasAttribute("disabled")).toBe(true);
        expect(valid.title).toContain("Page 1 is not present");
        expect(screen.getByRole("button", { name: "Locate source /contents/0/extra/1/source" }).title).toContain("source page is absent");
        expect(screen.getByRole("button", { name: "Locate source /contents/0/extra/2/source" }).title).toContain("CU D(...)");
        fireEvent.click(valid);
        expect(onLocateSource).not.toHaveBeenCalled();
        rerender(<JsonPane value={{ fresh: true }} />);
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
        expect(screen.getByLabelText("Current JSON key position").textContent).toContain("\u2014 / 1 keys");
        expect(screen.queryByRole("button", { name: /^Locate source / })).toBeNull();
    });
});
