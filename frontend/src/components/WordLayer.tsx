import { useLayoutEffect, useRef, useState } from "react";
import { getRasterSize } from "../source/geometry";
import type { PageSize } from "../source/geometry";
import { WORD_LAYER_COLOR } from "../source/sourceOverlays";
import type { CuPoint } from "../model/types";

export function WordLayer({ words, size, pageNumber, contentId, dpr }: {
    words: readonly { key: string; polygon: readonly CuPoint[] }[];
    size: PageSize; pageNumber: number; contentId: string; dpr: number;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);
    useLayoutEffect(() => {
        const element = canvas.current;
        if (!element) return;
        try {
            const raster = getRasterSize(size, dpr);
            element.width = raster.width;
            element.height = raster.height;
            const context = element.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("OCR word layer rendering is unavailable.");
            context.clearRect(0, 0, raster.width, raster.height);
            context.setTransform(raster.width / size.width, 0, 0, raster.height / size.height, 0, 0);
            context.fillStyle = WORD_LAYER_COLOR;
            context.strokeStyle = WORD_LAYER_COLOR;
            context.lineWidth = 1;
            for (const word of words) {
                const first = word.polygon[0];
                if (!first) throw new Error("An OCR word polygon is unavailable.");
                context.beginPath();
                context.moveTo(first.x, first.y);
                for (const point of word.polygon.slice(1)) context.lineTo(point.x, point.y);
                context.closePath();
                context.fill();
                context.stroke();
            }
            setError(null);
        } catch (failure) {
            element.width = 0;
            element.height = 0;
            setError(failure instanceof Error ? failure.message : String(failure));
        }
        return () => { element.width = 0; element.height = 0; };
    }, [words, size, dpr]);
    return <>
        <canvas ref={canvas} className="cu-overlay" data-testid="word-overlay"
            data-word-count={words.length} data-page-number={pageNumber} data-content-id={contentId}
            aria-hidden="true" />
        {error && <div className="cu-inline-error" role="alert">OCR words: {error}</div>}
    </>;
}
