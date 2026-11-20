import { useId, useLayoutEffect, useRef } from "react";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

export interface CustomizedFieldOrderControl {
    enabled: boolean;
    disabledReason: string | null;
    onChange: (enabled: boolean) => void;
}

export function FieldsSettings({ id, anchor, settings, onSettings, onResetOrder, resetOrderDisabledReason,
    customizedFieldOrder, onObjectExpansion, objectExpansionDisabledReason, onClose, labelMode = false, hideConfidence = false }: {
    labelMode?: boolean;
    hideConfidence?: boolean;
    id: string; anchor: HTMLElement; settings: ReviewSettings; onSettings: (settings: ReviewSettings) => void;
    onResetOrder: () => void; resetOrderDisabledReason: string | null;
    customizedFieldOrder?: CustomizedFieldOrderControl | undefined;
    onObjectExpansion: (open: boolean) => void; objectExpansionDisabledReason: string | null;
    onClose: (restoreFocus: boolean) => void;
}) {
    const confidenceId = useId();
    const customizedOrderId = useId();
    const panel = useRef<HTMLElement>(null);
    const onKeyDown = usePanelDismiss(panel, anchor, onClose);
    useLayoutEffect(() => { panel.current?.querySelector<HTMLInputElement>("input:enabled")?.focus({ preventScroll: true }); }, []);
    return <section id={id} className="cu-fields-settings" ref={panel} role="dialog" aria-label={labelMode ? "Label settings" : "Fields settings"} tabIndex={-1}
        onKeyDown={onKeyDown} onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) onClose(false);
        }}>
        <header><h2>Settings</h2><button type="button" className="cu-icon-button" aria-label={labelMode ? "Close label settings" : "Close fields settings"}
            onClick={() => onClose(true)}><ViewerIcon name="close" /></button></header>
        {!hideConfidence && <label className="cu-switch-row cu-confidence-toggle" htmlFor={confidenceId}>
            <span>Show Confidence</span>
            <input id={confidenceId} type="checkbox" role="switch" checked={settings.columns === 3}
                onChange={event => onSettings({ ...settings, columns: event.target.checked ? 3 : 2 })} />
            <span className="cu-switch-track" aria-hidden="true" />
        </label>}
        {customizedFieldOrder && <label className="cu-switch-row cu-customized-order-toggle" htmlFor={customizedOrderId}
            title={customizedFieldOrder.disabledReason ?? undefined}>
            <span>Use Customized Field Order</span>
            <input id={customizedOrderId} type="checkbox" role="switch" checked={customizedFieldOrder.enabled}
                disabled={customizedFieldOrder.disabledReason !== null} aria-description={customizedFieldOrder.disabledReason ?? undefined}
                onChange={event => customizedFieldOrder.onChange(event.target.checked)} />
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
