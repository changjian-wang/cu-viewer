import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready, selectResultView } from "./viewerAssertions";

const python = process.env.CU_CLI_PYTHON;
const installed = process.env.CU_CLI_PACKAGE_ROOT;
const viewerPython = process.env.CU_VIEWER_PYTHON;
const viewerInstalled = process.env.CU_VIEWER_PACKAGE_ROOT;
function installedEnvironment(independent: boolean) {
    const executable = independent ? viewerPython : python;
    const packageRoot = independent ? viewerInstalled : installed;
    if (!executable || !packageRoot) {
        throw new Error(independent ?
            "Set CU_VIEWER_PYTHON/CU_VIEWER_PACKAGE_ROOT to an isolated Viewer wheel installation." :
            "Set CU_CLI_PYTHON/CU_CLI_PACKAGE_ROOT to an isolated CLI wheel installation.");
    }
    return { executable, packageRoot };
}
const fixtures = resolve("tests", "fixtures");
const harness = `
import _thread, importlib, json, os, shutil, sys, threading, webbrowser
from pathlib import Path
from types import SimpleNamespace
import importlib.util
from importlib.metadata import version
import cu_viewer
root = Path(sys.argv.pop(1)).resolve()
independent = sys.argv.pop(1) == "independent"
assert Path(cu_viewer.__file__).resolve().is_relative_to(root)
assert list(root.glob("cu_viewer-*.dist-info"))
assert version("cu-viewer") == os.environ.get("CU_CLI_EXPECT_VIEWER_VERSION", "0.1.0b1")
assert shutil.which("node") is None
def no_service(*args, **kwargs):
    raise AssertionError("Saved viewing must not load profiles or build service clients")
if independent:
    assert importlib.util.find_spec("cu_cli") is None
    assert importlib.util.find_spec("cu_cli_core") is None
    from cu_viewer.__main__ import main
else:
    import cu_cli, cu_cli_core
    from cu_cli.cli import main
    assert Path(cu_cli.__file__).resolve().is_relative_to(root)
    assert Path(cu_cli_core.__file__).resolve().is_relative_to(root)
    assert not (Path(cu_cli.__file__).parent / "resources/viewer").exists()
    adapter = importlib.import_module("cu_cli.commands.analyze")
    if "--result" in sys.argv:
        adapter.Profile.load = staticmethod(no_service)
        adapter.build_client = no_service
    else:
        adapter.Profile.load = staticmethod(lambda **kwargs: SimpleNamespace(
            default_analyzer="prebuilt-layout", api_version="2025-11-01"))
        adapter.build_client = lambda *args, **kwargs: object()
        def analyze_once(client, job):
            print("TEST_ANALYZE_CALL", file=sys.stderr, flush=True)
            return job, json.loads(Path(os.environ["CU_CLI_BROWSER_TEST_RESULT"]).read_text(encoding="utf-8"))
        adapter._run_one = analyze_once
def stop():
    if sys.stdin.readline().strip() == "stop":
        _thread.interrupt_main()
threading.Thread(target=stop, daemon=True).start()
def opened(url):
    print("VIEWER_URL=" + url, flush=True)
    return True
webbrowser.open = opened
main()
`;

async function startViewer(source: string, result: string, fresh = false, independent = false) {
    const directory = await mkdtemp(join(tmpdir(), "cu-cli-browser-"));
    const { executable, packageRoot } = installedEnvironment(independent);
    const args = independent ? [source, "--result", result] :
        ["analyze", source, "--view", ...(fresh ? ["--json"] : ["--result", result])];
    const child = spawn(executable, ["-u", "-B", "-c", harness, packageRoot, independent ? "independent" : "cli", ...args], {
        cwd: directory,
        env: {
            ...process.env, PYTHONPATH: packageRoot, CU_NO_UPDATE_CHECK: "1", PYTHONIOENCODING: "utf-8",
            PATH: dirname(executable),
            CU_CLI_BROWSER_TEST_RESULT: result,
        },
        stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data: string) => { stderr += data; });
    const exited = new Promise<number | null>(resolveExit => child.once("exit", code => resolveExit(code)));
    const stop = async () => {
        if (child.exitCode === null && !child.stdin.destroyed) child.stdin.end("stop\n");
        const code = await Promise.race([
            exited,
            new Promise<never>((_, reject) => {
                const timer = setTimeout(() => {
                    if (child.pid && child.exitCode === null) {
                        execFileSync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${child.pid}`]);
                    }
                    reject(new Error(`CLI did not stop after its interrupt.\n${stderr}`));
                }, 10000);
                timer.unref();
            }),
        ]);
        await rm(directory, { recursive: true, force: true });
        expect(code, stderr).toBe(0);
    };
    try {
        const url = await new Promise<string>((resolveUrl, reject) => {
            const timer = setTimeout(() => reject(new Error(`CLI startup timed out.\n${stderr}`)), 30000);
            child.once("error", error => { clearTimeout(timer); reject(error); });
            child.once("exit", code => {
                clearTimeout(timer);
                reject(new Error(`CLI exited before readiness (${code}).\n${stderr}`));
            });
            child.stdout.on("data", (data: string) => {
                stdout += data;
                const match = /^VIEWER_URL=(http:\/\/127\.0\.0\.1:\d+\/[a-zA-Z0-9_-]+\/)\r?$/m.exec(stdout);
                if (match?.[1]) {
                    clearTimeout(timer);
                    if (!fresh) expect(stdout.slice(0, match.index)).toBe("");
                    resolveUrl(match[1]);
                }
            });
        });
        return { url, stop, stdout: () => stdout, stderr: () => stderr };
    } catch (error) {
        await stop();
        throw error;
    }
}

async function inspect(page: Page, source: string, result: string, run: (url: string) => Promise<void>, fresh = false, independent = false) {
    const before = await readFile(result);
    const resources = join(installedEnvironment(independent).packageRoot, "cu_viewer", "resources", "viewer");
    expect((await readdir(resources)).sort()).toEqual(["manifest.json", "viewer.zip"]);
    const host = await startViewer(source, result, fresh, independent);
    const errors: string[] = [];
    const failed: string[] = [];
    const external: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
        if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    page.on("request", request => {
        if (!request.url().startsWith(new URL(host.url).origin + "/") &&
            !request.url().startsWith("data:") && !request.url().startsWith("blob:")) external.push(request.url());
    });
    try {
        const response = await page.goto(host.url);
        expect(response?.headers()["content-security-policy"]).toContain("script-src 'self' 'wasm-unsafe-eval'");
        await expect(page).toHaveTitle("CU Viewer");
        await expect(page.getByRole("heading", { name: "CU Viewer", exact: true })).toBeVisible();
        if (!independent && process.env.CU_CLI_EXPECT_VIEWER_VERSION === "0.1.0b2") {
            await expect(page.locator('meta[name="viewer-compatibility-test"]')).toHaveAttribute("content", "0.1.0b2");
        }
        await ready(page);
        await run(host.url);
        expect(errors).toEqual([]);
        expect(failed).toEqual([]);
        expect(external).toEqual([]);
        expect(await readFile(result)).toEqual(before);
        if (fresh) {
            expect(host.stderr().match(/TEST_ANALYZE_CALL/g)).toHaveLength(1);
            expect(JSON.parse(host.stdout().split("VIEWER_URL=")[0] ?? "")).toEqual(JSON.parse(before.toString("utf8")));
        } else {
            expect(host.stderr()).not.toContain("TEST_ANALYZE_CALL");
        }
    } finally {
        await host.stop();
    }
    await expect(fetch(host.url)).rejects.toThrow();
    expect((await readdir(resources)).sort()).toEqual(["manifest.json", "viewer.zip"]);
}

test("installed CLI serves real PDF, lazy result panes and source navigation without Node hosting", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", request => requested.push(request.url()));
    await inspect(page, join(fixtures, "mixed-financial-docs.pdf"), join(fixtures, "mixed-financial-docs.cu.json"), async () => {
        expect(requested.some(url => /\/pdfjs\/build\/pdf\.worker\.mjs$/.test(url))).toBe(true);
        expect(requested.some(url => /\/(MarkdownPane|JsonPane)-/.test(url))).toBe(false);
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
        await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
        await page.locator('[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]')
            .getByRole("button", { name: "Amount", exact: true }).click();
        await expect(page.getByTestId("source-overlay")).toBeVisible();
        await page.getByRole("tab", { name: "Markdown", exact: true }).click();
        await expect(page.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
        await expect(page.getByTestId("word-overlay")).toBeVisible();
        await page.getByRole("tab", { name: "Tables", exact: true }).click();
        await expect(page.getByRole("table")).toBeVisible();
        await page.getByRole("tab", { name: "Result", exact: true }).click();
        await expect(page.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
        expect(requested.some(url => /\/MarkdownPane-/.test(url))).toBe(true);
        expect(requested.some(url => /\/JsonPane-/.test(url))).toBe(true);
        await page.getByRole("textbox", { name: "Page number" }).fill("4");
        await page.getByRole("textbox", { name: "Page number" }).press("Enter");
        await ready(page);
        await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    });
});

for (const independent of [false, true]) {
    const host = independent ? "independent Viewer wheel" : "installed CLI";
    for (const source of ["receipt.png", join("images", "receipt-derived.jpg"), join("images", "receipt-derived.bmp")]) {
        test(`${host} displays ${source} and real receipt grounding`, async ({ page }) => {
            await inspect(page, join(fixtures, source), join(fixtures, "receipt.cu.json"), async () => {
                await page.getByRole("button", { name: "MerchantName", exact: true }).click();
                await checkPolygon(page, [
                    { x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
                    { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 },
                ], 0);
                await page.getByRole("tab", { name: "Markdown", exact: true }).click();
                await expect(page.locator(".cu-markdown")).toBeVisible();
            }, false, independent);
        });
    }

    test(`${host} loads its HEIF worker and WASM under real server CSP`, async ({ page }) => {
        const directory = await mkdtemp(join(tmpdir(), "cu-cli-heif-"));
        const saved = join(directory, "synthetic-grounding.json");
        await writeFile(saved, JSON.stringify({
            apiVersion: "2025-11-01", contents: [{
                kind: "document", pages: [{ pageNumber: 1, width: 64, height: 64, unit: "pixel" }], fields: {},
            }],
        }));
        const requests: string[] = [];
        page.on("request", request => requests.push(request.url()));
        try {
            await inspect(page, join(fixtures, "images", "heic-rs", "flat-64.heic"), saved, async () => {
                const pixel = await page.getByTestId("source-canvas").evaluate(element => {
                    if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the original source canvas.");
                    const context = element.getContext("2d");
                    if (!context) throw new Error("Source canvas unavailable.");
                    return Array.from(context.getImageData(element.width / 2, element.height / 2, 1, 1).data);
                });

                expect(pixel[0]).toBeGreaterThan(150);
                expect(pixel[1]).toBeLessThan(80);
                expect(requests.some(url => url.endsWith("/heif/heif.worker.js"))).toBe(true);
                expect(requests.some(url => url.endsWith("/heif/heic_decoder_bg.wasm"))).toBe(true);
            }, false, independent);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test("installed CLI analyzes once with an offline substitute then opens the same result", async ({ page }) => {
    await inspect(page, join(fixtures, "receipt.png"), join(fixtures, "receipt.cu.json"), async () => {
        await expect(page.getByRole("button", { name: "MerchantName", exact: true })).toBeVisible();
    }, true);
});

test("independent Viewer wheel opens a saved PDF without any cu-cli installation", async ({ page }) => {
    await inspect(page, join(fixtures, "mixed-financial-docs.pdf"), join(fixtures, "mixed-financial-docs.cu.json"), async () => {
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
        await page.getByRole("tab", { name: "Markdown", exact: true }).click();
        await expect(page.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
        const pane = page.getByRole("region", { name: "Extraction results" });
        await selectResultView(pane, "Tables");
        await expect(pane.getByRole("table")).toBeVisible();
        await page.setViewportSize({ width: 880, height: 850 });
        await expect(pane.getByRole("button", { name: "More result views" })).toBeVisible();
        await selectResultView(pane, "Result");
        await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    }, false, true);
});
