import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PageSize } from "../source/geometry";
import { createPageGeometry, getFitZoom, getRevealOffset, projectRegion } from "../source/geometry";
import type { LoadedSource } from "../source/source";
import { hasSourcePage, unavailableSourcePageMessage } from "../source/source";
import type { CuContent, CuField, CuPoint, CuRegion } from "../model/types";
import { fieldLabel } from "../interaction/interaction";
import type { ResultView } from "../model/resultViews";
import type { SourceOutline } from "../source/sourceOverlays";
import { sourceWordOutlines } from "../source/sourceOverlays";
import { SourcePopover } from "./SourcePopover";
import { SourceTableMarkers } from "./SourceTableMarkers";
import type { SourceTableMarker } from "./SourceTableMarkers";
import { WordLayer } from "./WordLayer";
import { useSourceRendering } from "../source/useSourceRendering";

interface SourcePaneProps {
    source: LoadedSource | null;
    loading: boolean;
    error: string | null;
    content: CuContent | undefined;
    pageNumber: number;
    active: CuField | null;
    preview: boolean;
    pinned: CuField | null;
    pinnedRegions: readonly CuRegion[];
    pinnedRegionIndex: number;
    view: ResultView | undefined;
    outlines: readonly SourceOutline[];
    previewId: string;
    onPreviewEnter: () => void;
    onPreviewLeave: () => void;
    onDismissPreview: () => void;
    regions: CuRegion[];
    regionIndex: number;
    revealRequest: number | null;
    color: string;
    onPage: (pageNumber: number) => void;
    onRegion: (index: number) => void;
    onRenderReady: (ready: boolean) => void;
}

export function SourcePane(props: SourcePaneProps) {
    const container = useRef<HTMLDivElement>(null);
    const toolbar = useRef<HTMLElement>(null);
    const regionControls = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<HTMLElement | null>(null);
    const handledReveal = useRef<number | null>(null);
    const previousView = useRef<{ pageNumber: number; zoom: number; source: LoadedSource | null } | null>(null);
    const sourceId = useId();
    const [available, setAvailable] = useState<PageSize>({ width: 800, height: 650 });
    const [fit, setFit] = useState<"page" | "width" | null>("page");
    const [manualZoom, setManualZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [pan, setPan] = useState<CuPoint>({ x: 0, y: 0 });
    const drag = useRef<{ clientX: number; clientY: number; pan: CuPoint } | null>(null);
    const [pageText, setPageText] = useState(String(props.pageNumber));
    const pageEdited = useRef(false);
    const [pageError, setPageError] = useState<string | null>(null);
    const [navigationError, setNavigationError] = useState<string | null>(null);
    const page = props.source?.pages.find(value => value.pageNumber === props.pageNumber);
    const zoom = page && fit ? getFitZoom(page, available, rotation, fit) : manualZoom;
    const { canvas, renderedPage, renderKey, dpr, ready, renderError, layerFrame, layersReady, projectionSize, size } =
        useSourceRendering({ source: props.source, page, pageNumber: props.pageNumber, zoom, rotation, available,
            loading: props.loading, error: props.error, onRenderReady: props.onRenderReady });
    const captureControlFocus = (): void => {
        const target = document.activeElement;
        if (target instanceof HTMLElement && (toolbar.current?.contains(target) || regionControls.current?.contains(target))) {
            pendingFocus.current = target;
        }
    };
    useLayoutEffect(() => {
        const previous = previousView.current;
        if ((props.preview || (props.revealRequest !== null && props.revealRequest !== handledReveal.current)) &&
            previous?.source === props.source && previous.pageNumber !== props.pageNumber &&
            fit !== null && previous.zoom !== zoom) {
            setManualZoom(previous.zoom);
            setFit(null);
        }
        previousView.current = { pageNumber: props.pageNumber, zoom, source: props.source };
    }, [props.revealRequest, props.preview, props.source, props.pageNumber, fit, zoom]);
    useLayoutEffect(() => {
        if (!ready || !pendingFocus.current) return;
        const target = pendingFocus.current;
        pendingFocus.current = null;
        if (!target.isConnected || (document.activeElement !== document.body && document.activeElement !== target)) return;
        const next = target.matches(":disabled") ?
            target.closest(".cu-region-controls, .cu-page-controls, .cu-view-controls")
                ?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)") : target;
        next?.focus({ preventScroll: true });
    }, [ready, props.regionIndex, props.pageNumber]);
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
    useEffect(() => {
        pageEdited.current = false;
        setPageText(String(props.pageNumber));
    }, [props.pageNumber]);
    useEffect(() => {
        setPan({ x: 0, y: 0 });
        setPageError(null);
        container.current?.scrollTo(0, 0);
    }, [props.pageNumber]);
    useEffect(() => {
        if (document.activeElement instanceof HTMLElement && toolbar.current?.contains(document.activeElement)) {
            pendingFocus.current = document.activeElement;
        }
    }, [props.source, props.pageNumber, zoom, rotation, renderKey, dpr, page, props.onRenderReady]);
    const background = useMemo(() => {
        const words: { key: string; polygon: CuPoint[] }[] = [];
        const outlines: (SourceOutline & { polygon: CuPoint[] })[] = [];
        const markers: SourceTableMarker[] = [];
        const cuPage = props.content?.pages.find(value => value.pageNumber === props.pageNumber);
        if (!ready || !projectionSize || !page || !cuPage) return { words, outlines, markers, error: null };
        try {
            const geometry = createPageGeometry(cuPage, projectionSize, { zoom: 1, rotation, pan: { x: 0, y: 0 } });
            for (const word of sourceWordOutlines(cuPage)) words.push({ key: word.key, polygon: projectRegion(word.region, geometry).polygon });
            for (const outline of props.outlines) outlines.push({ ...outline, polygon: projectRegion(outline.region, geometry).polygon });
            if (["fields", "markdown", "paragraphs", "tables"].includes(props.view ?? "")) {
                for (const table of props.content?.tables ?? []) {
                    table.field.regions.forEach((region, index) => {
                        if (region.pageNumber !== props.pageNumber) return;
                        const points = projectRegion(region, geometry).polygon;
                        markers.push({ key: `${table.id}:${index}`, table, polygon: points, point: {
                            x: Math.min(...points.map(point => point.x)) - 18, y: Math.min(...points.map(point => point.y)),
                        } });
                    });
                }
            }
            return { words, outlines, markers, error: null };
        } catch (error) {
            return { words: [], outlines: [], markers: [], error: error instanceof Error ? error.message : String(error) };
        }
    }, [props.outlines, props.view, props.content, props.pageNumber, ready, page, projectionSize, rotation]);
    let polygons: CuPoint[][] = [];
    const region = props.regions[props.regionIndex];
    const regionPageAvailable = hasSourcePage(props.source?.pages, region?.pageNumber);
    useEffect(() => {
        const request = props.revealRequest;
        if (request === null || request === handledReveal.current || props.preview || !ready || !projectionSize ||
            !region || region.pageNumber !== props.pageNumber || !page) return;
        const viewport = container.current;
        const paper = renderedPage.current;
        const cuPage = props.content?.pages.find(value => value.pageNumber === props.pageNumber);
        if (!viewport || !paper || !cuPage) return;
        handledReveal.current = request;
        setNavigationError(null);
        try {
            const geometry = createPageGeometry(cuPage, projectionSize, { zoom: 1, rotation, pan: { x: 0, y: 0 } });
            const regions = props.active?.detailView ? props.regions.filter(value => value.pageNumber === props.pageNumber) : [region];
            const bounds = viewport.getBoundingClientRect();
            const frame = paper.getBoundingClientRect();
            const points = regions.flatMap(value => projectRegion(value, geometry).polygon.map(value => ({
                x: frame.x + value.x - bounds.x - viewport.clientLeft,
                y: frame.y + value.y - bounds.y - viewport.clientTop,
            })));
            const offset = getRevealOffset(points, { width: viewport.clientWidth, height: viewport.clientHeight });
            if (offset.x !== 0 || offset.y !== 0) setPan(current => ({ x: current.x + offset.x, y: current.y + offset.y }));
        } catch (error) {
            setNavigationError(error instanceof Error ? error.message : String(error));
        }
    }, [props.revealRequest, props.preview, props.pageNumber, props.content, props.active, props.regions, ready, region, page, projectionSize, rotation]);
    let overlayError: string | null = props.source && region && !regionPageAvailable ?
        unavailableSourcePageMessage(region.pageNumber) : null;
    if (ready && projectionSize && region?.pageNumber === props.pageNumber && page) {
        const cuPage = props.content?.pages.find(value => value.pageNumber === props.pageNumber);
        if (cuPage) {
            try {
                const geometry = createPageGeometry(cuPage, projectionSize, { zoom: 1, rotation, pan: { x: 0, y: 0 } });
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
        pageEdited.current = false;
        setPageError(null);
        captureControlFocus();
        props.onPage(number);
    };
    const changeZoom = (direction: number): void => {
        setManualZoom(direction > 0 ? zoom * 1.25 : zoom / 1.25);
        setFit(null);
        setPan({ x: 0, y: 0 });
    };
    const error = props.error ?? renderError;
    return <section className="cu-source-pane" aria-label="Source document" aria-busy={!ready && !error}>
        <header className="cu-source-heading"><strong>{props.source?.name ?? "Source document"}</strong><span>
            {props.source ? props.source.kind === "pdf" ? `PDF · ${props.source.pages.length} pages` : `${page?.width} × ${page?.height} px` : props.loading ? "Loading" : "Unavailable"}
        </span></header>
        <span id={`${sourceId}-pan-help`} className="cu-visually-hidden">Use arrow keys to move the document. Zoom, fit and rotation controls follow the viewport.</span>
        <div className="cu-document-container" ref={container} role="group" aria-label="Source viewport"
            aria-describedby={`${sourceId}-pan-help`} aria-disabled={!ready} tabIndex={ready ? 0 : -1}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            onKeyDown={event => {
                if (!ready || event.target !== event.currentTarget) return;
                const offset = event.key === "ArrowLeft" ? { x: -40, y: 0 } : event.key === "ArrowRight" ? { x: 40, y: 0 } :
                    event.key === "ArrowUp" ? { x: 0, y: -40 } : event.key === "ArrowDown" ? { x: 0, y: 40 } : undefined;
                if (!offset) return;
                event.preventDefault();
                props.onDismissPreview();
                handledReveal.current = props.revealRequest;
                setPan(current => ({ x: current.x + offset.x, y: current.y + offset.y }));
            }}
            onPointerDown={event => {
                if (!ready || event.button !== 0) return;
                event.preventDefault();
                props.onDismissPreview();
                handledReveal.current = props.revealRequest;
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
                <div className="cu-rendered-page" ref={renderedPage} data-testid="rendered-page" style={{
                    width: size?.width, height: size?.height, visibility: ready ? "visible" : "hidden",
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                }}>
                    <canvas ref={canvas} role="img" aria-label={`Rendered source page ${props.pageNumber}`} data-testid="source-canvas" />
                    {layersReady && layerFrame && props.content && background.words.length > 0 &&
                        <WordLayer words={background.words} size={layerFrame.size} pageNumber={props.pageNumber}
                            contentId={props.content.id} dpr={dpr} />}
                    {layersReady && background.outlines.length > 0 && <svg key={`outlines:${renderKey}:${props.view}`} className="cu-overlay" data-testid="result-overlay"
                        data-result-view={props.view} aria-hidden="true" focusable="false" width={layerFrame?.size.width} height={layerFrame?.size.height}>
                        {background.outlines.map(outline => <polygon key={outline.key} data-outline-id={outline.field.id}
                            points={outline.polygon.map(point => `${point.x},${point.y}`).join(" ")}
                            fill={outline.color} fillOpacity={props.view === "fields" ? 0.04 : 0.08}
                            stroke={outline.color} strokeWidth={1} />)}
                    </svg>}
                    {layersReady && polygons.length > 0 && <svg key={`active:${renderKey}`} className="cu-overlay" data-testid="source-overlay" aria-hidden="true"
                        focusable="false" width={layerFrame?.size.width} height={layerFrame?.size.height}>
                        {polygons.map((polygon, index) => <polygon key={index}
                            points={polygon.map(point => `${point.x},${point.y}`).join(" ")} fill={props.color} fillOpacity={props.preview ? 0.08 : 0.15}
                            stroke={props.color} strokeWidth={2} strokeDasharray={props.preview ? "4 3" : undefined} />)}
                    </svg>}
                    {layersReady && layerFrame && background.markers.length > 0 &&
                        <SourceTableMarkers key={`${props.content?.id}:${props.pageNumber}:${props.view}`}
                            markers={background.markers} size={layerFrame.size} pan={pan}
                            viewport={container} paper={renderedPage} onPreviewStart={props.onDismissPreview} />}
                </div>
            </div>
            {layersReady && props.preview && props.active && polygons[0] && (!props.active.detailView || props.active.detailView === "paragraphs") &&
                <SourcePopover id={props.previewId} field={props.active} color={props.color} points={polygons[0]}
                    pan={pan} viewport={container} paper={renderedPage} onEnter={props.onPreviewEnter} onLeave={props.onPreviewLeave} />}
            {(!ready || error) && <div className={`cu-source-state cu-state${error ? " cu-error" : ""}`} role={error ? "alert" : "status"}>
                <h2>{error ? "Source could not be displayed" : "Loading source..."}</h2>
                <p>{error ?? "Valid field data stays available."}</p>
            </div>}
        </div>
        <div className={`cu-preview-dock${props.pinned && props.pinnedRegions.length > 1 ? " has-region-controls" : ""}`}>
            {props.pinned && props.pinnedRegions.length > 1 ?
                    <aside className="cu-preview cu-region-navigation" aria-label="Source region navigation">
                        <strong>{fieldLabel(props.pinned)}</strong>
                        <div className="cu-region-controls" ref={regionControls} onClickCapture={captureControlFocus}>
                            <button type="button" aria-label="Previous source region" disabled={props.pinnedRegionIndex === 0}
                                onClick={() => props.onRegion(props.pinnedRegionIndex - 1)}>‹</button>
                            <span>Region {props.pinnedRegionIndex + 1} of {props.pinnedRegions.length}</span>
                            <button type="button" aria-label="Next source region"
                                disabled={props.pinnedRegionIndex >= props.pinnedRegions.length - 1}
                                onClick={() => props.onRegion(props.pinnedRegionIndex + 1)}>›</button>
                        </div>
                    </aside> :
                <span className="cu-preview-hint">{props.active && !region ?
                    `${props.active.name}: no source region` : region && !regionPageAvailable ?
                        props.source ? `Source page ${region.pageNumber} is unavailable in this file.` : "Source is not available for navigation." :
                        props.active && region?.pageNumber !== props.pageNumber ?
                            `Selected source is on page ${region?.pageNumber}` : "Hover a result to preview its source; select to pin it."}</span>}
        </div>
        {overlayError && <div className="cu-inline-error" role="alert">Source region: {overlayError}</div>}
        {background.error && <div className="cu-inline-error" role="alert">Source outlines: {background.error}</div>}
        {navigationError && <div className="cu-inline-error" role="alert">Source navigation: {navigationError}</div>}
        <footer className="cu-source-toolbar" ref={toolbar} onClickCapture={captureControlFocus}>
            <div className="cu-page-controls">
                {props.source?.kind === "image" ? <span>Image · single page</span> : <>
                    <button type="button" aria-label="Previous page" disabled={!ready || props.pageNumber <= 1} onClick={() => props.onPage(props.pageNumber - 1)}>‹</button>
                    <input aria-label="Page number" aria-describedby={`${sourceId}-page-count`}
                        aria-invalid={Boolean(pageError)} aria-errormessage={pageError ? `${sourceId}-page-error` : undefined}
                        value={pageText} disabled={!ready} onChange={event => {
                            pageEdited.current = true;
                            setPageText(event.target.value);
                        }}
                        onKeyDown={event => { if (event.key === "Enter") applyPage(); }} onBlur={event => {
                            if (!pageEdited.current || !ready) return;
                            applyPage();
                            if (event.relatedTarget instanceof HTMLElement && toolbar.current?.contains(event.relatedTarget)) {
                                pendingFocus.current = event.relatedTarget;
                            }
                        }} />
                    <span id={`${sourceId}-page-count`}>of {props.source?.pages.length ?? "--"}</span>
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
        {pageError && <div id={`${sourceId}-page-error`} className="cu-inline-error" role="alert">{pageError}</div>}
    </section>;
}
