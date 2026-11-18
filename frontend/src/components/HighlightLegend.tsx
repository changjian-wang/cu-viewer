import { useId, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { appearance, FIELD_REVIEW_COLORS } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { usePanelDismiss } from "../interaction/usePanelDismiss";
import { ViewerIcon } from "./ViewerIcon";

function LegendItems({ settings, onChange, labelMode, fieldReview, comparisonAvailable, compactLegend }: {
    labelMode: boolean;
    fieldReview: boolean;
    comparisonAvailable: boolean;
    compactLegend: boolean;
    settings: ReviewSettings; onChange: (settings: ReviewSettings) => void;
}) {
    const id = useId();
    const inlineControls = compactLegend && fieldReview && !labelMode && !comparisonAvailable;
    const switches: ("showFields" | "showTables" | "highlightLow")[] =
        labelMode ? ["showFields", "showTables"] : ["showFields", "showTables", "highlightLow"];
    if (fieldReview && !inlineControls) return <ul className="cu-legend-items cu-field-review-legend" aria-label="Highlighting legend entries">
        {([
            ["default", labelMode ? "Reference field or object label" : "Default field or object value", FIELD_REVIEW_COLORS.default],
            ["array", labelMode ? "Reference array label" : "Default array value", FIELD_REVIEW_COLORS.array],
            ...(comparisonAvailable ? [["matched", "Matches label", FIELD_REVIEW_COLORS.matched],
                ["error", "Different or extra extracted value", FIELD_REVIEW_COLORS.error],
                ["missing", "Label only; not extracted", FIELD_REVIEW_COLORS.missing]] : []),
        ]).map(([key, name, background]) => <li className="cu-legend-group" key={key}>
            <div className="cu-legend-item" data-legend-category={key}><span className="cu-legend-swatch" aria-hidden="true" style={{ background }} />
                <span className="cu-legend-label"><span className="cu-legend-name">{name}</span></span></div></li>)}
        {!labelMode && <li className="cu-legend-group">
            <div className="cu-legend-item" data-legend-category="low-outline">
                <span className="cu-legend-outline-swatch" aria-hidden="true"
                    style={{ background: comparisonAvailable ? FIELD_REVIEW_COLORS.matched : FIELD_REVIEW_COLORS.default,
                        borderColor: FIELD_REVIEW_COLORS.lowStroke }}>123</span>
                <span className="cu-legend-label"><span className="cu-legend-name">Low confidence</span>
                    <span className="cu-legend-description">{comparisonAvailable ?
                        "Confidence below threshold; matching color is unchanged." :
                        "Confidence below threshold; field or array color is unchanged."}</span></span>
            </div>
        </li>}
        {switches.map(setting =>
            <li className="cu-legend-group" key={setting}><label className="cu-switch-row cu-legend-review-toggle">
                <span>{setting === "showFields" ? "Show field highlights" : setting === "showTables" ? "Show array highlights" : "Show low confidence outlines"}</span>
                <input type="checkbox" role="switch" checked={settings[setting]}
                    onChange={event => onChange({ ...settings, [setting]: event.target.checked })} />
                <span className="cu-switch-track" aria-hidden="true" />
            </label>{setting === "highlightLow" && <span className="cu-legend-description">{comparisonAvailable ?
                "Red outline below the confidence threshold; background still indicates matching." :
                "Red outline below the confidence threshold; background still indicates the field type."}</span>}</li>)}
    </ul>;
    const groups = inlineControls ? [
        { setting: "showFields", label: "Show field highlights",
            entries: [["default", false, 1, "Default field or object value", ""]] },
        { setting: "showTables", label: "Show array highlights",
            entries: [["array", true, 1, "Default array value", ""]] },
        { setting: "highlightLow", label: "Show low confidence outlines",
            entries: [["low-outline", false, 0, "Low confidence", "Confidence below threshold; field or array color is unchanged."]] },
    ] as const : [
        { setting: "showFields", label: labelMode ? "Show label highlights" : "Show field highlights",
            entries: [["field", false, 1, labelMode ? "Field or object label" : "Field value",
                labelMode ? "Reference label; not compared" : "At or above threshold"]] },
        { setting: "showTables", label: labelMode ? "Show array label highlights" : "Show table highlights",
            entries: [["table", true, 1, labelMode ? "Array label" : "Table value",
                labelMode ? "Array rows and values; not compared" : "At or above threshold"]] },
        { setting: "highlightLow", label: "Show low confidence highlight", entries: [
            ["lowField", false, 0, "Low-confidence field", "Below threshold"],
            ["lowTable", true, 0, "Low-confidence table value", "Below threshold"],
        ] },
    ] as const;
    return <ul className={`cu-legend-items${inlineControls ? " cu-ordinary-field-legend" : ""}`} aria-label="Highlighting legend entries">{groups.filter(group =>
        !labelMode || group.setting !== "highlightLow").map(({ setting, label, entries }) =>
        <li key={label} className={`cu-legend-group${setting === "highlightLow" ? " cu-legend-low-group" : ""}`}
            data-setting={setting} aria-labelledby={setting === "highlightLow" && !inlineControls ? `${id}-low-heading` : undefined}>
            {setting === "highlightLow" && !inlineControls && <h3 className="cu-legend-group-title" id={`${id}-low-heading`}>
                Low confidence <span>Fields &amp; tables</span>
            </h3>}
            <div className="cu-legend-group-entries" id={`${id}-${setting}`}>
                {entries.map(([category, table, confidence, name, description]) => {
                    const style = inlineControls ? { background: `var(--cu-default-review-fill, ${table ?
                        FIELD_REVIEW_COLORS.array : FIELD_REVIEW_COLORS.default})` } : appearance({ confidence }, table,
                        { ...settings, threshold: 0.7, highlightLow: true }, labelMode);
                    const explanation = !inlineControls && !labelMode && !settings.highlightLow && (category === "field" || category === "table") ?
                        "All scored values while low-confidence highlight is off" : description;
                    return <div key={category} className="cu-legend-item" data-legend-category={category}
                        title={`${name} - ${explanation}`}>
                        {inlineControls && category === "low-outline" ?
                            <span className="cu-legend-outline-swatch" aria-hidden="true"
                                style={{ background: style.background, borderColor: FIELD_REVIEW_COLORS.lowStroke }}>123</span> :
                            <span className="cu-legend-swatch" aria-hidden="true" style={{ background: style.background }} />}
                        <div className="cu-legend-label"><span className="cu-legend-name">{name}</span>
                            {explanation && <span className="cu-legend-description">{explanation}</span>}</div>
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

function LegendPanel({ id, anchor, settings, onChange, onClose, labelMode, fieldReview, comparisonAvailable, compactLegend }: {
    labelMode: boolean;
    fieldReview: boolean;
    comparisonAvailable: boolean;
    compactLegend: boolean;
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
        <LegendItems settings={settings} onChange={onChange} labelMode={labelMode}
            fieldReview={fieldReview} comparisonAvailable={comparisonAvailable} compactLegend={compactLegend} />
    </section>;
}

export function HighlightLegend({ id, buttonRef, settings, onChange, open, onToggle, onClose, labelMode = false,
    fieldReview = false, comparisonAvailable = false, compactLegend = false }: {
    labelMode?: boolean;
    fieldReview?: boolean;
    comparisonAvailable?: boolean;
    compactLegend?: boolean;
    id: string; buttonRef: RefObject<HTMLButtonElement | null>; settings: ReviewSettings; open: boolean;
    onChange: (settings: ReviewSettings) => void; onToggle: () => void; onClose: (restoreFocus: boolean) => void;
}) {
    return <div className="cu-toolbar-legend">
        <div className="cu-legend-control">
            <button type="button" ref={buttonRef} className={`cu-legend-toggle${fieldReview ? " cu-label-legend-toggle" : ""}`} aria-label="Highlighting legend"
                aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={onToggle}>
                {fieldReview ? <><ViewerIcon name="info" />Legend</> : <>Legend<ViewerIcon name="down" /></>}
            </button>
            {open && buttonRef.current && <LegendPanel id={id} anchor={buttonRef.current}
                settings={settings} onChange={onChange} onClose={onClose} labelMode={labelMode}
                fieldReview={fieldReview} comparisonAvailable={comparisonAvailable} compactLegend={compactLegend} />}
        </div>
    </div>;
}
