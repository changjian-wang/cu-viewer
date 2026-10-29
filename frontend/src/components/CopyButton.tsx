import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label, context }: { value: string; label: string; context?: object | undefined }) {
    const current = useRef({ value, context });
    const generation = useRef(0);
    const mounted = useRef(false);
    const [state, setState] = useState<{ request: number; status: "copying" | "copied" | "error"; error?: string } | null>(null);
    if (current.current.value !== value || current.current.context !== context) {
        generation.current++;
        current.current = { value, context };
    }
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; generation.current++; };
    }, []);
    const active = state?.request === generation.current ? state : null;
    const copying = active?.status === "copying";
    const copy = async (): Promise<void> => {
        if (copying) return;
        const copiedValue = value;
        const request = ++generation.current;
        const valid = (): boolean => mounted.current && request === generation.current &&
            current.current.value === copiedValue && current.current.context === context;
        setState({ request, status: "copying" });
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this host.");
            await navigator.clipboard.writeText(copiedValue);
            if (valid()) setState({ request, status: "copied" });
        } catch (error) {
            if (valid()) setState({ request, status: "error", error: error instanceof Error ? error.message : String(error) });
            else console.warn("An obsolete Viewer copy attempt failed.", error);
        }
    };
    return <span className="cu-copy-control">
        <button type="button" className="cu-copy-button" aria-label={label}
            aria-disabled={copying} aria-busy={copying} onClick={() => { void copy(); }}>Copy</button>
        {active?.status === "copied" && <span role="status">Copied</span>}
        {active?.status === "error" && <span role="alert">Copy failed: {active.error}</span>}
    </span>;
}
