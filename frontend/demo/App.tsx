import { useEffect, useRef, useState } from "react";
import { ContentUnderstandingResultViewer } from "../src";
import type { ViewerSource } from "../src";
import pdfUrl from "../../tests/fixtures/mixed-financial-docs.pdf?url";
import pdfResultUrl from "../../tests/fixtures/mixed-financial-docs.cu.json?url";
import pngUrl from "../../tests/fixtures/receipt.png?url";
import pngResultUrl from "../../tests/fixtures/receipt.cu.json?url";
import largePdfUrl from "../../tests/fixtures/large-bank-statement.pdf?url";
import largePdfResultUrl from "../../tests/fixtures/large-bank-statement.cu.json?url";

const requestedSample = new URLSearchParams(window.location.search).get("sample");
const samples = {
    pdf: { label: "PDF", source: pdfUrl, result: pdfResultUrl, name: "mixed-financial-docs.pdf", json: "mixed-financial-docs.cu.json", type: "application/pdf" },
    png: { label: "Receipt PNG", source: pngUrl, result: pngResultUrl, name: "receipt.png", json: "receipt.cu.json", type: "image/png" },
    large: { label: "Large PDF", source: largePdfUrl, result: largePdfResultUrl,
        name: "large-bank-statement.pdf", json: "large-bank-statement.cu.json", type: "application/pdf" },
};
type Sample = keyof typeof samples;
const sampleChoices: readonly Sample[] = ["pdf", "png", "large"];
const initialSample: Sample = requestedSample === "pdf" || requestedSample === "png" || requestedSample === "large"
    ? requestedSample : "pdf";

export function App() {
    const [sample, setSample] = useState<Sample>(initialSample);
    const [reload, setReload] = useState(0);
    const [input, setInput] = useState<{
        source: ViewerSource; result: unknown; name: string; json: string; labels?: unknown; labelName?: string;
    } | null>(null);
    const [hostError, setHostError] = useState<string | null>(null);
    const jsonGeneration = useRef(0);
    const labelGeneration = useRef(0);
    useEffect(() => {
        jsonGeneration.current++;
        labelGeneration.current++;
        const controller = new AbortController();
        const pair = samples[sample];
        setInput(null);
        setHostError(null);
        void Promise.all([
            fetch(pair.source, { signal: controller.signal }).then(async response => {
                if (!response.ok) throw new Error(`Sample source failed (${response.status}).`);
                return response.blob();
            }),
            fetch(pair.result, { signal: controller.signal }).then(async response => {
                if (!response.ok) throw new Error(`Sample result failed (${response.status}).`);
                const data: unknown = await response.json();
                return data;
            }),
        ]).then(([blob, result]) => {
            if (controller.signal.aborted) return;
            setInput({ source: new File([blob], pair.name, { type: pair.type }), result, name: pair.name, json: pair.json });
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setHostError(error instanceof Error ? error.message : String(error));
        });
        return () => controller.abort();
    }, [sample, reload]);
    const loadJson = (file: File): void => {
        const generation = ++jsonGeneration.current;
        setHostError(null);
        void file.text().then(text => {
            const result: unknown = JSON.parse(text);
            if (generation !== jsonGeneration.current) return;
            setInput(current => current ? { ...current, result, json: file.name } : null);
        }).catch((error: unknown) => {
            if (generation !== jsonGeneration.current) return;
            setHostError(`Saved JSON could not be read: ${error instanceof Error ? error.message : String(error)}`);
            setInput(current => current ? { ...current, result: undefined, json: file.name } : null);
        });
    };
    const chooseSample = (choice: Sample): void => {
        jsonGeneration.current++;
        labelGeneration.current++;
        setSample(choice);
        setReload(current => current + 1);
    };
    const loadLabels = (file: File): void => {
        const generation = ++labelGeneration.current;
        setHostError(null);
        void file.text().then(text => {
            const labels: unknown = JSON.parse(text);
            if (generation !== labelGeneration.current) return;
            setInput(current => current ? { ...current, labels, labelName: file.name } : null);
        }).catch((error: unknown) => {
            if (generation !== labelGeneration.current) return;
            setHostError(`Local label JSON could not be read: ${error instanceof Error ? error.message : String(error)}`);
            setInput(current => current ? { ...current, labels: undefined, labelName: file.name } : null);
        });
    };
    return <main className="prototype-host">
        <header className="prototype-banner"><div className="prototype-brand"><h1>CU Viewer</h1><span>Development preview · saved data</span></div>
        <div className="prototype-inputs">
            <label className="prototype-picker"><span>Source</span><strong>{input?.name ?? "Loading sample..."}</strong><span className="prototype-browse">Browse...</span>
                <input type="file" aria-label="Choose source file" accept=".pdf,.png,.jpg,.jpeg,.jpe,.bmp,.heif,.heic" disabled={!input}
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                            jsonGeneration.current++;
                            labelGeneration.current++;
                            setHostError(null);
                            setInput(current => current ? { ...current, source: file, name: file.name } : null);
                            event.target.value = "";
                        }
                    }} />
            </label>
            <label className="prototype-picker"><span>Labels</span><strong title={input?.labelName}>{input?.labelName ?? "Choose .labels.json"}</strong><span className="prototype-browse">Browse...</span>
                <input type="file" aria-label="Choose local label JSON" accept=".json" disabled={!input} onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) {
                        loadLabels(file);
                        event.target.value = "";
                    }
                }} />
            </label>
            <label className="prototype-picker"><span>Result</span><strong>{input?.json ?? "Loading sample..."}</strong><span className="prototype-browse">Browse...</span>
                <input type="file" aria-label="Choose saved Analyze JSON" accept=".json" disabled={!input} onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) {
                        loadJson(file);
                        event.target.value = "";
                    }
                }} />
            </label>
            <div className="prototype-samples"><span>Samples:</span>
                {sampleChoices.map(choice => <button key={choice} type="button" aria-pressed={sample === choice}
                    onClick={() => chooseSample(choice)}>{samples[choice].label}</button>)}
            </div>
        </div>
        </header>
        {hostError && <div className="prototype-alert" role="alert">{hostError}</div>}
        <div className="prototype-workspace">
            {input ? <ContentUnderstandingResultViewer source={input.source} result={input.result} labels={input.labels} /> :
                <div className="prototype-loading" role="status">{hostError ? "Sample loading failed." : "Loading saved source and result..."}</div>}
        </div>
    </main>;
}
