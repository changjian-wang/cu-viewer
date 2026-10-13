// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
