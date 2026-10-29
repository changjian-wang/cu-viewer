import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CuPoint } from "../model/types";
import { ViewerIcon } from "./ViewerIcon";
import type { ViewerIconName } from "./ViewerIcon";

export interface MenuAction {
    label: string;
    disabled?: boolean;
    title?: string | undefined;
    icon?: ViewerIconName;
    run: () => void;
}

export function ActionMenu({ id, label, anchor, actions, onClose, kind = "document" }: {
    id: string; label: string; anchor: HTMLElement; actions: readonly MenuAction[];
    onClose: (restoreFocus: boolean) => void;
    kind?: "document" | "value";
}) {
    const menu = useRef<HTMLDivElement>(null);
    const focused = useRef(false);
    const close = useRef(onClose);
    close.current = onClose;
    const [position, setPosition] = useState<CuPoint | null>(null);
    useLayoutEffect(() => {
        const element = menu.current;
        const window = anchor.ownerDocument.defaultView;
        if (!element || !window) return;
        focused.current = false;
        const update = (): void => {
            if (!anchor.isConnected) { close.current(false); return; }
            const bounds = anchor.getBoundingClientRect();
            setPosition({
                x: Math.max(8, Math.min(bounds.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8)),
                y: Math.max(8, Math.min(bounds.bottom + 5, window.innerHeight - element.offsetHeight - 8)),
            });
        };
        update();
        window.addEventListener("resize", update);
        anchor.ownerDocument.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            anchor.ownerDocument.removeEventListener("scroll", update, true);
        };
    }, [anchor]);
    useLayoutEffect(() => {
        if (!position || focused.current) return;
        menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
        focused.current = true;
    }, [position, anchor]);
    useEffect(() => {
        const outside = (event: PointerEvent): void => {
            if (event.target instanceof Node && !menu.current?.contains(event.target) && !anchor.contains(event.target)) close.current(false);
        };
        anchor.ownerDocument.addEventListener("pointerdown", outside);
        return () => anchor.ownerDocument.removeEventListener("pointerdown", outside);
    }, [anchor]);
    return createPortal(<div id={id} role="menu" aria-label={label} className={`cu-viewer-menu cu-viewer-popup cu-${kind}-menu`} ref={menu}
        style={{ left: position?.x, top: position?.y, visibility: position ? "visible" : "hidden" }}
        onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) close.current(false);
        }}
        onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault();
                event.stopPropagation(); close.current(true); return;
            }
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
            const index = items.findIndex(item => item === event.target);
            const next = event.key === "ArrowDown" ? items[(index + 1) % items.length] :
                event.key === "ArrowUp" ? items[(index - 1 + items.length) % items.length] :
                    event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1) : undefined;
            if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); }
        }}>
        {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled}
            title={action.title} onClick={() => { close.current(true); action.run(); }}>
            {action.icon && <ViewerIcon name={action.icon} />}{action.label}</button>)}
    </div>, anchor.ownerDocument.body);
}
