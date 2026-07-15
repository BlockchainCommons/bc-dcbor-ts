/**
 * Round-trip stability property test (REFACTOR_PLAN Phase 0.4).
 *
 * For any dCBOR-representable value, re-encoding the decoded bytes must produce
 * byte-identical output: encode(decode(encode(v))) === encode(v). This is the
 * strongest safety net for the encoder/decoder rewrite in later phases - it
 * exercises far more inputs than the hand-written vectors.
 *
 * Strings are restricted to printable ASCII so generated inputs are always
 * valid UTF-8 and in NFC (dedicated tests cover the UTF-8/NFC rejection paths);
 * this keeps the property focused on structural round-trip stability.
 */

import fc from "fast-check";
import { encodeCbor, decodeCbor } from "../src";
import type { CborInput } from "../src";

const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const asciiString = fc
  .array(fc.integer({ min: 32, max: 126 }), { maxLength: 24 })
  .map((codes) => String.fromCharCode(...codes));

const leaf = fc.oneof(
  fc.integer(),
  fc.bigInt({ min: -18446744073709551616n, max: 18446744073709551615n }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  asciiString,
  fc.boolean(),
  fc.constant(null),
);

const { tree } = fc.letrec((tie) => ({
  tree: fc.oneof(
    { maxDepth: 4, withCrossShrink: true },
    leaf,
    fc.array(tie("tree"), { maxLength: 6 }),
    fc.dictionary(asciiString, tie("tree"), { maxKeys: 6 }),
  ),
}));

describe("round-trip stability (property)", () => {
  it("encode(decode(encode(v))) === encode(v)", () => {
    fc.assert(
      fc.property(tree, (v) => {
        const bytes = encodeCbor(v as CborInput);
        const reencoded = encodeCbor(decodeCbor(bytes));
        return toHex(reencoded) === toHex(bytes);
      }),
      { numRuns: 400 },
    );
  });
});
