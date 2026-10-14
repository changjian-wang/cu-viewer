import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { PageSize } from "../internal/geometry";
import type { CuPoint, CuTable } from "../internal/types";
import { SourcePopover } from "./SourcePopover";
import { TableDialog } from "./TableDialog";

export interface SourceTableMarker {
    key: string;
    table: CuTable;
    point: CuPoint;
    polygon: CuPoint[];
}

export function SourceTableMarkers({ markers, size, pan, viewport, paper, onPreviewStart }: {
    markers: readonly SourceTableMarker[]; size: PageSize; pan: CuPoint;
    viewport: RefObject<HTMLDivElement | null>; paper: RefObject<HTMLDivElement | null>; onPreviewStart: () => void;
}) {
    const id = useId();
    const [hovered, setHovered] = useState<SourceTableMarker | null>(null);
    const [opened, setOpened] = useState<{ marker: SourceTableMarker; invoker: HTMLButtonElement } | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const held = useRef(false);
    const buttons = useRef(new Map<string, HTMLButtonElement>());
    const keep = (): void => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
        closeTimer.current = null;
    };
    useEffect(() => () => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    }, []);
    const preview = markers.find(marker => marker.key === hovered?.key && marker.table === hovered.table);
    const selected = markers.find(marker => marker.key === opened?.marker.key && marker.table === opened.marker.table);
    const active = selected ?? preview;
    useEffect(() => {
        if (hovered && !preview) setHovered(null);
        if (opened && !selected) setOpened(null);
    }, [hovered, preview, opened, selected]);
    useEffect(() => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
        closeTimer.current = null;
        held.current = false;
        setHovered(null);
    }, [pan.x, pan.y]);
    const leave = (marker: SourceTableMarker): void => {
        keep();
        if (held.current || document.activeElement === buttons.current.get(marker.key)) return;
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            setHovered(current => current?.key === marker.key ? null : current);
        }, 150);
    };
    return <>
        {active && <svg className="cu-overlay" data-testid="table-preview-overlay" aria-hidden="true"
            focusable="false" width={size.width} height={size.height}>
            <polygon points={active.polygon.map(point => `${point.x},${point.y}`).join(" ")}
                fill="none" stroke="#605e5c" strokeWidth={1} strokeDasharray="3 3" />
        </svg>}
        <div className="cu-table-markers" data-testid="table-markers" style={{ width: size.width, height: size.height }}>
            {markers.map(marker => <button type="button" className="cu-table-marker" key={marker.key}
                ref={element => {
                    if (element) buttons.current.set(marker.key, element);
                    else buttons.current.delete(marker.key);
                }}
                aria-label={`Open ${marker.table.field.name}`} aria-haspopup="dialog"
                data-table-id={marker.table.id}
                aria-controls={selected?.key === marker.key ? `${id}-dialog` : undefined}
                aria-describedby={preview?.key === marker.key && !selected ? `${id}-content` : undefined}
                style={{ left: marker.point.x - 6, top: marker.point.y - 6 }}
                onPointerDown={event => event.stopPropagation()}
                onMouseEnter={() => { held.current = false; keep(); onPreviewStart(); setHovered(marker); }}
                onMouseLeave={() => leave(marker)}
                onFocus={() => { held.current = false; keep(); onPreviewStart(); setHovered(marker); }}
                onBlur={() => leave(marker)}
                onKeyDown={event => {
                    if (event.key === "Escape") { keep(); setHovered(null); event.stopPropagation(); }
                }}
                onClick={event => {
                    keep();
                    held.current = false;
                    setHovered(null);
                    setOpened({ marker, invoker: event.currentTarget });
                }}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <rect x=".5" y=".5" width="11" height="11" rx="1" fill="white" stroke="currentColor" />
                    <path d="M.5 4h11M.5 8h11M4 .5v11M8 .5v11" fill="none" stroke="currentColor" strokeWidth=".75" />
                </svg>
            </button>)}
        </div>
        {preview && !selected && viewport.current && createPortal(
            <SourcePopover id={id} field={preview.table.field} table={preview.table} color="#605e5c"
                points={[preview.point, { x: preview.point.x + 12, y: preview.point.y + 12 }]}
                pan={pan} viewport={viewport} paper={paper}
                onEnter={() => { held.current = true; keep(); }}
                onLeave={() => { held.current = false; leave(preview); }} />,
            viewport.current)}
        {selected && opened && <TableDialog id={`${id}-dialog`} table={selected.table} invoker={opened.invoker}
            onClose={() => { setOpened(null); }} />}
    </>;
}
