import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const root = process.env.CU_PACKED_CONSUMER_ROOT;
if (!root) throw new Error("Prepare isolated consumers and set CU_PACKED_CONSUMER_ROOT before running package tests.");
const mode = process.env.CU_PACKED_CONSUMER_MODE ?? "production";
if (mode !== "production" && mode !== "development") throw new Error("Unknown packed-consumer mode.");
const inventory: unknown = JSON.parse(readFileSync(resolve(root, "consumers.json"), "utf8"));
if (!inventory || typeof inventory !== "object" || !("profiles" in inventory) || !Array.isArray(inventory.profiles)) {
    throw new Error("The isolated consumer inventory is invalid.");
}
const profiles = inventory.profiles.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("name" in entry) || !("react" in entry) ||
        !("directory" in entry) || !("port" in entry) ||
        typeof entry.name !== "string" || typeof entry.react !== "string" || typeof entry.directory !== "string" ||
        typeof entry.port !== "number" || !Number.isSafeInteger(entry.port) || entry.port < 1024 || entry.port > 65535) {
        throw new Error("An isolated React consumer profile is invalid.");
    }
    return { name: entry.name, react: entry.react, directory: entry.directory, port: entry.port };
});
if (profiles.length !== 2) throw new Error("Both React 18 and React 19 consumers are required.");

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "package-host.spec.ts",
    outputDir: resolve(root, ".test-results", mode),
    workers: 1,
    timeout: 60000,
    updateSnapshots: "none",
    use: {
        viewport: { width: 1600, height: 1040 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        reducedMotion: "reduce",
        launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
        trace: "retain-on-failure",
    },
    projects: profiles.flatMap(profile => (["chrome", "edge"] as const).map(browser => ({
        name: `${profile.name}-${browser}`,
        metadata: { consumerDirectory: profile.directory, reactVersion: profile.react, mode },
        use: { channel: browser === "edge" ? "msedge" : "chrome", baseURL: `http://127.0.0.1:${profile.port}` },
        expect: {
            toHaveScreenshot: {
                animations: "disabled" as const,
                caret: "hide" as const,
                scale: "css" as const,
                threshold: 0,
                maxDiffPixels: 0,
                pathTemplate: join("{testDir}", "visual.spec.ts-snapshots", `{arg}-${browser}-{platform}{ext}`),
            },
        },
    }))),
    webServer: profiles.map(profile => ({
        command: `"${process.execPath}" "${join(profile.directory, "node_modules", "vite", "bin", "vite.js")}"${mode === "production" ? " preview" : ""}`,
        cwd: profile.directory,
        url: `http://127.0.0.1:${profile.port}`,
        reuseExistingServer: false,
        timeout: 30000,
    })),
});
