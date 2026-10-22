import type { CuPage, CuPoint, CuRegion } from "../model/types";

export interface PageSize {
    width: number;
    height: number;
}

export interface ViewTransform {
    zoom: number;
    rotation: number;
    pan: CuPoint;
}

export interface AffineMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

export interface PageGeometry {
    pageNumber: number;
    cuSize: PageSize;
    sourceSize: PageSize;
    displaySize: PageSize;
    matrix: AffineMatrix;
    inverse: AffineMatrix;
}

export class GeometryError extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
        this.name = "GeometryError";
    }
}

function positive(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value > 0;
}

function pageSize(size: { width?: number; height?: number }): PageSize {
    if (!positive(size.width) || !positive(size.height)) {
        throw new GeometryError("invalid-page-dimensions", "Finite positive page dimensions are required.");
    }
    return { width: size.width, height: size.height };
}

function point(value: CuPoint): void {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
        throw new GeometryError("invalid-point", "Point coordinates must be finite.");
    }
}

function rotation(value: number): 0 | 90 | 180 | 270 {
    if (!Number.isSafeInteger(value) || value % 90 !== 0) {
        throw new GeometryError("invalid-rotation", "Rotation must be an integer multiple of 90 degrees.");
    }
    const normalized = ((value % 360) + 360) % 360;
    if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
        return normalized;
    }
    throw new GeometryError("invalid-rotation", "Rotation cannot be represented.");
}

function finiteMatrix(matrix: AffineMatrix): AffineMatrix {
    if (Object.values(matrix).some(value => !Number.isFinite(value))) {
        throw new GeometryError("unrepresentable-transform", "The transform exceeds finite numeric range.");
    }
    return matrix;
}

function invert(matrix: AffineMatrix): AffineMatrix {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!Number.isFinite(determinant) || determinant === 0) {
        throw new GeometryError("unrepresentable-transform", "The transform has no finite inverse.");
    }
    const a = matrix.d / determinant;
    const b = -matrix.b / determinant;
    const c = -matrix.c / determinant;
    const d = matrix.a / determinant;
    return finiteMatrix({
        a, b, c, d,
        e: -(a * matrix.e + c * matrix.f),
        f: -(b * matrix.e + d * matrix.f),
    });
}

export function validateRegion(region: CuRegion, page: CuPage): void {
    const size = pageSize(page);
    if (!Number.isSafeInteger(region.pageNumber) || region.pageNumber <= 0 ||
        region.pageNumber !== page.pageNumber) {
        throw new GeometryError("source-page-mismatch", "The source region does not belong to this page.");
    }
    for (const value of region.polygon) {
        if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
            throw new GeometryError("invalid-source", "Source polygon coordinates must be finite.");
        }
        if (value.x < 0 || value.y < 0 || value.x > size.width || value.y > size.height) {
            throw new GeometryError("source-out-of-bounds", "Source coordinates exceed the referenced page dimensions.");
        }
    }
    const [p1, p2, p3, p4] = region.polygon;
    const area = p1.x * p2.y - p2.x * p1.y + p2.x * p3.y - p3.x * p2.y +
        p3.x * p4.y - p4.x * p3.y + p4.x * p1.y - p1.x * p4.y;
    if (!Number.isFinite(area) || area === 0) {
        throw new GeometryError("invalid-source", "Source polygon area is invalid.");
    }
}

// renderedPage is the CU-aligned CSS frame; CU textAngle is not a viewer rotation.
export function createPageGeometry(page: CuPage, renderedPage: PageSize, view: ViewTransform): PageGeometry {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber <= 0) {
        throw new GeometryError("invalid-page", "A positive one-based page number is required.");
    }
    const cuSize = pageSize(page);
    const sourceSize = pageSize(renderedPage);
    if (!positive(view.zoom)) throw new GeometryError("invalid-zoom", "Zoom must be finite and positive.");
    point(view.pan);
    const angle = rotation(view.rotation);
    const width = sourceSize.width * view.zoom;
    const height = sourceSize.height * view.zoom;
    const scaleX = width / cuSize.width;
    const scaleY = height / cuSize.height;
    const x = view.pan.x;
    const y = view.pan.y;
    let matrix: AffineMatrix;
    switch (angle) {
        case 0:
            matrix = { a: scaleX, b: 0, c: 0, d: scaleY, e: x, f: y };
            break;
        case 90:
            matrix = { a: 0, b: scaleX, c: -scaleY, d: 0, e: height + x, f: y };
            break;
        case 180:
            matrix = { a: -scaleX, b: 0, c: 0, d: -scaleY, e: width + x, f: height + y };
            break;
        case 270:
            matrix = { a: 0, b: -scaleX, c: scaleY, d: 0, e: x, f: width + y };
            break;
    }
    finiteMatrix(matrix);
    return {
        pageNumber: page.pageNumber,
        cuSize,
        sourceSize,
        displaySize: angle % 180 === 0 ? { width, height } : { width: height, height: width },
        matrix,
        inverse: invert(matrix),
    };
}

export function transformPoint(matrix: AffineMatrix, value: CuPoint): CuPoint {
    finiteMatrix(matrix);
    point(value);
    const transformed = {
        x: matrix.a * value.x + matrix.c * value.y + matrix.e,
        y: matrix.b * value.x + matrix.d * value.y + matrix.f,
    };
    point(transformed);
    return transformed;
}

export function projectRegion(region: CuRegion, geometry: PageGeometry): CuRegion {
    validateRegion(region, { pageNumber: geometry.pageNumber, ...geometry.cuSize });
    const [p1, p2, p3, p4] = region.polygon;
    return {
        pageNumber: region.pageNumber,
        polygon: [
            transformPoint(geometry.matrix, p1),
            transformPoint(geometry.matrix, p2),
            transformPoint(geometry.matrix, p3),
            transformPoint(geometry.matrix, p4),
        ],
    };
}

export function getFitZoom(source: PageSize, available: PageSize, angle: number, mode: "page" | "width"): number {
    const sourceSize = pageSize(source);
    const viewport = pageSize(available);
    const rotate = rotation(angle);
    const width = rotate % 180 === 0 ? sourceSize.width : sourceSize.height;
    const height = rotate % 180 === 0 ? sourceSize.height : sourceSize.width;
    if (mode !== "page" && mode !== "width") throw new GeometryError("invalid-fit-mode", "Fit mode must be page or width.");
    const zoom = mode === "width" ? viewport.width / width : Math.min(viewport.width / width, viewport.height / height);
    if (!positive(zoom)) throw new GeometryError("unrepresentable-transform", "The fit zoom cannot be represented.");
    return zoom;
}

export function getRasterSize(display: PageSize, devicePixelRatio: number): PageSize {
    const size = pageSize(display);
    if (!positive(devicePixelRatio)) throw new GeometryError("invalid-pixel-ratio", "Device pixel ratio must be finite and positive.");
    const width = Math.ceil(size.width * devicePixelRatio);
    const height = Math.ceil(size.height * devicePixelRatio);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
        throw new GeometryError("unrepresentable-transform", "Raster dimensions exceed finite integer range.");
    }
    return { width, height };
}

export function getRevealOffset(points: readonly CuPoint[], viewport: PageSize): CuPoint {
    const size = pageSize(viewport);
    if (points.length === 0) throw new GeometryError("invalid-source", "A source region is required for viewport navigation.");
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const value of points) {
        point(value);
        left = Math.min(left, value.x);
        right = Math.max(right, value.x);
        top = Math.min(top, value.y);
        bottom = Math.max(bottom, value.y);
    }
    const offset = {
        x: left < 0 || right > size.width ? size.width / 2 - (left + right) / 2 : 0,
        y: top < 0 || bottom > size.height ? size.height / 2 - (top + bottom) / 2 : 0,
    };
    point(offset);
    return offset;
}
