/**
 * Golden wire-format snapshots (REFACTOR_PLAN Phase 0.3).
 *
 * Encodes a broad corpus of values and snapshots the resulting hex. Any change
 * to the deterministic wire format - the thing the refactor must NOT alter -
 * shows up as a snapshot diff. Also asserts each value round-trips
 * byte-identically through decode + re-encode.
 */

import { cbor, encodeCbor, decodeCbor, CborMap, taggedValue } from "../src";
import type { CborInput } from "../src";

const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function mapOf(entries: [CborInput, CborInput][]): CborMap {
  const m = new CborMap();
  for (const [k, v] of entries) m.set(k, v);
  return m;
}

// [name, value] corpus spanning every major type + dCBOR edge cases.
const corpus: [string, CborInput][] = [
  ["uint zero", 0],
  ["uint small", 23],
  ["uint 24", 24],
  ["uint 1000000", 1000000],
  ["uint safe-max", Number.MAX_SAFE_INTEGER],
  ["uint u64::MAX", 18446744073709551615n],
  ["negative -1", -1],
  ["negative -1000", -1000],
  ["negative big", -18446744073709551616n],
  ["float 1.5", 1.5],
  ["float 3.14159", 3.14159265358979],
  ["float whole 42.0 reduces", 42.0],
  ["float 100000.0 reduces", 100000.0],
  ["nan", NaN],
  ["infinity", Infinity],
  ["-infinity", -Infinity],
  ["bool true", true],
  ["bool false", false],
  ["null", null],
  ["empty string", ""],
  ["string hello", "Hello"],
  ["string unicode", "こんにちは"],
  ["bytes empty", new Uint8Array(0)],
  ["bytes 00112233", new Uint8Array([0x00, 0x11, 0x22, 0x33])],
  ["array empty", []],
  ["array ints", [1, 2, 3]],
  ["array heterogeneous", [1, "two", true, null, [3, 4]]],
  ["map empty", new CborMap()],
  [
    "map mixed keys (canonical sort)",
    mapOf([
      [10, "ten"],
      [-1, "neg"],
      ["a", 1],
      [100, "hundred"],
      ["z", 2],
    ]),
  ],
  ["map with map key", mapOf([[mapOf([[1, 2]]), "nested-key"]])],
  ["tagged", taggedValue(1, "Hello")],
  ["tagged nested", taggedValue(100, taggedValue(200, [1, 2, 3]))],
  [
    "realistic document",
    mapOf([
      ["id", 1000000],
      ["title", "Important Document"],
      ["scores", [98, 87, 100]],
      ["active", true],
      ["balance", 18446744073709551615n],
      [
        "meta",
        mapOf([
          ["author", "Alice"],
          ["tags", ["a", "b"]],
        ]),
      ],
    ]),
  ],
];

describe("golden wire-format snapshots", () => {
  for (const [name, value] of corpus) {
    it(`encodes: ${name}`, () => {
      expect(toHex(encodeCbor(value))).toMatchSnapshot();
    });

    it(`round-trips: ${name}`, () => {
      const bytes = encodeCbor(value);
      const reencoded = encodeCbor(decodeCbor(bytes));
      expect(toHex(reencoded)).toBe(toHex(bytes));
      // The decoded value re-encodes identically via cbor() as well.
      expect(toHex(encodeCbor(cbor(value)))).toBe(toHex(bytes));
    });
  }
});
