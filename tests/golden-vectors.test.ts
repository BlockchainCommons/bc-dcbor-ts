/**
 * Golden wire-vector suite (API_REDESIGN_PLAN P1.1a) - the committed,
 * hand-pinned freeze of the deterministic wire format.
 *
 * Verifies the working tree against the committed fixtures:
 *   - tests/vectors/encode-vectors.json: construction recipe → expected bytes
 *     (or expected CborError code for inputs that throw)
 *   - tests/vectors/decode-vectors.json: bytes → accept (byte-identical
 *     re-encode) or reject with a specific CborError.code - covering every
 *     reachable decoder throw site, including the checkCanonicalEncoding
 *     re-encode rejections
 *
 * Unlike tests/golden.test.ts (vitest snapshots, auto-updatable with -u),
 * these fixtures only change through a deliberate run of
 * `bun run vectors:generate` - the diff is the reviewable record of any
 * wire-format change. During the API redesign the wire is FROZEN: any diff
 * here outside the two planned tombstone flips (P3.5 / P3.7) is a bug.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as src from "../src";
import {
  redesignedAdapterFor,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
  type Recipe,
} from "./vectors/recipes";

const here = dirname(fileURLToPath(import.meta.url));

interface EncodeFixture {
  name: string;
  recipe: Recipe;
  expect:
    | { ok: true; hex: string; decodeRejects?: string }
    | { ok: true; byteLength: number; sha256: string; hexPrefix: string; decodeRejects?: string }
    | { ok: false; code: string };
  tombstone?: "P3.5" | "P3.7";
}

interface DecodeFixture {
  name: string;
  hex: string;
  expect: { ok: true } | { ok: false; code: string };
  note: string;
}

/**
 * Tombstone flips that have LANDED (mirror of EXPECTED_TOMBSTONES in
 * differential.test.ts, but per-task so P3.5 and P3.7 can land separately).
 * A landed task's tombstone-marked fixtures must be regenerated to
 * expected-throw; un-landed ones must still encode.
 */
const LANDED_TOMBSTONES = new Set<"P3.5" | "P3.7">(["P3.5", "P3.7"]);

const loadFixtures = <T>(file: string): { count: number; vectors: T[] } =>
  JSON.parse(readFileSync(join(here, "vectors", file), "utf8")) as {
    count: number;
    vectors: T[];
  };

const { count: encodeCount, vectors: encodeVectors } =
  loadFixtures<EncodeFixture>("encode-vectors.json");
const { count: decodeCount, vectors: decodeVectors } =
  loadFixtures<DecodeFixture>("decode-vectors.json");

const api = redesignedAdapterFor(src);

const sha256 = (hex: string): string =>
  createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

describe("golden encode vectors (frozen wire format)", () => {
  it("fixture file is self-consistent and non-trivial", () => {
    expect(encodeVectors.length).toBe(encodeCount);
    expect(encodeVectors.length).toBeGreaterThanOrEqual(300);
  });

  it("fixtures are in sync with the corpus (regenerate after corpus edits)", async () => {
    const { encodeCorpus } = await import("./vectors/encode-corpus");
    expect(encodeVectors.map((v) => v.name)).toEqual(encodeCorpus.map((c) => c.name));
  });

  for (const vector of encodeVectors) {
    it(vector.name, () => {
      const outcome = encodeOutcome(api, vector.recipe);
      if (!vector.expect.ok) {
        expect(outcome).toEqual({ ok: false, code: vector.expect.code });
        return;
      }
      if (!outcome.ok) {
        throw new Error(`expected bytes, got CborError ${outcome.code}`);
      }
      if ("sha256" in vector.expect) {
        expect(outcome.hex.length / 2).toBe(vector.expect.byteLength);
        expect(outcome.hex.slice(0, 32)).toBe(vector.expect.hexPrefix);
        expect(sha256(outcome.hex)).toBe(vector.expect.sha256);
      } else {
        expect(outcome.hex).toBe(vector.expect.hex);
      }
      // Determinism lock: encoder output decodes and re-encodes
      // byte-identically - except the pinned bare-Float quirk vectors whose
      // output the decoder rejects as non-canonical (frozen behavior).
      const back = decodeOutcome(api, hexToBytes(outcome.hex));
      if (vector.expect.decodeRejects !== undefined) {
        expect(back).toEqual({ ok: false, stage: "decode", code: vector.expect.decodeRejects });
      } else {
        expect(back).toEqual({ ok: true, hex: outcome.hex });
      }
    });
  }
});

describe("golden decode vectors (accept/reject + error codes)", () => {
  it("fixture file is self-consistent and non-trivial", () => {
    expect(decodeVectors.length).toBe(decodeCount);
    expect(decodeVectors.length).toBeGreaterThanOrEqual(220);
  });

  it("fixtures are in sync with the corpus (regenerate after corpus edits)", async () => {
    const { decodeCorpus } = await import("./vectors/decode-corpus");
    expect(decodeVectors.map((v) => v.name)).toEqual(decodeCorpus.map((c) => c.name));
  });

  for (const vector of decodeVectors) {
    it(vector.name, () => {
      const outcome = decodeOutcome(api, hexToBytes(vector.hex));
      if (vector.expect.ok) {
        // Accepts must re-encode to the exact input bytes.
        expect(outcome).toEqual({ ok: true, hex: vector.hex });
      } else {
        // All fixture rejections are decode-stage rejections by construction
        // (the generator verifies this); `stage` distinguishes them from
        // decode-accepted-but-reencode-threw, which would be a divergence.
        expect(outcome).toEqual({ ok: false, stage: "decode", code: vector.expect.code });
      }
    });
  }
});

describe("golden vector fixture hygiene", () => {
  it("every CborError code that decode can raise has at least one reject vector", () => {
    // OutOfRange is reachable only via bigint byte-string/text lengths;
    // WrongTag/WrongType/MissingMapKey/InvalidString/InvalidDate/Custom are
    // extraction/construction-layer codes that decodeCbor itself never throws.
    const decodeReachable = [
      "Underrun",
      "UnsupportedHeaderValue",
      "NonCanonicalNumeric",
      "InvalidSimpleValue",
      "InvalidUtf8",
      "NonCanonicalString",
      "UnusedData",
      "MisorderedMapKey",
      "DuplicateMapKey",
      "OutOfRange",
    ];
    const covered = new Set(
      decodeVectors.filter((v) => !v.expect.ok).map((v) => (v.expect as { code: string }).code),
    );
    for (const code of decodeReachable) {
      expect(covered, `no reject vector for ${code}`).toContain(code);
    }
    // And nothing outside the reachable set sneaked into the fixtures.
    for (const code of covered) {
      expect(decodeReachable).toContain(code);
    }
  });

  it("tombstone fixtures match their landed/unlanded state", () => {
    // Per-task flip: when P3.5 (or P3.7) lands, add it to LANDED_TOMBSTONES
    // and regenerate - its marked fixtures must then be expected-throw while
    // the other task's fixtures still encode.
    for (const vector of encodeVectors.filter((v) => v.tombstone)) {
      const landed = LANDED_TOMBSTONES.has(vector.tombstone as "P3.5" | "P3.7");
      expect(
        vector.expect.ok,
        `${vector.name} (${vector.tombstone}) should ${landed ? "throw" : "encode"}`,
      ).toBe(!landed);
    }
  });
});
