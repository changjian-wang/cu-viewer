import { useId, useLayoutEffect, useRef } from "react";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

export function FieldsSettings({ id, anchor, settings, onSettings, onResetOrder, resetOrderDisabledReason,
    onObjectExpansion, objectExpansionDisabledReason, onClose, labelMode = false, hideConfidence = false }: {
    labelMode?: boolean;
    hideConfidence?: boolean;
    id: string; anchor: HTMLElement; settings: ReviewSettings; onSettings: (settings: ReviewSettings) => void;
    onResetOrder: () => void; resetOrderDisabledReason: string | null;
    onObjectExpansion: (open: boolean) => void; objectExpansionDisabledReason: string | null;
    onClose: (restoreFocus: boolean) => void;
}) {
    const switchId = useId();
    const panel = useRef<HTMLElement>(null);
    const onKeyDown = usePanelDismiss(panel, anchor, onClose);
    useLayoutEffect(() => { panel.current?.querySelector("input")?.focus({ preventScroll: true }); }, []);
    return <section id={id} className="cu-fields-settings" ref={panel} role="dialog" aria-label={labelMode ? "Label settings" : "Fields settings"} tabIndex={-1}
        onKeyDown={onKeyDown} onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) onClose(false);
        }}>
        <header><h2>Settings</h2><button type="button" className="cu-icon-button" aria-label={labelMode ? "Close label settings" : "Close fields settings"}
            onClick={() => onClose(true)}><ViewerIcon name="close" /></button></header>
        {!hideConfidence && <label className="cu-switch-row cu-confidence-toggle" htmlFor={switchId}>
            <span>Show Confidence</span>
            <input id={switchId} type="checkbox" role="switch" checked={settings.columns === 3}
                onChange={event => onSettings({ ...settings, columns: event.target.checked ? 3 : 2 })} />
            <span className="cu-switch-track" aria-hidden="true" />
        </label>}
        <div className="cu-fields-settings-actions">
            <button type="button" className="cu-text-button" disabled={resetOrderDisabledReason !== null}
                title={resetOrderDisabledReason ?? undefined} onClick={onResetOrder}>
                <ViewerIcon name="reset" />Reset Field Order
            </button>
            <button type="button" className="cu-text-button" disabled={objectExpansionDisabledReason !== null}
                title={objectExpansionDisabledReason ?? undefined} onClick={() => onObjectExpansion(false)}>
                <ViewerIcon name="collapseAll" />Collapse all object fields
            </button>
            <button type="button" className="cu-text-button" disabled={objectExpansionDisabledReason !== null}
                title={objectExpansionDisabledReason ?? undefined} onClick={() => onObjectExpansion(true)}>
                <ViewerIcon name="expandAll" />Expand all object values
            </button>
        </div>
    </section>;
}
