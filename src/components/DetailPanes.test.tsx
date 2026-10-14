// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseCuResult } from "../internal/parseCuResult";
import { ParagraphsPane } from "./ParagraphsPane";
import { TablesPane } from "./TablesPane";
import { MetadataPane } from "./MetadataPane";
import { CodePane } from "./CodePane";
import { CopyButton } from "./CopyButton";
import { SourceThumbnail } from "./SourceThumbnail";
import { FiguresPane } from "./FiguresPane";
import type { LoadedSource, SourceCrop } from "../internal/source";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "clipboard");
});

describe("dedicated result panes", () => {
    it("renders CU paragraph order, role and page metadata with source-linked selection", () => {
        const content = parseCuResult({
            apiVersion: "2025-11-01",
            contents: [{ kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
                paragraphs: [{ content: "First text", role: "title", source: "D(1,1,2,3,4)" }, { content: "Second text" }] }],
        }).contents[0];
        if (!content?.paragraphs) throw new Error("Expected paragraphs.");
        const onSelect = vi.fn();
        const onHover = vi.fn(), onLeave = vi.fn();
        render(<ParagraphsPane paragraphs={content.paragraphs} selected={null} hovered={null} previewId="paragraph-preview"
            onHover={onHover} onLeave={onLeave} onSelect={onSelect} />);
        expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual([
            expect.stringContaining("First text"), expect.stringContaining("Second text"),
        ]);
        expect(screen.getByText("title")).toBeTruthy();
        expect(screen.getByText("Page 1")).toBeTruthy();
        const paragraph = screen.getByRole("button", { name: "Select Paragraph 1" });
        fireEvent.mouseEnter(paragraph);
        expect(onHover).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        fireEvent.mouseLeave(paragraph);
        expect(onLeave).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        fireEvent.focus(paragraph);
        expect(onHover).toHaveBeenCalledWith(content.paragraphs[0]?.field, false);
        fireEvent.click(paragraph);
        expect(onSelect).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        expect(screen.getByText("No source region")).toBeTruthy();
    });

    it("renders native table headers and merged spans and reports layout errors explicitly", () => {
        const content = parseCuResult({
            apiVersion: "2025-11-01",
            contents: [{ kind: "document", tables: [{ rowCount: 1, columnCount: 2,
                cells: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: "Merged header" }] }] }],
        }).contents[0];
        if (!content?.tables) throw new Error("Expected tables.");
        const onSelect = vi.fn();
        const view = render(<TablesPane tables={content.tables} index={0} onTableChange={vi.fn()} selected={null} onSelect={onSelect} />);
        expect(screen.getByRole("columnheader").getAttribute("colspan")).toBe("2");
        fireEvent.click(screen.getByRole("button", { name: "Select Table 1, row 1, column 1" }));
        expect(onSelect).toHaveBeenCalledWith(content.tables[0]?.cells[0]?.field);
        view.rerender(<TablesPane tables={content.tables.map(table => ({ ...table, rows: [], layoutError: "Invalid grid" }))}
            index={0} onTableChange={vi.fn()} selected={null} onSelect={onSelect} />);
        expect(screen.getByRole("alert").textContent).toBe("Invalid grid");
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("associates all returned figure descriptions with unique targets across viewers", () => {
        const content = parseCuResult({
            apiVersion: "2026-06-01-preview",
            contents: [{ kind: "document", figures: [{ id: "figure with spaces", kind: "chart", role: "logo",
                caption: { content: "Returned caption" }, description: "Returned description",
                footnotes: [{ content: "First footnote" }, { content: "Second footnote" }] }] }],
        }).contents[0];
        if (!content?.figures) throw new Error("Expected figures.");
        render(<>
            <FiguresPane figures={content.figures} content={content} source={null} selected={null} onSelect={vi.fn()} />
            <FiguresPane figures={content.figures} content={content} source={null} selected={null} onSelect={vi.fn()} />
        </>);
        const ids: string[] = [];
        for (const button of screen.getAllByRole("button", { name: "Select Figure 1" })) {
            const description = button.getAttribute("aria-describedby");
            if (!description) throw new Error("Expected figure descriptions.");
            const targets = description.split(" ");
            ids.push(...targets);
            const text = targets.map(id => {
                const element = document.getElementById(id);
                if (!element) throw new Error(`Missing description target: ${id}`);
                return element.textContent;
            }).join(" ");
            expect(text).toContain("Returned caption");
            expect(text).toContain("Returned description");
            expect(text).toContain("First footnote");
            expect(text).toContain("Second footnote");
            expect(text).toContain("No source region");
        }
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("preserves metadata property order and copies only the requested value", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        render(<MetadataPane metadata={{ Zebra: "last alphabetically", Author: "Contoso" }} />);
        expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["Zebra", "Author"]);
        fireEvent.click(screen.getByRole("button", { name: "Copy metadata Author" }));
        expect(await screen.findByText("Copied")).toBeTruthy();
        expect(writeText).toHaveBeenCalledWith("Contoso");
    });

    it("shows clipboard failures and never reports success after denial", async () => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
        });
        render(<CopyButton value="returned" label="Copy test" />);
        fireEvent.click(screen.getByRole("button", { name: "Copy test" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Permission denied");
        expect(screen.queryByText("Copied")).toBeNull();
    });

    it("keeps copying focusable and guards duplicate activation while a write is pending", async () => {
        let complete!: () => void;
        const writeText = vi.fn().mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        render(<CopyButton value="returned" label="Copy test" />);
        const button = screen.getByRole("button", { name: "Copy test" });
        button.focus();
        fireEvent.click(button);
        expect(button.hasAttribute("disabled")).toBe(false);
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-busy")).toBe("true");
        expect(document.activeElement).toBe(button);
        fireEvent.click(button);
        expect(writeText).toHaveBeenCalledTimes(1);
        await act(async () => { complete(); await Promise.resolve(); });
        expect(button.getAttribute("aria-disabled")).toBe("false");
        expect(document.activeElement).toBe(button);
        expect(screen.getByText("Copied")).toBeTruthy();
    });

    it("switches all code languages, highlights safely and copies the exact sample", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const { container } = render(<CodePane analyzerId={'test-"<script>window.bad=true</script>'} apiVersion="2026-06-01-preview" />);
        expect(screen.getByLabelText("Python SDK sample").textContent).toContain("client.begin_analyze");
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector(".hljs-keyword")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "C#" }));
        expect(screen.getByLabelText("C# SDK sample").textContent).toContain("V2026_06_01_Preview");
        fireEvent.click(screen.getByRole("button", { name: "JavaScript" }));
        const code = screen.getByLabelText("JavaScript SDK sample").textContent;
        expect(code).toContain("client.analyze(");
        fireEvent.click(screen.getByRole("button", { name: "Copy SDK sample" }));
        expect(await screen.findByText("Copied")).toBeTruthy();
        expect(writeText).toHaveBeenCalledWith(code);
        expect(container.querySelector("script, iframe, img")).toBeNull();
    });

    it("crops through the loaded source and aborts a pending thumbnail on unmount", async () => {
        const signals: AbortSignal[] = [];
        const crops: (SourceCrop | undefined)[] = [];
        let complete!: (value: { width: number; height: number }) => void;
        const pending = new Promise<{ width: number; height: number }>(resolve => { complete = resolve; });
        const dispose = vi.fn().mockResolvedValue(undefined);
        const source: LoadedSource = {
            kind: "image", name: "owned", pages: [{ pageNumber: 1, width: 100, height: 100 }],
            render(_page, _canvas, _zoom, _rotation, signal, crop) {
                signals.push(signal); crops.push(crop); return pending;
            },
            dispose,
        };
        const content = parseCuResult({
            apiVersion: "2025-11-01",
            contents: [{ kind: "document", unit: "pixel", pages: source.pages,
                figures: [{ id: "figure", source: "D(1,10,20,20,10)" }] }],
        }).contents[0];
        const region = content?.figures?.[0]?.field.regions[0];
        if (!content || !region) throw new Error("Expected thumbnail region.");
        const view = render(<SourceThumbnail source={source} content={content} region={region} label="Owned crop" />);
        await vi.waitFor(() => expect(crops).toEqual([{ x: 10, y: 20, width: 20, height: 10 }]));
        view.unmount();
        expect(signals[0]?.aborted).toBe(true);
        complete({ width: 20, height: 10 });
        await pending;
        expect(dispose).not.toHaveBeenCalled();
    });
});
