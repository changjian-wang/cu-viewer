// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MarkdownPane, MARKDOWN_STATIC_CHARACTERS } from "./MarkdownPane";
import { parseCuResult } from "../model/parseCuResult";
import type { LoadedSource } from "../source/source";

afterEach(cleanup);

describe("safe Markdown result presentation", () => {
    it("formats successfully when React replays effects in StrictMode", async () => {
        render(<StrictMode><MarkdownPane markdown="# Strict background content" /></StrictMode>);
        expect(await screen.findByRole("heading", { name: "Strict background content" })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });
    it("renders Markdown and sanitized CU-style HTML tables without active content", async () => {
        const markdown = [
            "# Extracted title",
            "",
            "- first",
            "- second",
            "",
            "<table><tr><th>Item</th></tr><tr><td>Surface</td></tr></table>",
            "",
            "`inline`",
            "",
            "```text",
            "code block",
            "```",
            "",
            "[safe](https://example.com/path)",
            "[unsafe](javascript:alert(1))",
            "<script>window.__markdownXss = true</script>",
            "<iframe src=\"https://example.com\"></iframe>",
            "<img src=\"https://example.com/tracker.png\" onerror=\"window.__markdownXss = true\" alt=\"receipt\">",
        ].join("\n");
        const { container } = render(<MarkdownPane markdown={markdown} />);

        expect(await screen.findByRole("heading", { name: "Extracted title" })).toBeTruthy();
        expect(screen.getByRole("table").textContent).toContain("Surface");
        expect(screen.getByText("code block").tagName).toBe("CODE");
        expect(screen.getByRole("link", { name: "safe" }).getAttribute("href")).toBe("https://example.com/path");
        expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
        expect(container.querySelector("script, iframe, img")).toBeNull();
        expect(screen.getByText("Image omitted: receipt")).toBeTruthy();
    });

    it("reports missing Markdown without starting a formatting operation", () => {
        const { rerender } = render(<MarkdownPane markdown={undefined} />);
        expect(screen.getByRole("heading", { name: "No Markdown returned" })).toBeTruthy();
        rerender(<MarkdownPane markdown={" ".repeat(MARKDOWN_STATIC_CHARACTERS + 1)} />);
        expect(screen.getByRole("heading", { name: "No Markdown returned" })).toBeTruthy();
    });

    it("renders every CU page of a large document without changing content or bypassing sanitization", async () => {
        const markdown = `# First page\n\n${"first ".repeat(5_000)}\n\n<!-- PageBreak -->\n\n` +
            `# Last page\n\n${"last ".repeat(5_000)}\n\n<table><tr><td>Last cell</td></tr></table>\n\n` +
            '<script>alert(1)</script><img src="https://example.com/tracker.png" alt="last image">';
        const { container } = render(<MarkdownPane markdown={markdown} />);
        expect(await screen.findByRole("heading", { name: "First page" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Last page" })).toBeNull();
        const pagination = screen.getByRole("group", { name: "Markdown pagination" });
        expect(pagination.tagName).toBe("FOOTER");
        expect(container.lastElementChild).toBe(pagination);
        expect(screen.queryByRole("button", { name: "First Markdown page" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Last Markdown page" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Next Markdown page" }));
        expect(await screen.findByRole("heading", { name: "Last page" })).toBeTruthy();
        expect(screen.getByRole("table").textContent).toBe("Last cell");
        expect(container.querySelector("script, img")).toBeNull();
        expect(screen.getByText("Image omitted: last image")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Previous Markdown page" }));
        expect(await screen.findByRole("heading", { name: "First page" })).toBeTruthy();
    });

    it("keeps every page reachable without rejecting a large first page", async () => {
        render(<MarkdownPane markdown={`${"x".repeat(MARKDOWN_STATIC_CHARACTERS + 1)}\n\n<!-- PageBreak -->\n\n# Readable last page`} />);
        await screen.findByRole("group", { name: "Markdown pagination" });
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Next Markdown page" }));
        expect(await screen.findByRole("heading", { name: "Readable last page" })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("validates direct page entry and applies a blurred page before the following arrow click", async () => {
        const markdown = Array.from({ length: 3 }, (_, index) =>
            `# Page ${index + 1}\n\n${"text ".repeat(4_000)}\n`).join("\n<!-- PageBreak -->\n");
        render(<MarkdownPane markdown={markdown} />);
        const input = await screen.findByRole("textbox", { name: "Markdown page number" });
        for (const invalid of ["0", "4", "1.5", ""]) {
            fireEvent.change(input, { target: { value: invalid } });
            fireEvent.keyDown(input, { key: "Enter" });
            expect(screen.getByRole("alert").textContent).toContain("existing Markdown page");
            expect(screen.getByRole("heading", { name: "Page 1" })).toBeTruthy();
        }
        fireEvent.change(input, { target: { value: "2" } });
        fireEvent.blur(input);
        fireEvent.click(screen.getByRole("button", { name: "Next Markdown page" }));
        expect(await screen.findByRole("heading", { name: "Page 3" })).toBeTruthy();
        expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Markdown page number" }).value).toBe("3");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next Markdown page" }).disabled).toBe(true);
    });

    it("borrows the exact figure's local source crop and cancels it without disposing the source", async () => {
        let complete!: (size: { width: number; height: number }) => void;
        const pending = new Promise<{ width: number; height: number }>(resolve => { complete = resolve; });
        const draw = vi.fn<LoadedSource["render"]>().mockReturnValue(pending);
        const dispose = vi.fn().mockResolvedValue(undefined);
        const source: LoadedSource = {
            kind: "image", name: "local", pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
            render: draw, dispose,
        };
        const original = {
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel", pages: source.pages,
                figures: [{ id: "other", source: "D(1,1,1,5,5)" }, { id: "1.1", source: "D(2,10,20,20,10)" }] }],
        };
        const before = JSON.stringify(original), content = parseCuResult(original).contents[0];
        const view = render(<MarkdownPane markdown={'# Readable\n\n![Local logo](figures/1.1)\n\n\u2713 YES BANK'}
            content={content} source={source} />);
        expect(await screen.findByRole("heading", { name: "Readable" })).toBeTruthy();
        await waitFor(() => expect(draw).toHaveBeenCalledTimes(1));
        expect(draw.mock.calls[0]?.[0]).toBe(2);
        expect(draw.mock.calls[0]?.[5]).toEqual({ x: 10, y: 20, width: 20, height: 10 });
        const canvas = screen.getByTestId<HTMLCanvasElement>("source-thumbnail");
        expect(canvas.getAttribute("aria-label")).toBe("Local logo");
        expect(screen.getByText("\u2713 YES BANK")).toBeTruthy();
        const signal = draw.mock.calls[0]?.[4];
        expect(signal?.aborted).toBe(false);
        view.unmount();
        expect(signal?.aborted).toBe(true);
        expect(canvas.width).toBe(0);
        await act(async () => { complete({ width: 20, height: 10 }); await pending; });
        expect(dispose).not.toHaveBeenCalled();
        expect(JSON.stringify(original)).toBe(before);
    });

    it.each([
        { figures: [{ id: "other", source: "D(1,1,1,5,5)" }], message: "not available in this content" },
        { figures: [{ id: "1.1" }], message: "has no source region" },
        { figures: [{ id: "1.1" }, { id: "1.1" }], message: "ambiguous source metadata" },
    ])("keeps an unresolved figure local to its image: $message", async ({ figures, message }) => {
        const content = parseCuResult({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [{ pageNumber: 1, width: 100, height: 100 }], figures }],
        }).contents[0];
        render(<MarkdownPane markdown={"# Still readable\n\n![Logo](figures/1.1)"} content={content} />);
        expect((await screen.findByRole("alert")).textContent).toContain(message);
        expect(screen.getByRole("heading", { name: "Still readable" })).toBeTruthy();
        expect(screen.queryByTestId("source-thumbnail")).toBeNull();
    });
});
