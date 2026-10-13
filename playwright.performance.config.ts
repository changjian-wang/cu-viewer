import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "performance.spec.ts",
    outputDir: resolve("test-results", "performance"),
    workers: 1,
    timeout: 60000,
    use: {
        baseURL: "http://127.0.0.1:41873",
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
    },
    projects: [
        { name: "chrome", use: { channel: "chrome" } },
        { name: "edge", use: { channel: "msedge" } },
    ],
    webServer: {
        command: "npm run preview:performance",
        url: "http://127.0.0.1:41873",
        reuseExistingServer: false,
    },
});
