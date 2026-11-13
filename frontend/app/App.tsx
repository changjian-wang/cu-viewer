import { useEffect, useRef, useState } from "react";
import { ContentUnderstandingResultViewer } from "../src";
import type { ViewerFieldOrder } from "../src";
import { fieldEntries, validateFieldOrder } from "../src/interaction/reviewFields";
import { parseCuResult } from "../src/model/parseCuResult";

interface ViewerSession {
    source: string;
    result: unknown;
    labels: unknown;
    fieldOrder: ViewerFieldOrder | undefined;
    fieldOrderUrl: string | undefined;
    warnings: readonly string[];
}

function sessionURL(value: string): URL {
    const url = new URL(value, window.location.href);
    const base = new URL(".", window.location.href);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) ||
        url.username || url.password || url.search || url.hash) {
        throw new Error("The resource does not belong to this local viewer session.");
    }
    return url;
}

function compatibleOrder(value: unknown, result: unknown): ViewerFieldOrder {
    const saved = validateFieldOrder(value);
    if (!Object.keys(saved).length) return saved;
    const entries = parseCuResult(result).contents.flatMap(content => fieldEntries(content.fields));
    const invalidParents = new Set(entries.filter(entry => entry.inArray || entry.field.type !== "object").map(entry => entry.path));
    const paths = new Set(entries.filter(entry => !entry.inArray).map(entry => entry.path));
    const order: Record<string, readonly string[]> = {};
    for (const [parent, children] of Object.entries(saved)) {
        if (parent !== "$root" && (invalidParents.has(parent) || !paths.has(parent))) continue;
        const remaining = children.filter(path => paths.has(path));
        if (remaining.length) order[parent] = remaining;
    }
    return order;
}

export function App() {
    const [session, setSession] = useState<ViewerSession>();
    const [error, setError] = useState<string>();
    const [orderError, setOrderError] = useState<string>();
    const [orderStatus, setOrderStatus] = useState("");
    const lifetime = useRef<AbortController | null>(null);
    const confirmedOrder = useRef<ViewerFieldOrder>({});
    const queuedSave = useRef(Promise.resolve());
    const saveSequence = useRef(0);
    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        void (async () => {
            const response = await fetch(new URL("./session.json", window.location.href), {
                signal: controller.signal, credentials: "same-origin", cache: "no-store",
            });
            if (!response.ok) throw new Error(`Viewer session could not be loaded (${response.status}).`);
            const data: unknown = await response.json();
            if (!data || typeof data !== "object" || !("source" in data) || typeof data.source !== "string" ||
                !("name" in data) || typeof data.name !== "string" || (!("result" in data) && !("labels" in data))) {
                throw new Error("The CLI returned an invalid viewer session.");
            }
            if (!("result" in data) && "fieldOrderUrl" in data) {
                throw new Error("A label-only viewer session cannot specify an analyzer field-order URL.");
            }
            const source = sessionURL(data.source);
            const result = "result" in data ? data.result : undefined;
            const labels = "labels" in data ? data.labels : undefined;
            const warnings: string[] = [];
            if ("warnings" in data) {
                if (!Array.isArray(data.warnings) || data.warnings.some((warning: unknown) => typeof warning !== "string")) {
                    throw new Error("The CLI returned invalid viewer session warnings.");
                }
                for (const warning of data.warnings) if (typeof warning === "string") warnings.push(warning);
            }
            let fieldOrder: ViewerFieldOrder | undefined;
            let fieldOrderUrl: string | undefined;
            if ("fieldOrderUrl" in data) {
                fieldOrder = {};
                try {
                    if (typeof data.fieldOrderUrl !== "string" || !data.fieldOrderUrl) {
                        throw new Error("The CLI returned an invalid field-order URL.");
                    }
                    const url = sessionURL(data.fieldOrderUrl);
                    const response = await fetch(url, {
                        signal: controller.signal, credentials: "same-origin", cache: "no-store",
                    });
                    if (!response.ok) throw new Error(`azd settings could not be read (${response.status}).`);
                    fieldOrder = compatibleOrder(await response.json(), result);
                    fieldOrderUrl = url.href;
                } catch (failure) {
                    if (controller.signal.aborted) return;
                    setOrderError(`Field reordering is disabled: ${failure instanceof Error ? failure.message : String(failure)} Reload to retry.`);
                }
            }
            if (controller.signal.aborted) return;
            confirmedOrder.current = fieldOrder ?? {};
            setSession({ source: source.href, result, labels, fieldOrder, fieldOrderUrl, warnings });
        })().catch((failure: unknown) => {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
        });
        return () => controller.abort();
    }, []);

    const changeOrder = (order: ViewerFieldOrder): void => {
        const controller = lifetime.current;
        const url = session?.fieldOrderUrl;
        if (!controller || !url) throw new Error("The viewer has no writable field-order store.");
        const next = validateFieldOrder(order);
        const sequence = ++saveSequence.current;
        setSession(current => current ? { ...current, fieldOrder: next } : current);
        setOrderError(undefined);
        setOrderStatus("Saving field order to azd settings...");
        queuedSave.current = queuedSave.current.then(async () => {
            if (controller.signal.aborted) return;
            const response = await fetch(url, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
                signal: controller.signal, credentials: "same-origin", cache: "no-store",
            });
            if (!response.ok) throw new Error(`Field order was not saved to azd settings (${response.status}).`);
            if (controller.signal.aborted) return;
            confirmedOrder.current = next;
            if (sequence === saveSequence.current) {
                setOrderError(undefined);
                setOrderStatus("Field order saved to azd settings.");
            }
        }).catch((failure: unknown) => {
            if (controller.signal.aborted) return;
            setOrderError(failure instanceof Error ? failure.message : String(failure));
            if (sequence === saveSequence.current) {
                setSession(current => current ? { ...current, fieldOrder: confirmedOrder.current } : current);
                setOrderStatus("");
            }
        });
    };

    return <main className="cli-host"><div className="cli-workspace">
        {error ? <p role="alert">{error}</p> : session ? <>
            {session.warnings.map((warning, index) => <p role="alert" key={index}>{warning}</p>)}
            {orderError && <p role="alert">{orderError}</p>}
            <span className="cu-visually-hidden" role="status">{orderStatus}</span>
            <ContentUnderstandingResultViewer source={session.source} result={session.result} labels={session.labels}
                {...(session.fieldOrder === undefined ? {} : { fieldOrder: session.fieldOrder })}
                {...(session.fieldOrderUrl ? { onFieldOrderChange: changeOrder } : {})} />
        </> : <p role="status">Loading source and saved data...</p>}
    </div></main>;
}
