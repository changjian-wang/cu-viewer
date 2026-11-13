import { Component } from "react";
import type { ReactNode } from "react";
import { VirtualText } from "./VirtualText";

export function RawMarkdown({ markdown }: { markdown: string }) {
    return <VirtualText text={markdown} label="Original Markdown" className="cu-markdown-raw" />;
}

export function MarkdownFailure({ markdown, message, onRetry }: { markdown: string; message: string; onRetry: () => void }) {
    return <>
        <div className="cu-markdown-notice" role="alert">
            <p>Markdown could not be formatted. The original content remains available below.</p>
            <details><summary>Error details</summary><pre>{message}</pre></details>
            <button type="button" onClick={onRetry}>Retry formatting</button>
        </div>
        <RawMarkdown markdown={markdown} />
    </>;
}

export class MarkdownErrorBoundary extends Component<{
    children: ReactNode; markdown: string; onRetry: () => void;
}, { error: Error | null }> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: unknown): { error: Error } {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }
    render() {
        return this.state.error
            ? <MarkdownFailure markdown={this.props.markdown} message={this.state.error.message} onRetry={this.props.onRetry} />
            : this.props.children;
    }
}
