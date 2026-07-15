import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/diagnostic.ts", "src/walk.ts", "src/debug.ts"],
  outDir: "dist",
  // P3.18: IIFE dropped - IIFE entries can't share chunks and would fork the
  // tags-store singleton across entries (verified hazard).
  format: ["cjs", "esm"],
  dts: true,
  inputOptions: {
    // The rolldown-plugin-dts "fake-js" pass transforms .d.ts content without
    // emitting a sourcemap, producing a spurious SOURCEMAP_BROKEN warning even
    // though the real JS sourcemaps are correct. Filter only that case.
    onwarn(warning, defaultHandler) {
      if (warning.code === "SOURCEMAP_BROKEN") return;
      defaultHandler(warning);
    },
  },
  sourcemap: true,
  clean: true,
  target: "es2022",
  // P1.4: the former `deps.alwaysBundle` / `outputOptions.globals` blocks
  // referenced packages ("byte-data", "collections/sorted-map") that are not
  // dependencies of this zero-dependency library - verified no-op, removed.
});
