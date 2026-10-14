import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label }: { value: string; label: string }) {
    const current = useRef(value);
    const mounted = useRef(false);
    const [state, setState] = useState<{ value: string; status: "copying" | "copied" | "error"; error?: string } | null>(null);
    current.current = value;
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const active = state?.value === value ? state : null;
    const copying = active?.status === "copying";
    const copy = async (): Promise<void> => {
        if (copying) return;
        const copiedValue = value;
        setState({ value, status: "copying" });
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this host.");
            await navigator.clipboard.writeText(copiedValue);
            if (mounted.current && current.current === copiedValue) setState({ value: copiedValue, status: "copied" });
        } catch (error) {
            if (mounted.current && current.current === copiedValue) {
                setState({ value: copiedValue, status: "error", error: error instanceof Error ? error.message : String(error) });
            }
        }
    };
    return <span className="cu-copy-control">
        <button type="button" className="cu-copy-button" aria-label={label}
            aria-disabled={copying} aria-busy={copying} onClick={() => { void copy(); }}>Copy</button>
        {active?.status === "copied" && <span role="status">Copied</span>}
        {active?.status === "error" && <span role="alert">Copy failed: {active.error}</span>}
    </span>;
}
