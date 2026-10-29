// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, "clipboard"); vi.restoreAllMocks(); });

it("invalidates metadata copy across same-value context resets and value round-trips", async () => {
    let finish!: () => void;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: () => new Promise<void>(resolve => { finish = resolve; }),
    } });
    const context = {};
    const view = render(<CopyButton value="same" label="Copy value" context={context} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy value" }));
    view.rerender(<CopyButton value="other" label="Copy value" context={{}} />);
    view.rerender(<CopyButton value="same" label="Copy value" context={context} />);
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByText("Copied")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy value" }));
    view.rerender(<CopyButton value="same" label="Copy value" context={{}} />);
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByText("Copied")).toBeNull();
});
