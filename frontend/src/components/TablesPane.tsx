import { useLayoutEffect, useRef } from "react";
import type { CuField, CuTable } from "../model/types";
import { TableGrid } from "./TableGrid";

export function TablesPane({ tables, index, onTableChange, selected, onSelect }: {
    tables: readonly CuTable[]; index: number; onTableChange: (index: number) => void;
    selected: CuField | null; onSelect: (field: CuField) => void;
}) {
    const navigation = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<HTMLButtonElement | null>(null);
    useLayoutEffect(() => {
        const target = pendingFocus.current;
        pendingFocus.current = null;
        if (!target || (document.activeElement !== document.body && document.activeElement !== target)) return;
        const next = target.disabled ? navigation.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") : target;
        next?.focus({ preventScroll: true });
    }, [index]);
    const table = tables[index];
    return <div className="cu-rich-result-scroll cu-tables-pane">
        <div className="cu-table-navigation" aria-label="Table navigation" ref={navigation}>
            <strong>Current table</strong>
            <button type="button" aria-label="Previous table" disabled={index <= 0} onClick={event => {
                pendingFocus.current = event.currentTarget;
                onTableChange(index - 1);
            }}>‹</button>
            <span>{index + 1} of {tables.length}</span>
            <button type="button" aria-label="Next table" disabled={index >= tables.length - 1} onClick={event => {
                pendingFocus.current = event.currentTarget;
                onTableChange(index + 1);
            }}>›</button>
        </div>
        {table && <section key={table.id} aria-label={`Table ${index + 1}`} className="cu-detail-table">
            <h2>Table {index + 1}</h2>
            <TableGrid table={table} label={`Returned table ${index + 1}`} selected={selected} onSelect={onSelect} />
            {table.footnotes.length > 0 && <ul className="cu-detail-notes" aria-label={`Table ${index + 1} footnotes`}>
                {table.footnotes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
            </ul>}
        </section>}
    </div>;
}
