import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/cli.test.ts"],
    coverage: {
      provider: "v8",
      // Coverage floor recorded in REFACTOR_PLAN.md (Phase 0.2). Raise the
      // thresholds only; never lower them during the refactor.
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
      // Raise-only floors. Post-P3 wave actuals: st 72.2 / br 69.0 /
      // fn 70.7 / ln 73.2 (the prototype slim deleted untested surface).
      thresholds: {
        statements: 70,
        branches: 66,
        functions: 68,
        lines: 71,
      },
    },
  },
});
