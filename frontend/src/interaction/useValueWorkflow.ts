import { useEffect, useRef, useState } from "react";
import type { CuField } from "../model/types";
import { copyValue, isFieldGroup } from "./reviewFields";

interface ValueMenuState {
    field: CuField;
    trigger: HTMLElement;
}

interface CopyFeedback {
    field: CuField;
    status: "copying" | "copied" | "error";
    message: string;
}

interface ValueState {
    context: object;
    inspected: CuField | null;
    detailsFocusRequest: number | null;
    menu: ValueMenuState | null;
    feedback: CopyFeedback | null;
}

export type ValueWorkflow = ReturnType<typeof useValueWorkflow>;

export function useValueWorkflow(context: object) {
    const version = useRef(0);
    const currentContext = useRef(context);
    const [state, setState] = useState<ValueState>({ context, inspected: null, detailsFocusRequest: null, menu: null, feedback: null });
    if (currentContext.current !== context) {
        currentContext.current = context;
        version.current++;
        setState({ context, inspected: null, detailsFocusRequest: null, menu: null, feedback: null });
    }
    const mounted = useRef(false);
    const current = state.context === context ? state : { context, inspected: null, detailsFocusRequest: null, menu: null, feedback: null };
    const latest = useRef(current);
    latest.current = current;
    const menuOpen = useRef(false);
    menuOpen.current = Boolean(current.menu);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; version.current++; };
    }, []);
    const resetFeedback = (): void => { version.current++; };
    return {
        ...current, menuOpen, generation: version.current,
        select: (field: CuField): void => {
            resetFeedback();
            setState({ ...latest.current, inspected: latest.current.inspected && !isFieldGroup(field) ? field : null,
                menu: null, feedback: null });
        },
        clear: (): void => {
            resetFeedback();
            setState({ context, inspected: null, detailsFocusRequest: null, menu: null, feedback: null });
        },
        inspect: (field: CuField, focusValue = false): void => {
            resetFeedback();
            setState({ ...latest.current, inspected: field, detailsFocusRequest: focusValue ? version.current : null, menu: null, feedback: null });
        },
        closeDetails: (): void => {
            resetFeedback();
            setState({ ...latest.current, inspected: null, detailsFocusRequest: null, feedback: null });
        },
        openMenu: (field: CuField, trigger: HTMLElement): void => {
            resetFeedback();
            menuOpen.current = true;
            setState({ ...latest.current, menu: { field, trigger }, feedback: null });
        },
        closeMenu: (): void => {
            menuOpen.current = false;
            setState({ ...latest.current, menu: null });
        },
        copy: async (field: CuField): Promise<void> => {
            const request = ++version.current;
            setState({ ...latest.current, menu: null, feedback: { field, status: "copying", message: "Copying…" } });
            const valid = (): boolean => mounted.current && version.current === request && currentContext.current === context;
            try {
                const clipboard = latest.current.menu?.trigger.ownerDocument.defaultView?.navigator.clipboard ?? navigator.clipboard;
                if (!clipboard?.writeText) throw new Error("Clipboard access is unavailable in this host.");
                await clipboard.writeText(copyValue(field));
                if (valid()) setState(previous => ({ ...previous, feedback: { field, status: "copied", message: "Copied" } }));
            } catch (error) {
                if (valid()) setState(previous => ({ ...previous, feedback: {
                    field, status: "error", message: `Copy failed: ${error instanceof Error ? error.message : String(error)} Select the full value and copy it manually.`,
                } }));
                else console.warn("An obsolete Viewer copy attempt failed.", error);
            }
        },
    };
}
