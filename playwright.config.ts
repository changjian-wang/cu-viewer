import { join } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testIgnore: ["package-host.spec.ts", "performance.spec.ts"],
    fullyParallel: false,
    workers: 1,
    timeout: 60000,
    updateSnapshots: "none",
    expect: {
        toHaveScreenshot: {
            animations: "disabled",
            caret: "hide",
            scale: "css",
            threshold: 0,
            maxDiffPixels: 0,
            pathTemplate: join("{testDir}", "visual.spec.ts-snapshots", "{arg}-{projectName}-{platform}{ext}"),
        },
    },
    use: {
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    projects: [
        { name: "chrome", use: { channel: "chrome" } },
        { name: "edge", use: { channel: "msedge" } },
    ],
    webServer: {
        command: "npm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
    },
});
