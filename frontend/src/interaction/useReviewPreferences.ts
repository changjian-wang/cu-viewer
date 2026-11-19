import { useMemo, useState } from "react";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "../index";
import type { CuContent } from "../model/types";
import { defaultReviewSettings, fieldEntries, mergeSavedOrder, projectSavedOrder, schemaIdentity, validateFieldOrder, validateOrderParents } from "./reviewFields";
import type { ReviewSettings } from "./reviewFields";
import { preferenceKey, readPreferences, validateSettings, writePreferences } from "./reviewPreferences";
import type { ReviewPreferences } from "./reviewPreferences";

interface PreferenceState extends ReviewPreferences {
    schema: string;
    defaults: Readonly<ReviewSettings>;
    error: string | null;
    blocked: boolean;
}

export function useReviewPreferences(props: ContentUnderstandingResultViewerProps, content: CuContent | undefined,
    apiVersion: string | undefined, analyzerId: string | undefined, defaults: Readonly<ReviewSettings> = defaultReviewSettings,
    reconcileSavedOrder = false) {
    const schema = useMemo(() => schemaIdentity(content, apiVersion, analyzerId), [content, apiVersion, analyzerId]);
    const entries = useMemo(() => fieldEntries(content?.fields ?? []), [content]);
    const controlled = props.fieldOrder !== undefined;
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
                order: saved?.order ?? (props.fieldOrder === undefined ? configured.order : {}), error: null, blocked: false };
        } catch (error) {
            return { schema, defaults, settings: { ...defaults }, order: configured.order,
                error: `Browser preferences could not be read: ${error instanceof Error ? error.message : String(error)}`,
                blocked: true };
        }
    };
    const [state, setState] = useState<PreferenceState>(load);
    if (state.schema !== schema || state.defaults !== defaults) setState(load());
    const current = state.schema === schema && state.defaults === defaults ? state : { ...state, schema, defaults };
    const order = controlled ? configured.order : current.order;
    const persist = (next: PreferenceState): void => {
        if (next.blocked) {
            setState(next);
            return;
        }
        try {
            writePreferences(window.localStorage, schema, { settings: next.settings, order: next.order });
            setState({ ...next, error: null });
        } catch (error) {
            setState({ ...next, error: `Browser preferences were not saved: ${error instanceof Error ? error.message : String(error)}` });
        }
    };
    return {
        settings: current.settings, order, error: [configured.error, current.error].filter(Boolean).join(" ") || null,
        storageError: current.error,
        controlled,
        orderReadOnly: Boolean(configured.error || (controlled && !props.onFieldOrderChange)),
        changeSettings: (settings: ReviewSettings): void => persist({ ...current, settings: validateSettings(settings) }),
        changeOrder: (next: ViewerFieldOrder): void => {
            validateOrderParents(validateFieldOrder(next), entries);
            if (configured.error || (controlled && !props.onFieldOrderChange)) return;
            if (!controlled) persist({ ...current, order: next });
            props.onFieldOrderChange?.(restoreSavedOrder ? mergeSavedOrder(configured.saved, configured.order, next) : next);
        },
        reset: (): void => {
            try {
                window.localStorage.removeItem(preferenceKey(schema));
                const next = { schema, defaults, settings: { ...defaults }, order: {}, error: null, blocked: false };
                persist(next);
                if (!controlled) props.onFieldOrderChange?.({});
            } catch (error) {
                setState({ ...current, error: `Preferences could not be reset: ${error instanceof Error ? error.message : String(error)}` });
            }
        },
    };
}
