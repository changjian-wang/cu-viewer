import { useId, useLayoutEffect, useRef, useState } from "react";
import { formatThreshold, parseThreshold } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

export function HighlightSettings({ anchor, settings, onChange, onClose }: {
    anchor: HTMLElement; settings: ReviewSettings; onChange: (settings: ReviewSettings) => void; onClose: (restore: boolean) => void;
}) {
    const id = useId();
    const panel = useRef<HTMLElement>(null);
    const [threshold, setThreshold] = useState(() => formatThreshold(settings.threshold));
    const [error, setError] = useState<string | null>(null);
    const onKeyDown = usePanelDismiss(panel, anchor, onClose);
    useLayoutEffect(() => { panel.current?.querySelector("input")?.focus({ preventScroll: true }); }, []);
    return <section className="cu-highlighting-settings" ref={panel} role="dialog" aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}>
        <header><h2 id={`${id}-title`}>Highlighting</h2><button type="button" className="cu-icon-button"
            aria-label="Close highlighting settings" onClick={() => onClose(true)}><ViewerIcon name="close" /></button></header>
        <label className="cu-threshold-label" htmlFor={`${id}-threshold`}>Confidence threshold</label>
        <div className="cu-threshold-control">
            <input id={`${id}-threshold`} type="number" min="0" max="1" step="0.01" inputMode="decimal"
                value={threshold} aria-invalid={Boolean(error)}
                aria-describedby={`${id}-range ${id}-hint${error ? ` ${id}-error` : ""}`}
                onChange={event => {
                    setThreshold(event.target.value);
                    try { onChange({ ...settings, threshold: parseThreshold(event.target.value) }); setError(null); }
                    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
                }} />
            <span id={`${id}-range`}>0 to 1</span>
        </div>
        {error && <p id={`${id}-error`} className="cu-input-error" role="alert">{error}</p>}
        <p id={`${id}-hint`} className="cu-setting-hint">Values below <strong>{formatThreshold(settings.threshold)}</strong> receive low-confidence emphasis.</p>
        <div className="cu-settings-section cu-highlight-options"><h3>Options</h3>{([
            ["showFields", "Show field highlights"], ["showTables", "Show table highlights"], ["highlightLow", "Highlight low confidences"],
        ] as const).map(([key, label]) => <label key={key} className="cu-switch-row">
            <input type="checkbox" role="switch" checked={settings[key]} onChange={event => onChange({ ...settings, [key]: event.target.checked })} />
            <span className="cu-switch-track" aria-hidden="true" /><span>{label}</span>
        </label>)}</div>
        <p className="cu-panel-footnote">Highlighting never changes the extracted data.</p>
    </section>;
}
