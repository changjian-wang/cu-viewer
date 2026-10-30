import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { LoadedSource } from "../source/source";
import { ViewerIcon } from "./ViewerIcon";

export function SourceDocumentControls({ source, pageNumber, zoom, minZoom, maxZoom, ready, fit,
    controlsRef, children, onPage, onZoom, onFit, onRotate, onControlFocus }: {
    source: LoadedSource | null; pageNumber: number; zoom: number; minZoom: number; maxZoom: number;
    ready: boolean; fit: "page" | "width" | null;
    controlsRef: RefObject<HTMLDivElement | null>;
    children?: ReactNode;
    onPage: (pageNumber: number) => void; onZoom: (zoom: number) => void; onFit: (fit: "page" | "width") => void;
    onRotate: () => void; onControlFocus: (target?: HTMLElement) => void;
}) {
    const [text, setText] = useState(String(pageNumber));
    const edited = useRef(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { edited.current = false; setText(String(pageNumber)); setError(null); }, [pageNumber]);
    const applyPage = (): void => {
        if (!/^[1-9]\d*$/.test(text) || !source?.pages.some(page => page.pageNumber === Number(text))) {
            setError("Enter an existing page number."); return;
        }
        edited.current = false; setError(null); onControlFocus(); onPage(Number(text));
    };
    const percentage = Math.round(zoom * 100);
    return <>
        <div className="cu-document-controls cu-source-view-toolbar" role="group" aria-label="Document navigation and zoom"
            ref={controlsRef} onClickCapture={() => onControlFocus()}>
            <div className="cu-document-status" role="group" aria-label="Source selection and location">{children}</div>
            <div className="cu-page-controls">{source?.kind === "image" ? <span>Image · single page</span> : <>
                <button type="button" className="cu-icon-button" aria-label="Previous page" disabled={!ready || pageNumber <= 1}
                    onClick={() => onPage(pageNumber - 1)}><ViewerIcon name="left" /></button>
                <input aria-label="Page number" value={text} disabled={!ready} aria-invalid={Boolean(error)}
                    onChange={event => { edited.current = true; setText(event.target.value); }}
                    onKeyDown={event => { if (event.key === "Enter") applyPage(); }}
                    onBlur={event => {
                        if (!edited.current || !ready) return;
                        applyPage();
                        if (event.relatedTarget instanceof HTMLElement) onControlFocus(event.relatedTarget);
                    }} />
                <span>/ {source?.pages.length ?? "--"}</span>
                <button type="button" className="cu-icon-button" aria-label="Next page" disabled={!ready || pageNumber >= (source?.pages.length ?? 0)}
                    onClick={() => onPage(pageNumber + 1)}><ViewerIcon name="right" /></button>
            </>}</div>
            <div className="cu-view-controls">
                <button type="button" className="cu-icon-button" aria-label="Zoom out" disabled={!ready || zoom <= minZoom}
                    title={zoom <= minZoom ? "Minimum zoom reached" : "Zoom out"}
                    onClick={() => onZoom(zoom / 1.25)}><ViewerIcon name="minus" /></button>
                <select className="cu-zoom-select" aria-label="Zoom" disabled={!ready} value={String(percentage)}
                    title={fit === "page" ? "Fit page" : fit === "width" ? "Fit width" : "Manual zoom"}
                    onChange={event => {
                        if (event.target.value === "page" || event.target.value === "width") onFit(event.target.value);
                        else onZoom(Number(event.target.value) / 100);
                    }}>
                    <option value="page">Fit page</option><option value="width">Fit width</option>
                    {[...new Set([25, 50, 75, 100, 125, 150, 200, 300, percentage])].sort((a, b) => a - b).map(value =>
                        <option key={value} value={value}>{value}%</option>)}
                </select>
                <span className="cu-visually-hidden" aria-label="Zoom percentage">{ready ? `${percentage}%` : "--"}</span>
                <button type="button" className="cu-icon-button" aria-label="Zoom in" disabled={!ready || zoom >= maxZoom}
                    title={zoom >= maxZoom ? "Maximum zoom reached" : "Zoom in"}
                    onClick={() => onZoom(zoom * 1.25)}><ViewerIcon name="plus" /></button>
                <button type="button" className="cu-icon-button cu-rotate-button" aria-label="Rotate 90°"
                    disabled={!ready} onClick={onRotate}><ViewerIcon name="rotate" /></button>
            </div>
        </div>
        {error && <div className="cu-inline-error" role="alert">{error}</div>}
    </>;
}
