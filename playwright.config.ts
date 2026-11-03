import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { defineConfig } from "@playwright/test";

const candidateRoot = process.env.CU_VISUAL_CANDIDATE_ROOT;
const candidateRelative = candidateRoot ? relative(import.meta.dirname, resolve(candidateRoot)) : undefined;
if (candidateRoot && (!isAbsolute(candidateRoot) || candidateRelative === "" ||
    (candidateRelative !== ".." && !candidateRelative?.startsWith(`..${sep}`) && !isAbsolute(candidateRelative ?? "")))) {
    throw new Error("Visual candidates must use an absolute directory outside the repository.");
}

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
            pathTemplate: candidateRoot ? join(candidateRoot, "{arg}-{projectName}-{platform}{ext}") :
                join("{testDir}", "visual.spec.ts-snapshots", "{arg}-{projectName}-{platform}{ext}"),
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
    webServer: [
        {
            command: "npm run dev",
            url: "http://127.0.0.1:5173",
            reuseExistingServer: true,
        },
        {
            command: "node tests/e2e/cross-origin-server.mjs",
            url: "http://127.0.0.1:4175/health",
            reuseExistingServer: true,
        },
    ],
});
