// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarkdownPane } from "./MarkdownPane";
import { MarkdownErrorBoundary } from "./MarkdownRecovery";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("local Markdown recovery", () => {
    it("keeps the original source readable when workers are unavailable and supports retry", async () => {
        const WorkerClass = Worker;
        vi.stubGlobal("Worker", undefined);
        render(<MarkdownPane markdown="# Original source" />);
        expect((await screen.findByRole("alert")).textContent).toContain("Markdown could not be formatted");
        expect(screen.getByText("# Original source")).toBeTruthy();
        vi.stubGlobal("Worker", WorkerClass);
        fireEvent.click(screen.getByRole("button", { name: "Retry formatting" }));
        expect(await screen.findByRole("heading", { name: "Original source" })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("isolates rendering failures and exposes the actual error alongside original content", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const retry = vi.fn();
        function BrokenContent(): never { throw new Error("Synthetic block failure"); }
        render(<section><p>Unaffected sibling</p><MarkdownErrorBoundary markdown="# Saved content" onRetry={retry}>
            <BrokenContent />
        </MarkdownErrorBoundary></section>);
        expect(screen.getByText("Unaffected sibling")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Synthetic block failure");
        expect(screen.getByText("# Saved content")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Retry formatting" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
