/**
 * Dist-level packaging assertions (P3.18).
 *
 * Runs against the BUILT `dist/` output (skipped when absent - CI builds
 * before testing). The critical invariant: the subpath entries share chunks
 * with the root entry, so module-level singletons (the global tags store)
 * are one instance across entries. IIFE output was dropped precisely
 * because it would fork that singleton.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const built = existsSync(join(dist, "index.mjs")) && existsSync(join(dist, "diagnostic.mjs"));

describe.skipIf(!built)("dist packaging (P3.18)", () => {
  it("tags-store singleton is shared across subpath entries", async () => {
    const root = (await import(join(dist, "index.mjs"))) as {
      getGlobalTagsStore(): { register(tag: { value: number; name: string }): void };
      taggedValue(tag: number, content: unknown): unknown;
    };
    const diag = (await import(join(dist, "diagnostic.mjs"))) as {
      diagnostic(c: unknown, opts?: { annotate?: boolean }): string;
    };

    // Register a tag through the ROOT entry's store…
    root.getGlobalTagsStore().register({ value: 47474, name: "dist-singleton-probe" });
    // …and observe its name through the DIAGNOSTIC entry's annotator.
    const rendered = diag.diagnostic(root.taggedValue(47474, 1), { annotate: true });
    expect(rendered).toContain("dist-singleton-probe");
  });

  it("debug entry installs hooks onto the shared prototype", async () => {
    const root = (await import(join(dist, "index.mjs"))) as {
      cbor(value: unknown): { toString(): string; toJSON?: () => string };
    };
    const debug = (await import(join(dist, "debug.mjs"))) as {
      installDebugHooks(): void;
    };

    debug.installDebugHooks();
    const value = root.cbor([1, 2]);
    // toJSON is only present after installDebugHooks - and produces the
    // flat diagnostic, proving the debug entry reached the root's prototype.
    expect(value.toJSON?.()).toBe("[1, 2]");
    // The cheap core toString is untouched.
    expect(value.toString()).toBe("Cbor(0x820102)");
  });
});
