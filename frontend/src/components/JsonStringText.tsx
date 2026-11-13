import { useCallback, useMemo } from "react";
import type { ReactNode, RefObject } from "react";
import { VirtualText } from "./VirtualText";

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

export function JsonStringText({ text, viewportRef }: {
    text: string; viewportRef?: RefObject<HTMLDivElement | null>;
}) {
    const styles = useMemo(() => syntaxStyles(text), [text]);
    const renderText = useCallback((fragment: string, offset: number): ReactNode => {
        const nodes: ReactNode[] = [];
        let start = 0;
        for (let end = 1; end <= fragment.length; end++) {
            const kind = styles[offset + start];
            if (end !== fragment.length && styles[offset + end] === kind) continue;
            const value = fragment.slice(start, end);
            nodes.push(kind === TAG || kind === ESCAPE ?
                <span key={offset + start} className={kind === TAG ? "cu-json-syntax-tag" : "cu-json-syntax-escape"}>{value}</span> : value);
            start = end;
        }
        return nodes;
    }, [styles]);
    return <VirtualText text={text} label="Full JSON string" className="cu-json-full-text"
        {...(viewportRef ? { viewportRef } : {})} renderText={renderText} />;
}
