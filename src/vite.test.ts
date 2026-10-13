import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";
import { viewerAssets } from "./vite";

describe("optional Node-only viewer resource plugin", () => {
    it("uses the host asset directory without changing the React entry", async () => {
        const plugin = viewerAssets();
        const config = await resolveConfig({
            configFile: false,
            plugins: [plugin],
            build: { outDir: "dist-plugin-check", assetsDir: "host-assets" },
        }, "build");
        expect(config.plugins.some(value => value.name === "local-cu-viewer-pdf-assets")).toBe(true);
        expect(config.build.assetsDir).toBe("host-assets");
    });

    it.each([".", "..", join("..", "outside"), resolve("..", "outside-cu-viewer-assets")])("rejects unsafe output path %s", async path => {
        await expect(resolveConfig({
            configFile: false,
            plugins: [viewerAssets(path)],
            build: { outDir: "dist-plugin-check" },
        }, "build")).rejects.toThrow("non-root subdirectory");
    });

    it("accepts the repository's explicit library resource subdirectory", async () => {
        await expect(resolveConfig({
            configFile: false,
            plugins: [viewerAssets("pdfjs")],
            build: { outDir: "dist-plugin-check" },
        }, "build")).resolves.toMatchObject({ build: { outDir: "dist-plugin-check" } });
    });
});
import { join, resolve } from "node:path";
