// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FieldsPane } from "./FieldsPane";
import type { CuApiVersion, CuContent, CuField, CuRegion } from "../internal/types";

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
    context: { apiVersion?: CuApiVersion; analyzerId?: string } = {}) {
    const onSelect = vi.fn();
    const props = {
        result, content, contents: [content], contentIndex: 0, issues: [], error: null,
        selected, hovered: null, sourceReady: true, isPageAvailable,
        onContentChange: vi.fn(), onHover: vi.fn(), onLeave: vi.fn(), onSelect, onClear: vi.fn(),
        ...context,
    };
    const view = render(<FieldsPane {...props} />);
    return { ...view, onSelect, rerenderContent: (next: CuContent) => view.rerender(<FieldsPane {...props} content={next} />) };
}

afterEach(cleanup);

describe("structured Fields presentation", () => {
    it("shows one-based array items while retaining stable numeric source identities", () => {
        const { content, firstLabel } = structuredContent();
        const { container, onSelect } = renderPane(content);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        expect(screen.getByRole("button", { name: "Item 1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Item 2" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "0" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Expand Item 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Label" }));
        expect(onSelect).toHaveBeenCalledWith(firstLabel);
        expect(container.querySelector(`[data-field-id="${firstLabel.id}"]`)).toBeTruthy();
        expect(container.querySelector('[data-field-type="array"]')).toBeTruthy();
        expect(container.querySelectorAll('[data-field-type="object"]')).toHaveLength(2);
    });

    it("keeps a hidden selected descendant visible through its collapsed parent state", () => {
        const { content, rows, firstLabel } = structuredContent();
        const { container } = renderPane(content, firstLabel);
        fireEvent.click(screen.getByRole("button", { name: "Expand Rows" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand Item 1" }));
        expect(screen.getByRole("button", { name: "Label" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Collapse Rows" }));
        expect(screen.queryByRole("button", { name: "Label" })).toBeNull();
        expect(container.querySelector(`[data-field-id="${rows.id}"]`)?.classList.contains("is-selected")).toBe(true);
        expect(screen.getByRole("status").textContent).toBe("Pinned: Rows / Item 1 / Label");
    });

    it("derives a group page badge from real descendants and disables unavailable navigation", () => {
        const { content } = structuredContent();
        renderPane(content, null, pageNumber => pageNumber === 1);
        const badge = screen.getByRole<HTMLButtonElement>("button", { name: "Locate Rows on page 1" });
        expect(badge.disabled).toBe(false);
        cleanup();
        renderPane(content, null, () => false);
        const unavailable = screen.getByRole<HTMLButtonElement>("button", { name: "Locate Rows on page 1" });
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
    });

    it("renders only available Studio tabs and uses keyboard order without disabled placeholders", async () => {
        const { content } = structuredContent();
        Object.assign(content, {
            markdown: "# Saved",
            paragraphs: [{ content: "Saved paragraph" }],
            tables: [{ rowCount: 1, columnCount: 1 }],
            figures: [{ id: "figure-1" }],
            signatures: [{ id: "signature-1" }],
            metadata: { Author: "Contoso" },
        });
        const { container } = renderPane(content, null, () => true, { rawOnly: "preserved" },
            { apiVersion: "2026-06-01-preview", analyzerId: "saved-analyzer" });
        expect(screen.getAllByRole("tab").map(tab => tab.textContent))
            .toEqual(["Fields", "Markdown", "Paragraphs", "Tables", "Figures", "Signatures", "Metadata", "Result", "Code"]);
        expect(container.querySelectorAll('[role="tab"][disabled]')).toHaveLength(0);
        fireEvent.keyDown(screen.getByRole("tab", { name: "Fields" }), { key: "End" });
        expect(screen.getByRole("tab", { name: "Code" }).getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Code" }));
        expect(screen.getByRole("heading", { name: "Code view is not implemented yet" })).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("tab", { name: "Code" }), { key: "ArrowLeft" });
        expect(await screen.findByRole("tree", { name: "Original Analyze result JSON" })).toBeTruthy();
        expect(screen.getByText(/rawOnly/)).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("tab", { name: "Result" }), { key: "ArrowLeft" });
        expect(screen.getByRole("heading", { name: "Metadata view is not implemented yet" })).toBeTruthy();
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
