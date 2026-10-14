// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { TableDialog } from "./TableDialog";
import { parseCuResult } from "../internal/parseCuResult";

const invokers: HTMLButtonElement[] = [];
const showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
const closeModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
});

beforeEach(() => {
    showModal.mockClear(); closeModal.mockClear();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeModal });
});
afterEach(() => {
    cleanup();
    for (const element of invokers) element.remove();
    invokers.length = 0;
    if (showDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
});

function table() {
    const result = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", tables: [{
        rowCount: 2, columnCount: 2, cells: [
            { rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: "Merged heading" },
            { rowIndex: 1, columnIndex: 0, content: "<script>not executed</script>" },
            { rowIndex: 1, columnIndex: 1, content: "Returned value" },
        ],
    }] }] }).contents[0]?.tables?.[0];
    if (!result) throw new Error("Expected native table.");
    return result;
}

function setup(overrides: Partial<ReturnType<typeof table>> = {}, strict = false) {
    const invoker = document.createElement("button");
    invoker.textContent = "Table marker";
    document.body.appendChild(invoker);
    invokers.push(invoker);
    invoker.focus();
    const onClose = vi.fn();
    const content = <TableDialog id="native-table-dialog" table={{ ...table(), ...overrides }} invoker={invoker} onClose={onClose} />;
    const view = render(strict ? <StrictMode>{content}</StrictMode> : content);
    return { ...view, invoker, onClose };
}

describe("source table inspection dialog", () => {
    it("opens a true modal with only a close action and readonly native spans/text", () => {
        const { container } = setup();
        const dialog = screen.getByRole("dialog", { name: "Table" });
        expect(showModal).toHaveBeenCalledOnce();
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(screen.getByRole("columnheader").getAttribute("colspan")).toBe("2");
        expect(screen.getAllByRole("row")).toHaveLength(2);
        expect(screen.getAllByRole("button").filter(button => dialog.contains(button))).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Close table" })).toBe(document.activeElement);
        expect(screen.getByText("<script>not executed</script>")).toBeTruthy();
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector(".cu-detail-source")).toBeNull();
    });

    it("closes once and returns focus to the invoking marker", () => {
        const { invoker, onClose } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Close table" }));
        expect(closeModal).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(invoker);
    });

    it("handles native Escape cancellation and keeps keyboard focus stops inside the modal", () => {
        const { invoker, onClose } = setup();
        const close = screen.getByRole("button", { name: "Close table" });
        const scroll = document.querySelector<HTMLElement>(".cu-table-dialog .cu-table-scroll");
        if (!scroll) throw new Error("Expected the readonly scroll target.");
        fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(scroll);
        fireEvent.keyDown(scroll, { key: "Tab" });
        expect(document.activeElement).toBe(close);
        fireEvent(screen.getByRole("dialog", { name: "Table" }), new Event("cancel", { cancelable: true }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(invoker);
    });

    it("retains explicit table errors instead of rendering a guessed grid", () => {
        setup({ layoutError: "Table cell spans overlap.", rows: [] });
        expect(screen.getByRole("alert").textContent).toBe("Table cell spans overlap.");
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("survives StrictMode setup/cleanup replay without closing the live dialog or suppressing its real close", () => {
        const { onClose, invoker } = setup({}, true);
        expect(showModal).toHaveBeenCalledTimes(2);
        const dialog = screen.getByRole("dialog", { name: "Table" });
        fireEvent(dialog, new Event("close"));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Close table" }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(invoker);
    });

    it("reports modal opening failures visibly", () => {
        showModal.mockImplementationOnce(() => { throw new Error("Modal opening denied"); });
        const { onClose } = setup();
        expect(screen.getByRole("alert").textContent).toContain("Modal opening denied");
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
