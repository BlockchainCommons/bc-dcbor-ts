/**
 * Golden wire-vector fixture generator (API_REDESIGN_PLAN P1.1a).
 *
 * Usage: bun scripts/generate-vectors.mjs
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
 * change, and during the API redesign the wire format is frozen - a diff
 * outside the two planned tombstone flips is a bug.
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
import {
  redesignedAdapterFor,
  bytesToHex,
  decodeOutcome,
  encodeOutcome,
  hexToBytes,
} from "../tests/vectors/recipes.ts";
import { encodeCorpus } from "../tests/vectors/encode-corpus.ts";
import { decodeCorpus } from "../tests/vectors/decode-corpus.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = redesignedAdapterFor(src);

/** Above this many bytes, fixtures store a digest instead of full hex. */
const DIGEST_THRESHOLD_BYTES = 512;

const sha256 = (hex) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

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
  let expect;
  if (!outcome.ok) {
    expect = { ok: false, code: outcome.code };
  } else {
    // Round-trip lock: encoder output must decode and re-encode
    // byte-identically (dCBOR determinism) - EXCEPT the frozen bare-Float
    // quirk where the float ladder emits 0xfa floats for whole values that
    // the decoder's canonicality re-encode then rejects. Those are pinned
    // with `decodeRejects` so the quirk itself is frozen.
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
  const fixture = { name: entry.name, recipe: entry.recipe, expect };
  if (entry.tombstone) fixture.tombstone = entry.tombstone;
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
    if (actual.hex !== entry.hex) {
      problems.push(
        `decode ${entry.name}: accepted but re-encoded to ${actual.hex} (not byte-identical)`,
      );
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
  decodeFixtures.push({ name: entry.name, hex: entry.hex, expect: entry.expect, note: entry.note });
}

if (problems.length > 0) {
  console.error(`vector generation FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const meta = (count) => ({
  "//": "GENERATED by scripts/generate-vectors.mjs - do not edit by hand. Regeneration is a deliberate, reviewed act (see API_REDESIGN_PLAN.md P1.1).",
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

const throwing = encodeFixtures.filter((f) => !f.expect.ok).length;
const digests = encodeFixtures.filter((f) => f.expect.ok && f.expect.sha256).length;
console.log(
  `encode-vectors.json: ${encodeFixtures.length} vectors (${throwing} expected-throw, ${digests} digest-form)`,
);
console.log(
  `decode-vectors.json: ${decodeFixtures.length} vectors (${decodeFixtures.filter((f) => !f.expect.ok).length} rejections)`,
);
console.log(`source commit: ${sourceCommit}`);
