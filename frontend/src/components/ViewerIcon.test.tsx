import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getFileIconName, ViewerIcon } from "./ViewerIcon";

describe("source filename icons", () => {
    it("renders the Fluent PDF glyph with its native filled 16px coordinate system", () => {
        const svg = renderToStaticMarkup(<ViewerIcon name="filePdf" />);
        expect(svg).toContain('viewBox="0 0 16 16"');
        expect(svg).toContain('fill="currentColor"');
        expect(svg).toContain('stroke="none"');
        expect(svg).toContain('aria-hidden="true"');
        expect(svg).toContain('focusable="false"');
        expect(svg).toContain('d="M2.5 10C3.32843');
    });

    it.each(["fileImage", "fileDocument", "fileSpreadsheet", "fileSlides",
        "fileBook", "fileText", "fileCode", "fileMail"] as const)("renders %s with native Fluent 16px geometry", name => {
        const svg = renderToStaticMarkup(<ViewerIcon name={name} />);
        expect(svg).toContain('viewBox="0 0 16 16"');
        expect(svg).toContain('fill="currentColor"');
        expect(svg).toContain('stroke="none"');
        expect(svg).toContain('aria-hidden="true"');
        expect(svg).toContain('focusable="false"');
    });

    it("keeps all nine type glyphs visually distinct", () => {
        const names = ["filePdf", "fileImage", "fileDocument", "fileSpreadsheet", "fileSlides",
            "fileBook", "fileText", "fileCode", "fileMail"] as const;
        const shapes = names.map(name => renderToStaticMarkup(<ViewerIcon name={name} />));
        expect(new Set(shapes).size).toBe(9);
    });

    it.each(["file", "rotate", "settings"] as const)("preserves the original outline rendering for %s", name => {
        const svg = renderToStaticMarkup(<ViewerIcon name={name} />);
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).toContain('fill="none"');
        expect(svg).toContain('stroke="currentColor"');
    });

    it.each([
        ["filePdf", ["pdf"]],
        ["fileImage", ["tiff", "jpg", "jpeg", "jpe", "png", "bmp", "heif", "heic"]],
        ["fileDocument", ["doc", "docx", "docm", "odt", "rtf"]],
        ["fileSpreadsheet", ["xls", "xlsx", "xlsm", "ods", "csv", "tsv"]],
        ["fileSlides", ["ppt", "pptx", "pptm", "odp"]],
        ["fileBook", ["epub"]],
        ["fileText", ["txt", "md"]],
        ["fileCode", ["html", "xml", "json", "kml"]],
        ["fileMail", ["eml", "msg"]],
    ] as const)("maps every %s extension case-insensitively", (icon, extensions) => {
        for (const extension of extensions) {
            expect(getFileIconName(`source.${extension}`)).toBe(icon);
            expect(getFileIconName(`source.${extension.toUpperCase()}`)).toBe(icon);
        }
    });

    it.each([undefined, "", "source", ".pdf", "source.", "archive.tar.gz", "source.unknown",
        "source.constructor", "source.__proto__", "source.toString", "source.pdf?token=abc"])(
        "retains the original generic icon for %s", name => {
            expect(getFileIconName(name)).toBe("file");
        });

    it("uses only the final extension, not earlier tokens in the filename", () => {
        expect(getFileIconName("source.pdf.json")).toBe("fileCode");
        expect(getFileIconName(".hidden.invoice.PDF")).toBe("filePdf");
    });
});
