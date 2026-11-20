import { useMemo, useState } from "react";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "../index";
import type { CuContent, CuField } from "../model/types";
import { defaultReviewSettings, fieldEntries, isCustomizableObject, mergeSavedOrder, projectSavedOrder, schemaIdentity, validateFieldOrder, validateOrderParents } from "./reviewFields";
import type { ReviewSettings } from "./reviewFields";
import { readPreferences, validateSettings, writePreferences } from "./reviewPreferences";
import type { ReviewPreferences } from "./reviewPreferences";

interface PreferenceState extends ReviewPreferences {
    schema: string;
    defaults: Readonly<ReviewSettings>;
    error: string | null;
    blocked: boolean;
}

const jsonFieldOrder: ViewerFieldOrder = {};

export function useReviewPreferences(props: ContentUnderstandingResultViewerProps, content: CuContent | undefined,
    apiVersion: string | undefined, analyzerId: string | undefined, defaults: Readonly<ReviewSettings> = defaultReviewSettings,
    reconcileSavedOrder = false) {
    const schema = useMemo(() => schemaIdentity(content, apiVersion, analyzerId), [content, apiVersion, analyzerId]);
    const entries = useMemo(() => fieldEntries(content?.fields ?? []), [content]);
    const objectPaths = useMemo(() => new Map(entries.filter(isCustomizableObject).map(entry => [entry.field.id, entry.path])), [entries]);
    const controlled = props.fieldOrder !== undefined;
    const canToggleCustomization = !controlled && !reconcileSavedOrder;
    const restoreSavedOrder = controlled && reconcileSavedOrder;
    const configured = useMemo(() => {
        try {
            const saved = validateFieldOrder(props.fieldOrder ?? props.defaultFieldOrder ?? {});
            if (restoreSavedOrder) return { order: projectSavedOrder(saved, entries), saved, error: null };
            validateOrderParents(saved, entries);
            return { order: saved, saved, error: null };
        } catch (error) {
            return { order: {}, saved: {}, error: `Field order configuration: ${error instanceof Error ? error.message : String(error)}` };
        }
    }, [props.fieldOrder, props.defaultFieldOrder, entries, restoreSavedOrder]);
    const load = (): PreferenceState => {
        try {
            const saved = readPreferences(window.localStorage, schema);
            if (saved) validateOrderParents(saved.order, entries);
            return { schema, defaults, settings: saved?.settings ?? { ...defaults },
                order: saved?.order ?? (props.fieldOrder === undefined ? configured.order : {}),
                objectExpansion: saved?.objectExpansion, useCustomizedFieldOrder: saved?.useCustomizedFieldOrder,
                error: null, blocked: false };
        } catch (error) {
            return { schema, defaults, settings: { ...defaults }, order: configured.order,
                error: `Browser preferences could not be read: ${error instanceof Error ? error.message : String(error)}`,
                blocked: true };
        }
    };
    const [state, setState] = useState<PreferenceState>(load);
    if (state.schema !== schema || state.defaults !== defaults) setState(load());
    const current = state.schema === schema && state.defaults === defaults ? state : { ...state, schema, defaults };
    const customized = !canToggleCustomization || current.useCustomizedFieldOrder !== false;
    const order = controlled ? configured.order : customized ? current.order : jsonFieldOrder;
    const persist = (changes: Partial<ReviewPreferences>): void => {
        const apply = (preferences: ReviewPreferences): ReviewPreferences => ({
            ...preferences,
            ...changes,
            objectExpansion: changes.objectExpansion === undefined ? preferences.objectExpansion :
                { ...preferences.objectExpansion, ...changes.objectExpansion },
        });
        const next = { ...current, ...apply(current) };
        if (next.blocked) {
            setState(next);
            return;
        }
        try {
            const storage = window.localStorage;
            // Update only the edited preference; another viewer may have saved the same schema.
            const saved = apply(readPreferences(storage, schema) ?? current);
            if (changes.useCustomizedFieldOrder === true) validateOrderParents(saved.order, entries);
            writePreferences(storage, schema, saved);
            // Turning customization back on reapplies the stored profile, not a stale preview.
            setState({ ...next, ...(changes.useCustomizedFieldOrder === true ?
                { order: saved.order, objectExpansion: saved.objectExpansion } : {}), error: null });
        } catch (error) {
            setState({ ...next, error: `Browser preferences were not saved: ${error instanceof Error ? error.message : String(error)}` });
        }
    };
    return {
        settings: current.settings, order, error: [configured.error, current.error].filter(Boolean).join(" ") || null,
        storageError: current.error,
        controlled,
        orderReadOnly: Boolean(configured.error || (controlled && !props.onFieldOrderChange)),
        customizedFieldOrder: canToggleCustomization ? {
            enabled: customized,
            disabledReason: current.blocked ? "Reset browser preferences before changing field customization." : null,
            onChange: (enabled: boolean): void => {
                if (!current.blocked && enabled !== customized) persist({ useCustomizedFieldOrder: enabled });
            },
        } : undefined,
        objectExpansion: !reconcileSavedOrder && customized ? current.objectExpansion : undefined,
        changeObjectExpansion: (fields: readonly CuField[], open: boolean): void => {
            if (reconcileSavedOrder || !customized) return;
            const objectExpansion: Record<string, boolean> = {};
            for (const field of fields) {
                const path = objectPaths.get(field.id);
                if (path !== undefined) objectExpansion[path] = open;
            }
            if (Object.keys(objectExpansion).length) persist({ objectExpansion });
        },
        changeSettings: (settings: ReviewSettings): void => persist({ settings: validateSettings(settings) }),
        changeOrder: (next: ViewerFieldOrder): void => {
            validateOrderParents(validateFieldOrder(next), entries);
            if (!customized || configured.error || (controlled && !props.onFieldOrderChange)) return;
            if (!controlled) persist({ order: next });
            props.onFieldOrderChange?.(restoreSavedOrder ? mergeSavedOrder(configured.saved, configured.order, next) : next);
        },
        reset: (): void => {
            try {
                const next = { schema, defaults, settings: { ...defaults }, order: {}, error: null, blocked: false };
                writePreferences(window.localStorage, schema, next);
                setState(next);
                if (!controlled) props.onFieldOrderChange?.({});
            } catch (error) {
                setState({ ...current, error: `Preferences could not be reset: ${error instanceof Error ? error.message : String(error)}` });
            }
        },
    };
}
