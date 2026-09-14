/**
 * Golden wire-vector fixture generator.
 *
 * Usage: bun scripts/generate-vectors.ts
 *
 * Encodes the curated corpus (tests/vectors/encode-corpus.ts) with the
 * WORKING TREE and writes the expected outcomes to
 * tests/vectors/encode-vectors.json; verifies every curated decode vector
 * (tests/vectors/decode-corpus.ts) against the working tree and writes
 * tests/vectors/decode-vectors.json.
 *
 * The JSON fixtures are the committed source of truth that
 * tests/golden-vectors.test.ts checks on every run. Regenerating them is a
 * DELIBERATE act: the diff is the reviewable record of any wire-format
 * change. Review every changed expectation before committing it.
 *
 * Hard-fails (exit 1) if:
 *  - any decode vector's actual outcome differs from the corpus expectation
 *  - any accepted decode vector does not re-encode byte-identically
 *  - any successful encode vector does not round-trip through decode
 *  - any recipe is not JSON-round-trip-safe
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as src from "../src/index.ts";
import { diagnostic } from "../src/diag.ts";
import { hexAnnotated } from "../src/dump.ts";
import {
  currentAdapterFor,
  decodeErrorMessage,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
  materialize,
  bytesToHex,
} from "../tests/vectors/recipes.ts";
import { encodeCorpus } from "../tests/vectors/encode-corpus.ts";
import { decodeCorpus } from "../tests/vectors/decode-corpus.ts";
import { formatCorpus, type FormatConfig } from "../tests/vectors/format-corpus.ts";
import { dateCorpus } from "../tests/vectors/date-corpus.ts";
import { uintCorpus } from "../tests/vectors/uint-corpus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = currentAdapterFor(src);

/** Above this many bytes, fixtures store a digest instead of full hex. */
const DIGEST_THRESHOLD_BYTES = 512;

const sha256 = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

let sourceCommit = "unknown";
try {
  sourceCommit = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
} catch {
  /* not fatal - metadata only */
}

const problems = [];

// ---------------------------------------------------------------------------
// Encode fixtures
// ---------------------------------------------------------------------------

const encodeFixtures = [];
for (const entry of encodeCorpus) {
  // Recipes must survive the JSON fixture round trip exactly.
  const rt = JSON.parse(JSON.stringify(entry.recipe));
  if (JSON.stringify(rt) !== JSON.stringify(entry.recipe)) {
    problems.push(`encode ${entry.name}: recipe is not JSON-round-trip-safe`);
    continue;
  }

  const outcome = encodeOutcome(api, entry.recipe);
  let expect: {
    ok: boolean;
    code?: string;
    byteLength?: number;
    sha256?: string;
    hexPrefix?: string;
    hex?: string;
    decodeRejects?: string;
  };
  if (!outcome.ok) {
    expect = { ok: false, code: outcome.code };
  } else {
    // Round-trip lock: encoder output must decode and re-encode
    // byte-identically (dCBOR determinism). An output the decoder rejects is
    // pinned with `decodeRejects` instead of failing the run; no current
    // fixture needs it, but the escape hatch stays so such a quirk is
    // recorded deliberately rather than silently.
    const back = decodeOutcome(api, hexToBytes(outcome.hex));
    let decodeRejects;
    if (!back.ok) {
      if (back.stage !== "decode") {
        problems.push(`encode ${entry.name}: output re-encode threw ${back.code}`);
        continue;
      }
      decodeRejects = back.code;
    } else if (back.hex !== outcome.hex) {
      problems.push(`encode ${entry.name}: decode->re-encode diverges`);
      continue;
    }
    const byteLength = outcome.hex.length / 2;
    expect =
      byteLength > DIGEST_THRESHOLD_BYTES
        ? { ok: true, byteLength, sha256: sha256(outcome.hex), hexPrefix: outcome.hex.slice(0, 32) }
        : { ok: true, hex: outcome.hex };
    if (decodeRejects !== undefined) expect.decodeRejects = decodeRejects;
  }
  const fixture = {
    name: entry.name,
    recipe: entry.recipe,
    expect,
    ...(entry.tombstone ? { tombstone: entry.tombstone } : {}),
  };
  encodeFixtures.push(fixture);
}

// ---------------------------------------------------------------------------
// Decode fixtures - re-verify every curated expectation before committing it.
// ---------------------------------------------------------------------------

const decodeFixtures = [];
for (const entry of decodeCorpus) {
  const actual = decodeOutcome(api, hexToBytes(entry.hex));
  if (entry.expect.ok) {
    if (!actual.ok) {
      problems.push(`decode ${entry.name}: expected accept, got ${actual.code}`);
      continue;
    }
    // Accepts re-encode byte-identically unless the entry pins the bytes
    // the decoded node re-encodes to (whole-valued float heads -> integers).
    const want = entry.expect.hex ?? entry.hex;
    if (actual.hex !== want) {
      problems.push(`decode ${entry.name}: accepted but re-encoded to ${actual.hex}, expected ${want}`);
      continue;
    }
  } else {
    if (actual.ok) {
      problems.push(`decode ${entry.name}: expected ${entry.expect.code}, but it decoded`);
      continue;
    }
    if (actual.stage !== "decode") {
      problems.push(
        `decode ${entry.name}: rejected at ${actual.stage} stage, not decode (${actual.code})`,
      );
      continue;
    }
    if (actual.code !== entry.expect.code) {
      problems.push(`decode ${entry.name}: expected ${entry.expect.code}, got ${actual.code}`);
      continue;
    }
  }
  // Rejections also pin the error message: the reference's `Display` text
  // is part of the contract (the Rust harness compares `e.to_string()`).
  const expect = entry.expect.ok
    ? entry.expect
    : { ...entry.expect, message: decodeErrorMessage(api, hexToBytes(entry.hex)) };
  decodeFixtures.push({ name: entry.name, hex: entry.hex, expect, note: entry.note });
}

// ---------------------------------------------------------------------------
// Format fixtures - the five textual renderings under a chosen tags store.
// ---------------------------------------------------------------------------

const storeFor = (config: FormatConfig): src.TagsStore => {
  const store = new src.TagsStore();
  if (config === "standard") src.registerStandardTags(store);
  if (config === "standard+bignum") src.registerStandardTags(store, { bignum: true });
  return store;
};

const formatFixtures = [];
for (const entry of formatCorpus) {
  let value: src.Cbor;
  if ("hex" in entry.input) {
    value = src.decodeCbor(hexToBytes(entry.input.hex));
  } else {
    try {
      value = src.cbor(materialize(entry.input.recipe, api) as src.CborInput);
    } catch (e) {
      problems.push(`format ${entry.name}: recipe does not construct (${String(e)})`);
      continue;
    }
  }
  const store = storeFor(entry.config);
  const tags = entry.config === "none" ? "none" : store;
  formatFixtures.push({
    name: entry.name,
    input: entry.input,
    config: entry.config,
    ...(entry.build === undefined ? {} : { build: entry.build }),
    expect: {
      hex: bytesToHex(src.encodeCbor(value)),
      diagnostic: diagnostic(value, { tags }),
      annotated: diagnostic(value, { annotate: true, tags }),
      flat: diagnostic(value, { flat: true, tags }),
      summary: diagnostic(value, { summarize: true, tags }),
      hexAnnotated: hexAnnotated(value, { tagsStore: store }),
    },
    ...(entry.note === undefined ? {} : { note: entry.note }),
  });
}

// ---------------------------------------------------------------------------
// Date fixtures - CborDate decode and display.
// ---------------------------------------------------------------------------

const errorOutcome = (e: unknown): { ok: false; code: string; message: string } => {
  const code = api.errorCode(e);
  if (code === undefined) throw e;
  return { ok: false, code, message: (e as Error).message };
};

const dateFixtures = [];
for (const entry of dateCorpus) {
  let expect;
  if (entry.kind === "decode") {
    try {
      const date = src.CborDate.fromTaggedCbor(src.decodeCbor(hexToBytes(entry.hex)));
      expect = { ok: true, hex: bytesToHex(src.encodeCbor(date.toCbor())), display: date.toString() };
    } catch (e) {
      expect = errorOutcome(e);
    }
    dateFixtures.push({ name: entry.name, kind: entry.kind, hex: entry.hex, expect, ...(entry.note === undefined ? {} : { note: entry.note }) });
  } else {
    try {
      const date = materialize(entry.recipe, api) as src.CborDate;
      expect = { ok: true, hex: bytesToHex(src.encodeCbor(date.toCbor())), display: date.toString() };
    } catch (e) {
      const { code } = errorOutcome(e);
      expect = { ok: false, code };
    }
    dateFixtures.push({ name: entry.name, kind: entry.kind, recipe: entry.recipe, expect, ...(entry.note === undefined ? {} : { note: entry.note }) });
  }
}

// ---------------------------------------------------------------------------
// Unsigned-extraction fixtures - expectUnsigned(cbor, { width, wrapNegative }).
// ---------------------------------------------------------------------------

const uintFixtures = [];
for (const entry of uintCorpus) {
  let expect;
  try {
    const value = src.expectUnsigned(src.decodeCbor(hexToBytes(entry.hex)), {
      width: entry.width,
      wrapNegative: true,
    });
    expect = { ok: true, value: String(value) };
  } catch (e) {
    const { code } = errorOutcome(e);
    expect = { ok: false, code };
  }
  uintFixtures.push({ name: entry.name, hex: entry.hex, width: entry.width, expect, ...(entry.note === undefined ? {} : { note: entry.note }) });
}

if (problems.length > 0) {
  console.error(`vector generation FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const meta = (count: number) => ({
  "//": "GENERATED by scripts/generate-vectors.ts - do not edit by hand. Review regenerated expectations before committing them.",
  sourceCommit,
  count,
});

writeFileSync(
  join(root, "tests/vectors/encode-vectors.json"),
  JSON.stringify({ ...meta(encodeFixtures.length), vectors: encodeFixtures }, null, 1) + "\n",
);
writeFileSync(
  join(root, "tests/vectors/decode-vectors.json"),
  JSON.stringify({ ...meta(decodeFixtures.length), vectors: decodeFixtures }, null, 1) + "\n",
);
writeFileSync(
  join(root, "tests/vectors/format-vectors.json"),
  JSON.stringify({ ...meta(formatFixtures.length), vectors: formatFixtures }, null, 1) + "\n",
);
writeFileSync(
  join(root, "tests/vectors/date-vectors.json"),
  JSON.stringify({ ...meta(dateFixtures.length), vectors: dateFixtures }, null, 1) + "\n",
);
writeFileSync(
  join(root, "tests/vectors/uint-vectors.json"),
  JSON.stringify({ ...meta(uintFixtures.length), vectors: uintFixtures }, null, 1) + "\n",
);

const throwing = encodeFixtures.filter((f) => !f.expect.ok).length;
const digests = encodeFixtures.filter((f) => f.expect.ok && f.expect.sha256).length;
console.log(
  `encode-vectors.json: ${encodeFixtures.length} vectors (${throwing} expected-throw, ${digests} digest-form)`,
);
console.log(
  `decode-vectors.json: ${decodeFixtures.length} vectors (${decodeFixtures.filter((f) => !f.expect.ok).length} rejections)`,
);
console.log(`format-vectors.json: ${formatFixtures.length} vectors`);
console.log(
  `date-vectors.json: ${dateFixtures.length} vectors (${dateFixtures.filter((f) => !f.expect.ok).length} rejections)`,
);
console.log(
  `uint-vectors.json: ${uintFixtures.length} vectors (${uintFixtures.filter((f) => !f.expect.ok).length} rejections)`,
);
console.log(`source commit: ${sourceCommit}`);
