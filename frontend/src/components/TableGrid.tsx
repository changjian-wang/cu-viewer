import { useId } from "react";
import type { CuField, CuTable, CuTableCell } from "../model/types";
import { DetailSourceInfo } from "./DetailSourceInfo";

function TableCell({ cell, selected, onSelect }: {
    cell: CuTableCell; selected: CuField | null; onSelect: ((field: CuField) => void) | undefined;
}) {
    const baseId = useId();
    const Tag = ["rowHeader", "columnHeader", "stubHead"].includes(cell.kind) ? "th" : "td";
    const scope = cell.kind === "rowHeader" ? "row" : cell.kind === "columnHeader" ? "col" : undefined;
    const text = cell.content === "" ? '"" (empty string)' : cell.content;
    return <Tag rowSpan={cell.rowSpan} colSpan={cell.columnSpan} scope={scope} data-cell-kind={cell.kind}
        aria-label={Tag === "th" ? text : undefined}>
        {onSelect ? <button type="button" className="cu-table-cell-select" aria-label={`Select ${cell.field.name}`}
            aria-describedby={`${baseId}-value ${baseId}-source`}
            aria-pressed={selected?.id === cell.id} data-detail-id={cell.id} onClick={() => onSelect(cell.field)}>
            <span id={`${baseId}-value`} className="cu-detail-text">{text}</span>
            <DetailSourceInfo field={cell.field} id={`${baseId}-source`} />
        </button> : <span className="cu-table-cell-value">{text}</span>}
    </Tag>;
}

export function TableGrid({ table, label, selected = null, onSelect }: {
    table: CuTable; label: string; selected?: CuField | null; onSelect?: (field: CuField) => void;
}) {
    if (table.layoutError) return <div className="cu-inline-error" role="alert">{table.layoutError}</div>;
    return <div className="cu-table-scroll" tabIndex={onSelect ? undefined : 0}><table aria-label={label}>
        {table.caption !== undefined && <caption>{table.caption}</caption>}
        <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>
            {row.map((cell, columnIndex) => cell === undefined ? null : cell === null ?
                <td key={columnIndex} aria-label={`No cell returned at row ${rowIndex + 1}, column ${columnIndex + 1}`} /> :
                <TableCell key={cell.id} cell={cell} selected={selected} onSelect={onSelect} />)}
        </tr>)}</tbody>
    </table></div>;
}
