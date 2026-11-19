import { displayValue, fieldLabel, fieldRegions, isFieldGroup } from "../interaction/interaction";
import { collapsedValue, comparedExtractedAppearance, confidenceDescription, fieldAppearance, isTableValue, SOURCE_REVIEW_DESCRIPTION } from "../interaction/reviewFields";
import { comparisonStatusText } from "../model/fieldComparison";
import type { FieldComparisonNode } from "../model/fieldComparison";
import type { FieldsPaneProps } from "./FieldsPane";
import { ValueMenuTrigger } from "./ValueActions";
import { SourceReviewIcon } from "./ViewerIcon";

export function ComparisonValue({ node, side, props, arrayCell = false }: {
    node: FieldComparisonNode; side: "label" | "extracted"; props: FieldsPaneProps; arrayCell?: boolean;
}) {
    const field = node[side];
    const status = comparisonStatusText(node.status);
    const appearance = side === "extracted" ? comparedExtractedAppearance(node, props.settings) :
        !props.comparison?.comparable ? fieldAppearance({ hasValue: field?.hasValue ?? false },
            props.settings, node.status, isTableValue(node.field)) : undefined;
    const needsReview = side === "extracted" && field?.needsSourceReview;
    const style = appearance ? {
        background: appearance.background,
        color: appearance.color, boxShadow: appearance.boxShadow,
    } : undefined;
    if (!field?.hasValue) return <span className="cu-comparison-value is-missing" style={style}
        title={status} aria-label={side === "label" ?
            props.comparison?.comparable ? "No label" : "Not returned" : "Not extracted"}
        tabIndex={field ? -1 : undefined} data-field-value-focus={field?.id} aria-description={field ? fieldLabel(field) : undefined}
        data-comparison-status={node.status}><span className="cu-value-chip is-missing">{displayValue(field)}</span></span>;
    const name = fieldLabel(field);
    return <div className={`cu-comparison-value${props.selected === field ? " is-selected" : ""}`}
        style={style} data-field-id={field.id} data-comparison-status={node.status}
        onPointerMove={event => { event.stopPropagation(); if (!props.workflow.menuOpen.current) props.onHover(field); }}
        onPointerLeave={() => props.onLeave(field)}
        onFocus={event => { event.stopPropagation(); if (!props.restoringFocus.current && !props.workflow.menuOpen.current) props.onHover(field, false); }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) props.onLeave(field); }}>
        {arrayCell && needsReview && <SourceReviewIcon />}
        <button type="button" className="cu-field-value" data-review-focus={field.id} data-source-field-id={field.id}
            data-field-value-focus={field.id}
            aria-label={`Select ${side === "label" ? "label" : "extracted"} value of ${name}`}
            aria-description={needsReview ? SOURCE_REVIEW_DESCRIPTION : undefined}
            aria-pressed={props.selected === field}
            title={`${status}${side === "extracted" ? `; ${confidenceDescription(field, props.settings.threshold)}` : "; Label value"}${
                fieldRegions(field).length ? "" : "; No source region"}${needsReview ? `; ${SOURCE_REVIEW_DESCRIPTION}` : ""}`}
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
