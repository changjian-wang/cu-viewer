// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFieldDragAutoScroll } from "./useFieldDragAutoScroll";

afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function setup() {
    const element = document.createElement("div");
    element.innerHTML = '<table class="cu-fields-table"><thead><tr><th>Field</th></tr></thead></table>';
    document.body.append(element);
    const header = element.querySelector("th");
    if (!header) throw new Error("The field header is unavailable.");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 300, 200));
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 300, 32));
    let scrollTop = 0;
    Object.defineProperties(element, {
        clientWidth: { value: 300 }, clientHeight: { value: 200 }, scrollHeight: { value: 1000 },
        scrollTop: { get: () => scrollTop, set: (value: number) => { scrollTop = Math.round(Math.max(0, Math.min(800, value))); } },
    });
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
        const id = nextFrame++;
        frames.set(id, callback);
        return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    const advance = (time: number) => act(() => {
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(time);
    });
    const over = (clientY: number) => fireEvent(element, new MouseEvent("dragover", {
        bubbles: true, clientX: 150, clientY,
    }));
    return { element, header, frames, advance, over, ref: { current: element } };
}

describe("field drag edge auto-scroll", () => {
    it("only scrolls active drags, continues without new events and respects the sticky header and scroll limits", () => {
        const { element, header, frames, advance, over, ref } = setup();
        const { rerender } = renderHook(({ active }) => useFieldDragAutoScroll(ref, active),
            { initialProps: { active: false } });
        over(280);
        expect(frames.size).toBe(0);
        rerender({ active: true });
        over(245);
        for (const time of [16, 32, 48, 64, 80]) advance(time);
        expect(element.scrollTop).toBeGreaterThan(0);
        over(280);
        advance(96);
        const first = element.scrollTop;
        advance(112);
        expect(element.scrollTop).toBeGreaterThan(first);
        fireEvent(header, new MouseEvent("dragleave", { bubbles: true, clientX: 150, clientY: 280 }));
        const beforeLeave = element.scrollTop;
        advance(128);
        expect(element.scrollTop).toBeGreaterThan(beforeLeave);
        element.scrollTop = 300;
        over(144);
        advance(144);
        expect(element.scrollTop).toBeLessThan(300);
        element.scrollTop = 800;
        over(280);
        advance(160);
        expect(element.scrollTop).toBe(800);
        expect(frames.size).toBe(0);
    });

    it("stops in the middle, outside the list, on drop, drag end, Escape and window blur", () => {
        const { element, frames, advance, over, ref } = setup();
        renderHook(() => useFieldDragAutoScroll(ref, true));
        const stops = [
            () => over(216),
            () => fireEvent(document.body, new MouseEvent("dragover", { bubbles: true, clientX: 20, clientY: 20 })),
            () => fireEvent(element, new MouseEvent("dragleave", { bubbles: true, clientX: 20, clientY: 20 })),
            () => fireEvent.drop(element),
            () => fireEvent.dragEnd(element),
            () => fireEvent.keyDown(document, { key: "Escape" }),
            () => fireEvent(window, new Event("blur")),
        ];
        let time = 0;
        for (const stop of stops) {
            over(280);
            advance(time += 16);
            const before = element.scrollTop;
            stop();
            advance(time += 16);
            expect(element.scrollTop).toBe(before);
            expect(frames.size).toBe(0);
        }
    });

    it("cancels animation and removes listeners when disabled or unmounted", () => {
        const { element, frames, advance, over, ref } = setup();
        const { rerender, unmount } = renderHook(({ active }) => useFieldDragAutoScroll(ref, active),
            { initialProps: { active: true } });
        over(280);
        advance(16);
        const before = element.scrollTop;
        rerender({ active: false });
        advance(32);
        expect(element.scrollTop).toBe(before);
        expect(frames.size).toBe(0);
        rerender({ active: true });
        over(280);
        unmount();
        advance(48);
        over(280);
        expect(element.scrollTop).toBe(before);
        expect(frames.size).toBe(0);
    });
});
