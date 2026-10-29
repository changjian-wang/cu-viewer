import { displayValue, fieldLabel } from "../interaction/interaction";
import { confidenceDescription, isFieldGroup } from "../interaction/reviewFields";
import type { ValueWorkflow } from "../interaction/useValueWorkflow";
import type { CuField } from "../model/types";
import { ViewerIcon } from "./ViewerIcon";

export function ValueMenuTrigger({ field, workflow, menuId, onOpen }: {
    field: CuField; workflow: ValueWorkflow; menuId: string;
    onOpen: (field: CuField, trigger: HTMLElement) => void;
}) {
    return <button type="button" className="cu-value-menu-trigger cu-icon-button" tabIndex={-1}
        aria-label={`More value actions for ${fieldLabel(field)}`} aria-haspopup="menu"
        aria-expanded={workflow.menu?.field.id === field.id} aria-controls={workflow.menu?.field.id === field.id ? menuId : undefined}
        onClick={event => {
            event.stopPropagation();
            if (workflow.menu?.field.id === field.id) workflow.closeMenu();
            else onOpen(field, event.currentTarget);
        }}><ViewerIcon name="more" /></button>;
}

export function ValueDetails({ workflow, threshold, onClose }: {
    workflow: ValueWorkflow; threshold: number; onClose: () => void;
}) {
    const field = workflow.inspected;
    const content = useRef<HTMLDivElement>(null);
    const handledFocus = useRef<number | null>(null);
    useLayoutEffect(() => {
        const request = workflow.detailsFocusRequest;
        if (field && typeof request === "number" && request !== handledFocus.current) {
            handledFocus.current = request;
            content.current?.focus({ preventScroll: true });
        }
    }, [field, workflow.detailsFocusRequest]);
    if (!field) return null;
    const value = isFieldGroup(field) && field.hasValue ? JSON.stringify(field.value, null, 2) : displayValue(field);
    return <section className="cu-value-inspector" role="region" aria-label="Full value and confidence"
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
        <header><h3>{fieldLabel(field)}</h3><button type="button" className="cu-icon-button"
            aria-label="Close full value details" onClick={onClose}><ViewerIcon name="close" /></button></header>
        <div className="cu-inspector-value" ref={content} tabIndex={0} aria-label="Full extracted value">{value}</div>
        <footer><span>{confidenceDescription(field, threshold)}</span>
            <button type="button" className="cu-text-button" disabled={!field.hasValue} aria-label="Copy full value"
                onClick={() => { void workflow.copy(field); }}><ViewerIcon name="copy" />Copy value</button></footer>
    </section>;
}
import { useLayoutEffect, useRef } from "react";
