import { useEffect } from "react";
import type { RefObject } from "react";
import { getFieldViewportBounds } from "./fieldNavigation";

export function useFieldDragAutoScroll(viewport: RefObject<HTMLElement | null>, active: boolean): void {
    useEffect(() => {
        const element = viewport.current, view = element?.ownerDocument.defaultView;
        if (!active || !element || !view) return;
        const document = element.ownerDocument;
        let pointer: { x: number; y: number } | undefined;
        let frame: number | undefined, previousTime: number | undefined, remainder = 0;
        const stop = (): void => {
            if (frame !== undefined) view.cancelAnimationFrame(frame);
            pointer = undefined; frame = undefined; previousTime = undefined; remainder = 0;
        };
        const tick = (time: number): void => {
            frame = undefined;
            if (!pointer || !element.isConnected) { stop(); return; }
            const bounds = getFieldViewportBounds(element), height = bounds.bottom - bounds.top;
            if (height <= 0 || pointer.x < bounds.left || pointer.x >= bounds.right) { stop(); return; }
            const edge = Math.min(48, height / 2);
            const distance = pointer.y < bounds.top + edge ? pointer.y - (bounds.top + edge) :
                pointer.y > bounds.bottom - edge ? pointer.y - (bounds.bottom - edge) : 0;
            const velocity = Math.max(-1, Math.min(1, distance / edge)) * 0.8;
            if (!velocity) { stop(); return; }
            // Accumulate fractions so slow edge scrolling is not rounded away.
            remainder += velocity * Math.min(32, previousTime === undefined ? 16 : time - previousTime);
            const step = Math.trunc(remainder);
            if (step) {
                const before = element.scrollTop;
                element.scrollTop += step;
                remainder -= step;
                if (element.scrollTop === before) { stop(); return; }
            }
            previousTime = time;
            frame = view.requestAnimationFrame(tick);
        };
        const within = (event: DragEvent): boolean => {
            const bounds = element.getBoundingClientRect();
            return event.clientX >= bounds.left && event.clientX < bounds.right &&
                event.clientY >= bounds.top && event.clientY < bounds.bottom;
        };
        const over = (event: DragEvent): void => {
            if (!event.composedPath().includes(element) || !within(event)) { stop(); return; }
            pointer = { x: event.clientX, y: event.clientY };
            if (frame === undefined) frame = view.requestAnimationFrame(tick);
        };
        const leave = (event: DragEvent): void => { if (!within(event)) stop(); };
        const key = (event: KeyboardEvent): void => { if (event.key === "Escape") stop(); };
        document.addEventListener("dragover", over, true);
        document.addEventListener("dragleave", leave, true);
        document.addEventListener("drop", stop, true);
        document.addEventListener("dragend", stop, true);
        document.addEventListener("keydown", key, true);
        view.addEventListener("blur", stop);
        return () => {
            stop();
            document.removeEventListener("dragover", over, true);
            document.removeEventListener("dragleave", leave, true);
            document.removeEventListener("drop", stop, true);
            document.removeEventListener("dragend", stop, true);
            document.removeEventListener("keydown", key, true);
            view.removeEventListener("blur", stop);
        };
    }, [active, viewport]);
}
