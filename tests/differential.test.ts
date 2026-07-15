/**
 * Differential corpus harness (API_REDESIGN_PLAN P1.1b) - the mechanism that
 * proves the API redesign never changes the wire format.
 *
 * Every recipe in the ~93k combinatorial corpus (tests/corpus/corpus.ts) is
 * materialized and encoded TWICE: once with the frozen baseline bundle
 * (tests/baseline/dcbor-baseline.mjs, built from the commit recorded in
 * tests/baseline/README.md) and once with the working tree (../src). The
 * encodings must be byte-identical - including which inputs throw, and with
 * which CborError code.
 *
 * Decode differential: on a deterministic stride, the encoded bytes plus
 * deterministic corruptions (truncate / append / bit-flips) are decoded by
 * both builds; accept/reject outcome, re-encoded bytes, and error codes must
 * match exactly. The committed golden decode vectors also run through both.
 *
 * ## Tombstones (P3.5 / P3.7)
 *
 * When the breaking wave lands, the two flagged input shapes STOP encoding
 * and start throwing a directive error. Flip them here by adding the plan
 * task id to EXPECTED_TOMBSTONES - the harness then asserts
 * baseline-encodes → working-tree-throws for those categories, and byte
 * equality for everything else. That flip is the ONLY allowed differential
 * change during the redesign.
 *
 * ## When the public API is renamed (Phase 3)
 *
 * Write a new adapter for the redesigned surface in tests/vectors/recipes.ts
 * and point `current` below at it. The baseline keeps using `adapterFor`.
 * Recipes, corpus, and fixtures must NOT change.
 */

import * as baselineMod from "./baseline/dcbor-baseline.mjs";
import * as src from "../src";
import {
  adapterFor,
  redesignedAdapterFor,
  bytesToHex,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
  type VectorApi,
} from "./vectors/recipes";
import { categories, corpusSize } from "./corpus/corpus";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Plan tasks whose tombstone throw has LANDED in the working tree, mapped to
 * the CborError code of the directive error they must throw. Pre-wave this
 * is empty. When P3.5 lands add e.g. `["P3.5", "Custom"]`; same for P3.7.
 * Do not add anything else, ever. (The directive error MUST be a CborError -
 * a non-CborError throw crashes the category loudly by design.)
 */
const EXPECTED_TOMBSTONES = new Map<"P3.5" | "P3.7", string>([
  ["P3.5", "Custom"],
  ["P3.7", "Custom"],
]);

type DecodeDiffOutcome =
  | { ok: true; hex: string }
  | { ok: false; code: string; stage?: string };

/**
 * Deliberate decode-behavior change landed AFTER the frozen baseline:
 * byte-string/text lengths >= 2^53 (bigint after narrowing) now report
 * `Underrun` like Rust's usize bounds check instead of the baseline's
 * `OutOfRange` input guard - see RUST_DIVERGENCES.md. Both builds still
 * reject; only the code differs. The baseline's decode stage raised
 * OutOfRange ONLY from that bigint-length guard (asserted by the golden
 * fixture hygiene test), so this exact code pair - and nothing else - is
 * the signature of the change. Fold into the baseline at the next
 * deliberate re-baseline.
 */
const isKnownLengthCodeChange = (base: DecodeDiffOutcome, cur: DecodeDiffOutcome): boolean =>
  !base.ok &&
  !cur.ok &&
  base.stage === "decode" &&
  cur.stage === "decode" &&
  base.code === "OutOfRange" &&
  cur.code === "Underrun";

/**
 * Integrity pin for the frozen baseline. Without this, an accidental
 * re-baseline (or a build/copy mishap) silently turns the differential into
 * a self-comparison that passes vacuously. Update ONLY at the deliberate
 * P4.1 proof re-baseline, together with tests/baseline/README.md.
 */
const BASELINE_SHA256 = "ffb0bf6acdafaf01fbb6360497f96cb0f821d4d602f6f343cddd507a302fb72c";
const BASELINE_COMMIT = "187769a273176a2c6089fb412871226b6db1e795";

const baseline: VectorApi = adapterFor(baselineMod as unknown as Record<string, unknown>);
const current: VectorApi = redesignedAdapterFor(src as unknown as Record<string, unknown>);

/** Stride for the plain decode differential (encode bytes → both decoders). */
const DECODE_STRIDE = 4;
/** Stride for the corruption decode differential (4 mutations per pick). */
const MUTATION_STRIDE = 8;
/** Failure lines kept per category before truncating the report. */
const MAX_REPORTED = 15;

function* mutations(bytes: Uint8Array): Generator<[string, Uint8Array]> {
  if (bytes.length > 0) yield ["truncate-1", bytes.slice(0, -1)];
  const appended = new Uint8Array(bytes.length + 1);
  appended.set(bytes);
  yield ["append-00", appended];
  if (bytes.length > 0) {
    const first = bytes.slice();
    first[0] ^= 0x01;
    yield ["flip-first-low-bit", first];
  }
  if (bytes.length > 2) {
    const mid = bytes.slice();
    mid[bytes.length >> 1] ^= 0x80;
    yield ["flip-middle-high-bit", mid];
  }
}

const outcomeStr = (
  o: { ok: true; hex: string } | { ok: false; code: string; stage?: string },
): string =>
  o.ok
    ? `bytes ${o.hex.length > 64 ? o.hex.slice(0, 64) + "…" : o.hex}`
    : `throw ${o.stage !== undefined ? `${o.stage}:` : ""}${o.code}`;

describe("differential corpus: baseline vs working tree", () => {
  it("baseline bundle matches its integrity pin (not a self-comparison)", async () => {
    const { createHash } = await import("node:crypto");
    const here = dirname(fileURLToPath(import.meta.url));
    const digest = createHash("sha256")
      .update(readFileSync(join(here, "baseline", "dcbor-baseline.mjs")))
      .digest("hex");
    expect(digest, `baseline must be the build from ${BASELINE_COMMIT}`).toBe(BASELINE_SHA256);
  });

  it("corpus has the exact expected size (~93k plan floor)", () => {
    // Exact equality so a silently shrinking category can't hide inside the
    // floor. Editing the corpus deliberately => update this constant in the
    // same reviewed diff.
    expect(corpusSize()).toBe(93569);
    expect(corpusSize()).toBeGreaterThanOrEqual(93000);
  });

  for (const category of categories) {
    const tombstoneCode =
      category.tombstone !== undefined ? EXPECTED_TOMBSTONES.get(category.tombstone) : undefined;
    const tombstoned = tombstoneCode !== undefined;

    it(`${category.name}${tombstoned ? " (expected tombstone throws)" : ""}`, () => {
      const failures: string[] = [];
      let failureCount = 0;
      let index = 0;

      const report = (name: string, message: string): void => {
        failureCount++;
        if (failures.length < MAX_REPORTED) failures.push(`${name}: ${message}`);
      };

      for (const [name, recipe] of category.recipes()) {
        const base = encodeOutcome(baseline, recipe);
        const cur = encodeOutcome(current, recipe);

        if (tombstoned) {
          // Post-wave: the working tree must throw the directive error (not
          // just any error). Most of these encoded in the baseline; a few
          // edge recipes (e.g. out-of-range number tags) threw there too -
          // either way the tombstone throw must now win.
          if (cur.ok) {
            report(name, `working tree still encodes (${outcomeStr(cur)}) - tombstone missing`);
          } else if (cur.code !== tombstoneCode) {
            report(name, `threw ${cur.code}, expected directive error ${tombstoneCode}`);
          }
          index++;
          continue;
        }

        if (
          base.ok !== cur.ok ||
          (base.ok && cur.ok && base.hex !== cur.hex) ||
          (!base.ok && !cur.ok && base.code !== cur.code)
        ) {
          report(name, `baseline ${outcomeStr(base)} != current ${outcomeStr(cur)}`);
          index++;
          continue;
        }

        // Decode differential on the shared bytes (they are identical here).
        // Each decoder gets its own copy so a hypothetical input-mutating
        // decoder can't corrupt the other build's input.
        if (base.ok && index % DECODE_STRIDE === 0) {
          const encoded = hexToBytes(base.hex);
          const baseDec = decodeOutcome(baseline, encoded.slice());
          const curDec = decodeOutcome(current, encoded.slice());
          if (
            JSON.stringify(baseDec) !== JSON.stringify(curDec) &&
            !isKnownLengthCodeChange(baseDec, curDec)
          ) {
            report(
              name,
              `decode: baseline ${outcomeStr(baseDec)} != current ${outcomeStr(curDec)}`,
            );
          } else if (baseDec.ok && baseDec.hex !== base.hex) {
            report(name, `decode round-trip broke: ${outcomeStr(baseDec)} for ${base.hex}`);
          }
          // NB: both builds REJECTING the encoder's own output identically is
          // legal - the frozen bare-Float quirk emits 0xfa floats for whole
          // values that the decoder's canonicality re-encode refuses.

          if (index % MUTATION_STRIDE === 0) {
            for (const [mutName, mutated] of mutations(encoded)) {
              const baseMut = decodeOutcome(baseline, mutated.slice());
              const curMut = decodeOutcome(current, mutated.slice());
              if (
                JSON.stringify(baseMut) !== JSON.stringify(curMut) &&
                !isKnownLengthCodeChange(baseMut, curMut)
              ) {
                report(
                  `${name}/${mutName}`,
                  `on ${bytesToHex(mutated).slice(0, 48)}: baseline ${outcomeStr(baseMut)} != current ${outcomeStr(curMut)}`,
                );
              }
            }
          }
        }
        index++;
      }

      if (failureCount > 0) {
        failures.push(`… ${failureCount} total differential failure(s) in ${category.name}`);
      }
      expect(failures).toEqual([]);
      // Generous timeout: large categories (46k triples, 65536-entry
      // containers) run well past vitest's 5s default under coverage
      // instrumentation.
    }, 120_000);
  }

  it("golden decode vectors produce identical outcomes in both builds", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const { vectors } = JSON.parse(
      readFileSync(join(here, "vectors", "decode-vectors.json"), "utf8"),
    ) as { vectors: { name: string; hex: string }[] };

    const failures: string[] = [];
    for (const { name, hex } of vectors) {
      const bytes = hexToBytes(hex);
      const base = decodeOutcome(baseline, bytes.slice());
      const cur = decodeOutcome(current, bytes.slice());
      if (JSON.stringify(base) !== JSON.stringify(cur) && !isKnownLengthCodeChange(base, cur)) {
        failures.push(`${name}: baseline ${outcomeStr(base)} != current ${outcomeStr(cur)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
