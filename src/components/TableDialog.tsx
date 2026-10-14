import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CuTable } from "../internal/types";
import { TableGrid } from "./TableGrid";

export function TableDialog({ id, table, invoker, onClose }: {
    id: string; table: CuTable; invoker: HTMLButtonElement; onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    const notified = useRef(false);
    const [error, setError] = useState<string | null>(null);
    useLayoutEffect(() => {
        const element = dialog.current;
        if (!element) return;
        notified.current = false;
        try {
            if (typeof element.showModal !== "function") throw new Error("Native table dialogs are unavailable in this browser.");
            element.showModal();
            closeButton.current?.focus({ preventScroll: true });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        }
        return () => { notified.current = true; if (element.open) element.close(); };
    }, []);
    const notifyClosed = (): void => {
        if (notified.current) return;
        notified.current = true;
        onClose();
    };
    const close = (): void => {
        const element = dialog.current;
        const restore = element?.contains(document.activeElement) || document.activeElement === document.body;
        if (element?.open) element.close();
        notifyClosed();
        if (restore && invoker.isConnected) invoker.focus({ preventScroll: true });
    };
    if (error) return <div className="cu-inline-error cu-table-dialog-error" role="alert">
        Table could not be displayed: {error} <button type="button" onClick={close}>Close</button>
    </div>;
    return <dialog id={id} ref={dialog} className="cu-table-dialog" aria-labelledby={titleId} aria-modal="true"
        onPointerDown={event => event.stopPropagation()}
        onCancel={event => { event.preventDefault(); close(); }}
        onClose={() => { if (!dialog.current?.open) notifyClosed(); }}
        onKeyDown={event => {
            if (event.key !== "Tab") return;
            const stops = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
            const first = stops[0], last = stops[stops.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="cu-table-dialog-heading">
            <h2 id={titleId}>Table</h2>
            <button type="button" ref={closeButton} className="cu-table-dialog-close" aria-label="Close table" onClick={close}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.2" />
                </svg>
            </button>
        </header>
        <div className="cu-detail-table cu-table-dialog-body">
            <TableGrid table={table} label={table.field.name} />
            {table.footnotes.length > 0 && <ul className="cu-detail-notes">
                {table.footnotes.map((note, index) => <li key={index}>{note}</li>)}
            </ul>}
        </div>
    </dialog>;
}
