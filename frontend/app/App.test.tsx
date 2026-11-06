// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentUnderstandingResultViewerProps } from "../src";
import { App } from "./App";

vi.mock("../src", () => ({
    ContentUnderstandingResultViewer: (props: ContentUnderstandingResultViewerProps) => <section aria-label="Viewer">
        <output data-testid="order">{JSON.stringify(props.fieldOrder) ?? "browser"}</output>
        <button disabled={!props.onFieldOrderChange}
            onClick={() => props.onFieldOrderChange?.({ $root: ["/B", "/A"] })}>B first</button>
        <button disabled={!props.onFieldOrderChange}
            onClick={() => props.onFieldOrderChange?.({ $root: ["/A", "/B"] })}>A first</button>
        <button disabled={!props.onFieldOrderChange} onClick={() => props.onFieldOrderChange?.({})}>Reset</button>
    </section>,
}));

const result = { apiVersion: "2026-06-01-preview", analyzerId: "prebuilt-invoice", contents: [{
    kind: "document", fields: {
        A: { type: "string", valueString: "A" }, B: { type: "string", valueString: "B" },
        New: { type: "string", valueString: "New" },
        Group: { type: "array", valueArray: [{ type: "string", valueString: "row" }] },
    },
}] };
const session = { source: "./source/invoice.pdf", name: "invoice.pdf", result, fieldOrderUrl: "./field-order" };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
    window.history.replaceState({}, "", "/viewer-session/");
    fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CLI viewer field-order bridge", () => {
    it("loads saved order without writing defaults and ignores stale paths and changed parent types", async () => {
        fetcher.mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({
            $root: ["/B", "/Removed", "/A"], "/Group": ["/Group/OldChild"], "/Missing": ["/Missing/Child"],
        }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        expect(screen.getByTestId("order").textContent).toBe('{"$root":["/B","/A"]}');
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(true);
        expect(screen.queryByRole("banner")).toBeNull();
    });

    it("writes only explicit order changes and sends an empty mapping for reset", async () => {
        fetcher.mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({}))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        fireEvent.click(screen.getByRole("button", { name: "B first" }));
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
        expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
            method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"$root":["/B","/A"]}',
        });
        await screen.findByText("Field order saved to azd settings.");
        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
        expect(fetcher.mock.calls[3]?.[1]?.body).toBe("{}");
    });

    it("keeps the document available but disables reordering when azd preferences cannot be read", async () => {
        fetcher.mockResolvedValueOnce(json(session)).mockResolvedValueOnce(new Response(null, { status: 500 }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        expect(screen.getByRole("alert").textContent).toContain("azd settings could not be read (500)");
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "B first" }).disabled).toBe(true);
        expect(screen.getByTestId("order").textContent).toBe("{}");
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("reports failed writes and rolls back only to the last confirmed order", async () => {
        fetcher.mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({ $root: ["/A", "/B"] }))
            .mockResolvedValueOnce(new Response(null, { status: 500 }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        fireEvent.click(screen.getByRole("button", { name: "B first" }));
        await screen.findByRole("alert");
        expect(screen.getByRole("alert").textContent).toBe("Field order was not saved to azd settings (500).");
        expect(screen.getByTestId("order").textContent).toBe('{"$root":["/A","/B"]}');
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Reset" }).disabled).toBe(false);
    });

    it("serializes rapid changes and continues saving after an earlier request fails", async () => {
        let complete: ((response: Response) => void) | undefined;
        const pending = new Promise<Response>(resolve => { complete = resolve; });
        fetcher.mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({}))
            .mockReturnValueOnce(pending).mockResolvedValueOnce(new Response(null, { status: 204 }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        fireEvent.click(screen.getByRole("button", { name: "B first" }));
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
        fireEvent.click(screen.getByRole("button", { name: "A first" }));
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(screen.getByTestId("order").textContent).toBe('{"$root":["/A","/B"]}');
        await act(async () => { complete?.(new Response(null, { status: 500 })); await pending; });
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
        await screen.findByText("Field order saved to azd settings.");
        expect(fetcher.mock.calls[3]?.[1]?.body).toBe('{"$root":["/A","/B"]}');
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("does not fetch or disclose a credential-bearing foreign preferences URL", async () => {
        fetcher.mockResolvedValueOnce(json({ ...session,
            fieldOrderUrl: "https://private-user:private-pass@other.example/order?sig=private-sig#private-fragment" }));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("alert").textContent).toContain("does not belong to this local viewer session");
        expect(screen.getByRole("alert").textContent).not.toContain("private");
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "B first" }).disabled).toBe(true);
    });

    it("preserves browser-owned order for older read-only hosts without the optional capability", async () => {
        const legacy = { source: session.source, name: session.name, result };
        fetcher.mockResolvedValueOnce(json(legacy));
        render(<App />);
        await screen.findByRole("region", { name: "Viewer" });
        expect(screen.getByTestId("order").textContent).toBe("browser");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
