import { useEffect } from "react";
import type { KeyboardEvent, RefObject } from "react";

export function usePanelDismiss(panel: RefObject<HTMLElement | null>, anchor: HTMLElement,
    onClose: (restoreFocus: boolean) => void): (event: KeyboardEvent<HTMLElement>) => void {
    useEffect(() => {
        const outside = (event: PointerEvent): void => {
            if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.contains(event.target)) onClose(false);
        };
        anchor.ownerDocument.addEventListener("pointerdown", outside);
        return () => anchor.ownerDocument.removeEventListener("pointerdown", outside);
    }, [panel, anchor, onClose]);
    return event => {
        if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation(); onClose(true);
        }
    };
}
