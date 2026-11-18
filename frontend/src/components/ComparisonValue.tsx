import { displayValue, fieldLabel, fieldRegions, isFieldGroup } from "../interaction/interaction";
import { collapsedValue, confidenceDescription, fieldAppearance, FIELD_REVIEW_COLORS, isTableValue } from "../interaction/reviewFields";
import { comparisonStatusText } from "../model/fieldComparison";
import type { FieldComparisonNode } from "../model/fieldComparison";
import type { FieldsPaneProps } from "./FieldsPane";
import { ValueMenuTrigger } from "./ValueActions";

export function ComparisonValue({ node, side, props, objectSummary = false }: {
    node: FieldComparisonNode; side: "label" | "extracted"; props: FieldsPaneProps; objectSummary?: boolean;
}) {
    const field = node[side];
    const status = comparisonStatusText(node.status);
    const appearance = side === "extracted" || !props.comparison?.comparable ?
        fieldAppearance(side === "extracted" ? field : { hasValue: field?.hasValue ?? false },
            props.settings, node.status, isTableValue(node.field)) : undefined;
    const partialSummary = side === "extracted" && objectSummary && node.matched > 0 && node.errors > 0;
    const style = appearance ? {
        background: partialSummary ? FIELD_REVIEW_COLORS.partial : appearance.background,
        color: appearance.color, boxShadow: appearance.boxShadow,
    } : undefined;
    if (!field?.hasValue) return <span className="cu-comparison-value is-missing" style={style}
        title={status} aria-label={side === "label" ?
            props.comparison?.comparable ? "No label" : "Not returned" : "Not extracted"}
        data-comparison-status={node.status}>{props.comparison?.comparable ? "\u2014" : "Not returned"}</span>;
    const name = fieldLabel(field);
    return <div className={`cu-comparison-value${props.selected === field ? " is-selected" : ""}`}
        style={style} data-field-id={field.id} data-comparison-status={node.status}
        onPointerMove={event => { event.stopPropagation(); if (!props.workflow.menuOpen.current) props.onHover(field); }}
        onPointerLeave={() => props.onLeave(field)}
        onFocus={event => { event.stopPropagation(); if (!props.restoringFocus.current && !props.workflow.menuOpen.current) props.onHover(field, false); }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) props.onLeave(field); }}>
        <button type="button" className="cu-field-value" data-review-focus={field.id} data-source-field-id={field.id}
            aria-label={`Select ${side === "label" ? "label" : "extracted"} value of ${name}`}
            aria-pressed={props.selected === field}
            title={`${status}${side === "extracted" ? `; ${confidenceDescription(field, props.settings.threshold)}` : "; Label value"}${
                fieldRegions(field).length ? "" : "; No source region"}`}
            onClick={event => {
                event.stopPropagation();
                props.onSelect(field);
                props.onHover(field, event.detail === 0 ? false : undefined);
            }}
            onKeyDown={event => {
                if (event.key === "F2") { event.preventDefault(); props.workflow.inspect(field, true); }
                if (event.shiftKey && event.key === "F10") { event.preventDefault(); props.onMenu(field, event.currentTarget); }
            }}>{field.type === "object" && isFieldGroup(field) ? collapsedValue(field) || "{}" : displayValue(field)}</button>
        <ValueMenuTrigger field={field} workflow={props.workflow} menuId={props.menuId} onOpen={props.onMenu} />
    </div>;
}
