import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PageSize } from "./geometry";
import type { LoadedSource, SourcePage } from "./source";

interface SourceRenderingOptions {
    source: LoadedSource | null;
    page: SourcePage | undefined;
    pageNumber: number;
    zoom: number;
    rotation: number;
    available: PageSize;
    loading: boolean;
    error: string | null;
    onRenderReady: (ready: boolean) => void;
}

export function useSourceRendering({ source, page, pageNumber, zoom, rotation, available, loading, error,
    onRenderReady }: SourceRenderingOptions) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const renderedPage = useRef<HTMLDivElement>(null);
    const [rendered, setRendered] = useState<{
        key: string; source: LoadedSource; page: SourcePage; rotation: number; dpr: number; size: PageSize;
    } | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const renderKey = `${pageNumber}:${zoom}:${rotation}`;
    const dpr = window.devicePixelRatio;
    const hasPreview = Boolean(rendered && rendered.source === source && rendered.page === page && rendered.rotation === rotation &&
        !loading && !error && !renderError);
    const ready = Boolean(hasPreview && rendered?.key === renderKey && rendered.dpr === dpr);
    const [layerFrame, setLayerFrame] = useState<{ raster: typeof rendered; size: PageSize } | null>(null);

    // Read the actual paper frame only after its new CSS dimensions commit.
    useLayoutEffect(() => {
        const bounds = ready ? renderedPage.current?.getBoundingClientRect() : undefined;
        setLayerFrame(bounds && bounds.width > 0 && bounds.height > 0 ?
            { raster: rendered, size: { width: bounds.width, height: bounds.height } } : null);
    }, [ready, rendered, available]);
    const layersReady = ready && layerFrame?.raster === rendered;
    const projectionSize = useMemo(() => layersReady && layerFrame ?
        rotation % 180 === 0 ? layerFrame.size : { width: layerFrame.size.height, height: layerFrame.size.width } : null,
    [layersReady, layerFrame, rotation]);

    useEffect(() => {
        const controller = new AbortController();
        setRendered(previous => previous?.source === source && previous.page === page && previous.rotation === rotation ? previous : null);
        setRenderError(null);
        onRenderReady(false);
        if (!source || !page) {
            if (source && !page) setRenderError("The requested page is not present in this source.");
            return () => controller.abort();
        }
        const scratch = document.createElement("canvas");
        void Promise.resolve().then(() => source.render(pageNumber, scratch, zoom, rotation, controller.signal)).then(size => {
            if (controller.signal.aborted || !canvas.current) return;
            const visible = canvas.current;
            visible.width = scratch.width;
            visible.height = scratch.height;
            const context = visible.getContext("2d");
            if (!context) throw new Error("Visible canvas rendering is unavailable.");
            context.drawImage(scratch, 0, 0);
            setRendered({ key: renderKey, source, page, rotation, dpr, size });
            onRenderReady(true);
        }).catch((failure: unknown) => {
            if (controller.signal.aborted) return;
            setRendered(null);
            setRenderError(failure instanceof Error ? failure.message : String(failure));
            onRenderReady(false);
        }).finally(() => {
            scratch.width = 0;
            scratch.height = 0;
        });
        return () => controller.abort();
    }, [source, pageNumber, zoom, rotation, renderKey, dpr, page, onRenderReady]);

    return { canvas, renderedPage, renderKey, dpr, ready, hasPreview, renderError, layerFrame, layersReady, projectionSize,
        size: ready ? rendered?.size : undefined };
}
