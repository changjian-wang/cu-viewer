// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { JsonPane, MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "./JsonPane";

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

    it("pages a large string without cutting surrogate pairs or hiding its final characters", async () => {
        const value = `${"x".repeat(3_999)}\u{1f600}${"y".repeat(MAX_JSON_CHARACTERS)}original-tail`;
        const { container } = render(<JsonPane value={{ value }} />);
        await screen.findByRole("tree", { name: "Original Analyze result JSON" });
        fireEvent.click(screen.getByRole("button", { name: "Next JSON string at /value page" }));
        expect(container.querySelector(".cu-json-string")?.textContent?.startsWith('"\u{1f600}')).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Last JSON string at /value page" }));
        expect(container.querySelector(".cu-json-string")?.textContent).toContain("original-tail");
        expect(container.querySelector(".cu-json-string")?.textContent?.length).toBeLessThanOrEqual(4_002);
        expect(screen.queryByRole("alert")).toBeNull();
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
