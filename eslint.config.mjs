import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "@next/next/no-img-element": "off" } },
  { files: ["src/**/*.{ts,tsx}"], rules: { "no-console": "error" } },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/observability/core.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pino",
              message: "Use the sanitized observability/logger facade.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    // Generated agent tooling (trail init); not project code.
    ".trail/**",
    ".cursor/**",
    ".gemini/**",
  ]),
]);
