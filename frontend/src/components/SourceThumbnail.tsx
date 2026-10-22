import { useEffect, useRef, useState } from "react";
import { createPageGeometry, projectRegion } from "../source/geometry";
import type { PageSize } from "../source/geometry";
import type { LoadedSource } from "../source/source";
import type { CuContent, CuRegion } from "../model/types";

export function SourceThumbnail({ source, content, region, label }: {
    source: LoadedSource | null; content: CuContent; region: CuRegion; label: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [state, setState] = useState<{ status: "ready"; size: PageSize } | { status: "loading" | "error"; message?: string }>({ status: "loading" });
    useEffect(() => {
        const controller = new AbortController();
        const visible = canvas.current;
        const scratch = document.createElement("canvas");
        setState({ status: "loading" });
        void Promise.resolve().then(async () => {
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
            const zoom = Math.min(1, 320 / Math.max(crop.width, crop.height));
            if (controller.signal.aborted) return;
            const size = await source.render(region.pageNumber, scratch, zoom, 0, controller.signal, crop);
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
    }, [source, content, region]);
    return <span className="cu-source-thumbnail">
        <canvas ref={canvas} role="img" aria-label={label} data-testid="source-thumbnail"
            hidden={state.status !== "ready"} style={state.status === "ready" ? { width: state.size.width, height: state.size.height } : undefined} />
        {state.status === "loading" && <span role="status">Loading source preview…</span>}
        {state.status === "error" && <span role="alert">Source preview: {state.message}</span>}
    </span>;
}
