import type { CuField, CuTable, CuTableCell } from "../internal/types";
import { DetailSourceInfo } from "./DetailSourceInfo";

function TableCell({ cell, selected, onSelect }: { cell: CuTableCell; selected: CuField | null; onSelect: (field: CuField) => void }) {
    const Tag = ["rowHeader", "columnHeader", "stubHead"].includes(cell.kind) ? "th" : "td";
    const scope = cell.kind === "rowHeader" ? "row" : cell.kind === "columnHeader" ? "col" : undefined;
    return <Tag rowSpan={cell.rowSpan} colSpan={cell.columnSpan} scope={scope} data-cell-kind={cell.kind}
        aria-label={Tag === "th" ? cell.content || '"" (empty string)' : undefined}>
        <button type="button" className="cu-table-cell-select" aria-label={`Select ${cell.field.name}`}
            aria-pressed={selected?.id === cell.id} data-detail-id={cell.id} onClick={() => onSelect(cell.field)}>
            <span className="cu-detail-text">{cell.content === "" ? '"" (empty string)' : cell.content}</span>
            <DetailSourceInfo field={cell.field} />
        </button>
    </Tag>;
}

export function TablesPane({ tables, selected, onSelect }: {
    tables: readonly CuTable[]; selected: CuField | null; onSelect: (field: CuField) => void;
}) {
    return <div className="cu-rich-result-scroll cu-tables-pane">
        {tables.map((table, index) => <section key={table.id} aria-label={`Table ${index + 1}`} className="cu-detail-table">
            <h2>Table {index + 1}</h2>
            {table.layoutError ? <div className="cu-inline-error" role="alert">{table.layoutError}</div> :
                <div className="cu-table-scroll"><table aria-label={`Returned table ${index + 1}`}>
                    {table.caption !== undefined && <caption>{table.caption}</caption>}
                    <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>
                        {row.map((cell, columnIndex) => cell === undefined ? null : cell === null ?
                            <td key={columnIndex} aria-label={`No cell returned at row ${rowIndex + 1}, column ${columnIndex + 1}`} /> :
                            <TableCell key={cell.id} cell={cell} selected={selected} onSelect={onSelect} />)}
                    </tr>)}</tbody>
                </table></div>}
            {table.footnotes.length > 0 && <ul className="cu-detail-notes" aria-label={`Table ${index + 1} footnotes`}>
                {table.footnotes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
            </ul>}
        </section>)}
    </div>;
}
