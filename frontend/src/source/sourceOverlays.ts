import { GeometryError } from "./geometry";
import type { PageSize } from "./geometry";
import { fieldColor } from "../interaction/interaction";
import type { ResultView } from "../model/resultViews";
import type { CuContent, CuField, CuPage, CuPoint, CuRegion } from "../model/types";

export const WORD_LAYER_COLOR = "#FAFF7F40";

export function sourceWordOutlines(page: CuPage | undefined): { key: string; region: CuRegion }[] {
    const seen = new Set<string>();
    return (page?.words ?? []).flatMap(word => {
        const region = word.region;
        if (!region) return [];
        const key = `${region.pageNumber}:${region.polygon.map(point => `${point.x},${point.y}`).join(";")}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ key: word.id, region }];
    });
}

export interface SourceOutline {
    key: string;
    field: CuField;
    region: CuRegion;
    color: string;
}

export function sourceOutlines(content: CuContent | undefined, view: ResultView | undefined,
    pageNumber: number, hideMissing: boolean): SourceOutline[] {
    if (!content) return [];
    let fields: CuField[] = [];
    if (view === "fields") {
        const stack = content.fields.slice().reverse();
        while (stack.length) {
            const field = stack.pop();
            if (!field) break;
            if (hideMissing && !field.hasValue) continue;
            fields.push(field);
            stack.push(...field.children.slice().reverse());
        }
    } else if (view === "paragraphs") fields = (content.paragraphs ?? []).map(item => item.field);
    else if (view === "tables") fields = (content.tables ?? []).map(item => item.field);
    else if (view === "figures") fields = (content.figures ?? []).map(item => item.field);
    else if (view === "signatures") fields = (content.signatures ?? []).map(item => item.field);
    return fields.flatMap(field => field.regions.flatMap((region, index) =>
        region.pageNumber === pageNumber ? [{
            key: `${field.id}:${index}`, field, region,
            color: view === "fields" ? fieldColor(field, content.fields) : "#0078d4",
        }] : []));
}

export interface SourceAnchor extends CuPoint, PageSize {}

export function popoverPosition(anchor: SourceAnchor, viewport: PageSize, popup: PageSize): CuPoint | null {
    if (![anchor.x, anchor.y, anchor.width, anchor.height, viewport.width, viewport.height, popup.width, popup.height]
        .every(Number.isFinite) || anchor.width < 0 || anchor.height < 0 ||
        viewport.width <= 0 || viewport.height <= 0 || popup.width <= 0 || popup.height <= 0) {
        throw new GeometryError("invalid-popover-layout", "Source preview dimensions must be finite and positive.");
    }
    const margin = 8, gap = 10;
    if (anchor.x + anchor.width <= 0 || anchor.y + anchor.height <= 0 ||
        anchor.x >= viewport.width || anchor.y >= viewport.height) return null;
    const candidates = [
        { x: anchor.x, y: anchor.y - popup.height - gap },
        { x: anchor.x, y: anchor.y + anchor.height + gap },
        { x: anchor.x + anchor.width + gap, y: anchor.y },
        { x: anchor.x - popup.width - gap, y: anchor.y },
    ];
    for (const candidate of candidates) {
        const clamped = {
            x: Math.max(margin, Math.min(candidate.x, viewport.width - popup.width - margin)),
            y: Math.max(margin, Math.min(candidate.y, viewport.height - popup.height - margin)),
        };
        if (clamped.x + popup.width <= anchor.x || clamped.x >= anchor.x + anchor.width ||
            clamped.y + popup.height <= anchor.y || clamped.y >= anchor.y + anchor.height) return clamped;
    }
    return {
        x: Math.max(margin, Math.min(anchor.x, viewport.width - popup.width - margin)),
        y: Math.max(margin, Math.min(anchor.y - popup.height - gap, viewport.height - popup.height - margin)),
    };
}
