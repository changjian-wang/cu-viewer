import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: ["dist/**", "dist-demo/**", "dist-cli/**", "node_modules/**", "coverage/**", "test-results/**", "playwright-report/**"],
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ["frontend/src/source/heif.worker.ts"],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: "./tsconfig.worker.json",
            },
        },
    },
);
