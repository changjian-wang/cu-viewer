import { GeometryError } from "./geometry";
import type { PageSize } from "./geometry";
import { fieldRegions, isFieldGroup } from "../interaction/interaction";
import { appearance, defaultReviewSettings, isTableValue } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import type { ResultView } from "../model/resultViews";
import { isFieldView } from "../model/resultViews";
import type { CuContent, CuField, CuPage, CuPoint, CuRegion } from "../model/types";

export const WORD_LAYER_COLOR = "#FAFF7F40";
export const SOURCE_POPOVER_GAP = 12;

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
    enabled: boolean;
    regionIndex: number;
}

export function isValueSourceField(view: ResultView | undefined, field: CuField | null): field is CuField {
    return Boolean(field && !isFieldGroup(field) &&
        (isFieldView(view) ? !field.detailView : view === "paragraphs" && field.detailView === "paragraphs"));
}

export function sourceOutlines(content: CuContent | undefined, view: ResultView | undefined,
    pageNumber: number, hideMissing: boolean, settings: ReviewSettings = defaultReviewSettings): SourceOutline[] {
    if (!content) return [];
    let fields: CuField[] = [];
    if (isFieldView(view)) {
        const stack = content.fields.slice().reverse();
        while (stack.length) {
            const field = stack.pop();
            if (!field) break;
            if (hideMissing && !field.hasValue) continue;
            if (view === "label" || !isFieldGroup(field) || field.children.length === 0 ||
                (field.regions.length > 0 && fieldRegions(field) === field.regions)) fields.push(field);
            stack.push(...field.children.slice().reverse());
        }
    } else if (view === "paragraphs") fields = (content.paragraphs ?? []).map(item => item.field);
    else if (view === "figures") fields = (content.figures ?? []).map(item => item.field);
    else if (view === "signatures") fields = (content.signatures ?? []).map(item => item.field);
    return fields.flatMap(field => {
        const container = isFieldGroup(field) || content.tables?.some(table => table.field === field);
        const style = appearance(container ? {} : field, isTableValue(field), settings, view === "label");
        return field.regions.flatMap((region, index) => region.pageNumber === pageNumber ? [{
            key: `${field.id}:${index}`, field, region, regionIndex: index, color: style.background, enabled: style.enabled,
        }] : []);
    });
}

export interface SourceAnchor extends CuPoint, PageSize {}

interface SourceRegionPolygon { regionIndex: number; polygon: readonly CuPoint[] }
interface SourceBounds extends PageSize { left: number; right: number; top: number; bottom: number }
export interface SourceSelectionFrame { regionIndices: readonly number[]; polygon: readonly CuPoint[] }

function sourceBounds(polygon: readonly CuPoint[]): SourceBounds {
    if (!polygon.length || polygon.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        throw new GeometryError("invalid-source", "Source preview points must be finite.");
    }
    const left = Math.min(...polygon.map(point => point.x)), right = Math.max(...polygon.map(point => point.x));
    const top = Math.min(...polygon.map(point => point.y)), bottom = Math.max(...polygon.map(point => point.y));
    if (right <= left || bottom <= top) throw new GeometryError("invalid-source", "Source preview bounds must have positive dimensions.");
    return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function sourceObjectPreviewFrame(regions: readonly SourceRegionPolygon[]): SourceSelectionFrame | undefined {
    if (!regions.length) return undefined;
    const bounds = sourceBounds(regions.flatMap(region => [...region.polygon]));
    return {
        regionIndices: regions.map(region => region.regionIndex).sort((a, b) => a - b),
        polygon: [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
            { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }],
    };
}

function nearbySourceRegions(left: SourceBounds, right: SourceBounds): boolean {
    const gapX = Math.max(0, left.left - right.right, right.left - left.right);
    const gapY = Math.max(0, left.top - right.bottom, right.top - left.bottom);
    return Math.hypot(gapX, gapY) <= Math.min(left.width, left.height, right.width, right.height);
}

function inlineSourceRegions(left: SourceBounds, right: SourceBounds, horizontal: boolean): boolean {
    const thickness = horizontal ? Math.min(left.height, right.height) : Math.min(left.width, right.width);
    const overlap = horizontal ? Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) :
        Math.min(left.right, right.right) - Math.max(left.left, right.left);
    const center = horizontal ? Math.abs(left.top + left.bottom - right.top - right.bottom) / 2 :
        Math.abs(left.left + left.right - right.left - right.right) / 2;
    const gap = horizontal ? Math.max(0, left.left - right.right, right.left - left.right) :
        Math.max(0, left.top - right.bottom, right.top - left.bottom);
    return overlap >= thickness * 0.75 && center <= thickness * 0.35 && gap <= thickness * 0.45;
}

function nearbySourceFragments(left: SourceBounds, right: SourceBounds): boolean {
    return nearbySourceRegions(left, right) || inlineSourceRegions(left, right, true) || inlineSourceRegions(left, right, false);
}

function connectedRegions(bounds: readonly SourceBounds[], start: number,
    neighbors: (left: SourceBounds, right: SourceBounds) => boolean = nearbySourceRegions): number[] {
    const connected = [start], included = new Set(connected);
    for (let cursor = 0; cursor < connected.length; cursor++) {
        const current = bounds[connected[cursor]!]!;
        bounds.forEach((candidate, index) => {
            if (included.has(index)) return;
            if (neighbors(current, candidate)) { included.add(index); connected.push(index); }
        });
    }
    return connected;
}

export function sourcePopoverPoints(regions: readonly SourceRegionPolygon[], regionIndex: number,
    mergeFragments = false): readonly CuPoint[] | undefined {
    const focused = regions.findIndex(region => region.regionIndex === regionIndex);
    if (focused < 0) return undefined;
    const bounds = regions.map(region => sourceBounds(region.polygon));
    const included = new Set(connectedRegions(bounds, focused, mergeFragments ? nearbySourceFragments : nearbySourceRegions));
    return regions.flatMap((region, index) => included.has(index) ? [...region.polygon] : []);
}

function alignedSourceLines(bounds: readonly SourceBounds[], horizontal: boolean): boolean {
    const lines = bounds.map(bound => horizontal ? {
        start: bound.top, end: bound.bottom, crossStart: bound.left, crossEnd: bound.right,
        length: bound.width, thickness: bound.height,
    } : {
        start: bound.left, end: bound.right, crossStart: bound.top, crossEnd: bound.bottom,
        length: bound.height, thickness: bound.width,
    }).sort((a, b) => a.start - b.start);
    return lines.every((line, index) => {
        if (line.length < line.thickness) return false;
        const previous = lines[index - 1];
        if (!previous) return true;
        const overlap = Math.min(line.crossEnd, previous.crossEnd) - Math.max(line.crossStart, previous.crossStart);
        const spacing = Math.min(line.thickness, previous.thickness);
        return overlap >= Math.min(line.length, previous.length) / 2 &&
            (line.start + line.end - previous.start - previous.end) / 2 >= spacing / 2 &&
            line.start - previous.end <= spacing;
    });
}

function sourceLineBounds(bounds: readonly SourceBounds[], horizontal: boolean): SourceBounds[] {
    const visited = new Set<number>();
    return bounds.flatMap((_bound, index) => {
        if (visited.has(index)) return [];
        const line = connectedRegions(bounds, index, (left, right) => inlineSourceRegions(left, right, horizontal));
        line.forEach(member => visited.add(member));
        return [sourceBounds(line.flatMap(member => [
            { x: bounds[member]!.left, y: bounds[member]!.top },
            { x: bounds[member]!.right, y: bounds[member]!.bottom },
        ]))];
    });
}

export function sourceSelectionFrames(regions: readonly SourceRegionPolygon[],
    otherPolygons: readonly (readonly CuPoint[])[], mergeFragments = false): SourceSelectionFrame[] {
    const bounds = regions.map(region => sourceBounds(region.polygon)), blockers = otherPolygons.map(sourceBounds);
    const visited = new Set<number>(), frames: SourceSelectionFrame[] = [];
    regions.forEach((region, index) => {
        if (visited.has(index)) return;
        const block = connectedRegions(bounds, index, mergeFragments ? nearbySourceFragments : nearbySourceRegions);
        block.forEach(member => visited.add(member));
        if (block.length === 1) {
            frames.push({ regionIndices: [region.regionIndex], polygon: region.polygon });
            return;
        }
        const lines = block.map(member => bounds[member]!);
        const envelope = sourceBounds(block.flatMap(member => [...regions[member]!.polygon]));
        const overlaps = blockers.some(other => other.left <= envelope.right && other.right >= envelope.left &&
            other.top <= envelope.bottom && other.bottom >= envelope.top);
        const horizontal = mergeFragments ? sourceLineBounds(lines, true) : lines;
        const vertical = mergeFragments ? sourceLineBounds(lines, false) : lines;
        const aligned = (mergeFragments && (horizontal.length === 1 || vertical.length === 1)) ||
            alignedSourceLines(horizontal, true) || alignedSourceLines(vertical, false);
        if (aligned && !overlaps) {
            frames.push({
                regionIndices: block.map(member => regions[member]!.regionIndex).sort((a, b) => a - b),
                polygon: [{ x: envelope.left, y: envelope.top }, { x: envelope.right, y: envelope.top },
                    { x: envelope.right, y: envelope.bottom }, { x: envelope.left, y: envelope.bottom }],
            });
        } else {
            for (const member of block) frames.push({ regionIndices: [regions[member]!.regionIndex], polygon: regions[member]!.polygon });
        }
    });
    return frames.sort((a, b) => a.regionIndices[0]! - b.regionIndices[0]!);
}

export function outsetSourceFrame(polygon: readonly CuPoint[], padding = 1): readonly CuPoint[] {
    sourceBounds(polygon);
    if (polygon.length < 3 || !Number.isFinite(padding) || padding < 0) {
        throw new GeometryError("invalid-source", "Source frame padding must be finite and nonnegative.");
    }
    const area = polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (!Number.isFinite(area) || area === 0) {
        throw new GeometryError("invalid-source", "Source frames must have a finite nonzero area.");
    }
    if (!padding) return polygon;
    const normals = polygon.map((point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        const dx = next.x - point.x, dy = next.y - point.y, length = Math.hypot(dx, dy);
        if (!length) throw new GeometryError("invalid-source", "Source frame edges must have positive lengths.");
        return { x: Math.sign(area) * dy / length, y: -Math.sign(area) * dx / length };
    });
    return polygon.map((point, index) => {
        const previous = normals[(index + normals.length - 1) % normals.length]!, next = normals[index]!;
        const denominator = 1 + previous.x * next.x + previous.y * next.y;
        if (denominator <= 0) throw new GeometryError("invalid-source", "Source frame corners must not reverse direction.");
        const dx = padding * (previous.x + next.x) / denominator, dy = padding * (previous.y + next.y) / denominator;
        // Keep acute annotation corners from creating long decorative spikes.
        const factor = Math.min(1, padding * 2 / Math.hypot(dx, dy));
        return { x: point.x + dx * factor, y: point.y + dy * factor };
    });
}

export function popoverPosition(anchor: SourceAnchor, viewport: PageSize, popup: PageSize): CuPoint | null {
    if (![anchor.x, anchor.y, anchor.width, anchor.height, viewport.width, viewport.height, popup.width, popup.height]
        .every(Number.isFinite) || anchor.width < 0 || anchor.height < 0 ||
        viewport.width <= 0 || viewport.height <= 0 || popup.width <= 0 || popup.height <= 0) {
        throw new GeometryError("invalid-popover-layout", "Source preview dimensions must be finite and positive.");
    }
    const margin = 8;
    if (anchor.x + anchor.width <= 0 || anchor.y + anchor.height <= 0 ||
        anchor.x >= viewport.width || anchor.y >= viewport.height) return null;
    const y = anchor.y + anchor.height + SOURCE_POPOVER_GAP;
    const bottomLimit = viewport.height - margin - popup.height;
    if (y < margin || y > bottomLimit + 1 || popup.width > viewport.width - margin * 2) return null;
    // Browser scroll/transform rounding must not hide an otherwise complete card.
    return { x: Math.max(margin, Math.min(anchor.x, viewport.width - popup.width - margin)), y: Math.min(y, bottomLimit) };
}
