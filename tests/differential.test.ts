/**
 * Differential corpus harness: the working tree against a baseline build.
 *
 * Every recipe in the ~93k combinatorial corpus (tests/corpus/corpus.ts) is
 * materialized and encoded twice: once with the baseline bundle
 * (tests/baseline/dcbor-baseline.mjs, built from the commit recorded in
 * tests/baseline/README.md) and once with the working tree (../src). The
 * encodings must be byte-identical, including which inputs throw and with
 * which CborError code.
 *
 * Decode differential: on a deterministic stride, the encoded bytes plus
 * deterministic corruptions (truncate / append / bit-flips) are decoded by
 * both builds; accept/reject outcome, re-encoded bytes, and error codes must
 * match exactly. The committed golden decode vectors also run through both.
 *
 * Deliberate behavior changes since the baseline are recognized by the
 * `isKnown*Change` predicates below. Categories marked `tombstone` hold
 * input shapes the baseline encoded and the working tree rejects; for those
 * the harness asserts the directive error instead of byte equality.
 */

import * as baselineMod from "./baseline/dcbor-baseline.mjs";
import * as src from "../src";
import {
  baselineAdapterFor,
  currentAdapterFor,
  bytesToHex,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
  type Recipe,
  type RemovedInputShape,
  type VectorApi,
} from "./vectors/recipes";
import { categories, corpusSize } from "./corpus/corpus";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The CborError code each removed input shape throws. The directive error
 * must be a CborError: a non-CborError throw fails the category loudly.
 */
const EXPECTED_TOMBSTONES = new Map<RemovedInputShape, string>([
  ["tag-value-literal", "Custom"],
  ["tagged-cbor-only", "Custom"],
]);

type DecodeDiffOutcome = { ok: true; hex: string } | { ok: false; code: string; stage?: string };

/**
 * Decode-behavior change since the baseline: byte-string/text lengths >= 2^53
 * (bigint after narrowing) report `Underrun`, like the reference's
 * `parse_bytes` bounds check, instead of the baseline's `OutOfRange` input
 * guard. Both builds reject; only the code differs. The baseline's decode
 * stage raised OutOfRange only from that bigint-length guard (asserted by the
 * golden fixture hygiene test), so this exact code pair - and nothing else -
 * is the signature of the change.
 */
const isKnownLengthCodeChange = (base: DecodeDiffOutcome, cur: DecodeDiffOutcome): boolean =>
  !base.ok &&
  !cur.ok &&
  base.stage === "decode" &&
  cur.stage === "decode" &&
  base.code === "OutOfRange" &&
  cur.code === "Underrun";

/**
 * Decode-behavior change since the baseline: a text string starting with
 * U+FEFF keeps that code point (Rust `String::from_utf8` parity; the baseline
 * used the WHATWG TextDecoder default, which strips a leading BOM, so its
 * re-encode dropped the three bytes). Signature: both builds accept, the
 * working tree re-encodes the input byte-identically, the baseline does not,
 * and the input carries the UTF-8 BOM sequence.
 */
const isKnownBomKeepChange = (
  input: Uint8Array,
  base: DecodeDiffOutcome,
  cur: DecodeDiffOutcome,
): boolean => {
  if (!base.ok || !cur.ok) return false;
  const inputHex = bytesToHex(input);
  return cur.hex === inputHex && base.hex !== inputHex && inputHex.includes("efbbbf");
};

/**
 * Decode-behavior change since the baseline: whole-valued f32/f64 heads at or
 * beyond the saturating-cast bounds (`fa4f000001`, `fa4f800000`,
 * `fb43e0000000000001`, …) are accepted as the reference's
 * `validate_canonical_f32/f64` accept them, and decode to the integer node
 * `From<f32/f64>` builds. The baseline's re-encode check rejected every such
 * head as NonCanonicalNumeric. Signature: baseline rejects at the decode stage
 * with that code, the working tree either accepts or fails later in the input
 * with a different decode-stage code (a corruption mutation appends bytes
 * after the head: the baseline stops at the head, the working tree reads past
 * it and reports UnusedData), and the input carries a single- or
 * double-precision head byte.
 */
const isKnownWholeFloatAcceptChange = (
  input: Uint8Array,
  base: DecodeDiffOutcome,
  cur: DecodeDiffOutcome,
): boolean =>
  !base.ok &&
  base.stage === "decode" &&
  base.code === "NonCanonicalNumeric" &&
  (cur.ok || (cur.stage === "decode" && cur.code !== "NonCanonicalNumeric")) &&
  input.some((b) => b === 0xfa || b === 0xfb);

/**
 * Encode-behavior change since the baseline: `CborDate.fromEpochSeconds(NaN)`
 * is the epoch, as the reference's `from_timestamp` saturates it
 * (`trunc() as i64` → 0), where the baseline threw InvalidDate. Signature: the
 * recipe holds a NaN `date`, the baseline threw that code, the working tree
 * encodes.
 */
const isKnownNanDateChange = (
  recipe: Recipe,
  base: { ok: true; hex: string } | { ok: false; code: string },
  cur: { ok: true; hex: string } | { ok: false; code: string },
): boolean =>
  !base.ok &&
  base.code === "InvalidDate" &&
  cur.ok &&
  JSON.stringify(recipe).includes('{"k":"date","seconds":"NaN"}');

const isKnownDecodeChange = (
  input: Uint8Array,
  base: DecodeDiffOutcome,
  cur: DecodeDiffOutcome,
): boolean =>
  isKnownLengthCodeChange(base, cur) ||
  isKnownBomKeepChange(input, base, cur) ||
  isKnownWholeFloatAcceptChange(input, base, cur);

/**
 * Integrity pin for the baseline. Without this, an accidental re-baseline (or
 * a build/copy mishap) silently turns the differential into a
 * self-comparison that passes vacuously. Update only when deliberately
 * re-baselining, together with tests/baseline/README.md.
 */
const BASELINE_SHA256 = "ffb0bf6acdafaf01fbb6360497f96cb0f821d4d602f6f343cddd507a302fb72c";
const BASELINE_COMMIT = "187769a273176a2c6089fb412871226b6db1e795";

const baseline: VectorApi = baselineAdapterFor(baselineMod as unknown as Record<string, unknown>);
const current: VectorApi = currentAdapterFor(src as unknown as Record<string, unknown>);

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

  it("corpus has the exact expected size", () => {
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
          // The working tree must throw the directive error (not just any
          // error). Most of these encoded in the baseline; a few edge recipes
          // (e.g. out-of-range number tags) threw there too - either way the
          // directive error must win.
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
          if (!isKnownNanDateChange(recipe, base, cur)) {
            report(name, `baseline ${outcomeStr(base)} != current ${outcomeStr(cur)}`);
          }
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
            !isKnownDecodeChange(encoded, baseDec, curDec)
          ) {
            report(
              name,
              `decode: baseline ${outcomeStr(baseDec)} != current ${outcomeStr(curDec)}`,
            );
          } else if (baseDec.ok && baseDec.hex !== base.hex) {
            report(name, `decode round-trip broke: ${outcomeStr(baseDec)} for ${base.hex}`);
          }
          // NB: the bare-Float ladder emits 0xfa floats for whole values
          // >= 2^32; the baseline decoder refused those as non-canonical,
          // the working tree accepts them like the reference - covered by
          // isKnownWholeFloatAcceptChange above.

          if (index % MUTATION_STRIDE === 0) {
            for (const [mutName, mutated] of mutations(encoded)) {
              const baseMut = decodeOutcome(baseline, mutated.slice());
              const curMut = decodeOutcome(current, mutated.slice());
              if (
                JSON.stringify(baseMut) !== JSON.stringify(curMut) &&
                !isKnownDecodeChange(mutated, baseMut, curMut)
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
      if (JSON.stringify(base) !== JSON.stringify(cur) && !isKnownDecodeChange(bytes, base, cur)) {
        failures.push(`${name}: baseline ${outcomeStr(base)} != current ${outcomeStr(cur)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
