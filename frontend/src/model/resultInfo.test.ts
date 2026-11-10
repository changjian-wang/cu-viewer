import { describe, expect, it } from "vitest";
import { resultInfoEntries } from "./resultInfo";

describe("result-wide Info data", () => {
    it("orders every content's metadata before envelope usage, result infos and warnings without changing input", () => {
        const input = {
            status: "Succeeded", warnings: ["Not result warnings"], infos: ["Not result infos"],
            result: { contents: [{ metadata: { Zebra: "First" } }, {}, { metadata: { Author: "Second" } }],
                infos: [{ code: "Details", message: "Returned info" }], warnings: [] },
            usage: { pages: 0 },
        };
        const before = JSON.stringify(input);
        const entries = resultInfoEntries(input);
        expect(entries.map(entry => entry.name)).toEqual(["metadata", "usage", "infos", "warnings"]);
        expect(entries.map(entry => entry.path)).toEqual([
            "$metadata", "/usage", "/result/infos", "/result/warnings",
        ]);
        expect(entries[0]?.children).toEqual([
            { name: "contents[0]", path: "/result/contents/0/metadata", value: input.result.contents[0]?.metadata },
            { name: "contents[2]", path: "/result/contents/2/metadata", value: input.result.contents[2]?.metadata },
        ]);
        expect(entries[0]?.children?.[0]?.value).toBe(input.result.contents[0]?.metadata);
        expect(entries[1]?.value).toBe(input.usage);
        expect(entries[3]?.value).toEqual([]);
        expect(JSON.stringify(input)).toBe(before);
    });

    it("supports inner results and retains explicitly returned null, empty objects and arrays", () => {
        expect(resultInfoEntries({ contents: [{ metadata: {} }, { metadata: null }], usage: 0, infos: [], warnings: null }))
            .toEqual([
                { name: "metadata", path: "$metadata", value: { "contents[0]": {}, "contents[1]": null }, children: [
                    { name: "contents[0]", path: "/contents/0/metadata", value: {} },
                    { name: "contents[1]", path: "/contents/1/metadata", value: null },
                ] },
                { name: "usage", path: "/usage", value: 0 },
                { name: "infos", path: "/infos", value: [] },
                { name: "warnings", path: "/warnings", value: null },
            ]);
    });

    it("retains the content layer for one metadata group without changing the source path or value", () => {
        const metadata = { language: "en-US" };
        expect(resultInfoEntries({ result: { contents: [{ metadata }] } }))
            .toEqual([{ name: "metadata", path: "$metadata", value: { "contents[0]": metadata },
                children: [{ name: "contents[0]", path: "/result/contents/0/metadata", value: metadata }] }]);
    });

    it("omits absent sections and never confuses result usage with envelope usage", () => {
        expect(resultInfoEntries({ result: { contents: [], usage: { ignored: true } } })).toEqual([]);
        expect(resultInfoEntries({ result: { contents: [] }, usage: { pages: 1 } }).map(entry => entry.name)).toEqual(["usage"]);
        expect(resultInfoEntries(null)).toEqual([]);
        expect(resultInfoEntries({ result: null })).toEqual([]);
    });
});
