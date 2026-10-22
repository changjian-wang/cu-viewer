import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ContentUnderstandingResultViewer } from "../../frontend/src";
import type { ViewerSource } from "../../frontend/src";
import pdfUrl from "../fixtures/mixed-financial-docs.pdf?url";
import pdfResultUrl from "../fixtures/mixed-financial-docs.cu.json?url";
import pngUrl from "../fixtures/receipt.png?url";
import pngResultUrl from "../fixtures/receipt.cu.json?url";
import heifUrl from "../fixtures/images/example.heic?url";
import heifResultUrl from "../fixtures/images/example.synthetic.cu.json?url";

const inputKinds = ["File", "Blob", "ArrayBuffer", "HTTP URL", "Blob URL"] as const;
const conditions = ["valid", "empty", "corrupt"] as const;
const samples = {
    PDF: { source: pdfUrl, result: pdfResultUrl, name: "mixed-financial-docs.pdf", type: "application/pdf" },
    PNG: { source: pngUrl, result: pngResultUrl, name: "receipt.png", type: "image/png" },
    HEIF: { source: heifUrl, result: heifResultUrl, name: "example.heic", type: "image/heic" },
};

interface HostInput {
    source: ViewerSource;
    result: unknown;
    originalResult: string;
    bytes: ArrayBuffer | null;
    ownedUrl: string | null;
}

interface Inspection {
    byteLength: number | null;
    sha256: string | null;
    resultUnchanged: boolean;
    blobUrlReadable: boolean | null;
}

async function digest(bytes: ArrayBuffer): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        value => value.toString(16).padStart(2, "0")).join("");
}

function SourceInputHost() {
    const [kind, setKind] = useState<typeof inputKinds[number]>("File");
    const [condition, setCondition] = useState<typeof conditions[number]>("valid");
    const [urlOverride, setUrlOverride] = useState("");
    const [input, setInput] = useState<HostInput | null>(null);
    const [mounted, setMounted] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inspection, setInspection] = useState<Inspection | null>(null);
    const currentInput = useRef<HostInput | null>(null);
    const pending = useRef<AbortController | null>(null);

    useEffect(() => () => {
        pending.current?.abort();
        if (currentInput.current?.ownedUrl) URL.revokeObjectURL(currentInput.current.ownedUrl);
    }, []);

    const load = async (sampleName: keyof typeof samples): Promise<void> => {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setPreparing(true);
        setError(null);
        setInspection(null);
        let ownedUrl: string | null = null;
        try {
            const sample = samples[sampleName];
            const response = await fetch(sample.result, { signal: controller.signal });
            if (!response.ok) throw new Error(`Saved test result failed (${response.status}).`);
            const result: unknown = await response.json();
            const originalResult = JSON.stringify(result);
            if (originalResult === undefined) throw new Error("The saved test result cannot be serialized.");
            let bytes: ArrayBuffer | null = null;
            let source: ViewerSource;
            if (kind === "HTTP URL") {
                source = new URL(urlOverride || sample.source, location.href).href;
            } else {
                const sourceResponse = await fetch(sample.source, { signal: controller.signal });
                if (!sourceResponse.ok) throw new Error(`Test source preparation failed (${sourceResponse.status}).`);
                bytes = await sourceResponse.arrayBuffer();
                if (condition === "empty") bytes = new ArrayBuffer(0);
                if (condition === "corrupt") bytes = bytes.slice(0, 16);
                if (kind === "File") source = new File([bytes], sample.name, { type: sample.type });
                else if (kind === "Blob") source = new Blob([bytes]);
                else if (kind === "ArrayBuffer") source = bytes;
                else {
                    ownedUrl = URL.createObjectURL(new Blob([bytes], { type: sample.type }));
                    source = ownedUrl;
                }
            }
            if (controller.signal.aborted) {
                if (ownedUrl) URL.revokeObjectURL(ownedUrl);
                return;
            }
            const previous = currentInput.current;
            const next = { source, result, originalResult, bytes, ownedUrl };
            currentInput.current = next;
            setInput(next);
            setMounted(true);
            if (previous?.ownedUrl) URL.revokeObjectURL(previous.ownedUrl);
        } catch (failure) {
            if (ownedUrl) URL.revokeObjectURL(ownedUrl);
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            if (pending.current === controller) setPreparing(false);
        }
    };

    const inspect = async (): Promise<void> => {
        const value = currentInput.current;
        if (!value) throw new Error("There is no caller input to inspect.");
        setError(null);
        try {
            let blobUrlReadable: boolean | null = null;
            if (value.ownedUrl) {
                const response = await fetch(value.ownedUrl);
                if (!response.ok) throw new Error(`Caller-owned blob URL failed (${response.status}).`);
                blobUrlReadable = (await response.arrayBuffer()).byteLength === value.bytes?.byteLength;
            }
            setInspection({
                byteLength: value.bytes?.byteLength ?? null,
                sha256: value.bytes ? await digest(value.bytes) : null,
                resultUnchanged: JSON.stringify(value.result) === value.originalResult,
                blobUrlReadable,
            });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        }
    };

    const release = (): void => {
        pending.current?.abort();
        if (currentInput.current?.ownedUrl) URL.revokeObjectURL(currentInput.current.ownedUrl);
        currentInput.current = null;
        setInput(null);
        setMounted(false);
        setInspection(null);
    };

    return <main>
        <h1>Public-source input test host</h1>
        <p>Test-only host using saved real PDF/PNG pairs. HEIF uses a licensed photograph with synthetic geometry, not service output. Empty/corrupt inputs are synthetic failure cases. No Analyze calls.</p>
        <div className="input-controls">
            <label>Source input<select aria-label="Source input" value={kind} onChange={event => {
                const next = inputKinds.find(value => value === event.target.value);
                if (!next) throw new Error("Unknown test source input kind.");
                setKind(next);
            }}>{inputKinds.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Source condition<select aria-label="Source condition" value={condition} onChange={event => {
                const next = conditions.find(value => value === event.target.value);
                if (!next) throw new Error("Unknown test source condition.");
                setCondition(next);
            }}>{conditions.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>URL override<input aria-label="URL override" value={urlOverride} onChange={event => setUrlOverride(event.target.value)} /></label>
            <button type="button" onClick={() => { void load("PDF"); }}>Load PDF</button>
            <button type="button" onClick={() => { void load("PNG"); }}>Load PNG</button>
            <button type="button" onClick={() => { void load("HEIF"); }}>Load HEIF</button>
            <button type="button" disabled={!input || !mounted} onClick={() => setMounted(false)}>Unmount viewer</button>
            <button type="button" disabled={!input || mounted} onClick={() => setMounted(true)}>Mount viewer</button>
            <button type="button" disabled={!input} onClick={() => { void inspect(); }}>Inspect caller data</button>
            <button type="button" disabled={!input && !preparing} onClick={release}>Release host input</button>
        </div>
        {preparing && <p role="status">Preparing saved input...</p>}
        {error && <p role="alert">Test host: {error}</p>}
        {inspection && <div className="input-diagnostics">
            <span data-testid="caller-byte-length">{inspection.byteLength ?? "not applicable"}</span>{" / "}
            <span data-testid="caller-sha256">{inspection.sha256 ?? "not applicable"}</span>{" / "}
            <span data-testid="caller-result-unchanged">{String(inspection.resultUnchanged)}</span>{" / "}
            <span data-testid="caller-blob-url-readable">{inspection.blobUrlReadable === null ? "not applicable" : String(inspection.blobUrlReadable)}</span>
        </div>}
        <div className="input-workspace">
            {mounted && input ? <ContentUnderstandingResultViewer source={input.source} result={input.result} /> :
                <p role="status">Viewer unmounted.</p>}
        </div>
    </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("The test host root is missing.");
createRoot(root).render(<StrictMode><SourceInputHost /></StrictMode>);
