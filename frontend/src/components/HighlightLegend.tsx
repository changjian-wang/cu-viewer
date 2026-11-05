import { useId, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { appearance } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

function LegendItems({ settings, onChange }: {
    settings: ReviewSettings; onChange: (settings: ReviewSettings) => void;
}) {
    const id = useId();
    const groups = [
        { setting: "showFields", label: "Show field highlights",
            entries: [["field", false, 1, "Field value", "At or above threshold"]] },
        { setting: "showTables", label: "Show table highlights",
            entries: [["table", true, 1, "Table value", "At or above threshold"]] },
        { setting: "highlightLow", label: "Show low confidence highlight", entries: [
            ["lowField", false, 0, "Low-confidence field", "Below threshold"],
            ["lowTable", true, 0, "Low-confidence table value", "Below threshold"],
        ] },
    ] as const;
    return <ul className="cu-legend-items" aria-label="Highlighting legend entries">{groups.map(({ setting, label, entries }) =>
        <li key={label} className={`cu-legend-group${setting === "highlightLow" ? " cu-legend-low-group" : ""}`}
            data-setting={setting} aria-labelledby={setting === "highlightLow" ? `${id}-low-heading` : undefined}>
            {setting === "highlightLow" && <h3 className="cu-legend-group-title" id={`${id}-low-heading`}>
                Low confidence <span>Fields &amp; tables</span>
            </h3>}
            <div className="cu-legend-group-entries" id={`${id}-${setting}`}>
                {entries.map(([category, table, confidence, name, description]) => {
                    const style = appearance({ confidence }, table,
                        { ...settings, threshold: 0.7, highlightLow: true });
                    const explanation = !settings.highlightLow && (category === "field" || category === "table") ?
                        "All scored values while low-confidence highlight is off" : description;
                    return <div key={category} className="cu-legend-item" data-legend-category={category}
                        title={`${name} - ${explanation}`}>
                        <span className="cu-legend-swatch" aria-hidden="true" style={{ background: style.background }} />
                        <div className="cu-legend-label"><span className="cu-legend-name">{name}</span>
                            <span className="cu-legend-description">{explanation}</span></div>
                    </div>;
                })}
            </div>
            <label className="cu-switch-row cu-legend-switch">
                <input type="checkbox" role="switch" aria-label={label} aria-describedby={`${id}-${setting}`}
                    checked={settings[setting]} onChange={event => onChange({ ...settings, [setting]: event.target.checked })} />
                <span className="cu-switch-track" aria-hidden="true" />
            </label>
        </li>
    )}</ul>;
}

function LegendPanel({ id, anchor, settings, onChange, onClose }: {
    id: string; anchor: HTMLElement; settings: ReviewSettings; onChange: (settings: ReviewSettings) => void;
    onClose: (restoreFocus: boolean) => void;
}) {
    const panel = useRef<HTMLElement>(null);
    const onKeyDown = usePanelDismiss(panel, anchor, onClose);
    useLayoutEffect(() => { panel.current?.querySelector("button")?.focus({ preventScroll: true }); }, []);
    return <section id={id} ref={panel} className="cu-legend-panel" role="dialog" aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown} onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) onClose(false);
        }}>
        <div className="cu-legend-heading"><h2 id={`${id}-title`}>Legend</h2><button type="button" className="cu-icon-button"
            aria-label="Close legend" onClick={() => onClose(true)}><ViewerIcon name="close" /></button></div>
        <LegendItems settings={settings} onChange={onChange} />
    </section>;
}

export function HighlightLegend({ id, buttonRef, settings, onChange, open, onToggle, onClose }: {
    id: string; buttonRef: RefObject<HTMLButtonElement | null>; settings: ReviewSettings; open: boolean;
    onChange: (settings: ReviewSettings) => void; onToggle: () => void; onClose: (restoreFocus: boolean) => void;
}) {
    return <div className="cu-toolbar-legend">
        <div className="cu-legend-control">
            <button type="button" ref={buttonRef} className="cu-legend-toggle" aria-label="Highlighting legend"
                aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={onToggle}>
                Legend<ViewerIcon name="down" />
            </button>
            {open && buttonRef.current && <LegendPanel id={id} anchor={buttonRef.current}
                settings={settings} onChange={onChange} onClose={onClose} />}
        </div>
    </div>;
}
