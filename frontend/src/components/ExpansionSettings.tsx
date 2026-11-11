import { useLayoutEffect, useRef } from "react";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

export function ExpansionSettings({ id, anchor, label, closeLabel, items, disabledReason, onExpansion, onClose }: {
    id: string; anchor: HTMLElement; label: string; closeLabel: string; items: "groups" | "pages" | "JSON";
    disabledReason: string | null; onExpansion: (open: boolean) => void; onClose: (restoreFocus: boolean) => void;
}) {
    const panel = useRef<HTMLElement>(null);
    const onKeyDown = usePanelDismiss(panel, anchor, onClose);
    useLayoutEffect(() => {
        const first = panel.current?.querySelector<HTMLButtonElement>(".cu-fields-settings-actions button:not(:disabled)") ??
            panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
        first?.focus({ preventScroll: true });
    }, []);
    return <section id={id} className="cu-fields-settings" ref={panel} role="dialog" aria-label={label} tabIndex={-1}
        onKeyDown={onKeyDown} onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) onClose(false);
        }}>
        <header><h2>Settings</h2><button type="button" className="cu-icon-button" aria-label={closeLabel}
            onClick={() => onClose(true)}><ViewerIcon name="close" /></button></header>
        <div className="cu-fields-settings-actions">
            <button type="button" className="cu-text-button" disabled={disabledReason !== null}
                title={disabledReason ?? undefined} onClick={() => onExpansion(false)}>
                <ViewerIcon name="collapseAll" />Collapse all {items}
            </button>
            <button type="button" className="cu-text-button" disabled={disabledReason !== null}
                title={disabledReason ?? undefined} onClick={() => onExpansion(true)}>
                <ViewerIcon name="expandAll" />Expand all {items}
            </button>
        </div>
    </section>;
}
