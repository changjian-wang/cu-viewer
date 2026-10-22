import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ContentUnderstandingResultViewerProps, ViewerSource } from "./index";

describe("public viewer input contract", () => {
    it("keeps the exact source union", () => {
        expectTypeOf<ViewerSource>().toEqualTypeOf<File | Blob | ArrayBuffer | string>();
        expectTypeOf<ContentUnderstandingResultViewerProps["source"]>().toEqualTypeOf<ViewerSource>();
    });

    it("keeps the original serialized result unknown", () => {
        expectTypeOf<ContentUnderstandingResultViewerProps["result"]>().toBeUnknown();
    });

    it("allows each proposed source form without an SDK model", () => {
        const blob = new Blob(["source bytes"], { type: "application/pdf" });
        const file = new File([blob], "sample.pdf", { type: blob.type });
        const buffer = new ArrayBuffer(8);
        const url = "https://example.invalid/sample.pdf";
        const sources: ViewerSource[] = [file, blob, buffer, url];

        for (const source of sources) {
            const props: ContentUnderstandingResultViewerProps = { source, result: {} };
            expect(props.source).toBe(source);
        }
    });

    it("accepts the saved CLI JSON unchanged at the type boundary", () => {
        const rawResult: unknown = JSON.parse(
            readFileSync(resolve("tests", "fixtures", "receipt.cu.json"), "utf8"),
        );
        const props: ContentUnderstandingResultViewerProps = {
            source: new Blob(["source bytes"]),
            result: rawResult,
        };

        expect(props.result).toBe(rawResult);
    });
});
