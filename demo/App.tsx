import { useEffect, useRef, useState } from "react";
import { ContentUnderstandingResultViewer } from "../src";
import type { ViewerSource } from "../src";
import pdfUrl from "../tests/fixtures/mixed-financial-docs.pdf?url";
import pdfResultUrl from "../tests/fixtures/mixed-financial-docs.cu.json?url";
import pngUrl from "../tests/fixtures/receipt.png?url";
import pngResultUrl from "../tests/fixtures/receipt.cu.json?url";

const samples = {
    pdf: { source: pdfUrl, result: pdfResultUrl, name: "mixed-financial-docs.pdf", json: "mixed-financial-docs.cu.json", type: "application/pdf" },
    png: { source: pngUrl, result: pngResultUrl, name: "receipt.png", json: "receipt.cu.json", type: "image/png" },
};

export function App() {
    const [sample, setSample] = useState<"pdf" | "png">("pdf");
    const [reload, setReload] = useState(0);
    const [input, setInput] = useState<{ source: ViewerSource; result: unknown; name: string; json: string } | null>(null);
    const [hostError, setHostError] = useState<string | null>(null);
    const jsonGeneration = useRef(0);
    useEffect(() => {
        jsonGeneration.current++;
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
    const chooseSample = (choice: "pdf" | "png"): void => {
        jsonGeneration.current++;
        setSample(choice);
        setReload(current => current + 1);
    };
    return <main className="prototype-host">
        <header className="prototype-banner"><h1>CU Result Viewer</h1><span>Interactive prototype · saved data only · not a released package</span></header>
        <div className="prototype-inputs">
            <label className="prototype-picker"><span>Source</span><strong>{input?.name ?? "Loading sample..."}</strong><span className="prototype-browse">Browse...</span>
                <input type="file" aria-label="Choose source file" accept=".pdf,.png,.jpg,.jpeg,.jpe,.bmp" disabled={!input}
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                            jsonGeneration.current++;
                            setHostError(null);
                            setInput(current => current ? { ...current, source: file, name: file.name } : null);
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
                <button type="button" aria-pressed={sample === "pdf"} onClick={() => chooseSample("pdf")}>PDF</button>
                <button type="button" aria-pressed={sample === "png"} onClick={() => chooseSample("png")}>Receipt PNG</button>
            </div>
        </div>
        {hostError && <div className="prototype-alert" role="alert">{hostError}</div>}
        <div className="prototype-workspace">
            {input ? <ContentUnderstandingResultViewer source={input.source} result={input.result} /> :
                <div className="prototype-loading" role="status">{hostError ? "Sample loading failed." : "Loading saved source and result..."}</div>}
        </div>
        <footer className="prototype-footer">Local source + original Analyze JSON. No upload, authentication or CU service call. <span>PDF/PNG prototype; HEIF and rich P1 panes are not integrated.</span></footer>
    </main>;
}
