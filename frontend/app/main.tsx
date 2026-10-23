import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ContentUnderstandingResultViewer } from "../src";
import "./styles.css";

function App() {
    const [session, setSession] = useState<{ source: string; name: string; result: unknown }>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        const controller = new AbortController();
        void fetch(new URL("./session.json", window.location.href), {
            signal: controller.signal, credentials: "same-origin", cache: "no-store",
        }).then(async response => {
            if (!response.ok) throw new Error(`Viewer session could not be loaded (${response.status}).`);
            const data: unknown = await response.json();
            if (!data || typeof data !== "object" || !("source" in data) || typeof data.source !== "string" ||
                !("name" in data) || typeof data.name !== "string" || !("result" in data)) {
                throw new Error("The CLI returned an invalid viewer session.");
            }
            const source = new URL(data.source, window.location.href);
            const sessionPath = new URL(".", window.location.href).pathname;
            if (source.origin !== window.location.origin || !source.pathname.startsWith(sessionPath)) {
                throw new Error("The source does not belong to this local viewer session.");
            }
            if (!controller.signal.aborted) setSession({ source: source.href, name: data.name, result: data.result });
        }).catch((failure: unknown) => {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
        });
        return () => controller.abort();
    }, []);
    return <main className="cli-host">
        <header><h1>CU Viewer</h1>{session && <span title={session.name}>{session.name}</span>}</header>
        <div className="cli-workspace">
            {error ? <p role="alert">{error}</p> : session ?
                <ContentUnderstandingResultViewer source={session.source} result={session.result} /> :
                <p role="status">Loading source and saved result...</p>}
        </div>
    </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("The CLI viewer root is missing.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
