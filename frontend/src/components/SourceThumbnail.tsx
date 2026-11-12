import { useEffect, useMemo, useRef, useState } from "react";
import { createPageGeometry, projectRegion } from "../source/geometry";
import type { PageSize } from "../source/geometry";
import type { LoadedSource } from "../source/source";
import { validateSourceCrop } from "../source/source";
import type { CuContent, CuRegion } from "../model/types";

function thumbnailLayout(source: LoadedSource | null, content: CuContent, region: CuRegion) {
    if (!source) throw new Error("Source is not available for a thumbnail.");
    const sourcePage = source.pages.find(page => page.pageNumber === region.pageNumber);
    const cuPage = content.pages.find(page => page.pageNumber === region.pageNumber);
    if (!sourcePage || !cuPage) throw new Error(`Page ${region.pageNumber} is not available for a thumbnail.`);
    const points = projectRegion(region, createPageGeometry(cuPage, sourcePage,
        { zoom: 1, rotation: 0, pan: { x: 0, y: 0 } })).polygon;
    const x = Math.min(...points.map(point => point.x));
    const y = Math.min(...points.map(point => point.y));
    const crop = {
        x, y, width: Math.max(...points.map(point => point.x)) - x,
        height: Math.max(...points.map(point => point.y)) - y,
    };
    validateSourceCrop(crop, sourcePage, 0);
    const zoom = Math.min(1, 320 / Math.max(crop.width, crop.height));
    return { source, crop, zoom, size: { width: crop.width * zoom, height: crop.height * zoom } };
}

export function SourceThumbnail({ source, content, region, label, reserveSpace = false }: {
    source: LoadedSource | null; content: CuContent; region: CuRegion; label: string; reserveSpace?: boolean;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [state, setState] = useState<{ status: "ready"; size: PageSize } | { status: "loading" | "error"; message?: string }>({ status: "loading" });
    const plan = useMemo(() => {
        try {
            return { layout: thumbnailLayout(source, content, region) };
        } catch (error: unknown) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [source, content, region]);
    useEffect(() => {
        const controller = new AbortController();
        const visible = canvas.current;
        const scratch = document.createElement("canvas");
        setState({ status: "loading" });
        void Promise.resolve().then(async () => {
            const layout = plan.layout;
            if (!layout) throw new Error(plan.error);
            if (controller.signal.aborted) return;
            const size = await layout.source.render(region.pageNumber, scratch, layout.zoom, 0, controller.signal, layout.crop);
            if (controller.signal.aborted || !visible) return;
            visible.width = scratch.width;
            visible.height = scratch.height;
            const context = visible.getContext("2d");
            if (!context) throw new Error("Thumbnail canvas rendering is unavailable.");
            context.drawImage(scratch, 0, 0);
            setState({ status: "ready", size });
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }).finally(() => {
            scratch.width = 0;
            scratch.height = 0;
        });
        return () => {
            controller.abort();
            if (visible) {
                visible.width = 0;
                visible.height = 0;
            }
        };
    }, [plan, region.pageNumber]);
    return <span className="cu-source-thumbnail" style={reserveSpace && plan.layout && state.status !== "error" ? {
        width: plan.layout.size.width, maxWidth: "100%", aspectRatio: `${plan.layout.size.width} / ${plan.layout.size.height}`,
    } : undefined}>
        <canvas ref={canvas} role="img" aria-label={label} data-testid="source-thumbnail"
            hidden={state.status !== "ready"} style={state.status === "ready" ? { width: state.size.width, height: state.size.height } : undefined} />
        {state.status === "loading" && <span role="status">Loading source preview…</span>}
        {state.status === "error" && <span role="alert">Source preview: {state.message}</span>}
    </span>;
}
