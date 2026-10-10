import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: ["dist/**", "dist-demo/**", "node_modules/**", "coverage/**", "test-results/**", "playwright-report/**"],
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
);
