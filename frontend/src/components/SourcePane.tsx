import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PageSize } from "../source/geometry";
import { createPageGeometry, getFitZoom, getRevealOffset, pointInPolygon, projectRegion, transformPoint, wheelZoomFactor } from "../source/geometry";
import type { LoadedSource } from "../source/source";
import { hasSourcePage, unavailableSourcePageMessage } from "../source/source";
import type { CuContent, CuField, CuPoint, CuRegion } from "../model/types";
import { fieldLabel, isFieldGroup } from "../interaction/interaction";
import { leafFields } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import type { ResultView } from "../model/resultViews";
import type { SourceOutline } from "../source/sourceOverlays";
import { SOURCE_POPOVER_GAP, sourceOutlines, sourcePopoverPoints, sourceSelectionFrames } from "../source/sourceOverlays";
import { SourcePopover } from "./SourcePopover";
import { useSourceRendering } from "../source/useSourceRendering";
import { SourceToolbar } from "./SourceToolbar";
import { ViewerIcon } from "./ViewerIcon";

interface SourcePaneProps {
    source: LoadedSource | null;
    loading: boolean;
    error: string | null;
    content: CuContent | undefined;
    pageNumber: number;
    active: CuField | null;
    preview: boolean;
    pinned: CuField | null;
    hasSelection: boolean;
    pinnedRegions: readonly CuRegion[];
    pinnedRegionIndex: number;
    view: ResultView | undefined;
    outlines: readonly SourceOutline[];
    previewId: string;
    onPreviewEnter: () => void;
    onPreviewLeave: () => void;
    onDismissPreview: () => void;
    onHover: (field: CuField, regionIndex: number, keyboard?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField, regionIndex: number) => void;
    onSelectTable: (field: CuField, regionIndex: number) => void;
    onClear: () => void;
    regions: readonly CuRegion[];
    regionIndex: number;
    revealRequest: number | null;
    onPage: (pageNumber: number) => void;
    onRegion: (index: number) => void;
    onRenderReady: (ready: boolean) => void;
    settings: ReviewSettings;
    onSettings: (settings: ReviewSettings) => void;
    onResetLayout: () => void;
}

interface ProjectedOutline extends SourceOutline { polygon: CuPoint[] }
interface ProjectedTable {
    key: string;
    field: CuField;
    regionIndex: number;
    polygon: CuPoint[];
}

export function SourcePane(props: SourcePaneProps) {
    const container = useRef<HTMLDivElement>(null), toolbar = useRef<HTMLElement>(null);
    const pendingFocus = useRef<HTMLElement | null>(null);
    const handledReveal = useRef<number | null>(null);
    const previousView = useRef<{ pageNumber: number; zoom: number; source: LoadedSource | null } | null>(null);
    const zoomAnchor = useRef<{ point: CuPoint; client: CuPoint } | null>(null);
    const sourceId = useId();
    const [available, setAvailable] = useState<PageSize>({ width: 800, height: 650 });
    const [fit, setFit] = useState<"page" | "width" | null>("page");
    const [manualZoom, setManualZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [pan, setPan] = useState<CuPoint>({ x: 0, y: 0 });
    const [reserve, setReserve] = useState(0);
    const [popupSize, setPopupSize] = useState<(PageSize & { fieldId: string }) | null>(null);
    const [navigationError, setNavigationError] = useState<string | null>(null);
    const drag = useRef<{ client: CuPoint; pan: CuPoint; moved: boolean; target: ProjectedOutline | ProjectedTable | undefined } | null>(null);
    const page = props.source?.pages.find(value => value.pageNumber === props.pageNumber);
    const zoom = page && fit ? getFitZoom(page, available, rotation, fit) : manualZoom;
    const fitPageZoom = page ? getFitZoom(page, available, rotation, "page") : 1;
    const minZoom = Math.min(0.25, fitPageZoom, zoom), maxZoom = Math.max(3, fitPageZoom, zoom);
    const { canvas, renderedPage, renderKey, dpr, ready, renderError, layerFrame, layersReady, projectionSize, size } =
        useSourceRendering({ source: props.source, page, pageNumber: props.pageNumber, zoom, rotation, available,
            loading: props.loading, error: props.error, onRenderReady: props.onRenderReady });
    const display = size ?? (page ? {
        width: (rotation % 180 ? page.height : page.width) * zoom,
        height: (rotation % 180 ? page.width : page.height) * zoom,
    } : { width: 0, height: 0 });
    const group = props.active ? isFieldGroup(props.active) : false;
    const pinnedGroup = props.pinned ? isFieldGroup(props.pinned) : false;
    const wholeTable = props.content?.tables?.some(table => table.id === props.active?.id);
    const showCard = Boolean(props.active && !group && !wholeTable &&
        (!props.active.detailView || props.active.detailView === "paragraphs"));
    const valuePreview = Boolean(props.preview && props.view === "fields" && props.active && !group && !props.active.detailView);
    const previewInSelection = Boolean(props.pinned && props.active && (props.pinned.id === props.active.id ||
        (pinnedGroup && props.active.id.startsWith(`${props.pinned.id}/`))));
    const captureControlFocus = (requested?: HTMLElement): void => {
        const target = requested ?? container.current?.ownerDocument.activeElement;
        if (target instanceof HTMLElement && container.current?.parentElement?.contains(target) &&
            (toolbar.current?.contains(target) || target.closest(".cu-region-controls"))) pendingFocus.current = target;
    };
    useLayoutEffect(() => {
        const previous = previousView.current;
        if (props.revealRequest !== null && props.revealRequest !== handledReveal.current &&
            previous?.source === props.source && previous.pageNumber !== props.pageNumber && fit !== null && previous.zoom !== zoom) {
            setManualZoom(previous.zoom); setFit(null);
        }
        previousView.current = { pageNumber: props.pageNumber, zoom, source: props.source };
    }, [props.revealRequest, props.source, props.pageNumber, fit, zoom]);
    useLayoutEffect(() => {
        if (!ready || !pendingFocus.current) return;
        const target = pendingFocus.current;
        pendingFocus.current = null;
        if (!target.isConnected || (target.ownerDocument.activeElement !== target.ownerDocument.body && target.ownerDocument.activeElement !== target)) return;
        const next = target.matches(":disabled") ? target.closest(".cu-region-controls, .cu-page-controls, .cu-view-controls")
            ?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)") : target;
        next?.focus({ preventScroll: true });
    }, [ready, props.regionIndex, props.pageNumber]);
    useEffect(() => {
        const element = container.current;
        if (!element) return;
        const observer = new ResizeObserver(entries => {
            const bounds = entries[0]?.contentRect;
            if (bounds && bounds.width > 64 && bounds.height > 60) setAvailable({ width: bounds.width - 64, height: bounds.height - 60 });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        zoomAnchor.current = null; setPan({ x: 0, y: 0 }); setReserve(0); container.current?.scrollTo(0, 0);
    }, [props.pageNumber]);
    useEffect(() => { if (!props.hasSelection) setReserve(0); }, [props.hasSelection]);
    useEffect(captureControlFocus, [props.source, props.pageNumber, zoom, rotation, renderKey, dpr]);
    const geometry = useMemo(() => {
        const cuPage = props.content?.pages.find(value => value.pageNumber === props.pageNumber);
        if (!ready || !projectionSize || !cuPage) return { value: null, error: null };
        try { return { value: createPageGeometry(cuPage, projectionSize, { zoom: 1, rotation, pan: { x: 0, y: 0 } }), error: null }; }
        catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) }; }
    }, [props.content, props.pageNumber, ready, projectionSize, rotation]);
    const background = useMemo(() => {
        const outlines: ProjectedOutline[] = [], tables: ProjectedTable[] = [];
        if (!geometry.value) return { outlines, tables, error: geometry.error };
        try {
            for (const outline of props.outlines) outlines.push({ ...outline, polygon: projectRegion(outline.region, geometry.value).polygon });
            for (const table of props.content?.tables ?? []) table.field.regions.forEach((region, index) => {
                if (region.pageNumber !== props.pageNumber) return;
                tables.push({ key: `${table.id}:${index}`, field: table.field, regionIndex: index,
                    polygon: projectRegion(region, geometry.value).polygon });
            });
            return { outlines, tables, error: null };
        } catch (error) { return { outlines: [], tables: [], error: error instanceof Error ? error.message : String(error) }; }
    }, [props.outlines, props.content, props.pageNumber, geometry]);
    const selectedPolygons = useMemo(() => {
        const project = (field: CuField | null, regions: readonly CuRegion[]) =>
            !field || !geometry.value ? [] : regions.flatMap((region, regionIndex) =>
                region.pageNumber === props.pageNumber ?
                    [{ regionIndex, polygon: projectRegion(region, geometry.value).polygon }] : []);
        try {
            const pinned = project(props.pinned, props.pinnedRegions);
            const preview = props.preview ? project(props.active, props.regions) : [];
            const pageGeometry = geometry.value;
            const framesFor = (field: CuField | null, regions: typeof pinned) => {
                const merge = props.view === "fields" && field && !isFieldGroup(field) && !field.detailView && regions.length > 1;
                return merge && pageGeometry ? sourceSelectionFrames(regions,
                    sourceOutlines(props.content, "fields", props.pageNumber, false)
                        .filter(outline => outline.field.id !== field.id)
                        .map(outline => projectRegion(outline.region, pageGeometry).polygon)) :
                    regions.map(item => ({ regionIndices: [item.regionIndex], polygon: item.polygon }));
            };
            const previewRegions = valuePreview || props.active?.detailView ? preview :
                preview.filter(item => item.regionIndex === props.regionIndex);
            return {
                pinned, preview, frames: framesFor(props.pinned, pinned),
                previewFrames: framesFor(props.active, previewRegions),
                card: showCard ? sourcePopoverPoints(props.preview ? preview : pinned, props.regionIndex) : undefined,
                error: null,
            };
        } catch (error) { return { pinned: [], preview: [], frames: [], previewFrames: [], card: undefined, error: error instanceof Error ? error.message : String(error) }; }
    }, [geometry, props.content, props.view, props.pinned, props.pinnedRegions, props.preview,
        props.active, props.regions, props.regionIndex, props.pageNumber, showCard, valuePreview]);
    const activePolygons = props.preview ? selectedPolygons.preview : selectedPolygons.pinned;
    const cardPolygon = selectedPolygons.card;
    const measureCard = useCallback((next: PageSize): void => {
        const fieldId = props.active?.id;
        if (fieldId) setPopupSize(current => current?.fieldId === fieldId && current.width === next.width && current.height === next.height ?
            current : { ...next, fieldId });
    }, [props.active?.id]);
    useLayoutEffect(() => {
        const request = props.revealRequest, viewport = container.current, paper = renderedPage.current;
        if (request === null || request === handledReveal.current || props.preview || !ready || !viewport || !paper ||
            !activePolygons.length || (showCard && !cardPolygon)) return;
        if (showCard && popupSize?.fieldId !== props.active?.id) return;
        try {
            const points = showCard && cardPolygon ? cardPolygon : activePolygons.flatMap(item => item.polygon);
            let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
            for (const point of points) {
                left = Math.min(left, point.x); right = Math.max(right, point.x);
                top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
            }
            const height = showCard ? popupSize?.height ?? 0 : 0;
            const space = height ? height + SOURCE_POPOVER_GAP + 8 : 8;
            const nextReserve = Math.max(0, bottom + space - display.height - 30 + pan.y);
            if (Math.abs(nextReserve - reserve) > 0.01) { setReserve(nextReserve); return; }
            const bounds = viewport.getBoundingClientRect(), frame = paper.getBoundingClientRect();
            const x = frame.x - bounds.x - viewport.clientLeft, y = frame.y - bounds.y - viewport.clientTop;
            const startY = bottom - top + space + 8 > viewport.clientHeight && height ? bottom : top - 8;
            const offset = getRevealOffset([{ x: x + left - 8, y: y + startY },
                { x: x + right + 8, y: y + bottom + space }], { width: viewport.clientWidth, height: viewport.clientHeight });
            const previous = { x: viewport.scrollLeft, y: viewport.scrollTop };
            viewport.scrollLeft -= offset.x; viewport.scrollTop -= offset.y;
            const remaining = { x: offset.x + viewport.scrollLeft - previous.x, y: offset.y + viewport.scrollTop - previous.y };
            if (Math.abs(remaining.x) > 0.01 || Math.abs(remaining.y) > 0.01) setPan(current => ({
                x: current.x + remaining.x, y: current.y + remaining.y,
            }));
            handledReveal.current = request;
            setNavigationError(null);
        } catch (error) { handledReveal.current = request; setNavigationError(error instanceof Error ? error.message : String(error)); }
    }, [props.revealRequest, props.preview, props.active, ready, activePolygons, cardPolygon, showCard, popupSize, display.height, pan.y, reserve]);
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const applyZoom = (value: number, client?: CuPoint): void => {
        const viewport = container.current, paper = renderedPage.current;
        if (!page || !viewport || !paper) return;
        try {
            const next = Math.max(minZoom, Math.min(maxZoom, value));
            if (next === zoomRef.current) return;
            const frame = paper.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
            if (frame.width <= 0 || frame.height <= 0) throw new Error("Wait for a visible source frame before zooming.");
            const anchor = client ?? { x: bounds.x + viewport.clientWidth / 2, y: bounds.y + viewport.clientHeight / 2 };
            const currentGeometry = createPageGeometry(page, rotation % 180 ? { width: frame.height, height: frame.width } : frame,
                { zoom: 1, rotation, pan: { x: 0, y: 0 } });
            zoomAnchor.current = { point: transformPoint(currentGeometry.inverse, { x: anchor.x - frame.x, y: anchor.y - frame.y }), client: anchor };
            zoomRef.current = next;
            handledReveal.current = props.revealRequest;
            props.onDismissPreview(); setReserve(0); setFit(null); setManualZoom(next); setNavigationError(null);
        } catch (error) { setNavigationError(error instanceof Error ? error.message : String(error)); }
    };
    const zoomHandler = useRef(applyZoom);
    zoomHandler.current = applyZoom;
    useEffect(() => {
        const viewport = container.current;
        if (!viewport) return;
        const wheel = (event: WheelEvent): void => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            try { zoomHandler.current(zoomRef.current * wheelZoomFactor(event.deltaY, event.deltaMode, viewport.clientHeight),
                { x: event.clientX, y: event.clientY }); }
            catch (error) { setNavigationError(error instanceof Error ? error.message : String(error)); }
        };
        viewport.addEventListener("wheel", wheel, { passive: false });
        return () => viewport.removeEventListener("wheel", wheel);
    }, []);
    useLayoutEffect(() => {
        const anchor = zoomAnchor.current, paper = renderedPage.current;
        if (!anchor || !paper || !page) return;
        const frame = paper.getBoundingClientRect();
        if (frame.width <= 0 || frame.height <= 0) return;
        const nextGeometry = createPageGeometry(page, rotation % 180 ? { width: frame.height, height: frame.width } : frame,
            { zoom: 1, rotation, pan: { x: 0, y: 0 } });
        const point = transformPoint(nextGeometry.matrix, anchor.point);
        const dx = anchor.client.x - frame.x - point.x, dy = anchor.client.y - frame.y - point.y;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) setPan(current => ({ x: current.x + dx, y: current.y + dy }));
        if (ready) zoomAnchor.current = null;
    }, [zoom, fit, ready, display.width, display.height, page, rotation, pan, reserve, available]);
    const hit = (clientX: number, clientY: number): ProjectedOutline | ProjectedTable | undefined => {
        const frame = renderedPage.current?.getBoundingClientRect();
        if (!frame) return undefined;
        const point = { x: clientX - frame.x, y: clientY - frame.y };
        return background.outlines.find(outline => pointInPolygon(point, outline.polygon)) ??
            background.tables.find(table => pointInPolygon(point, table.polygon));
    };
    const isTable = (field: CuField): boolean => props.content?.tables?.some(table => table.field === field) ?? false;
    const selectSource = (field: CuField, index: number): void => {
        if (isTable(field)) props.onSelectTable(field, index);
        else props.onSelect(field, index);
    };
    const resetView = (): void => {
        zoomAnchor.current = null; handledReveal.current = props.revealRequest;
        props.onDismissPreview(); setReserve(0); setPan({ x: 0, y: 0 }); container.current?.scrollTo(0, 0);
    };
    const region = props.regions[props.regionIndex];
    const unavailable = props.source && region && !hasSourcePage(props.source.pages, region.pageNumber);
    const sourcePages = [...new Set(props.pinnedRegions.map(region => region.pageNumber))].sort((a, b) => a - b);
    const error = props.error ?? renderError;
    return <section className="cu-source-pane" aria-label="Source document" aria-busy={!ready && !error}>
        <SourceToolbar source={props.source} pageNumber={props.pageNumber} zoom={zoom} ready={ready} fit={fit}
            minZoom={minZoom} maxZoom={maxZoom}
            summaryId={`${sourceId}-summary`}
            toolbarRef={toolbar} settings={props.settings} onSettings={props.onSettings} onPage={props.onPage}
            onZoom={value => applyZoom(value)} onFit={value => { resetView(); setFit(value); }}
            onRotate={() => { resetView(); setRotation(value => (value + 90) % 360); }}
            onResetLayout={props.onResetLayout} onControlFocus={captureControlFocus} />
        <span id={`${sourceId}-pan-help`} className="cu-visually-hidden">Ctrl or Command with scroll zooms at the pointer. Ordinary scroll moves the viewport. Drag or use arrow keys to pan; click a source region to select it.</span>
        <div className="cu-document-container" ref={container} role="group" aria-label="Source viewport"
            aria-describedby={`${sourceId}-summary ${sourceId}-pan-help`} aria-disabled={!ready} tabIndex={ready ? 0 : -1}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            onKeyDown={event => {
                if (event.key === "Escape" && drag.current) {
                    event.preventDefault(); event.stopPropagation();
                    setPan(drag.current.pan); drag.current = null; return;
                }
                if (!ready || event.target !== event.currentTarget) return;
                const offset = event.key === "ArrowLeft" ? { x: -40, y: 0 } : event.key === "ArrowRight" ? { x: 40, y: 0 } :
                    event.key === "ArrowUp" ? { x: 0, y: -40 } : event.key === "ArrowDown" ? { x: 0, y: 40 } : undefined;
                if (offset) {
                    event.preventDefault(); props.onDismissPreview(); handledReveal.current = props.revealRequest;
                    setPan(current => ({ x: current.x + offset.x, y: current.y + offset.y }));
                }
            }}
            onPointerDown={event => {
                if (!ready || event.button !== 0 || (event.target instanceof Element && event.target.closest(".cu-source-popover"))) return;
                event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
                drag.current = { client: { x: event.clientX, y: event.clientY }, pan, moved: false, target: hit(event.clientX, event.clientY) };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
                if (drag.current) {
                    const dx = event.clientX - drag.current.client.x, dy = event.clientY - drag.current.client.y;
                    if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
                    if (drag.current.moved) {
                        props.onDismissPreview(); handledReveal.current = props.revealRequest;
                        setPan({ x: drag.current.pan.x + dx, y: drag.current.pan.y + dy });
                    }
                    return;
                }
                if (!ready || (event.target instanceof Element && event.target.closest(".cu-source-popover"))) return;
                const target = hit(event.clientX, event.clientY);
                if (target && !isTable(target.field)) props.onHover(target.field, target.regionIndex);
                else if (target) props.onDismissPreview();
                else if (props.preview && props.active) props.onLeave(props.active);
            }}
            onPointerUp={event => {
                const current = drag.current;
                drag.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                if (current && !current.moved) {
                    if (current.target) selectSource(current.target.field, current.target.regionIndex);
                    else props.onClear();
                }
            }}
            onPointerLeave={() => { if (props.preview && props.active && !drag.current) props.onLeave(props.active); }}
            onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        >
            <div className="cu-document-stage" style={{
                minWidth: Math.max(display.width + 64, available.width + 64),
                minHeight: Math.max(display.height + 60 + reserve, available.height + 60), paddingBottom: 30 + reserve,
            }}>
                <div className="cu-rendered-page" ref={renderedPage} data-testid="rendered-page"
                    style={{ width: display.width, height: display.height, visibility: ready ? "visible" : "hidden",
                        transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                    <canvas ref={canvas} role="img" aria-label={`Rendered source page ${props.pageNumber}`} data-testid="source-canvas" />
                    {layersReady && background.tables.length > 0 && <svg className="cu-overlay cu-source-tables" data-testid="source-tables"
                        width={layerFrame?.size.width} height={layerFrame?.size.height} role="group" aria-label="Source tables" focusable="false">
                        {background.tables.map((table, index) => <polygon key={table.key} data-table-id={table.field.id}
                            data-region-index={table.regionIndex} points={table.polygon.map(point => `${point.x},${point.y}`).join(" ")}
                            role="button" aria-label={`Locate ${table.field.name} in results`}
                            tabIndex={index === 0 ? 0 : -1} fill="transparent" stroke="none"
                            onFocus={props.onDismissPreview}
                            onKeyDown={event => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault(); props.onSelectTable(table.field, table.regionIndex);
                                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                    event.preventDefault();
                                    const next = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
                                    if (next instanceof SVGPolygonElement) next.focus({ preventScroll: true });
                                }
                            }} />)}
                    </svg>}
                    {layersReady && background.outlines.length > 0 && <svg className="cu-overlay cu-source-regions" data-testid="result-overlay"
                        data-result-view={props.view} role="group" aria-label="Extracted source regions" focusable="false"
                        width={layerFrame?.size.width} height={layerFrame?.size.height}>
                        <g className="cu-source-highlight-edges" aria-hidden="true" pointerEvents="none">
                            {background.outlines.filter(outline => outline.enabled).map(outline => <path key={outline.key} data-source-edge-id={outline.field.id}
                                d={`M ${outline.polygon.map(point => `${point.x},${point.y}`).join(" L ")} Z`}
                                fill="none" stroke={outline.color} strokeWidth={2} strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke" />)}
                        </g>
                        {background.outlines.map((outline, index) => <polygon key={outline.key} data-outline-id={outline.field.id}
                            data-region-index={outline.regionIndex}
                            role="button" aria-label={`Select source of ${fieldLabel(outline.field)}, region ${outline.regionIndex + 1}`}
                            aria-describedby={props.active?.id === outline.field.id && showCard ? `${props.previewId}-content` : undefined}
                            tabIndex={index === 0 ? 0 : -1} points={outline.polygon.map(point => `${point.x},${point.y}`).join(" ")}
                            fill={outline.enabled ? outline.color : "none"} fillOpacity={1} stroke="none"
                            onFocus={() => isTable(outline.field) ? props.onDismissPreview() : props.onHover(outline.field, outline.regionIndex, true)}
                            onBlur={() => props.onLeave(outline.field)}
                            onKeyDown={event => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault(); selectSource(outline.field, outline.regionIndex);
                                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                    event.preventDefault();
                                    const next = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
                                    if (next instanceof SVGPolygonElement) next.focus({ preventScroll: true });
                                }
                            }} />)}
                    </svg>}
                    {/* Avoid double-painted antialiasing inside the existing fixed selection. */}
                    {layersReady && !previewInSelection && selectedPolygons.previewFrames.length > 0 && <svg className="cu-overlay cu-source-interaction" data-testid="preview-overlay"
                        aria-hidden="true" focusable="false" width={layerFrame?.size.width} height={layerFrame?.size.height}>
                        {selectedPolygons.previewFrames.map(item => <polygon key={item.regionIndices.join(",")} data-source-id={props.active?.id}
                            data-region-index={item.regionIndices.length === 1 ? item.regionIndices[0] : undefined}
                            data-region-indices={item.regionIndices.join(" ")}
                            data-selection-frame={item.regionIndices.length > 1 ? "merged" : "region"}
                            points={item.polygon.map(point => `${point.x},${point.y}`).join(" ")} fill="none"
                            stroke="var(--cu-hover-stroke)"
                            strokeWidth={valuePreview ? 1.8 : 1.5} strokeDasharray={valuePreview ? undefined : "3 2"} />)}
                    </svg>}
                    {layersReady && selectedPolygons.pinned.length > 0 && <svg className="cu-overlay cu-source-interaction" data-testid="source-overlay"
                        aria-hidden="true" focusable="false" width={layerFrame?.size.width} height={layerFrame?.size.height}>
                        {selectedPolygons.frames.map(item => <polygon key={item.regionIndices.join(",")} data-source-id={props.pinned?.id}
                            data-region-index={item.regionIndices.length === 1 ? item.regionIndices[0] : undefined}
                            data-region-indices={item.regionIndices.join(" ")}
                            data-selection-frame={item.regionIndices.length > 1 ? "merged" : "region"}
                            points={item.polygon.map(point => `${point.x},${point.y}`).join(" ")} fill="none"
                            stroke="var(--cu-selected-stroke)" strokeWidth={1.8} />)}
                    </svg>}
                </div>
            </div>
            {layersReady && showCard && props.active && cardPolygon && <SourcePopover id={props.previewId} field={props.active}
                settings={props.settings} points={cardPolygon} pan={pan} viewport={container} paper={renderedPage}
                onMeasure={measureCard} onEnter={props.onPreviewEnter} onLeave={props.onPreviewLeave} />}
            {(!ready || error) && <div className={`cu-source-state cu-state${error ? " cu-error" : ""}`} role={error ? "alert" : "status"}>
                <h2>{error ? "Source could not be displayed" : "Loading source..."}</h2><p>{error ?? "Valid field data stays available."}</p>
            </div>}
        </div>
        <footer className="cu-preview-dock">
            {pinnedGroup && props.pinned ? <div className="cu-group-source-controls"><strong>{fieldLabel(props.pinned)}</strong>
                <span>{leafFields([props.pinned]).length} fields · {selectedPolygons.pinned.length} regions on p.{props.pageNumber}</span>
                {sourcePages.length > 1 && <select aria-label="Selected group source page" value={props.pageNumber}
                    onChange={event => props.onRegion(props.pinnedRegions.findIndex(region => region.pageNumber === Number(event.target.value)))}>
                    {!sourcePages.includes(props.pageNumber) && <option value={props.pageNumber} disabled>Page {props.pageNumber} (no group source)</option>}
                    {sourcePages.map(pageNumber => <option key={pageNumber} value={pageNumber}
                        disabled={!hasSourcePage(props.source?.pages, pageNumber)}>Page {pageNumber}</option>)}
                </select>}</div> :
                props.pinned && props.pinnedRegions.length > 1 ? <aside className="cu-region-controls" aria-label="Source region navigation">
                    <span>{fieldLabel(props.pinned)}</span>
                    <button type="button" aria-label="Previous source region" disabled={props.pinnedRegionIndex === 0}
                        onClick={() => { captureControlFocus(); props.onRegion(props.pinnedRegionIndex - 1); }}>‹</button>
                    <span title="All field regions on this page stay selected. Arrows change the source location.">
                        {selectedPolygons.pinned.length} {selectedPolygons.pinned.length === 1 ? "region" : "regions"} on p.{props.pageNumber}
                        {" · "}Location {props.pinnedRegionIndex + 1} of {props.pinnedRegions.length}</span>
                    <button type="button" aria-label="Next source region" disabled={props.pinnedRegionIndex >= props.pinnedRegions.length - 1}
                        onClick={() => { captureControlFocus(); props.onRegion(props.pinnedRegionIndex + 1); }}>›</button>
                </aside> : <span className="cu-preview-hint">{props.active && !region ? `${props.active.name}: no source region` :
                    unavailable ? `Source page ${region.pageNumber} is unavailable in this file.` :
                        props.active && region?.pageNumber !== props.pageNumber ? `Selected source is on page ${region?.pageNumber}` :
                            "Ctrl / Cmd + scroll to zoom · Drag to pan"}</span>}
            <button type="button" className="cu-icon-button" aria-label="Clear selection" onClick={props.onClear}><ViewerIcon name="close" /></button>
        </footer>
        {unavailable && <div className="cu-inline-error" role="alert">Source region: {unavailableSourcePageMessage(region.pageNumber)}</div>}
        {background.error && <div className="cu-inline-error" role="alert">Source outlines: {background.error}</div>}
        {selectedPolygons.error && <div className="cu-inline-error" role="alert">Source selection: {selectedPolygons.error}</div>}
        {navigationError && <div className="cu-inline-error" role="alert">Source navigation: {navigationError}</div>}
    </section>;
}
