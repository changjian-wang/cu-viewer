// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseCuResult } from "../model/parseCuResult";
import { FiguresPane } from "./FiguresPane";

vi.mock("./SourceThumbnail", () => ({
    SourceThumbnail: ({ label }: { label: string }) => <span role="img" aria-label={label} />,
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function fixture() {
    const content = parseCuResult({
        apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
            pages: [1, 2, 3].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
            figures: [
                { id: "logo-a", kind: "image", caption: { content: "Alpha caption" }, description: "Alpha logo",
                    footnotes: [{ content: "Only-footnote-needle" }], source: "D(1,1,1,10,10)" },
                { id: "chart-b", kind: "chart", role: "diagram",
                    caption: { content: `${"Complete caption text. ".repeat(100)}caption-tail-needle` },
                    source: "D(1,20,1,10,10)" },
                { id: "multi-c", description: "Multiple source regions", source: "D(3,1,1,10,10);D(2,1,1,10,10);D(3,20,1,10,10)" },
                { id: "unbound-d", description: "No grounding" },
                { id: "last-e", kind: "unknown", description: "Alpha last", source: "D(1,40,1,10,10)" },
            ] }],
    }).contents[0];
    if (!content?.figures) throw new Error("The figure fixtures are unavailable.");
    return { content, figures: content.figures, source: null, selected: null, hovered: null,
        onSelect: vi.fn(), onHover: vi.fn(), onLeave: vi.fn() };
}

describe("compact source-linked figures", () => {
    it("groups only consecutive page sets and retains figure order, metadata and hover behavior", () => {
        const props = fixture(), before = JSON.stringify(props.figures);
        const { container } = render(<FiguresPane {...props} />);
        expect(screen.getAllByRole("heading").map(heading => heading.textContent))
            .toEqual(["Page 1", "Pages 3, 2", "No source region", "Page 1"]);
        expect(screen.getAllByRole("button", { name: /^Select Figure / }).map(button => button.getAttribute("data-detail-id")))
            .toEqual(props.figures.map(figure => figure.id));
        expect(screen.getByText("Footnote: Only-footnote-needle")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Select Figure 2" }).textContent).toContain("caption-tail-needle");
        expect(screen.getByRole("button", { name: "Select Figure 3" }).textContent).not.toContain("unknown");
        expect(screen.getByRole("button", { name: "Select Figure 5" }).textContent).toContain("unknown");
        expect(container.querySelector(".cu-detail-select")).toBeNull();
        const first = screen.getByRole("button", { name: "Select Figure 1" });
        fireEvent.pointerMove(first);
        expect(props.onHover).toHaveBeenLastCalledWith(props.figures[0]?.field);
        fireEvent.mouseLeave(first);
        expect(props.onLeave).toHaveBeenLastCalledWith(props.figures[0]?.field);
        fireEvent.focus(first);
        expect(props.onHover).toHaveBeenLastCalledWith(props.figures[0]?.field, false);
        fireEvent.click(first);
        expect(props.onSelect).toHaveBeenLastCalledWith(props.figures[0]?.field);
        expect(JSON.stringify(props.figures)).toBe(before);
    });

    it("searches full captions, IDs and footnotes while temporarily exposing manual folds", () => {
        const props = fixture();
        render(<FiguresPane {...props} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Collapse Page 1" })[0]!);
        expect(screen.queryByRole("button", { name: "Select Figure 1" })).toBeNull();
        const search = screen.getByRole("searchbox", { name: "Search figures" });
        for (const [query, name] of [["caption-tail-needle", "Select Figure 2"],
            ["CHART-B", "Select Figure 2"], ["only-footnote-needle", "Select Figure 1"]] as const) {
            fireEvent.change(search, { target: { value: query } });
            expect(screen.getAllByRole("button", { name: /^Select Figure / })).toHaveLength(1);
            expect(screen.getByRole("button", { name })).toBeTruthy();
            expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse Page 1" }).disabled).toBe(true);
        }
        fireEvent.click(screen.getByRole("button", { name: "Figures settings" }));
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Collapse all pages" }).disabled).toBe(true);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Figures settings" }));
        fireEvent.change(search, { target: { value: "No such figure" } });
        expect(screen.getByRole("heading", { name: "No matching figures" })).toBeTruthy();
        expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next figure" }).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.queryByRole("button", { name: "Select Figure 1" })).toBeNull();
        expect(screen.getByRole("button", { name: "Select Figure 5" })).toBeTruthy();
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it("cycles through matching figures, opens only the target group and focuses its row", () => {
        const props = fixture();
        const { rerender } = render(<FiguresPane {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Figures settings" }));
        fireEvent.click(screen.getByRole("button", { name: "Collapse all pages" }));
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(screen.queryAllByRole("button", { name: /^Select Figure / })).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Previous figure" }));
        expect(props.onSelect).toHaveBeenLastCalledWith(props.figures[4]?.field);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Select Figure 5" }));
        expect(screen.getByRole("button", { name: "Expand Pages 3, 2" })).toBeTruthy();
        rerender(<FiguresPane {...props} selected={props.figures[4]?.field ?? null} />);
        expect(screen.getByLabelText("Current figure position").textContent).toBe("5 / 5 figures");
        fireEvent.change(screen.getByRole("searchbox", { name: "Search figures" }), { target: { value: "Alpha" } });
        expect(screen.getByLabelText("Current figure position").textContent).toBe("2 / 2 figures");
        fireEvent.click(screen.getByRole("button", { name: "Next figure" }));
        expect(props.onSelect).toHaveBeenLastCalledWith(props.figures[0]?.field);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Select Figure 1" }));
    });

    it("reveals source selections once without moving focus or reopening a filtered target later", () => {
        const props = fixture();
        const target = props.figures[2];
        if (!target) throw new Error("The multi-page target is missing.");
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return this.matches(".cu-figures-scroll") ? new DOMRect(0, 0, 400, 100) : new DOMRect(0, 250, 400, 30);
        });
        const { container, rerender } = render(<FiguresPane {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Pages 3, 2" }));
        const search = screen.getByRole("searchbox", { name: "Search figures" });
        search.focus();
        rerender(<FiguresPane {...props} selected={target.field} sourceSelection selectionRequest={1} />);
        const viewport = container.querySelector<HTMLElement>(".cu-figures-scroll");
        if (!viewport) throw new Error("The figure viewport is missing.");
        expect(viewport.scrollTop).toBe(224);
        expect(document.activeElement).toBe(search);
        viewport.scrollTop = 0;
        rerender(<FiguresPane {...props} selected={target.field} hovered={props.figures[0]?.field ?? null}
            sourceSelection selectionRequest={1} />);
        expect(viewport.scrollTop).toBe(0);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Pages 3, 2" }));
        fireEvent.change(search, { target: { value: "Alpha" } });
        rerender(<FiguresPane {...props} selected={target.field} sourceSelection selectionRequest={2} />);
        expect(screen.getByRole("status").textContent).toContain("hidden by the current search");
        expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search figures" }).value).toBe("Alpha");
        fireEvent.change(search, { target: { value: "" } });
        expect(screen.getByRole("button", { name: "Expand Pages 3, 2" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Select Figure 3" })).toBeNull();
        expect(props.onSelect).not.toHaveBeenCalled();
    });
});
