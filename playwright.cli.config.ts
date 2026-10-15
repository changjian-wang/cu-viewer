import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "cli-host.spec.ts",
    outputDir: "./test-results/cli",
    workers: 1,
    timeout: 60000,
    use: {
        viewport: { width: 1600, height: 1040 },
        reducedMotion: "reduce",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "cli-chrome", use: { channel: "chrome" } },
        { name: "cli-edge", use: { channel: "msedge" } },
    ],
});
