import { describe, expect, it } from "vitest";
import { getFieldRevealOffset } from "./fieldNavigation";

const visible = { left: 100, right: 500, top: 200, bottom: 800 };

describe("field reveal safe area", () => {
    it("keeps a completely visible row stationary, including source selections", () => {
        const row = { left: 100, right: 500, top: 240, bottom: 273 };
        expect(getFieldRevealOffset(row, visible)).toEqual({ x: 0, y: 0 });
        expect(getFieldRevealOffset(row, visible, true)).toEqual({ x: 0, y: 0 });
    });

    it("moves the complete row below a sticky header rather than exposing just its name", () => {
        expect(getFieldRevealOffset({ left: 100, right: 500, top: 180, bottom: 213 }, visible))
            .toEqual({ x: 0, y: -20 });
    });

    it("puts newly revealed source targets in the upper part of the safe area", () => {
        expect(getFieldRevealOffset({ left: 100, right: 500, top: 180, bottom: 213 }, visible, true))
            .toEqual({ x: 0, y: -209 });
        expect(getFieldRevealOffset({ left: 100, right: 500, top: 820, bottom: 853 }, visible, true))
            .toEqual({ x: 0, y: 431 });
    });

    it("excludes the array row index from the horizontal safe area", () => {
        expect(getFieldRevealOffset({ left: 740, right: 870, top: 200, bottom: 234 },
            { left: 807, right: 1200, top: 200, bottom: 234 })).toEqual({ x: -67, y: 0 });
        expect(getFieldRevealOffset({ left: 1150, right: 1280, top: 200, bottom: 234 },
            { left: 807, right: 1200, top: 200, bottom: 234 })).toEqual({ x: 80, y: 0 });
    });

    it("uses minimal movement for keyboard or right-pane selection at the bottom edge", () => {
        expect(getFieldRevealOffset({ left: 100, right: 500, top: 790, bottom: 823 }, visible))
            .toEqual({ x: 0, y: 23 });
    });

    it("does not scroll a target already spanning a smaller safe area", () => {
        expect(getFieldRevealOffset({ left: 50, right: 550, top: 180, bottom: 820 }, visible, true))
            .toEqual({ x: 0, y: 0 });
    });

    it("rejects invalid geometry rather than reporting a successful reveal", () => {
        expect(() => getFieldRevealOffset({ ...visible, top: NaN }, visible)).toThrow();
        expect(() => getFieldRevealOffset(visible, { ...visible, bottom: visible.top })).toThrow();
    });
});
