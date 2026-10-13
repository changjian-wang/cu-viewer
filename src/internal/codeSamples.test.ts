import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { codeSample } from "./codeSamples";
import type { CodeLanguage } from "./codeSamples";

describe("read-only SDK samples", () => {
    it.each(["2025-11-01", "2026-06-01-preview"] as const)("uses %s context with placeholders and verified SDK methods", version => {
        for (const language of ["python", "csharp", "javascript"] as const) {
            const code = codeSample(language, "saved-analyzer", version);
            expect(code).toContain("saved-analyzer");
            expect(code).toContain("{{CONTENT_UNDERSTANDING_ENDPOINT}}");
            expect(code).toContain("{{CONTENT_UNDERSTANDING_KEY}}");
            expect(code).toContain("{{FILE_URL}}");
            expect(code).not.toContain("yatengh");
            if (language === "python") expect(code).toContain("client.begin_analyze(");
            if (language === "javascript") expect(code).toContain("client.analyze(");
            if (language === "csharp") expect(code).toContain("client.AnalyzeAsync(");
        }
        expect(codeSample("csharp", "saved", version)).toContain(version === "2025-11-01" ? "V2025_11_01" : "V2026_06_01_Preview");
    });

    it.each(["python", "csharp", "javascript"] as const)("escapes analyzer strings in the %s sample", (language: CodeLanguage) => {
        const analyzer = 'quoted-"analyzer"\n<script>alert("not executed")</script>';
        expect(codeSample(language, analyzer, "2026-06-01-preview")).toContain(JSON.stringify(analyzer));
    });

    it("produces valid JavaScript module syntax without executing the sample", () => {
        const code = codeSample("javascript", 'quoted-"analyzer"\n<script>alert("not executed")</script>', "2026-06-01-preview");
        const check = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: code, encoding: "utf8" });
        if (check.error) throw check.error;
        expect(check.stderr).toBe("");
        expect(check.status).toBe(0);
    });

    it("rejects missing analyzer context instead of substituting a successful-looking sample", () => {
        expect(() => codeSample("python", " ", "2025-11-01")).toThrow("nonempty analyzer ID");
    });
});
