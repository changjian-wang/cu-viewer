import { useMemo, useState } from "react";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "../index";
import type { CuContent } from "../model/types";
import { defaultReviewSettings, fieldEntries, schemaIdentity, validateFieldOrder, validateOrderParents } from "./reviewFields";
import type { ReviewSettings } from "./reviewFields";
import { preferenceKey, readPreferences, validateSettings, writePreferences } from "./reviewPreferences";
import type { ReviewPreferences } from "./reviewPreferences";

interface PreferenceState extends ReviewPreferences {
    schema: string;
    error: string | null;
    blocked: boolean;
}

export function useReviewPreferences(props: ContentUnderstandingResultViewerProps, content: CuContent | undefined,
    apiVersion: string | undefined, analyzerId: string | undefined) {
    const schema = useMemo(() => schemaIdentity(content, apiVersion, analyzerId), [content, apiVersion, analyzerId]);
    const entries = useMemo(() => fieldEntries(content?.fields ?? []), [content]);
    const configured = useMemo(() => {
        try {
            const order = validateFieldOrder(props.fieldOrder ?? props.defaultFieldOrder ?? {});
            validateOrderParents(order, entries);
            return { order, error: null };
        } catch (error) {
            return { order: {}, error: `Field order configuration: ${error instanceof Error ? error.message : String(error)}` };
        }
    }, [props.fieldOrder, props.defaultFieldOrder, entries]);
    const load = (): PreferenceState => {
        try {
            const saved = readPreferences(window.localStorage, schema);
            if (saved) validateOrderParents(saved.order, entries);
            return { schema, settings: saved?.settings ?? { ...defaultReviewSettings },
                order: saved?.order ?? (props.fieldOrder === undefined ? configured.order : {}), error: null, blocked: false };
        } catch (error) {
            return { schema, settings: { ...defaultReviewSettings }, order: configured.order,
                error: `Browser preferences could not be read: ${error instanceof Error ? error.message : String(error)}`,
                blocked: true };
        }
    };
    const [state, setState] = useState<PreferenceState>(load);
    if (state.schema !== schema) setState(load());
    const current = state.schema === schema ? state : { ...state, schema };
    const controlled = props.fieldOrder !== undefined;
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
            props.onFieldOrderChange?.(next);
        },
        reset: (): void => {
            try {
                window.localStorage.removeItem(preferenceKey(schema));
                const next = { schema, settings: { ...defaultReviewSettings }, order: {}, error: null, blocked: false };
                persist(next);
                if (!controlled) props.onFieldOrderChange?.({});
            } catch (error) {
                setState({ ...current, error: `Preferences could not be reset: ${error instanceof Error ? error.message : String(error)}` });
            }
        },
    };
}
