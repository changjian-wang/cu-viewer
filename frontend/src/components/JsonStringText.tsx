import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { VirtualText } from "./VirtualText";
import { visibleTextMatches } from "../model/textSearch";
import type { TextRange, TextSearchIndex } from "../model/textSearch";

const TAG = 1;
const ESCAPE = 2;

function syntaxStyles(text: string): Uint8Array {
    // Keep syntax metadata at one byte per UTF-16 unit, without building a token tree.
    const styles = new Uint8Array(text.length);
    let cursor = 1;
    while (cursor < text.length - 1) {
        const start = text.indexOf("<", cursor);
        if (start < 0) break;
        if (text.startsWith("<!--", start)) {
            const end = text.indexOf("-->", start + 4);
            if (end < 0) break;
            cursor = end + 3;
            styles.fill(TAG, start, cursor);
            continue;
        }
        if (!/^<(?:\/?[a-z]|!doctype\b)/i.test(text.slice(start, start + 12))) {
            cursor = start + 1;
            continue;
        }
        let end = start + 1;
        let quote = "";
        for (; end < text.length - 1; end++) {
            let character = text[end];
            if (character === "\\") {
                character = text[end + 1];
                end += character === "u" ? 5 : 1;
            }
            if (character === '"' || character === "'") {
                if (quote === character) quote = "";
                else if (!quote) quote = character;
            } else if (!quote && character === ">") {
                styles.fill(TAG, start, ++end);
                break;
            } else if (!quote && character === "<") break;
        }
        cursor = end;
    }
    for (const match of text.matchAll(/\\(?:["\\/bfnrt]|u[\da-fA-F]{4})/g)) {
        styles.fill(ESCAPE, match.index, match.index + match[0].length);
    }
    return styles;
}

export function JsonStringText({ text, viewportRef, searchIndex, activeMatch }: {
    text: string; viewportRef?: RefObject<HTMLDivElement | null>;
    searchIndex?: TextSearchIndex | null;
    activeMatch?: TextRange | null;
}) {
    const ownViewport = useRef<HTMLDivElement>(null);
    const scroll = viewportRef ?? ownViewport;
    const styles = useMemo(() => syntaxStyles(text), [text]);
    const reveal = useMemo(() => activeMatch ? { offset: activeMatch.start } : null, [activeMatch]);
    useLayoutEffect(() => {
        const viewport = scroll.current;
        if (!activeMatch || !viewport) return;
        let observer: MutationObserver | undefined;
        const show = (): boolean => {
            const mark = viewport.querySelector<HTMLElement>("[data-json-search-active]");
            if (!mark) return false;
            const bounds = viewport.getBoundingClientRect(), target = mark.getBoundingClientRect();
            if (target.top < bounds.top + 12 || target.bottom > bounds.bottom - 12) {
                viewport.scrollTop += target.top - bounds.top -
                    (target.height > viewport.clientHeight - 24 ? 12 : (viewport.clientHeight - target.height) / 2);
            }
            observer?.disconnect();
            return true;
        };
        if (!show()) {
            observer = new MutationObserver(show);
            observer.observe(viewport, { childList: true, subtree: true });
        }
        return () => observer?.disconnect();
    }, [activeMatch, scroll]);
    const renderText = useCallback((fragment: string, offset: number): ReactNode => {
        const nodes: ReactNode[] = [];
        const hits = searchIndex?.count ? new Uint8Array(fragment.length) : null;
        if (hits && searchIndex) {
            for (const match of visibleTextMatches(text, searchIndex, offset, offset + fragment.length)) {
                hits.fill(1, Math.max(0, match.start - offset), Math.min(fragment.length, match.end - offset));
            }
            if (activeMatch && activeMatch.start < offset + fragment.length && activeMatch.end > offset) {
                hits.fill(2, Math.max(0, activeMatch.start - offset), Math.min(fragment.length, activeMatch.end - offset));
            }
        }
        let start = 0;
        for (let end = 1; end <= fragment.length; end++) {
            const kind = styles[offset + start];
            const hit = hits?.[start] ?? 0;
            if (end !== fragment.length && styles[offset + end] === kind && (hits?.[end] ?? 0) === hit) continue;
            const value = fragment.slice(start, end);
            const node = kind === TAG || kind === ESCAPE ?
                <span key={offset + start} className={kind === TAG ? "cu-json-syntax-tag" : "cu-json-syntax-escape"}>{value}</span> : value;
            nodes.push(hit ? <mark key={offset + start} className={`cu-json-find-match${hit === 2 ? " is-current" : ""}`}
                data-json-search-active={hit === 2 ? "true" : undefined}>{node}</mark> : node);
            start = end;
        }
        return nodes;
    }, [styles, text, searchIndex, activeMatch]);
    return <VirtualText text={text} label="Full JSON string" className="cu-json-full-text"
        viewportRef={scroll} reveal={reveal} renderText={renderText} />;
}
