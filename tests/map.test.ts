/**
 * `CborMap` positional access - the lockstep walk `cborEquals` and the encoder
 * use instead of materializing `entriesArray`.
 */

import { cbor, encodeCbor, cborEquals } from "../src/cbor";
import { CborMap } from "../src/map";
import { bytesToHex } from "../src/hex";
import { lexicographicallyCompareBytes } from "../src/stdlib";

describe("CborMap positional access (entryAt / encodedKeyAt)", () => {
  const build = (): CborMap => {
    const m = new CborMap();
    m.set("z", 1);
    m.set(10, "ten");
    m.set("é", true); // non-NFC text key
    m.set([1, 2], null);
    m.set(-1, 0.5);
    return m;
  };

  it("walks the same entries as entriesArray, in canonical order", () => {
    const m = build();
    const entries = m.entriesArray;
    expect(m.size).toBe(5);
    expect(entries).toHaveLength(m.size);
    for (let i = 0; i < m.size; i++) {
      expect(cborEquals(m.entryAt(i).key, entries[i].key)).toBe(true);
      expect(cborEquals(m.entryAt(i).value, entries[i].value)).toBe(true);
    }
    for (let i = 1; i < m.size; i++) {
      expect(lexicographicallyCompareBytes(m.encodedKeyAt(i - 1), m.encodedKeyAt(i))).toBeLessThan(
        0,
      );
    }
  });

  it("stores the encoded key bytes each entry is sorted by", () => {
    const m = build();
    for (let i = 0; i < m.size; i++) {
      expect(bytesToHex(m.encodedKeyAt(i))).toBe(bytesToHex(encodeCbor(m.entryAt(i).key)));
    }
  });

  it("encodes a non-NFC text key through its stored (NFC) bytes", () => {
    // The node keeps the decomposed string; the stored key bytes, and so the
    // wire, carry the composed form - the same bytes re-encoding would give.
    const m = new CborMap();
    m.set("é", true);
    expect(m.entryAt(0).key.type).toBe(3);
    expect(m.entryAt(0).key.value).toBe("é");
    expect(bytesToHex(m.encodedKeyAt(0))).toBe("62c3a9");
    expect(bytesToHex(encodeCbor(cbor(m)))).toBe("a162c3a9f5");
  });

  it("encodes to the same bytes regardless of insertion order", () => {
    const a = build();
    const b = new CborMap();
    b.set(-1, 0.5);
    b.set([1, 2], null);
    b.set("é", true);
    b.set(10, "ten");
    b.set("z", 1);
    expect(bytesToHex(encodeCbor(cbor(a)))).toBe(bytesToHex(encodeCbor(cbor(b))));
    expect(cborEquals(cbor(a), cbor(b))).toBe(true);
  });

  it("a replaced value keeps the entry's position and key bytes", () => {
    const m = build();
    const before = m.entriesArray.map((e) => e.key);
    m.set(10, "TEN");
    expect(m.size).toBe(5);
    for (let i = 0; i < m.size; i++) {
      expect(cborEquals(m.entryAt(i).key, before[i])).toBe(true);
    }
    expect(m.get(10)?.value).toBe("TEN");
  });

  it("structural equality stops at the first differing entry", () => {
    const a = build();
    const b = build();
    b.set("z", 2);
    expect(cborEquals(cbor(a), cbor(b))).toBe(false);
    const c = build();
    c.delete(-1);
    expect(cborEquals(cbor(a), cbor(c))).toBe(false); // size differs
  });
});
