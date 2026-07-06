/**
 * Hex front-door property tests (P3.6 gate, run at P4.1).
 *
 * Three obligations from the plan:
 *  1. old-vs-new byte equality: for every hex string the PRE-redesign
 *     `hexToBytes` decoded meaningfully (valid even-length hex), the new
 *     validating implementation produces bit-identical bytes - compared
 *     directly against the frozen baseline bundle's export;
 *  2. round-trips: bytes → hex → bytes and valid hex → bytes → hex are
 *     lossless (case-normalized);
 *  3. malformed hex (odd length, non-hex characters) now throws CborError
 *     code "Custom" instead of silently fabricating bytes.
 */

import fc from "fast-check";

import { bytesToHex, hexToBytes, CborError } from "../src";
import * as baseline from "./baseline/dcbor-baseline.mjs";

const hexChars = "0123456789abcdefABCDEF";
const validHexArb = fc
  .array(fc.integer({ min: 0, max: hexChars.length - 1 }), { maxLength: 64 })
  .map((idxs) => idxs.map((i) => hexChars[i]).join(""))
  .filter((s) => s.length % 2 === 0);

describe("hex property tests (old vs new, P3.6)", () => {
  it("valid hex decodes bit-identically to the pre-redesign implementation", () => {
    fc.assert(
      fc.property(validHexArb, (hex) => {
        const oldBytes = baseline.hexToBytes(hex);
        const newBytes = hexToBytes(hex);
        expect(bytesToHex(newBytes)).toBe(baseline.bytesToHex(oldBytes));
      }),
      { numRuns: 500 },
    );
  });

  it("whitespace-tolerant like the old implementation", () => {
    expect(bytesToHex(hexToBytes("de ad\nbe\tef"))).toBe("deadbeef");
    expect(bytesToHex(baseline.hexToBytes("de ad\nbe\tef"))).toBe("deadbeef");
  });

  it("bytes -> hex -> bytes round-trips losslessly", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
        const back = hexToBytes(bytesToHex(bytes));
        expect(back.length).toBe(bytes.length);
        expect(bytesToHex(back)).toBe(bytesToHex(bytes));
      }),
      { numRuns: 500 },
    );
  });

  it("valid hex -> bytes -> hex round-trips (case-normalized)", () => {
    fc.assert(
      fc.property(validHexArb, (hex) => {
        expect(bytesToHex(hexToBytes(hex))).toBe(hex.toLowerCase());
      }),
      { numRuns: 500 },
    );
  });

  it("fixed vectors: valid-hex byte equality", () => {
    for (const [hex, expected] of [
      ["", ""],
      ["00", "00"],
      ["DEADBEEF", "deadbeef"],
      ["0102030405060708090a0b0c0d0e0f", "0102030405060708090a0b0c0d0e0f"],
    ] as const) {
      expect(bytesToHex(hexToBytes(hex))).toBe(expected);
      expect(baseline.bytesToHex(baseline.hexToBytes(hex))).toBe(expected);
    }
  });

  it("malformed hex throws CborError Custom (previously fabricated bytes)", () => {
    for (const bad of ["z", "zz", "0", "123", "0x00", "gg", "0g", "abc", "é0"]) {
      let thrown: unknown;
      try {
        hexToBytes(bad);
      } catch (e) {
        thrown = e;
      }
      expect(CborError.isCborError(thrown), `expected throw for ${JSON.stringify(bad)}`).toBe(true);
      expect((thrown as CborError).code).toBe("Custom");
    }
  });

  it("property: odd-length or non-hex input always throws Custom", () => {
    const invalidArb = fc
      .string({ maxLength: 32 })
      .map((s) => s.replace(/\s/g, ""))
      .filter((s) => s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s));
    fc.assert(
      fc.property(invalidArb, (bad) => {
        let thrown: unknown;
        try {
          hexToBytes(bad);
        } catch (e) {
          thrown = e;
        }
        expect(CborError.isCborError(thrown)).toBe(true);
        expect((thrown as CborError).code).toBe("Custom");
      }),
      { numRuns: 300 },
    );
  });
});
