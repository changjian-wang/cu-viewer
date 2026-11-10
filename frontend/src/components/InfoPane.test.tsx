// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoPane } from "./InfoPane";
import { MAX_JSON_CHARACTERS } from "../model/resultLimits";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Info name/value tree", () => {
    it("expands all nested information in order and preserves values without copy controls or feedback", () => {
        const result = {
            status: "Succeeded",
            result: { contents: [{ metadata: { Zebra: "first", Author: "<script>unsafe()</script>" } },
                { metadata: { Empty: "" } }],
                infos: [{ code: "LLMStats", details: { reused: false } }], warnings: [] },
            usage: { pages: 0, tokens: [{ input: 24 }] },
        };
        const before = JSON.stringify(result);
        const { container } = render(<InfoPane result={result} />);
        expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual([
            "metadata", "contents[0]", "Zebra", "Author", "contents[1]", "Empty",
            "usage", "pages", "tokens", "item 1", "input", "infos", "item 1", "code", "details", "reused", "warnings",
        ]);
        expect(screen.getAllByRole("button", { name: /^Collapse / }).every(button => button.getAttribute("aria-expanded") === "true")).toBe(true);
        expect(screen.queryByRole("button", { name: /^Expand / })).toBeNull();
        expect(screen.getByText('"" (empty string)')).toBeTruthy();
        expect(screen.getByText("false")).toBeTruthy();
        expect(screen.getByText("0")).toBeTruthy();
        expect(screen.getByText("[]")).toBeTruthy();
        expect(container.querySelector("script")).toBeNull();
        expect(screen.getByText("<script>unsafe()</script>")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
        expect(screen.queryByText("Copied")).toBeNull();
        expect(container.querySelector(".cu-copy-control")).toBeNull();
        expect(JSON.stringify(result)).toBe(before);
    });

    it("uses readable array labels and singular counts while retaining original paths and empty containers", () => {
        const { container } = render(<InfoPane result={{
            result: { contents: [{ metadata: {} }], infos: [{ code: "Details" }], warnings: [] },
            usage: { entries: [0, false], absent: null },
        }} />);
        expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual([
            "metadata", "contents[0]", "usage", "entries", "item 1", "item 2", "absent", "infos", "item 1", "code", "warnings",
        ]);
        expect(screen.getByText("1 item")).toBeTruthy();
        expect(screen.getByText("2 items")).toBeTruthy();
        expect(screen.queryByText("1 items")).toBeNull();
        const warning = container.querySelector('tr[data-info-path="/result/warnings"]');
        expect(warning?.classList.contains("is-info-section")).toBe(true);
        expect(warning?.classList.contains("is-group")).toBe(true);
        expect(warning?.querySelector("button")).toBeNull();
        expect(warning?.querySelector("td")?.textContent).toBe("[]");
        expect(container.querySelector('tr[data-info-path="/result/infos/0"] .cu-info-label')?.textContent).toBe("item 1");
    });

    it("lowercases generated labels in infos, warnings and nested usage arrays without changing returned casing", () => {
        const result = {
            contents: [], usage: { tokens: [[0, false]] },
            infos: [{ Item: "Keep Item 1" }],
            warnings: [{ code: "CaseSensitive", targets: ["Keep Item 2"] }],
        };
        const before = JSON.stringify(result);
        const { container } = render(<InfoPane result={result} />);
        for (const path of ["/usage/tokens/0", "/usage/tokens/0/0", "/infos/0", "/warnings/0", "/warnings/0/targets/0"]) {
            expect(container.querySelector(`tr[data-info-path="${path}"] .cu-info-label`)?.textContent).toBe("item 1");
        }
        expect(container.querySelector('tr[data-info-path="/infos/0/Item"] .cu-info-label')?.textContent).toBe("Item");
        expect(screen.getByText("Keep Item 1")).toBeTruthy();
        expect(screen.getByText("Keep Item 2")).toBeTruthy();
        expect(screen.getByText("CaseSensitive")).toBeTruthy();
        expect(JSON.stringify(result)).toBe(before);
    });

    it("folds the metadata root and each content independently while preserving the other Info sections", () => {
        const { container } = render(<InfoPane result={{
            result: { contents: [{ metadata: { First: "First document" } }, { metadata: { Second: "Second document" } }] },
            usage: { pages: 2 },
        }} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse metadata.contents[0]" }));
        expect(screen.queryByText("First document")).toBeNull();
        expect(screen.getByText("Second document")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Collapse metadata" }));
        expect(screen.queryByText("contents[1]")).toBeNull();
        expect(screen.getByText("pages")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Expand metadata" }));
        expect(screen.getByRole("button", { name: "Expand metadata.contents[0]" })).toBeTruthy();
        expect(container.querySelector('tr[data-info-path="/result/contents/1/metadata/Second"]')?.textContent)
            .toContain("Second document");
    });

    it("folds only the requested branch and resets expansion when the result changes", () => {
        const result = { contents: [], usage: { tokens: { input: 24 } }, warnings: [] };
        const { container, rerender } = render(<InfoPane result={result} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse usage.tokens" }));
        expect(container.querySelector('tr[data-info-path="/usage/tokens/input"]')).toBeNull();
        expect(screen.getByRole("button", { name: "Expand token usage" }).textContent).toBe("input: 24");
        expect(screen.getByText("warnings")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Expand usage.tokens" }).getAttribute("aria-expanded")).toBe("false");
        rerender(<InfoPane result={{ ...result }} />);
        expect(screen.getByText("input")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Collapse usage.tokens" })).toBeTruthy();
    });

    it("previews collapsed token counters on hover or focus and expands back to the original values", () => {
        vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
        const result = { contents: [{ metadata: { tokens: { OtherModel: 9 } } }],
            usage: { tokens: { "Model/Name~input-input": 0, "Model/Name~input-output": 947 } } };
        const before = JSON.stringify(result);
        const { container } = render(<InfoPane result={result} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse metadata.contents[0].tokens" }));
        expect(screen.queryByRole("button", { name: "Expand token usage" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Collapse usage.tokens" }));
        const summary = screen.getByRole("button", { name: "Expand token usage" });
        const text = "Model/Name~input (in 0 / out 947)";
        expect(summary.textContent).toBe(text);
        expect(screen.queryByRole("tooltip")).toBeNull();
        fireEvent.mouseEnter(summary);
        const popup = screen.getByRole("tooltip", { name: "Token usage" });
        expect(popup.textContent).toBe(text);
        expect(summary.getAttribute("aria-describedby")).toBe(`${popup.id}-content`);
        fireEvent.mouseLeave(summary, { relatedTarget: popup });
        expect(screen.getByRole("tooltip")).toBeTruthy();
        fireEvent.mouseLeave(popup);
        expect(screen.queryByRole("tooltip")).toBeNull();
        fireEvent.focus(summary);
        expect(screen.getByRole("tooltip").textContent).toBe(text);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).toBeNull();
        fireEvent.click(summary);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Collapse usage.tokens" }));
        expect(screen.queryByRole("button", { name: "Expand token usage" })).toBeNull();
        expect(container.querySelector('tr[data-info-path="/usage/tokens/Model~1Name~0input-input"] > td')?.textContent).toBe("0");
        expect(container.querySelector('tr[data-info-path="/usage/tokens/Model~1Name~0input-output"] > td')?.textContent).toBe("947");
        expect(JSON.stringify(result)).toBe(before);
    });

    it("groups exact model pairs in first-seen order without mixing models or reinterpreting unknown counters", () => {
        const tokens = {
            "Model-A-output": 7, "Model-B-input": 0, "Model-A-input": 12,
            unclassified: 3, "Model-B-output": 4, "Model-A-input-cached": 2,
            "Model-A-cached-input": 5, "MODEL-X-input": 13, "model-x-output": 6, "-input": 8,
        };
        const result = { contents: [], usage: { tokens } };
        const before = JSON.stringify(result);
        const { container } = render(<InfoPane result={result} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse usage.tokens" }));
        const summary = screen.getByRole("button", { name: "Expand token usage" });
        expect(summary.textContent).toBe("Model-A (in 12 / out 7); " +
            "Model-B (in 0 / out 4); unclassified: 3; Model-A-input-cached: 2; " +
            "Model-A-cached-input: 5; MODEL-X-input: 13; model-x-output: 6; -input: 8");
        expect([...summary.querySelectorAll(".cu-info-token-model")].map(element => element.textContent)).toEqual([
            "Model-A", "Model-B", "unclassified", "Model-A-input-cached", "Model-A-cached-input",
            "MODEL-X-input", "model-x-output", "-input",
        ]);
        fireEvent.click(summary);
        const rows = [...container.querySelectorAll('tr[data-info-path^="/usage/tokens/"]')];
        expect(rows.map(row => row.querySelector(".cu-info-label")?.textContent)).toEqual(Object.keys(tokens));
        expect(rows.map(row => row.querySelector("td")?.textContent)).toEqual(Object.values(tokens).map(String));
        expect(JSON.stringify(result)).toBe(before);
    });

    it("expands and collapses every group including hidden array descendants without changing values or order", () => {
        const result = {
            result: { contents: [{ metadata: { nested: { Author: "First document" } } }],
                infos: [{ detail: { message: "Information" } }], warnings: [{ target: { message: "Warning" } }] },
            usage: { tokens: { "Model-input": 0, "Model-output": 947 }, detail: [{ nested: { reused: false } }] },
        };
        const before = JSON.stringify(result);
        const { container } = render(<InfoPane result={result} />);
        const paths = [...container.querySelectorAll("tr[data-info-path]")].map(row => row.getAttribute("data-info-path"));
        fireEvent.click(screen.getByRole("button", { name: "Collapse usage.detail" }));
        fireEvent.click(screen.getByRole("button", { name: "Info settings" }));
        const collapse = screen.getByRole("button", { name: "Collapse all groups" });
        expect(document.activeElement).toBe(collapse);
        fireEvent.click(collapse);
        expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["metadata", "usage", "infos", "warnings"]);
        expect(screen.getByRole("dialog", { name: "Info settings" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Close info settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand usage" }));
        expect(screen.getByRole("button", { name: "Expand usage.tokens" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Expand usage.detail" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand usage.detail[0]" }));
        expect(screen.getByRole("button", { name: "Expand usage.detail[0].nested" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Info settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Expand all groups" }));
        expect([...container.querySelectorAll(".cu-info-expander")].every(button => button.getAttribute("aria-expanded") === "true")).toBe(true);
        expect([...container.querySelectorAll("tr[data-info-path]")].map(row => row.getAttribute("data-info-path"))).toEqual(paths);
        expect(screen.getByText("false")).toBeTruthy();
        expect(screen.getByText("0")).toBeTruthy();
        expect(JSON.stringify(result)).toBe(before);
    });

    it("disables bulk actions without groups and preserves settings dismissal, focus and result resets", () => {
        const { rerender } = render(<InfoPane result={{ contents: [], usage: null, infos: [], warnings: [] }} />);
        const trigger = screen.getByRole("button", { name: "Info settings" });
        fireEvent.click(trigger);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse all groups" }).disabled).toBe(true);
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Expand all groups" }).disabled).toBe(true);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close info settings" }));
        fireEvent.keyDown(screen.getByRole("dialog", { name: "Info settings" }), { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        fireEvent.click(trigger);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).not.toBe(trigger);
        fireEvent.click(trigger);
        rerender(<InfoPane result={{ contents: [], usage: { nested: { count: 0 } } }} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("button", { name: "Info settings" }).getAttribute("aria-expanded")).toBe("false");
        expect(screen.getByRole("button", { name: "Collapse usage.nested" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Info settings" }));
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse all groups" }).disabled).toBe(false);
    });

    it("reports invalid or oversized information explicitly instead of rendering partial success", () => {
        const circular: { self?: unknown } = {};
        circular.self = circular;
        const { rerender } = render(<InfoPane result={{ usage: circular }} />);
        expect(screen.getByRole("alert").textContent).toContain("Info could not be displayed");
        rerender(<InfoPane result={{ usage: { invalid: NaN } }} />);
        expect(screen.getByRole("alert").textContent).toContain("non-finite");
        rerender(<InfoPane result={{ usage: { text: "x".repeat(MAX_JSON_CHARACTERS + 1) } }} />);
        expect(screen.getByRole("alert").textContent).toContain("Info is too large to display");
    });
});
