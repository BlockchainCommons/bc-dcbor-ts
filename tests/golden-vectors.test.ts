/**
 * Golden wire-vector suite: the committed, hand-reviewed record of the
 * deterministic wire format.
 *
 * Verifies the working tree against the committed fixtures:
 *   - encode-vectors.json: construction recipe → expected bytes (or expected
 *     CborError code for inputs that throw)
 *   - decode-vectors.json: bytes → accept (re-encoded bytes) or reject with a
 *     specific CborError code and message - covering every reachable decoder
 *     throw site, including the checkCanonicalEncoding re-encode rejections
 *   - format-vectors.json, date-vectors.json, uint-vectors.json: diagnostic
 *     renderings, CborDate decode/display, and fixed-width unsigned extraction
 *
 * Unlike tests/golden.test.ts (vitest snapshots, auto-updatable with -u),
 * these fixtures only change through a deliberate run of
 * `bun run vectors:generate` - the diff is the reviewable record of any
 * wire-format change. The Rust harness (tests/rust-validation) checks the
 * same fixtures against the reference.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as src from "../src";
import {
  cbor,
  type CborInput,
  CborDate,
  decodeCbor,
  encodeCbor,
  expectUnsigned,
  registerStandardTags,
  TagsStore,
} from "../src";
import { diagnostic } from "../src/diag";
import { hexAnnotated } from "../src/dump";
import {
  currentAdapterFor,
  bytesToHex,
  decodeErrorMessage,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
  materialize,
  type Recipe,
  type RemovedInputShape,
} from "./vectors/recipes";

const here = dirname(fileURLToPath(import.meta.url));

interface EncodeFixture {
  name: string;
  recipe: Recipe;
  expect:
    | { ok: true; hex: string; decodeRejects?: string }
    | { ok: true; byteLength: number; sha256: string; hexPrefix: string; decodeRejects?: string }
    | { ok: false; code: string };
  tombstone?: RemovedInputShape;
}

interface DecodeFixture {
  name: string;
  hex: string;
  expect: { ok: true; hex?: string } | { ok: false; code: string; message: string };
  note: string;
}

interface FormatFixture {
  name: string;
  input: { recipe: Recipe } | { hex: string };
  config: "none" | "standard" | "standard+bignum";
  build?: "default" | "bignum";
  expect: {
    hex: string;
    diagnostic: string;
    annotated: string;
    flat: string;
    summary: string;
    hexAnnotated: string;
  };
}

type DateFixture = { name: string; expect: DateExpect } & (
  { kind: "decode"; hex: string } | { kind: "display"; recipe: Recipe }
);
type DateExpect =
  { ok: true; hex: string; display: string } | { ok: false; code: string; message?: string };

interface UintFixture {
  name: string;
  hex: string;
  width: 8 | 16 | 32 | 64;
  expect: { ok: true; value: string } | { ok: false; code: string };
}

const loadFixtures = <T>(file: string): { count: number; vectors: T[] } =>
  JSON.parse(readFileSync(join(here, "vectors", file), "utf8")) as {
    count: number;
    vectors: T[];
  };

const { count: encodeCount, vectors: encodeVectors } =
  loadFixtures<EncodeFixture>("encode-vectors.json");
const { count: decodeCount, vectors: decodeVectors } =
  loadFixtures<DecodeFixture>("decode-vectors.json");
const { count: formatCount, vectors: formatVectors } =
  loadFixtures<FormatFixture>("format-vectors.json");
const { count: dateCount, vectors: dateVectors } = loadFixtures<DateFixture>("date-vectors.json");
const { count: uintCount, vectors: uintVectors } = loadFixtures<UintFixture>("uint-vectors.json");

const api = currentAdapterFor(src);

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
      // byte-identically - unless a fixture deliberately pins a decoder
      // rejection of the encoder's own output (none do at present).
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
        // Accepts re-encode to the exact input bytes, unless the fixture pins
        // the re-encoding of the decoded node (whole-valued float heads that
        // reduce to integers, as in the reference).
        expect(outcome).toEqual({ ok: true, hex: vector.expect.hex ?? vector.hex });
      } else {
        // All fixture rejections are decode-stage rejections by construction
        // (the generator verifies this); `stage` distinguishes them from
        // decode-accepted-but-reencode-threw, which would be a divergence.
        expect(outcome).toEqual({ ok: false, stage: "decode", code: vector.expect.code });
        // The message is the reference's error Display text (the Rust
        // harness compares it); pin it here so it cannot drift.
        expect(decodeErrorMessage(api, hexToBytes(vector.hex))).toBe(vector.expect.message);
      }
    });
  }
});

describe("golden format vectors (diagnostic and annotated hex, per tags store)", () => {
  it("fixture file is self-consistent and in sync with the corpus", async () => {
    expect(formatVectors.length).toBe(formatCount);
    const { formatCorpus } = await import("./vectors/format-corpus");
    expect(formatVectors.map((v) => v.name)).toEqual(formatCorpus.map((c) => c.name));
  });

  const storeFor = (config: FormatFixture["config"]): TagsStore => {
    const store = new TagsStore();
    if (config === "standard") registerStandardTags(store);
    if (config === "standard+bignum") registerStandardTags(store, { bignum: true });
    return store;
  };

  for (const vector of formatVectors) {
    it(vector.name, () => {
      const value =
        "hex" in vector.input
          ? decodeCbor(hexToBytes(vector.input.hex))
          : cbor(materialize(vector.input.recipe, api) as CborInput);
      const store = storeFor(vector.config);
      const tags = vector.config === "none" ? "none" : store;
      expect({
        hex: bytesToHex(encodeCbor(value)),
        diagnostic: diagnostic(value, { tags }),
        annotated: diagnostic(value, { annotate: true, tags }),
        flat: diagnostic(value, { flat: true, tags }),
        summary: diagnostic(value, { summarize: true, tags }),
        hexAnnotated: hexAnnotated(value, { tagsStore: store }),
      }).toEqual(vector.expect);
    });
  }
});

describe("golden date vectors (CborDate decode and display)", () => {
  it("fixture file is self-consistent and in sync with the corpus", async () => {
    expect(dateVectors.length).toBe(dateCount);
    const { dateCorpus } = await import("./vectors/date-corpus");
    expect(dateVectors.map((v) => v.name)).toEqual(dateCorpus.map((c) => c.name));
  });

  const outcome = (build: () => CborDate): DateExpect => {
    try {
      const date = build();
      return { ok: true, hex: bytesToHex(encodeCbor(date.toCbor())), display: date.toString() };
    } catch (e) {
      const code = api.errorCode(e);
      if (code === undefined) throw e;
      return { ok: false, code, message: (e as Error).message };
    }
  };

  for (const vector of dateVectors) {
    it(vector.name, () => {
      const actual =
        vector.kind === "decode"
          ? outcome(() => CborDate.fromTaggedCbor(decodeCbor(hexToBytes(vector.hex))))
          : outcome(() => materialize(vector.recipe, api) as CborDate);
      if (vector.expect.ok || vector.expect.message !== undefined) {
        expect(actual).toEqual(vector.expect);
      } else {
        // Display rows pin the code only.
        expect(actual.ok).toBe(false);
        expect(!actual.ok && actual.code).toBe(vector.expect.code);
      }
    });
  }
});

describe("golden unsigned-extraction vectors (expectUnsigned with width and wrapNegative)", () => {
  it("fixture file is self-consistent and in sync with the corpus", async () => {
    expect(uintVectors.length).toBe(uintCount);
    const { uintCorpus } = await import("./vectors/uint-corpus");
    expect(uintVectors.map((v) => v.name)).toEqual(uintCorpus.map((c) => c.name));
  });

  for (const vector of uintVectors) {
    it(vector.name, () => {
      let actual: UintFixture["expect"];
      try {
        const value = expectUnsigned(decodeCbor(hexToBytes(vector.hex)), {
          width: vector.width,
          wrapNegative: true,
        });
        actual = { ok: true, value: String(value) };
      } catch (e) {
        const code = api.errorCode(e);
        if (code === undefined) throw e;
        actual = { ok: false, code };
      }
      expect(actual).toEqual(vector.expect);
    });
  }
});

describe("golden vector fixture hygiene", () => {
  it("every CborError code that decode can raise has at least one reject vector", () => {
    // Bigint byte-string/text lengths (>= 2^53) report Underrun like every
    // other missing body - Rust parity - so OutOfRange is not decode-reachable;
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

  it("tombstone fixtures all expect a throw", () => {
    for (const vector of encodeVectors.filter((v) => v.tombstone)) {
      expect(vector.expect.ok, `${vector.name} (${vector.tombstone}) should throw`).toBe(false);
    }
  });
});
