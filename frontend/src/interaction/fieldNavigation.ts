import { getRevealOffset } from "../source/geometry";

type Bounds = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export function getFieldRevealOffset(target: Bounds, visible: Bounds, comfortable = false): { x: number; y: number } {
    const width = visible.right - visible.left, height = visible.bottom - visible.top;
    const offset = getRevealOffset([
        { x: target.left - visible.left, y: target.top - visible.top },
        { x: target.right - visible.left, y: target.bottom - visible.top },
    ], { width, height });
    return {
        x: offset.x ? -offset.x : 0,
        y: comfortable && offset.y ? target.top - visible.top - Math.max(0, (height - (target.bottom - target.top)) / 3) :
            offset.y ? -offset.y : 0,
    };
}

export function revealFieldTarget(button: HTMLElement, viewport: HTMLElement, comfortable = false): HTMLElement | null {
    const wrapper = button.closest<HTMLElement>(".cu-inline-table-wrap");
    const target = wrapper ? button.closest("td") : button.closest("tr");
    if (!target || !viewport.clientWidth || !viewport.clientHeight) return null;
    const bounds = viewport.getBoundingClientRect();
    const header = viewport.querySelector(".cu-fields-table > thead > tr > th")?.getBoundingClientRect();
    const visible = {
        left: bounds.left + viewport.clientLeft,
        right: bounds.left + viewport.clientLeft + viewport.clientWidth,
        top: Math.max(bounds.top + viewport.clientTop, header?.bottom ?? bounds.top) + 8,
        bottom: bounds.top + viewport.clientTop + viewport.clientHeight - 8,
    };
    if (visible.bottom <= visible.top) return null;
    if (wrapper) {
        const area = wrapper.getBoundingClientRect();
        const rowIndex = target.closest("tr")?.querySelector("th")?.getBoundingClientRect();
        const safeLeft = Math.max(area.left + wrapper.clientLeft, rowIndex?.right ?? area.left) + 8;
        const safeRight = area.left + wrapper.clientLeft + wrapper.clientWidth - 8;
        if (safeRight <= safeLeft) return null;
        const cell = target.getBoundingClientRect();
        wrapper.scrollLeft += getFieldRevealOffset(cell, {
            left: safeLeft, right: safeRight, top: cell.top, bottom: cell.bottom,
        }).x;
    }
    const cell = target.getBoundingClientRect();
    const columnHeader = wrapper?.querySelector("thead")?.getBoundingClientRect();
    const top = comfortable && columnHeader && cell.bottom - columnHeader.top <= (visible.bottom - visible.top) * 0.75 ?
        Math.min(cell.top, columnHeader.top) : cell.top;
    viewport.scrollTop += getFieldRevealOffset({ ...visible, top, bottom: cell.bottom }, visible, comfortable).y;
    return target;
}

export function emphasizeFieldTarget(target: HTMLElement): Animation | null {
    const view = target.ownerDocument.defaultView;
    if (!view || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        typeof target.animate !== "function") return null;
    const frames: Keyframe[] = [
        { backgroundColor: "#d8c6f2" },
        { backgroundColor: view.getComputedStyle(target).backgroundColor },
    ];
    const animation = target.animate(frames, { duration: 1000, easing: "ease-out" });
    animation.id = "cu-field-location";
    return animation;
}
