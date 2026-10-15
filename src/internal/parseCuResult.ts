import type { CuContent, CuDetailItem, CuDetailRecord, CuDetailView, CuField, CuFigure, CuPage, CuParagraph, CuParseIssue, CuRegion, CuResultModel, CuSignature, CuTable, CuTableCell, CuWord } from "./types";
import { GeometryError, validateRegion } from "./geometry";
import { MAX_JSON_VALUES } from "./resultLimits";

const valueKeys = new Map([
    ["string", "valueString"],
    ["date", "valueDate"],
    ["time", "valueTime"],
    ["number", "valueNumber"],
    ["integer", "valueInteger"],
    ["boolean", "valueBoolean"],
    ["object", "valueObject"],
    ["array", "valueArray"],
]);

export class CuResultParseError extends Error {
    constructor(
        readonly code: string,
        readonly path: string,
        message: string,
    ) {
        super(message);
        this.name = "CuResultParseError";
    }
}

function fail(code: string, path: string, message: string): never {
    throw new CuResultParseError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPageNumber(value: unknown): value is number {
    return isPositiveNumber(value) && Number.isSafeInteger(value);
}

function pointerSegment(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function warn(issues: CuParseIssue[], code: string, path: string, message: string): void {
    issues.push({ code, path, message });
}

function optionalString(record: Record<string, unknown>, key: string, path: string): string | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string") fail("invalid-metadata", `${path}/${key}`, `${key} must be a string.`);
    return value;
}

function validateJsonValue(value: unknown, path: string): void {
    const active = new WeakSet<object>();
    const stack: { value: unknown; path: string; exit?: object }[] = [{ value, path }];
    while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) break;
        if (frame.exit) {
            active.delete(frame.exit);
            continue;
        }
        const current = frame.value;
        if (current === null || typeof current === "string" || typeof current === "boolean") continue;
        if (typeof current === "number" && Number.isFinite(current)) continue;
        if (!isRecord(current) && !isArray(current)) {
            fail("invalid-field-value", frame.path, "Field values must contain serialized JSON data.");
        }
        if (active.has(current)) fail("cyclic-input", frame.path, "Field values cannot contain cyclic references.");
        active.add(current);
        stack.push({ value: null, path: frame.path, exit: current });
        const entries: [string, unknown][] = isArray(current)
            ? Array.from(current, (entry: unknown, index) => [String(index), entry])
            : Object.entries(current);
        for (const [key, entry] of entries) {
            stack.push({ value: entry, path: `${frame.path}/${pointerSegment(key)}` });
        }
    }
}

function validateTypedValue(type: string, value: unknown, path: string): void {
    if (value === null) return;
    let valid: boolean;
    switch (type) {
        case "string":
        case "date":
        case "time":
            valid = typeof value === "string";
            break;
        case "number":
            valid = typeof value === "number" && Number.isFinite(value);
            break;
        case "integer":
            valid = typeof value === "number" && Number.isSafeInteger(value);
            break;
        case "boolean":
            valid = typeof value === "boolean";
            break;
        case "object":
            valid = isRecord(value);
            break;
        case "array":
            valid = isArray(value);
            break;
        default:
            validateJsonValue(value, path);
            return;
    }
    if (!valid) fail("invalid-field-value", path, `The value does not match field type ${type}.`);
}

function parsePages(raw: unknown, path: string, issues: CuParseIssue[]): CuPage[] {
    if (raw === undefined) return [];
    if (!isArray(raw)) fail("invalid-pages", path, "Pages must be an array.");
    const seen = new Set<number>();
    return raw.map((entry: unknown, index) => {
        const pagePath = `${path}/${index}`;
        if (!isRecord(entry) || !isPageNumber(entry.pageNumber)) {
            fail("invalid-page", pagePath, "A page must have a positive, one-based pageNumber.");
        }
        if (seen.has(entry.pageNumber)) fail("duplicate-page", pagePath, "Page numbers must be unique within a content item.");
        seen.add(entry.pageNumber);
        const page: CuPage = { pageNumber: entry.pageNumber };
        if (isPositiveNumber(entry.width) && isPositiveNumber(entry.height)) {
            page.width = entry.width;
            page.height = entry.height;
        } else {
            warn(issues, "invalid-page-dimensions", pagePath, "Page dimensions are unavailable; source regions cannot be mapped.");
        }
        if (entry.angle !== undefined) {
            if (typeof entry.angle === "number" && Number.isFinite(entry.angle)) page.textAngle = entry.angle;
            else warn(issues, "invalid-page-angle", `${pagePath}/angle`, "The supplied text angle is invalid.");
        }
        return page;
    });
}

function parseRegion(
    source: string,
    content: CuContent,
    pages: ReadonlyMap<number, CuPage>,
    path: string,
    issues: CuParseIssue[],
): CuRegion | undefined {
    const reject = (code: string, message: string): undefined => {
        warn(issues, code, path, message);
        return undefined;
    };
    const match = /^D\(([^()]*)\)$/.exec(source.trim());
    const body = match?.[1];
    if (body === undefined) return reject("invalid-source", "Source must use a CU D(...) region.");
    const parts = body.split(",").map(part => part.trim());
    const pageToken = parts.shift();
    if (!pageToken || !/^[1-9]\d*$/.test(pageToken)) {
        return reject("invalid-source", "Source must reference a positive, one-based page.");
    }
    const pageNumber = Number(pageToken);
    if (!Number.isSafeInteger(pageNumber)) return reject("invalid-source", "Source page number is invalid.");
    const page = pages.get(pageNumber);
    if (!page) return reject("missing-source-page", "The referenced source page is absent.");
    if (content.kind !== "document" || !content.unit || page.width === undefined || page.height === undefined) {
        return reject("unavailable-source-geometry", "Verified document units and page dimensions are required for a source region.");
    }
    if ((parts.length !== 4 && parts.length !== 8) ||
        parts.some(part => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(part))) {
        return reject("invalid-source", "Source must contain a rectangle or four-point polygon.");
    }
    const numbers = parts.map(Number);
    if (numbers.some(value => !Number.isFinite(value))) return reject("invalid-source", "Source coordinates must be finite.");
    const [a, b, c, d, e, f, g, h] = numbers;
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
        return reject("invalid-source", "Source coordinates are incomplete.");
    }
    let polygon: CuRegion["polygon"];
    if (parts.length === 4) {
        if (c <= 0 || d <= 0) return reject("invalid-source", "Source rectangle dimensions must be positive.");
        polygon = [{ x: a, y: b }, { x: a + c, y: b }, { x: a + c, y: b + d }, { x: a, y: b + d }];
    } else {
        if (e === undefined || f === undefined || g === undefined || h === undefined) {
            return reject("invalid-source", "Source polygon coordinates are incomplete.");
        }
        polygon = [{ x: a, y: b }, { x: c, y: d }, { x: e, y: f }, { x: g, y: h }];
    }
    try {
        validateRegion({ pageNumber, polygon }, page);
    } catch (error) {
        if (!(error instanceof GeometryError)) throw error;
        return reject(error.code, error.message);
    }
    return { pageNumber, polygon };
}

interface FieldFrame {
    raw: unknown;
    name: string;
    id: string;
    path: string;
    destination: CuField[];
    exit?: object;
}

function parseSource(
    raw: unknown, content: CuContent, path: string, issues: CuParseIssue[],
    pages: ReadonlyMap<number, CuPage> = new Map(content.pages.map(page => [page.pageNumber, page])),
): { source?: string; regions: CuRegion[] } {
    const regions: CuRegion[] = [];
    if (raw === undefined || raw === null) return { regions };
    if (typeof raw !== "string") {
        warn(issues, "invalid-source", path, "Source must be a CU encoded string.");
        return { regions };
    }
    for (const text of raw.split(";")) {
        const region = parseRegion(text, content, pages, path, issues);
        if (region) regions.push(region);
    }
    return { source: raw, regions };
}

function parseFields(raw: unknown, content: CuContent, rootPath: string, issues: CuParseIssue[]): CuField[] {
    if (raw === undefined) return [];
    if (!isRecord(raw)) fail("invalid-fields", `${rootPath}/fields`, "Fields must be an object.");
    const fields: CuField[] = [];
    const active = new WeakSet<object>();
    const stack: FieldFrame[] = [];
    const pushFields = (entries: [string, unknown][], id: string, path: string, destination: CuField[]): void => {
        for (const [name, value] of entries.slice().reverse()) {
            stack.push({
                raw: value,
                name,
                id: `${id}/${pointerSegment(name)}`,
                path: `${path}/${pointerSegment(name)}`,
                destination,
            });
        }
    };
    pushFields(Object.entries(raw), `${content.id}/fields`, `${rootPath}/fields`, fields);
    while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) break;
        if (frame.exit) {
            active.delete(frame.exit);
            continue;
        }
        if (!isRecord(frame.raw) || typeof frame.raw.type !== "string" || frame.raw.type.length === 0) {
            fail("invalid-field", frame.path, "Each field must have a nonempty type.");
        }
        const type = frame.raw.type;
        const field = frame.raw;
        if (active.has(field)) fail("cyclic-input", frame.path, "Field relationships cannot contain cyclic references.");
        active.add(field);
        stack.push({ ...frame, exit: field });
        const typedKeys = Object.keys(field).filter(key => /^value[A-Z]/.test(key));
        const knownKey = valueKeys.get(type);
        if (typedKeys.length > 1 || (knownKey && typedKeys.some(key => key !== knownKey))) {
            fail("invalid-field-value", frame.path, "The field has conflicting or mismatched typed value keys.");
        }
        const valueKey = knownKey ?? typedKeys[0];
        if (!knownKey) warn(issues, "unverified-field-type", `${frame.path}/type`, "This field type is retained as opaque JSON; richer type-specific behavior is not verified.");
        const hasValue = valueKey !== undefined && Object.hasOwn(field, valueKey);
        const value = hasValue && valueKey ? field[valueKey] : undefined;
        if (hasValue) validateTypedValue(type, value, `${frame.path}/${valueKey ?? ""}`);
        const node: CuField = {
            id: frame.id, path: frame.path, name: frame.name, type,
            hasValue, value, children: [], regions: [],
        };
        if (valueKey) node.valueKey = valueKey;
        frame.destination.push(node);
        if (field.confidence !== undefined && field.confidence !== null) {
            if (typeof field.confidence === "number" && Number.isFinite(field.confidence) &&
                field.confidence >= 0 && field.confidence <= 1) node.confidence = field.confidence;
            else warn(issues, "invalid-confidence", `${frame.path}/confidence`, "Confidence must be a finite number from 0 to 1.");
        }
        Object.assign(node, parseSource(field.source, content, `${frame.path}/source`, issues));
        if (type === "object" && isRecord(value)) {
            pushFields(Object.entries(value), `${frame.id}/valueObject`, `${frame.path}/valueObject`, node.children);
        } else if (type === "array" && isArray(value)) {
            const entries: [string, unknown][] = Array.from(value, (entry: unknown, index) => [String(index), entry]);
            pushFields(entries, `${frame.id}/valueArray`, `${frame.path}/valueArray`, node.children);
        }
    }
    return fields;
}

function parseDetails(raw: unknown, path: string, issues: CuParseIssue[]): { raw: CuDetailRecord; index: number }[] | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!isArray(raw)) {
        warn(issues, "invalid-content-detail", path, "Result details must be an array of objects.");
        return undefined;
    }
    return raw.flatMap((entry: unknown, index) => {
        if (isRecord(entry)) return [{ raw: entry, index }];
        warn(issues, "invalid-content-detail", `${path}/${index}`, "Each result detail must be an object.");
        return [];
    });
}

function detailString(raw: CuDetailRecord, key: string, path: string, issues: CuParseIssue[], required = false): string | undefined {
    const value = raw[key];
    if (typeof value === "string") return value;
    if (required || (value !== undefined && value !== null)) {
        warn(issues, "invalid-content-detail", `${path}/${key}`, `${key} must be a string.`);
    }
    return undefined;
}

function parsePageWords(raw: unknown, content: CuContent, path: string, issues: CuParseIssue[]): void {
    if (raw === undefined) return;
    if (!isArray(raw)) fail("invalid-pages", path, "Pages must be an array.");
    const pages = new Map(content.pages.map(page => [page.pageNumber, page]));
    for (const [pageIndex, entry] of raw.entries()) {
        const page = content.pages[pageIndex];
        if (!isRecord(entry) || !page) throw new Error("The parsed word page is unavailable.");
        const wordPath = `${path}/${pageIndex}/words`;
        const entries = parseDetails(entry.words, wordPath, issues);
        if (entries === undefined) continue;
        page.words = entries.flatMap(({ raw: word, index }) => {
            const itemPath = `${wordPath}/${index}`;
            const text = detailString(word, "content", itemPath, issues, true);
            if (text === undefined) return [];
            const parsed: CuWord = { id: `${content.id}/pages/${pageIndex}/words/${index}`, content: text };
            const region = parseSource(word.source, content, `${itemPath}/source`, issues, pages).regions[0];
            if (region) {
                if (region.pageNumber === page.pageNumber) parsed.region = region;
                else warn(issues, "source-page-mismatch", `${itemPath}/source`, "A word source must belong to its containing page.");
            }
            return [parsed];
        });
    }
}

function detailItem(
    raw: CuDetailRecord, content: CuContent, suffix: string, path: string, name: string,
    value: string, view: CuDetailView, issues: CuParseIssue[],
): CuDetailItem {
    const id = `${content.id}/${suffix}`;
    const field: CuField = {
        id, path, name, type: "string", hasValue: true, value, children: [],
        detailView: view, ...parseSource(raw.source, content, `${path}/source`, issues),
    };
    const item: CuDetailItem = { id, raw, field };
    const role = detailString(raw, "role", path, issues);
    if (role !== undefined) item.role = role;
    return item;
}

function captionText(raw: unknown, path: string, issues: CuParseIssue[]): string | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (isRecord(raw) && typeof raw.content === "string") return raw.content;
    warn(issues, "invalid-content-detail", path, "Caption or footnote must have string content.");
    return undefined;
}

function footnoteTexts(raw: unknown, path: string, issues: CuParseIssue[]): string[] {
    if (raw === undefined || raw === null) return [];
    if (!isArray(raw)) {
        warn(issues, "invalid-content-detail", path, "Footnotes must be an array.");
        return [];
    }
    return raw.flatMap((entry, index) => {
        const text = captionText(entry, `${path}/${index}`, issues);
        return text === undefined ? [] : [text];
    });
}

function parseParagraphs(raw: unknown, content: CuContent, path: string, issues: CuParseIssue[]): CuParagraph[] | undefined {
    return parseDetails(raw, path, issues)?.flatMap(({ raw: entry, index }) => {
        const itemPath = `${path}/${index}`;
        const text = detailString(entry, "content", itemPath, issues, true);
        if (text === undefined) return [];
        return [{ ...detailItem(entry, content, `paragraphs/${index}`, itemPath, `Paragraph ${index + 1}`, text, "paragraphs", issues), content: text }];
    });
}

function parseFigures(raw: unknown, content: CuContent, path: string, issues: CuParseIssue[]): CuFigure[] | undefined {
    return parseDetails(raw, path, issues)?.flatMap(({ raw: entry, index }) => {
        const itemPath = `${path}/${index}`;
        const figureId = detailString(entry, "id", itemPath, issues, true);
        if (figureId === undefined) return [];
        const kind = detailString(entry, "kind", itemPath, issues) ?? "unknown";
        const caption = captionText(entry.caption, `${itemPath}/caption`, issues);
        const description = detailString(entry, "description", itemPath, issues);
        const item: CuFigure = {
            ...detailItem(entry, content, `figures/${index}`, itemPath, `Figure ${index + 1}`,
                description ?? caption ?? figureId, "figures", issues),
            figureId, kind, footnotes: footnoteTexts(entry.footnotes, `${itemPath}/footnotes`, issues),
        };
        if (caption !== undefined) item.caption = caption;
        if (description !== undefined) item.description = description;
        return [item];
    });
}

function parseSignatures(raw: unknown, content: CuContent, path: string, issues: CuParseIssue[]): CuSignature[] | undefined {
    return parseDetails(raw, path, issues)?.flatMap(({ raw: entry, index }) => {
        const itemPath = `${path}/${index}`;
        const signatureId = detailString(entry, "id", itemPath, issues, true);
        if (signatureId === undefined) return [];
        return [{
            ...detailItem(entry, content, `signatures/${index}`, itemPath, `Signature ${index + 1}`,
                signatureId, "signatures", issues),
            signatureId,
        }];
    });
}

function parseTables(raw: unknown, content: CuContent, path: string, issues: CuParseIssue[]): CuTable[] | undefined {
    return parseDetails(raw, path, issues)?.flatMap(({ raw: entry, index }) => {
        const tablePath = `${path}/${index}`;
        if (!isPageNumber(entry.rowCount) || !isPageNumber(entry.columnCount) || !isArray(entry.cells)) {
            warn(issues, "invalid-content-detail", tablePath, "Tables require positive rowCount/columnCount and a cells array.");
            return [];
        }
        const table: CuTable = {
            ...detailItem(entry, content, `tables/${index}`, tablePath, `Table ${index + 1}`,
                `Table ${index + 1}`, "tables", issues),
            rowCount: entry.rowCount, columnCount: entry.columnCount, cells: [], rows: [],
            footnotes: footnoteTexts(entry.footnotes, `${tablePath}/footnotes`, issues),
        };
        const caption = captionText(entry.caption, `${tablePath}/caption`, issues);
        if (caption !== undefined) table.caption = caption;
        for (const [cellIndex, rawCell] of entry.cells.entries()) {
            const cellPath = `${tablePath}/cells/${cellIndex}`;
            if (!isRecord(rawCell)) {
                warn(issues, "invalid-content-detail", cellPath, "A table cell must be an object.");
                table.layoutError = "The table contains invalid cells. Inspect the original data in Result.";
                continue;
            }
            const { rowIndex, columnIndex } = rawCell;
            const rowSpan = rawCell.rowSpan === undefined ? 1 : rawCell.rowSpan;
            const columnSpan = rawCell.columnSpan === undefined ? 1 : rawCell.columnSpan;
            const text = detailString(rawCell, "content", cellPath, issues, true);
            if (typeof rowIndex !== "number" || !Number.isSafeInteger(rowIndex) || rowIndex < 0 ||
                typeof columnIndex !== "number" || !Number.isSafeInteger(columnIndex) || columnIndex < 0 ||
                !isPageNumber(rowSpan) || !isPageNumber(columnSpan) ||
                rowIndex + rowSpan > table.rowCount || columnIndex + columnSpan > table.columnCount || text === undefined) {
                warn(issues, "invalid-content-detail", cellPath, "Table cell coordinates/spans must fit the declared grid and have string content.");
                table.layoutError = "The table contains invalid cells. Inspect the original data in Result.";
                continue;
            }
            const cell: CuTableCell = {
                ...detailItem(rawCell, content, `tables/${index}/cells/${cellIndex}`, cellPath,
                    `Table ${index + 1}, row ${rowIndex + 1}, column ${columnIndex + 1}`, text, "tables", issues),
                content: text, kind: detailString(rawCell, "kind", cellPath, issues) ?? "content",
                rowIndex, columnIndex, rowSpan, columnSpan,
            };
            table.cells.push(cell);
        }
        if (table.rowCount * table.columnCount > MAX_JSON_VALUES) {
            table.layoutError = `Table exceeds the ${MAX_JSON_VALUES.toLocaleString("en-US")}-position result rendering limit.`;
        }
        if (!table.layoutError) {
            table.rows = Array.from({ length: table.rowCount }, () =>
                Array<CuTableCell | null | undefined>(table.columnCount).fill(null));
            for (const cell of table.cells) {
                for (let row = cell.rowIndex; row < cell.rowIndex + cell.rowSpan; row++) {
                    const positions = table.rows[row];
                    if (!positions) throw new Error("Parsed table row is unavailable.");
                    for (let column = cell.columnIndex; column < cell.columnIndex + cell.columnSpan; column++) {
                        if (positions[column] !== null) {
                            table.layoutError = "Table cell spans overlap. Inspect the original data in Result.";
                            warn(issues, "invalid-content-detail", cell.field.path, table.layoutError);
                        }
                        positions[column] = undefined;
                    }
                }
                const positions = table.rows[cell.rowIndex];
                if (!positions) throw new Error("Parsed table row is unavailable.");
                positions[cell.columnIndex] = cell;
            }
            if (table.layoutError) table.rows = [];
        }
        return [table];
    });
}

function parseMetadata(raw: unknown, path: string, issues: CuParseIssue[]): Record<string, string> | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!isRecord(raw)) {
        warn(issues, "invalid-content-metadata", path, "Content metadata must be an object of string values.");
        return undefined;
    }
    const entries: [string, string][] = [];
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string") entries.push([key, value]);
        else warn(issues, "invalid-content-metadata", `${path}/${pointerSegment(key)}`, "Metadata values must be strings.");
    }
    return Object.fromEntries(entries);
}

export function parseCuResult(input: unknown): CuResultModel {
    if (!isRecord(input)) fail("invalid-result", "", "Pass parsed serialized CU JSON as an object.");
    let result = input;
    let rootPath = "";
    if (Object.hasOwn(input, "result")) {
        if (input.status !== "Succeeded") fail("analysis-not-succeeded", "/status", "The supplied CU operation has not succeeded.");
        if (!isRecord(input.result)) fail("invalid-result", "/result", "The CU operation result must be an object.");
        result = input.result;
        rootPath = "/result";
    }
    if (result.apiVersion !== "2025-11-01" && result.apiVersion !== "2026-06-01-preview") {
        fail("unsupported-api-version", `${rootPath}/apiVersion`, "Supported CU API versions are 2025-11-01 and 2026-06-01-preview.");
    }
    if (!isArray(result.contents)) fail("invalid-contents", `${rootPath}/contents`, "The CU result must contain a contents array.");
    const model: CuResultModel = { apiVersion: result.apiVersion, original: input, contents: [], issues: [] };
    const analyzerId = optionalString(result, "analyzerId", rootPath);
    if (analyzerId !== undefined) model.analyzerId = analyzerId;
    for (const [index, entry] of result.contents.entries()) {
        const id = `/contents/${index}`;
        const path = `${rootPath}${id}`;
        if (!isRecord(entry) || typeof entry.kind !== "string" || entry.kind.length === 0) {
            fail("invalid-content", path, "A content item must have a nonempty kind.");
        }
        const content: CuContent = {
            id, kind: entry.kind,
            pages: parsePages(entry.pages, `${path}/pages`, model.issues),
            fields: [],
        };
        if (entry.kind !== "document") warn(model.issues, "unverified-content-kind", `${path}/kind`, "Fields are retained, but source geometry is only verified for document contents.");
        if (entry.unit === "inch" || entry.unit === "pixel") content.unit = entry.unit;
        else if (entry.unit !== undefined) warn(model.issues, "unverified-unit", `${path}/unit`, "Only verified inch/pixel source units can be mapped.");
        parsePageWords(entry.pages, content, `${path}/pages`, model.issues);
        const markdown = optionalString(entry, "markdown", path);
        if (markdown !== undefined) content.markdown = markdown;
        const contentAnalyzerId = optionalString(entry, "analyzerId", path);
        if (contentAnalyzerId !== undefined) content.analyzerId = contentAnalyzerId;
        const paragraphs = parseParagraphs(entry.paragraphs, content, `${path}/paragraphs`, model.issues);
        const tables = parseTables(entry.tables, content, `${path}/tables`, model.issues);
        const figures = parseFigures(entry.figures, content, `${path}/figures`, model.issues);
        if (paragraphs !== undefined) content.paragraphs = paragraphs;
        if (tables !== undefined) content.tables = tables;
        if (figures !== undefined) content.figures = figures;
        if (model.apiVersion !== "2026-06-01-preview" && entry.signatures !== undefined && entry.signatures !== null) {
            warn(model.issues, "unverified-content-property", `${path}/signatures`,
                "Signatures are only mapped for 2026-06-01-preview; inspect the original data in Result.");
        }
        if (model.apiVersion === "2026-06-01-preview") {
            const signatures = parseSignatures(entry.signatures, content, `${path}/signatures`, model.issues);
            if (signatures !== undefined) content.signatures = signatures;
            const metadata = parseMetadata(entry.metadata, `${path}/metadata`, model.issues);
            if (metadata !== undefined) content.metadata = metadata;
        } else if (entry.metadata !== undefined && entry.metadata !== null) {
            warn(model.issues, "unverified-content-property", `${path}/metadata`,
                "Content metadata is only mapped for 2026-06-01-preview; inspect the original data in Result.");
        }
        for (const key of ["startPageNumber", "endPageNumber"] as const) {
            if (entry[key] !== undefined) {
                if (!isPageNumber(entry[key])) fail("invalid-page-range", `${path}/${key}`, "Content page ranges must use positive page numbers.");
                content[key] = entry[key];
            }
        }
        if (content.startPageNumber !== undefined && content.endPageNumber !== undefined &&
            content.startPageNumber > content.endPageNumber) {
            fail("invalid-page-range", path, "The content page range is reversed.");
        }
        content.fields = parseFields(entry.fields, content, path, model.issues);
        model.contents.push(content);
    }
    return model;
}
