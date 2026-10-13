// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarkdownPane, MAX_MARKDOWN_CHARACTERS } from "./MarkdownPane";

afterEach(cleanup);

describe("safe Markdown result presentation", () => {
    it("renders Markdown and sanitized CU-style HTML tables without active content", () => {
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

        expect(screen.getByRole("heading", { name: "Extracted title" })).toBeTruthy();
        expect(screen.getByRole("table").textContent).toContain("Surface");
        expect(screen.getByText("code block").tagName).toBe("CODE");
        expect(screen.getByRole("link", { name: "safe" }).getAttribute("href")).toBe("https://example.com/path");
        expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
        expect(container.querySelector("script, iframe, img")).toBeNull();
        expect(screen.getByText("Image omitted: receipt")).toBeTruthy();
    });

    it("reports missing and oversized Markdown instead of silently rendering partial content", () => {
        const { rerender } = render(<MarkdownPane markdown={undefined} />);
        expect(screen.getByRole("heading", { name: "No Markdown returned" })).toBeTruthy();
        rerender(<MarkdownPane markdown={" ".repeat(MAX_MARKDOWN_CHARACTERS + 1)} />);
        expect(screen.getByRole("alert").textContent).toContain("Markdown is too large to render");
    });
});
