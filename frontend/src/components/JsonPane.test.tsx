// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { JsonPane, MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "./JsonPane";

const dialogShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const dialogClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});

afterEach(() => {
    cleanup();
    if (dialogShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", dialogShow);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (dialogClose) Object.defineProperty(HTMLDialogElement.prototype, "close", dialogClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

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

    it("rejects circular and non-JSON values explicitly", () => {
        const circular: { self?: unknown } = {};
        circular.self = circular;
        const { rerender } = render(<JsonPane value={circular} />);
        expect(screen.getByRole("alert").textContent).toContain("JSON could not be displayed");

        rerender(<JsonPane value={{ value: undefined }} />);
        expect(screen.getByRole("alert").textContent).toContain("non-JSON undefined");
        rerender(<JsonPane value={undefined} />);
        expect(screen.getByRole("alert").textContent).toContain("non-JSON undefined");
    });

    it("exposes the correct raw Markdown span on array/entry hover and keyboard focus without rendering HTML", () => {
        const value = { result: { stringEncoding: "codePoint", contents: [{
            markdown: "😀<b>$610.00</b>", fields: { Amount: { spans: [{ offset: 4, length: 7 }, { offset: 1, length: 3 }] } },
        }] } };
        const before = JSON.stringify(value);
        const { container } = render(<JsonPane value={value} />);
        for (const path of ["/result", "/result/contents", "/result/contents/0", "/result/contents/0/fields",
            "/result/contents/0/fields/Amount"]) {
            const toggle = container.querySelector<HTMLButtonElement>(`[data-json-path="${path}"] > .cu-json-toggle`);
            if (!toggle) throw new Error(`Missing JSON toggle: ${path}`);
            fireEvent.click(toggle);
        }
        const spans = container.querySelector<HTMLElement>('[data-json-path="/result/contents/0/fields/Amount/spans"]')!;
        expect(spans.hasAttribute("title")).toBe(false);
        const arrayTrigger = spans.querySelector<HTMLElement>(".cu-json-span-trigger")!;
        fireEvent.mouseEnter(arrayTrigger);
        let popup = screen.getByRole("tooltip", { name: "Span preview" });
        expect(popup.textContent).toBe("$610.00\n<b>");
        expect(popup.querySelector("b")).toBeNull();
        fireEvent.mouseLeave(arrayTrigger, { relatedTarget: popup });
        expect(screen.getByRole("tooltip")).toBe(popup);
        fireEvent.mouseLeave(popup);
        expect(screen.queryByRole("tooltip")).toBeNull();
        fireEvent.click(spans.querySelector("button")!);
        const entry = spans.querySelector<HTMLElement>('[data-json-path$="/spans/0"]')!;
        expect(entry.hasAttribute("title")).toBe(false);
        const toggle = entry.querySelector("button")!;
        act(() => toggle.focus());
        popup = screen.getByRole("tooltip", { name: "Span preview" });
        expect(popup.textContent).toBe("$610.00");
        expect(toggle.getAttribute("aria-description")).toBe("$610.00");
        expect(toggle.getAttribute("aria-describedby")).toBe(`${popup.id}-content`);
        fireEvent.mouseLeave(entry.querySelector(".cu-json-span-trigger")!);
        expect(screen.getByRole("tooltip")).toBe(popup);
        fireEvent.mouseEnter(arrayTrigger);
        expect(screen.getAllByRole("tooltip")).toHaveLength(1);
        expect(screen.getByRole("tooltip").textContent).toBe("$610.00\n<b>");
        expect(toggle.hasAttribute("aria-describedby")).toBe(false);
        fireEvent.mouseLeave(arrayTrigger);
        fireEvent.focus(toggle);
        expect(screen.getByRole("tooltip").textContent).toBe("$610.00");
        fireEvent.keyDown(toggle, { key: "Escape" });
        expect(screen.queryByRole("tooltip")).toBeNull();
        expect(document.activeElement).toBe(toggle);
        expect(container.querySelector("b")).toBeNull();
        expect(JSON.stringify(value)).toBe(before);
    });

    it("keeps span previews inside the viewport, above a bottom-edge trigger, and closes them on scroll", () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue(new DOMRect(window.innerWidth - 30, window.innerHeight - 30, 20, 20));
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(80);
        const { container } = render(<JsonPane value={{ contents: [{
            markdown: "Value", spans: [{ offset: 0, length: 5 }],
        }] }} />);
        for (const path of ["/contents", "/contents/0"]) {
            fireEvent.click(container.querySelector(`[data-json-path="${path}"] > .cu-json-toggle`)!);
        }
        fireEvent.mouseEnter(container.querySelector(".cu-json-span-trigger")!);
        const popup = screen.getByRole<HTMLElement>("tooltip", { name: "Span preview" });
        expect(popup.textContent).toBe("Value");
        expect(popup.getAttribute("data-side")).toBe("above");
        expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(8);
        expect(parseFloat(popup.style.left) + 200).toBeLessThanOrEqual(window.innerWidth - 8);
        expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(8);
        expect(parseFloat(popup.style.top) + 80).toBeLessThanOrEqual(window.innerHeight - 38);
        expect(container.contains(popup)).toBe(false);
        fireEvent.scroll(popup.querySelector(".cu-json-span-content")!);
        expect(screen.getByRole("tooltip")).toBe(popup);
        fireEvent.scroll(document);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("opens a large array in bounded pages and reaches the original last entry", async () => {
        const values = Object.freeze(Array.from({ length: MAX_JSON_VALUES + 1 }, (_, index) =>
            index === MAX_JSON_VALUES ? "last original entry" : index));
        render(<JsonPane value={Object.freeze({ values })} />);
        const tree = await screen.findByRole("tree", { name: "Original Analyze result JSON" });
        const array = tree.querySelector<HTMLElement>('[data-json-path="/values"]');
        if (!array) throw new Error("The original array is missing.");
        fireEvent.click(within(array).getByRole("button", { name: "Expand JSON node" }));
        expect(within(tree).getAllByRole("treeitem").length).toBeLessThanOrEqual(102);
        expect(screen.queryByText('"last original entry"')).toBeNull();
        fireEvent.click(within(array).getByRole("button", { name: "Last JSON entries at /values page" }));
        expect(screen.getByText('"last original entry"')).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("summarizes long strings safely and preserves JSON escapes in the full viewer without losing tree position", () => {
        const value = `${"x".repeat(239)}\u{1f600}${"y".repeat(3_750)}\r\n\t"quoted"\\\n<img src="https://example.invalid/image">original-tail`;
        const original = Object.freeze({ markdown: value, after: "Following field" });
        const { container } = render(<JsonPane value={original} />);
        expect(container.querySelector(".cu-json-string")?.textContent).toBe(JSON.stringify("x".repeat(239)));
        expect(screen.queryByRole("button", { name: /JSON string.*page/ })).toBeNull();
        const trigger = screen.getByRole("button", { name: "View full text for /markdown" });
        const scroll = trigger.closest<HTMLElement>(".cu-rich-result-scroll");
        if (!scroll) throw new Error("The JSON viewport is missing.");
        scroll.scrollTop = 320; scroll.scrollLeft = 12;
        fireEvent.click(trigger);
        const dialog = screen.getByRole("dialog", { name: "markdown" });
        const text = within(dialog).getByRole("region", { name: "Full JSON string" });
        expect(text.textContent).toBe(JSON.stringify(value));
        expect(text.textContent).not.toContain("\n");
        expect(text.textContent).not.toContain("\t");
        expect(text.querySelector(".cu-json-syntax-tag")).not.toBeNull();
        expect(text.querySelector(".cu-json-syntax-escape")).not.toBeNull();
        expect(dialog.querySelector("img")).toBeNull();
        expect(document.activeElement).toBe(text);
        scroll.scrollTop = 0;
        fireEvent.click(within(dialog).getByRole("button", { name: "Close full text" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(scroll.scrollTop).toBe(320);
        expect(scroll.scrollLeft).toBe(12);
        expect(original.markdown).toBe(value);
        expect(screen.getByText('"Following field"')).toBeTruthy();
    });

    it("keeps a large string's tree preview bounded and opens the same full-value viewer", async () => {
        const value = `${"x".repeat(MAX_JSON_CHARACTERS)}original-tail`;
        const { container } = render(<JsonPane value={{ markdown: value }} />);
        await screen.findByRole("tree", { name: "Original Analyze result JSON" });
        expect(container.querySelector(".cu-json-string")?.textContent?.length).toBeLessThan(250);
        fireEvent.click(screen.getByRole("button", { name: "View full text for /markdown" }));
        expect(screen.getByRole("dialog", { name: "markdown" })).toBeTruthy();
        expect(screen.getByText(`${value.length.toLocaleString("en-US")} characters`, { selector: ".cu-json-string-count" })).toBeTruthy();
    });

    it("closes on cancel without bubbling Escape and discards an open viewer when input changes", () => {
        const onKeyDown = vi.fn();
        const original = { value: "x".repeat(4_001) };
        const { rerender } = render(<div onKeyDown={onKeyDown}><JsonPane value={original} /></div>);
        const trigger = screen.getByRole("button", { name: "View full text for /value" });
        fireEvent.click(trigger);
        let dialog = screen.getByRole("dialog");
        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(onKeyDown).not.toHaveBeenCalled();
        fireEvent(dialog, new Event("cancel", { cancelable: true }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
        fireEvent.click(trigger);
        dialog = screen.getByRole("dialog");
        rerender(<div onKeyDown={onKeyDown}><JsonPane value={{ value: "Replacement" }} /></div>);
        expect(dialog.hasAttribute("open")).toBe(false);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText('"Replacement"')).toBeTruthy();
        rerender(<div onKeyDown={onKeyDown}><JsonPane value={original} /></div>);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("searches the complete displayed literal, navigates matches and clears highlighting without changing text", async () => {
        const value = "x".repeat(4_001) + " A+b A+B";
        render(<JsonPane value={{ markdown: value }} />);
        fireEvent.click(screen.getByRole("button", { name: "View full text for /markdown" }));
        const dialog = screen.getByRole("dialog");
        const input = within(dialog).getByRole("searchbox", { name: "Search full text" });
        fireEvent.change(input, { target: { value: "a+b" } });
        await within(dialog).findByText("1 / 2");
        expect(dialog.querySelectorAll(".cu-json-find-match")).toHaveLength(2);
        fireEvent.click(within(dialog).getByRole("button", { name: "Next text match" }));
        expect(within(dialog).getByText("2 / 2")).toBeTruthy();
        fireEvent.keyDown(input, { key: "Enter" });
        expect(within(dialog).getByText("1 / 2")).toBeTruthy();
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
        expect(within(dialog).getByText("2 / 2")).toBeTruthy();
        fireEvent.change(input, { target: { value: "missing" } });
        await within(dialog).findByText("No matches");
        expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Next text match" }).disabled).toBe(true);
        fireEvent.change(input, { target: { value: "" } });
        expect(dialog.querySelector(".cu-json-find-match")).toBeNull();
        expect(within(dialog).getByRole("region", { name: "Full JSON string" }).textContent).toBe(JSON.stringify(value));
    });

    it("validates the entire large input, including invalid values after the former limit", async () => {
        const values = Array.from({ length: MAX_JSON_VALUES + 1 }, () => 0);
        const { rerender } = render(<JsonPane value={{ values, invalid: undefined }} />);
        expect((await screen.findByRole("alert")).textContent).toContain("non-JSON undefined");
        const circular: { values: number[]; self?: unknown } = { values };
        circular.self = circular;
        rerender(<JsonPane value={circular} />);
        expect((await screen.findByRole("alert")).textContent).toContain("circular");
    });
});
