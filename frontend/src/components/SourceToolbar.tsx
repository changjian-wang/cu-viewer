import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LoadedSource } from "../source/source";
import type { ReviewSettings } from "../interaction/reviewFields";
import { ActionMenu } from "./ActionMenu";
import { HighlightSettings } from "./HighlightSettings";
import { HighlightLegend } from "./HighlightLegend";
import { ViewerIcon } from "./ViewerIcon";

export function SourceToolbar({ source, pageNumber, zoom, minZoom, maxZoom, ready, fit, toolbarRef, settings, summaryId,
    onSettings, onPage, onZoom, onFit, onRotate, onResetLayout, onControlFocus }: {
    source: LoadedSource | null; pageNumber: number; zoom: number; ready: boolean; fit: "page" | "width" | null;
    minZoom: number; maxZoom: number;
    toolbarRef: RefObject<HTMLElement | null>; settings: ReviewSettings; onSettings: (settings: ReviewSettings) => void;
    summaryId: string;
    onPage: (pageNumber: number) => void; onZoom: (zoom: number) => void; onFit: (fit: "page" | "width") => void;
    onRotate: () => void; onResetLayout: () => void; onControlFocus: (target?: HTMLElement) => void;
}) {
    const [text, setText] = useState(String(pageNumber));
    const id = useId();
    const edited = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [overlay, setOverlay] = useState<"more" | "settings" | "legend" | null>(null);
    const more = useRef<HTMLButtonElement>(null), settingsButton = useRef<HTMLButtonElement>(null), legendButton = useRef<HTMLButtonElement>(null);
    useEffect(() => { edited.current = false; setText(String(pageNumber)); setError(null); }, [pageNumber]);
    const applyPage = (): void => {
        if (!/^[1-9]\d*$/.test(text) || !source?.pages.some(page => page.pageNumber === Number(text))) {
            setError("Enter an existing page number."); return;
        }
        edited.current = false; setError(null); onControlFocus(); onPage(Number(text));
    };
    const close = (restore: boolean): void => {
        if (restore) (overlay === "more" ? more : overlay === "legend" ? legendButton : settingsButton).current?.focus({ preventScroll: true });
        setOverlay(null);
    };
    const percentage = Math.round(zoom * 100);
    const image = source?.kind === "image" ? source.pages[0] : undefined;
    const summary = source ? `${source.name} · ${image ? `${image.width} × ${image.height} px` : `PDF · ${source.pages.length} pages`}` : "Source document";
    return <>
        <header className="cu-source-toolbar" ref={toolbarRef} onClickCapture={() => onControlFocus()}
            onKeyDown={event => {
                if (event.key === "Escape" && overlay) { event.preventDefault(); event.stopPropagation(); close(true); }
            }}>
            <div className="cu-file-name"><span className="cu-file-icon"><ViewerIcon name="file" /></span>
                <strong title={summary}>{source?.name ?? "Source document"}</strong>
                <span className="cu-kind-badge">{source?.kind === "image" ? "IMAGE" : "PDF"}</span></div>
            <span className="cu-visually-hidden" id={summaryId} aria-label="Source information">{summary}</span>
            <div className="cu-document-controls">
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
                <span className="cu-toolbar-divider" />
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
                    <button type="button" className="cu-icon-button cu-rotate-button" aria-label="Rotate 90°" disabled={!ready} onClick={onRotate}><ViewerIcon name="rotate" /></button>
                </div>
            </div>
            <HighlightLegend id={`${id}-legend`} buttonRef={legendButton} settings={settings} onChange={onSettings} open={overlay === "legend"}
                onToggle={() => setOverlay(overlay === "legend" ? null : "legend")} onClose={close} />
            <div className="cu-source-actions">
                <button type="button" className="cu-icon-button" ref={more} aria-label="More document actions" aria-haspopup="menu"
                    aria-expanded={overlay === "more"} onClick={() => setOverlay(overlay === "more" ? null : "more")}><ViewerIcon name="more" /></button>
                <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Highlighting settings" aria-haspopup="dialog"
                    aria-expanded={overlay === "settings"} onClick={() => setOverlay(overlay === "settings" ? null : "settings")}><ViewerIcon name="settings" /></button>
            </div>
        </header>
        {error && <div className="cu-inline-error" role="alert">{error}</div>}
        {overlay === "more" && more.current && <ActionMenu id={`${id}-document-actions`} label="Document actions" anchor={more.current} onClose={close}
            actions={[
                { label: "Fit page", disabled: !ready, run: () => onFit("page") },
                { label: "Fit width", disabled: !ready, run: () => onFit("width") },
                { label: "Rotate 90°", icon: "rotate", disabled: !ready, run: onRotate },
                { label: "Reset layout widths", icon: "reset", run: onResetLayout },
            ]} />}
        {overlay === "settings" && settingsButton.current && <HighlightSettings anchor={settingsButton.current}
            settings={settings} onChange={onSettings} onClose={close} />}
    </>;
}
