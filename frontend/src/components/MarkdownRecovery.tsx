import { Component, useRef } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MARKDOWN_FRAGMENT_CHARACTERS, textBoundary } from "../markdown/model";

export function RawMarkdown({ markdown }: { markdown: string }) {
    const scroll = useRef<HTMLDivElement>(null);
    const count = Math.max(1, Math.ceil(markdown.length / MARKDOWN_FRAGMENT_CHARACTERS));
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLPreElement>({
        count,
        getScrollElement: () => scroll.current,
        estimateSize: () => 900,
        overscan: 1,
    });
    if (count === 1) return <div className="cu-rich-result-scroll"><pre className="cu-markdown-raw">{markdown}</pre></div>;
    return <div ref={scroll} className="cu-rich-result-scroll" role="region" aria-label="Original Markdown" tabIndex={0}>
        <div className="cu-markdown-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(item => {
                const start = textBoundary(markdown, item.index * MARKDOWN_FRAGMENT_CHARACTERS);
                const end = textBoundary(markdown, Math.min(markdown.length, (item.index + 1) * MARKDOWN_FRAGMENT_CHARACTERS));
                return <pre key={item.index} ref={virtualizer.measureElement} data-index={item.index}
                    className="cu-markdown-raw cu-markdown-virtual-block"
                    style={{ transform: `translateY(${item.start}px)` }}>{markdown.slice(start, end)}</pre>;
            })}
        </div>
    </div>;
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
