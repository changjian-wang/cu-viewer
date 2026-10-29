import { useId, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { appearance, sourceCategoryDisabledReason, sourceCategoryVisibility } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

function LegendItems({ settings, onChange, compact = false }: {
    settings: ReviewSettings; onChange: (settings: ReviewSettings) => void; compact?: boolean;
}) {
    const id = useId();
    const categories = sourceCategoryVisibility(settings);
    return <ul className={`cu-legend-items${compact ? " cu-legend-inline" : ""}`}
        aria-label={compact ? "Highlighting legend summary" : "Highlighting legend entries"}>{([
            ["field", false, 1, "Field value", "Field", "At or above threshold"],
            ["table", true, 1, "Table value", "Table", "At or above threshold"],
            ["lowField", false, 0, "Low-confidence field", "Low field", "Below threshold"],
            ["lowTable", true, 0, "Low-confidence table value", "Low table", "Below threshold"],
            ["unavailable", false, undefined, "Confidence unavailable", "N/A", "No score was supplied"],
        ] as const).map(([category, table, confidence, label, shortLabel, description]) => {
            const style = appearance(confidence === undefined ? {} : { confidence }, table,
                { ...settings, threshold: 0.7, highlightLow: true });
            const pressed = categories[category];
            const reason = sourceCategoryDisabledReason(category, settings);
            const explanation = !settings.highlightLow && (category === "field" || category === "table") ?
                "All scored values while low-confidence emphasis is off" : description;
            const action = `${pressed ? "Hide" : "Show"} this category of source highlights.`;
            const hint = `${explanation}. ${reason ?? action}`;
            return <li key={category} className="cu-legend-item" title={`${label} - ${hint}`}>
                <button type="button" className="cu-legend-category" data-legend-category={category}
                    aria-label={label} aria-pressed={pressed} aria-describedby={`${id}-${category}`}
                    disabled={reason !== null} onClick={() => onChange({
                        ...settings, sourceCategories: { ...categories, [category]: !pressed },
                    })}>
                    <span className="cu-legend-swatch" aria-hidden="true" style={{ background: pressed ? style.background : "transparent" }} />
                    <div className="cu-legend-label"><span className="cu-legend-name">{compact ? shortLabel : label}</span>
                        {!compact && <span className="cu-legend-description">{explanation}</span>}
                        {!compact && reason && <span className="cu-legend-disabled-reason">{reason}</span>}</div>
                    <span id={`${id}-${category}`} className="cu-visually-hidden">{hint}</span>
                </button>
            </li>;
        })}</ul>;
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
            if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor) onClose(false);
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
        <LegendItems settings={settings} onChange={onChange} compact />
    </div>;
}
