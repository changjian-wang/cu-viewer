import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { ViewerIcon } from "./ViewerIcon";
import { JsonStringText } from "./JsonStringText";
import { CopyButton } from "./CopyButton";

export interface JsonStringSelection {
    value: string;
    path: string;
    label: string | undefined;
    trigger: HTMLButtonElement;
}

export function JsonStringDialog({ selection, onClose }: {
    selection: JsonStringSelection; onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const literal = useMemo(() => JSON.stringify(selection.value), [selection.value]);
    useLayoutEffect(() => {
        const element = dialog.current;
        if (!element) return;
        const scroll = selection.trigger.closest<HTMLElement>(".cu-rich-result-scroll");
        const position = scroll ? { top: scroll.scrollTop, left: scroll.scrollLeft } : null;
        element.showModal();
        viewport.current?.focus({ preventScroll: true });
        return () => {
            if (element.open) element.close();
            if (selection.trigger.isConnected) {
                if (scroll && position) { scroll.scrollTop = position.top; scroll.scrollLeft = position.left; }
                selection.trigger.focus({ preventScroll: true });
            }
        };
    }, [selection.trigger]);
    return <dialog ref={dialog} className="cu-json-string-dialog" aria-labelledby={titleId} aria-modal="true"
        onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
        <header>
            <div className="cu-json-string-heading">
                <h2 id={titleId}>{selection.label ?? "JSON string"}</h2>
                <span className="cu-json-string-path">{selection.path || "/"}</span>
            </div>
            <span className="cu-json-string-count">{selection.value.length.toLocaleString("en-US")} characters</span>
            <button type="button" className="cu-icon-button" aria-label="Close full text" title="Close full text" onClick={onClose}>
                <ViewerIcon name="close" />
            </button>
        </header>
        <JsonStringText text={literal} viewportRef={viewport} />
        <footer><span>JSON string literal; escape sequences are preserved. Copy copies the original value.</span>
            <CopyButton value={selection.value} label="Copy full text" context={selection} />
        </footer>
    </dialog>;
}
