// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseCuResult } from "../model/parseCuResult";
import { ParagraphsPane } from "./ParagraphsPane";
import { CopyButton } from "./CopyButton";
import { SourceThumbnail } from "./SourceThumbnail";
import { FiguresPane } from "./FiguresPane";
import type { LoadedSource, SourceCrop } from "../source/source";

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
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / }).map(button => button.textContent)).toEqual([
            expect.stringContaining("First text"), expect.stringContaining("Second text"),
        ]);
        expect(screen.getByText("title")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Page 1" })).toBeTruthy();
        const paragraph = screen.getByRole("button", { name: "Select Paragraph 1" });
        const description = paragraph.getAttribute("aria-describedby")?.split(" ")
            .map(id => document.getElementById(id)?.textContent).join(" ");
        expect(description).toContain("First text");
        expect(description).toContain("Page 1");
        expect(description).toContain("title");
        fireEvent.pointerMove(paragraph);
        expect(onHover).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        fireEvent.mouseLeave(paragraph);
        expect(onLeave).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        fireEvent.focus(paragraph);
        expect(onHover).toHaveBeenCalledWith(content.paragraphs[0]?.field, false);
        fireEvent.click(paragraph);
        expect(onSelect).toHaveBeenCalledWith(content.paragraphs[0]?.field);
        expect(screen.getByRole("heading", { name: "No source region" })).toBeTruthy();
    });

    it("groups only consecutive page sets and retains full long, empty and escaped text in the original order", () => {
        const long = `${"Full paragraph content remains readable.\n".repeat(80)}FULL END`;
        const paragraphs = parseCuResult({
            apiVersion: "2026-06-01-preview",
            contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2, 3].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [
                    { content: "First", source: "D(1,1,1,10,10)" },
                    { content: "Second", source: "D(1,2,2,10,10)" },
                    { content: long, role: "sectionHeading", source: "D(3,1,1,10,10);D(2,1,1,10,10);D(3,3,3,10,10)" },
                    { content: "" },
                    { content: "<script>unsafe()</script>", source: "D(1,3,3,10,10)" },
                ],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs) throw new Error("Expected grouped paragraph fixtures.");
        const before = JSON.stringify(paragraphs);
        const { container } = render(<ParagraphsPane paragraphs={paragraphs} selected={null} hovered={null}
            previewId={undefined} onHover={vi.fn()} onLeave={vi.fn()} onSelect={vi.fn()} />);
        expect(screen.getAllByRole("heading").map(heading => heading.textContent))
            .toEqual(["Page 1", "Pages 3, 2", "No source region", "Page 1"]);
        expect(screen.getAllByRole("listitem")).toHaveLength(5);
        const buttons = screen.getAllByRole("button", { name: /^Select Paragraph / });
        expect(buttons.map(button => button.getAttribute("data-detail-id"))).toEqual(paragraphs.map(paragraph => paragraph.id));
        expect(buttons.map(button => button.querySelector(".cu-paragraph-index")?.textContent)).toEqual(["1", "2", "3", "4", "5"]);
        expect(buttons[2]?.querySelector(".cu-paragraph-content")?.textContent).toBe(long);
        expect(buttons[2]?.querySelector(".cu-paragraph-regions")?.textContent?.trim()).toBe("3 regions");
        const description = buttons[2]?.getAttribute("aria-describedby")?.split(" ")
            .map(id => document.getElementById(id)?.textContent).join(" ");
        expect(description).toContain("Page 3, 2");
        expect(description).toContain("3 regions");
        expect(screen.getByText('"" (empty string)')).toBeTruthy();
        expect(screen.getByText("<script>unsafe()</script>")).toBeTruthy();
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector(".cu-detail-select")).toBeNull();
        expect(JSON.stringify(paragraphs)).toBe(before);
    });

    it("reveals source-selected paragraphs once per request without moving focus or reacting to hover", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document",
                paragraphs: [{ content: "Source selected paragraph" }, { content: "Hovered paragraph" }] }],
        }).contents[0]?.paragraphs;
        if (!paragraphs?.[0] || !paragraphs[1]) throw new Error("Expected source-selection paragraph fixtures.");
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return this.matches(".cu-rich-result-scroll") ? new DOMRect(0, 0, 400, 100) : new DOMRect(0, 250, 400, 30);
        });
        const props = {
            paragraphs, selected: paragraphs[0].field, hovered: null, previewId: "paragraph-preview",
            onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), sourceSelection: true, selectionRequest: 1,
        };
        const focus = document.activeElement;
        const { container, rerender } = render(<ParagraphsPane {...props} />);
        const viewport = container.querySelector<HTMLElement>(".cu-rich-result-scroll");
        if (!viewport) throw new Error("Expected a paragraph viewport.");
        expect(viewport.scrollTop).toBe(224);
        expect(document.activeElement).toBe(focus);
        viewport.scrollTop = 0;
        rerender(<ParagraphsPane {...props} hovered={paragraphs[1].field} />);
        expect(viewport.scrollTop).toBe(0);
        rerender(<ParagraphsPane {...props} selectionRequest={2} />);
        expect(viewport.scrollTop).toBe(224);
        viewport.scrollTop = 0;
        rerender(<ParagraphsPane {...props} sourceSelection={false} selectionRequest={3} />);
        expect(viewport.scrollTop).toBe(0);
    });

    it("folds consecutive groups independently without renumbering or changing selection and resets for new paragraphs", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [
                    { content: "First", source: "D(1,1,1,10,10)" },
                    { content: "Second", source: "D(1,2,2,10,10)" },
                    { content: "Third", source: "D(2,1,1,10,10)" },
                    { content: "No grounding" },
                    { content: "Fifth", source: "D(1,3,3,10,10)" },
                ],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs?.[0]) throw new Error("Expected folding paragraph fixtures.");
        const props = { paragraphs, selected: paragraphs[0].field, hovered: null, previewId: undefined,
            onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn() };
        const before = JSON.stringify(paragraphs);
        const { rerender } = render(<ParagraphsPane {...props} />);
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / })).toHaveLength(5);
        const firstGroup = screen.getAllByRole("button", { name: "Collapse Page 1" })[0];
        if (!firstGroup) throw new Error("Expected the first page group.");
        firstGroup.focus();
        fireEvent.click(firstGroup);
        expect(document.activeElement).toBe(firstGroup);
        expect(firstGroup.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByRole("button", { name: "Select Paragraph 1" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Select Paragraph 2" })).toBeNull();
        expect(screen.getByRole("button", { name: "Select Paragraph 3" }).querySelector(".cu-paragraph-index")?.textContent).toBe("3");
        expect(screen.getByRole("button", { name: "Select Paragraph 5" }).querySelector(".cu-paragraph-index")?.textContent).toBe("5");
        expect(screen.getByRole("button", { name: "Collapse Page 1" }).getAttribute("aria-expanded")).toBe("true");
        expect(props.onSelect).not.toHaveBeenCalled();
        expect(props.onHover).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Expand Page 1" }));
        expect(screen.getByRole("button", { name: "Select Paragraph 1" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Collapse Page 2" }));
        rerender(<ParagraphsPane {...props} paragraphs={[...paragraphs]} />);
        expect(screen.getByRole("button", { name: "Collapse Page 2" }).getAttribute("aria-expanded")).toBe("true");
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / })).toHaveLength(5);
        expect(JSON.stringify(paragraphs)).toBe(before);
    });

    it("opens only the newly source-selected group and leaves manual folds, hover and focus alone", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [{ content: "First", source: "D(1,1,1,10,10)" },
                    { content: "Second", source: "D(2,1,1,10,10)" }],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs?.[0] || !paragraphs[1]) throw new Error("Expected source-driven folding fixtures.");
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return this.matches(".cu-rich-result-scroll") ? new DOMRect(0, 0, 400, 100) : new DOMRect(0, 250, 400, 30);
        });
        const props = { paragraphs, selected: paragraphs[1].field, hovered: null, previewId: undefined,
            onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), sourceSelection: true, selectionRequest: 1 };
        const { container, rerender } = render(<><button>Source target</button><ParagraphsPane {...props} /></>);
        const viewport = container.querySelector<HTMLElement>(".cu-rich-result-scroll");
        if (!viewport) throw new Error("Expected a paragraph viewport.");
        fireEvent.click(screen.getByRole("button", { name: "Collapse Page 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Collapse Page 2" }));
        viewport.scrollTop = 0;
        expect(screen.queryByRole("button", { name: "Select Paragraph 2" })).toBeNull();
        rerender(<><button>Source target</button><ParagraphsPane {...props} hovered={paragraphs[0].field} /></>);
        expect(screen.getByRole("button", { name: "Expand Page 2" })).toBeTruthy();
        expect(viewport.scrollTop).toBe(0);
        const source = screen.getByRole("button", { name: "Source target" });
        source.focus();
        rerender(<><button>Source target</button><ParagraphsPane {...props} selectionRequest={2} /></>);
        expect(screen.getByRole("button", { name: "Collapse Page 2" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Expand Page 1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Select Paragraph 2" }).getAttribute("aria-pressed")).toBe("true");
        expect(viewport.scrollTop).toBe(224);
        expect(document.activeElement).toBe(source);
        viewport.scrollTop = 0;
        rerender(<><button>Source target</button><ParagraphsPane {...props} selectionRequest={2} /></>);
        expect(viewport.scrollTop).toBe(0);
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it("searches paragraph names and content without replacing manual folds and handles empty matches explicitly", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [{ content: "Alpha first", source: "D(1,1,1,10,10)" },
                    { content: "Beta", source: "D(2,1,1,10,10)" },
                    { content: "Alpha last", source: "D(2,3,3,10,10)" }],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs) throw new Error("Expected searchable paragraphs.");
        const props = { paragraphs, selected: null, hovered: null, previewId: undefined,
            onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn() };
        const { rerender } = render(<ParagraphsPane {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Page 1" }));
        const search = screen.getByRole("searchbox", { name: "Search paragraphs" });
        fireEvent.change(search, { target: { value: "ALPHA" } });
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / }).map(button => button.getAttribute("aria-label")))
            .toEqual(["Select Paragraph 1", "Select Paragraph 3"]);
        expect(screen.getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Page 1", "Page 2"]);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse Page 1" }).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Paragraphs settings" }));
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse all pages" }).disabled).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Expand all pages" }).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole("dialog", { name: "Paragraphs settings" }), { key: "Escape" });
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Paragraphs settings" }));
        fireEvent.change(search, { target: { value: "Paragraph 2" } });
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / })).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Select Paragraph 2" })).toBeTruthy();
        fireEvent.change(search, { target: { value: "not returned anywhere" } });
        expect(screen.getByRole("heading", { name: "No matching paragraphs" })).toBeTruthy();
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next paragraph" }).disabled).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Previous paragraph" }).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getByRole("button", { name: "Expand Page 1" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Select Paragraph 1" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Paragraphs settings" }));
        fireEvent.change(search, { target: { value: "Alpha" } });
        rerender(<ParagraphsPane {...props} paragraphs={[...paragraphs]} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search paragraphs" }).value).toBe("");
        expect(screen.getByRole("button", { name: "Collapse Page 1" }).getAttribute("aria-expanded")).toBe("true");
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it("navigates filtered paragraphs in order, wraps, restores target groups and supports bulk settings", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [{ content: "Alpha first", source: "D(1,1,1,10,10)" },
                    { content: "Beta", source: "D(2,1,1,10,10)" },
                    { content: "Alpha last", source: "D(2,3,3,10,10)" }],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs?.[0] || !paragraphs[1] || !paragraphs[2]) throw new Error("Expected navigation paragraphs.");
        const onSelect = vi.fn();
        const props = { paragraphs, selected: null, hovered: null, previewId: undefined,
            onHover: vi.fn(), onLeave: vi.fn(), onSelect };
        const { rerender } = render(<ParagraphsPane {...props} />);
        expect(screen.getByLabelText("Current paragraph position").textContent).toBe("\u2014 / 3 paragraphs");
        fireEvent.click(screen.getByRole("button", { name: "Previous paragraph" }));
        expect(onSelect).toHaveBeenLastCalledWith(paragraphs[2].field);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Select Paragraph 3" }));
        rerender(<ParagraphsPane {...props} selected={paragraphs[2].field} />);
        expect(screen.getByLabelText("Current paragraph position").textContent).toBe("3 / 3 paragraphs");
        fireEvent.click(screen.getByRole("button", { name: "Next paragraph" }));
        expect(onSelect).toHaveBeenLastCalledWith(paragraphs[0].field);
        rerender(<ParagraphsPane {...props} selected={paragraphs[0].field} />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search paragraphs" }), { target: { value: "alpha" } });
        expect(screen.getByLabelText("Current paragraph position").textContent).toBe("1 / 2 paragraphs");
        fireEvent.click(screen.getByRole("button", { name: "Next paragraph" }));
        expect(onSelect).toHaveBeenLastCalledWith(paragraphs[2].field);
        rerender(<ParagraphsPane {...props} selected={paragraphs[2].field} />);
        expect(screen.getByLabelText("Current paragraph position").textContent).toBe("2 / 2 paragraphs");
        fireEvent.click(screen.getByRole("button", { name: "Next paragraph" }));
        expect(onSelect).toHaveBeenLastCalledWith(paragraphs[0].field);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search paragraphs" }), { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: "Paragraphs settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Collapse all pages" }));
        expect(screen.queryAllByRole("button", { name: /^Select Paragraph / })).toHaveLength(0);
        expect(screen.getByRole("dialog", { name: "Paragraphs settings" })).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        fireEvent.click(screen.getByRole("button", { name: "Next paragraph" }));
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Select Paragraph 1" }));
        expect(screen.getByRole("button", { name: "Expand Page 2" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Paragraphs settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand all pages" }));
        expect(screen.getAllByRole("button", { name: /^Select Paragraph / })).toHaveLength(3);
    });

    it("reports source selections hidden by search without clearing it or reopening manual folds", () => {
        const paragraphs = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
                paragraphs: [{ content: "Alpha", source: "D(1,1,1,10,10)" },
                    { content: "Beta", source: "D(2,1,1,10,10)" }],
            }],
        }).contents[0]?.paragraphs;
        if (!paragraphs?.[1]) throw new Error("Expected filtered source-selection paragraphs.");
        const props = { paragraphs, selected: null, hovered: null, previewId: undefined,
            onHover: vi.fn(), onLeave: vi.fn(), onSelect: vi.fn(), sourceSelection: false, selectionRequest: null };
        const { rerender } = render(<ParagraphsPane {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Page 2" }));
        fireEvent.change(screen.getByRole("searchbox", { name: "Search paragraphs" }), { target: { value: "Alpha" } });
        rerender(<ParagraphsPane {...props} selected={paragraphs[1].field} sourceSelection selectionRequest={1} />);
        expect(screen.getByRole("status").textContent).toContain("hidden by the current search");
        expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search paragraphs" }).value).toBe("Alpha");
        fireEvent.change(screen.getByRole("searchbox", { name: "Search paragraphs" }), { target: { value: "" } });
        expect(screen.getByRole("button", { name: "Expand Page 2" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Select Paragraph 2" })).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
        expect(props.onSelect).not.toHaveBeenCalled();
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
            <FiguresPane figures={content.figures} content={content} source={null} selected={null} hovered={null}
                onHover={vi.fn()} onLeave={vi.fn()} onSelect={vi.fn()} />
            <FiguresPane figures={content.figures} content={content} source={null} selected={null} hovered={null}
                onHover={vi.fn()} onLeave={vi.fn()} onSelect={vi.fn()} />
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
