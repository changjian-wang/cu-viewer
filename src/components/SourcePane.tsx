import { useEffect, useRef, useState } from "react";
import type { PageSize } from "../internal/geometry";
import { createPageGeometry, getFitZoom, projectRegion } from "../internal/geometry";
import type { LoadedSource } from "../internal/source";
import { hasSourcePage, unavailableSourcePageMessage } from "../internal/source";
import type { CuContent, CuField, CuPoint, CuRegion } from "../internal/types";
import { displayValue, fieldLabel, formatConfidence } from "../internal/interaction";

interface SourcePaneProps {
    source: LoadedSource | null;
    loading: boolean;
    error: string | null;
    content: CuContent | undefined;
    pageNumber: number;
    active: CuField | null;
    preview: boolean;
    regions: CuRegion[];
    regionIndex: number;
    color: string;
    onPage: (pageNumber: number) => void;
    onRegion: (index: number) => void;
    onRenderReady: (ready: boolean) => void;
}

export function SourcePane(props: SourcePaneProps) {
    const container = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [available, setAvailable] = useState<PageSize>({ width: 800, height: 650 });
    const [fit, setFit] = useState<"page" | "width" | null>("page");
    const [manualZoom, setManualZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [pan, setPan] = useState<CuPoint>({ x: 0, y: 0 });
    const drag = useRef<{ clientX: number; clientY: number; pan: CuPoint } | null>(null);
    const [rendered, setRendered] = useState<{ key: string; source: LoadedSource; dpr: number; size: PageSize } | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [pageText, setPageText] = useState(String(props.pageNumber));
    const [pageError, setPageError] = useState<string | null>(null);
    const page = props.source?.pages.find(value => value.pageNumber === props.pageNumber);
    const zoom = page && fit ? getFitZoom(page, available, rotation, fit) : manualZoom;
    const renderKey = `${props.pageNumber}:${zoom}:${rotation}`;
    const dpr = window.devicePixelRatio;
    const ready = Boolean(rendered?.key === renderKey && rendered.source === props.source && rendered.dpr === dpr && !props.loading && !props.error && !renderError);
    useEffect(() => {
        const element = container.current;
        if (!element) return;
        const observer = new ResizeObserver(entries => {
            const bounds = entries[0]?.contentRect;
            if (bounds && bounds.width > 40 && bounds.height > 40) setAvailable({ width: bounds.width - 40, height: bounds.height - 40 });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    useEffect(() => setPageText(String(props.pageNumber)), [props.pageNumber]);
    useEffect(() => {
        setPan({ x: 0, y: 0 });
        setPageError(null);
        container.current?.scrollTo(0, 0);
    }, [props.pageNumber]);
    useEffect(() => {
        const controller = new AbortController();
        const source = props.source;
        setRendered(null);
        setRenderError(null);
        props.onRenderReady(false);
        if (!source || !page) {
            if (source && !page) setRenderError("The requested page is not present in this source.");
            return () => controller.abort();
        }
        const scratch = document.createElement("canvas");
        void Promise.resolve().then(() => source.render(props.pageNumber, scratch, zoom, rotation, controller.signal)).then(size => {
            if (controller.signal.aborted || !canvas.current) return;
            const visible = canvas.current;
            visible.width = scratch.width;
            visible.height = scratch.height;
            const context = visible.getContext("2d");
            if (!context) throw new Error("Visible canvas rendering is unavailable.");
            context.drawImage(scratch, 0, 0);
            setRendered({ key: renderKey, source, dpr, size });
            props.onRenderReady(true);
        }).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setRenderError(error instanceof Error ? error.message : String(error));
            props.onRenderReady(false);
        }).finally(() => {
            scratch.width = 0;
            scratch.height = 0;
        });
        return () => controller.abort();
    }, [props.source, props.pageNumber, zoom, rotation, renderKey, dpr, page, props.onRenderReady]);
    const size = ready ? rendered?.size : undefined;
    let polygons: CuPoint[][] = [];
    const region = props.regions[props.regionIndex];
    const regionPageAvailable = hasSourcePage(props.source?.pages, region?.pageNumber);
    let overlayError: string | null = props.source && region && !regionPageAvailable ?
        unavailableSourcePageMessage(region.pageNumber) : null;
    if (ready && region?.pageNumber === props.pageNumber && page) {
        const cuPage = props.content?.pages.find(value => value.pageNumber === props.pageNumber);
        if (cuPage) {
            try {
                const geometry = createPageGeometry(cuPage, page, { zoom, rotation, pan: { x: 0, y: 0 } });
                const visibleRegions = props.active?.detailView ?
                    props.regions.filter(value => value.pageNumber === props.pageNumber) : [region];
                polygons = visibleRegions.map(value => projectRegion(value, geometry).polygon);
            } catch (error) {
                overlayError = error instanceof Error ? error.message : String(error);
            }
        }
    }
    const applyPage = (): void => {
        const number = Number(pageText);
        if (!/^[1-9]\d*$/.test(pageText) || !props.source?.pages.some(value => value.pageNumber === number)) {
            setPageError("Enter an existing page number.");
            return;
        }
        setPageError(null);
        props.onPage(number);
    };
    const changeZoom = (direction: number): void => {
        setManualZoom(direction > 0 ? zoom * 1.25 : zoom / 1.25);
        setFit(null);
        setPan({ x: 0, y: 0 });
    };
    const error = props.error ?? renderError;
    return <section className="cu-source-pane" aria-label="Source document">
        <header className="cu-source-heading"><strong>{props.source?.name ?? "Source document"}</strong><span>
            {props.source ? props.source.kind === "pdf" ? `PDF · ${props.source.pages.length} pages` : `${page?.width} × ${page?.height} px` : props.loading ? "Loading" : "Unavailable"}
        </span></header>
        <div className="cu-document-container" ref={container}
            onPointerDown={event => {
                if (!ready || event.button !== 0) return;
                event.preventDefault();
                drag.current = { clientX: event.clientX, clientY: event.clientY, pan };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
                if (!drag.current) return;
                setPan({ x: drag.current.pan.x + event.clientX - drag.current.clientX, y: drag.current.pan.y + event.clientY - drag.current.clientY });
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
        >
            <div className="cu-document-stage" style={{
                minWidth: `${Math.max((size?.width ?? 0) + 40, available.width + 40)}px`,
                minHeight: `${Math.max((size?.height ?? 0) + 40, available.height + 40)}px`,
            }}>
                <div className="cu-rendered-page" data-testid="rendered-page" style={{
                    width: size?.width, height: size?.height, visibility: ready ? "visible" : "hidden",
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                }}>
                    <canvas ref={canvas} aria-label="Rendered source page" data-testid="source-canvas" />
                    {polygons.length > 0 && <svg className="cu-overlay" data-testid="source-overlay" width={size?.width} height={size?.height}>
                        {polygons.map((polygon, index) => <polygon key={index}
                            points={polygon.map(point => `${point.x},${point.y}`).join(" ")} fill={props.color} fillOpacity={props.preview ? 0.08 : 0.15}
                            stroke={props.color} strokeWidth={2} strokeDasharray={props.preview ? "4 3" : undefined} />)}
                    </svg>}
                </div>
            </div>
            {(!ready || error) && <div className={`cu-source-state cu-state${error ? " cu-error" : ""}`} role={error ? "alert" : "status"}>
                <h2>{error ? "Source could not be displayed" : "Loading source..."}</h2>
                <p>{error ?? "Valid field data stays available."}</p>
            </div>}
        </div>
        <div className="cu-preview-dock">
            {props.preview && props.active && ready && polygons.length > 0 ?
                <aside className="cu-preview" aria-label="Field preview">
                    <strong>{fieldLabel(props.active)}</strong><span title={displayValue(props.active)}>{displayValue(props.active)}</span>
                    {props.active.confidence !== undefined && <span>{formatConfidence(props.active.confidence)}</span>}
                </aside> :
                props.active && !props.preview && props.regions.length > 1 ?
                    <aside className="cu-preview cu-region-navigation" aria-label="Source region navigation">
                        <strong>{fieldLabel(props.active)}</strong>
                        <div className="cu-region-controls">
                            <button type="button" aria-label="Previous source region" disabled={props.regionIndex === 0}
                                onClick={() => props.onRegion(props.regionIndex - 1)}>‹</button>
                            <span>Region {props.regionIndex + 1} of {props.regions.length}</span>
                            <button type="button" aria-label="Next source region"
                                disabled={props.regionIndex >= props.regions.length - 1}
                                onClick={() => props.onRegion(props.regionIndex + 1)}>›</button>
                        </div>
                    </aside> :
                <span className="cu-preview-hint">{props.active && !region ?
                    `${props.active.name}: no source region` : region && !regionPageAvailable ?
                        props.source ? `Source page ${region.pageNumber} is unavailable in this file.` : "Source is not available for navigation." :
                        props.active && region?.pageNumber !== props.pageNumber ?
                            `Selected source is on page ${region?.pageNumber}` : "Field preview appears here without covering document text."}</span>}
        </div>
        {overlayError && <div className="cu-inline-error" role="alert">Source region: {overlayError}</div>}
        <footer className="cu-source-toolbar">
            <div className="cu-page-controls">
                {props.source?.kind === "image" ? <span>Image · single page</span> : <>
                    <button type="button" aria-label="Previous page" disabled={!ready || props.pageNumber <= 1} onClick={() => props.onPage(props.pageNumber - 1)}>‹</button>
                    <input aria-label="Page number" value={pageText} disabled={!ready} onChange={event => setPageText(event.target.value)}
                        onKeyDown={event => { if (event.key === "Enter") applyPage(); }} onBlur={applyPage} />
                    <span>of {props.source?.pages.length ?? "--"}</span>
                    <button type="button" aria-label="Next page" disabled={!ready || props.pageNumber >= (props.source?.pages.length ?? 0)} onClick={() => props.onPage(props.pageNumber + 1)}>›</button>
                </>}
            </div>
            <div className="cu-view-controls">
                <button type="button" aria-label="Zoom out" disabled={!ready} onClick={() => changeZoom(-1)}>−</button>
                <button type="button" aria-label="Zoom in" disabled={!ready} onClick={() => changeZoom(1)}>+</button>
                <span aria-label="Zoom percentage">{ready ? `${Math.round(zoom * 100)}%` : "--"}</span>
                <button type="button" disabled={!ready} aria-pressed={fit === "page"} onClick={() => { setFit("page"); setPan({ x: 0, y: 0 }); }}>Fit page</button>
                <button type="button" disabled={!ready} aria-pressed={fit === "width"} onClick={() => { setFit("width"); setPan({ x: 0, y: 0 }); }}>Fit width</button>
                <button type="button" disabled={!ready} onClick={() => { setRotation((rotation + 90) % 360); setPan({ x: 0, y: 0 }); }}>Rotate 90°</button>
                <span className="cu-pan-hint">Drag to pan</span>
            </div>
        </footer>
        {pageError && <div className="cu-inline-error" role="alert">{pageError}</div>}
    </section>;
}
