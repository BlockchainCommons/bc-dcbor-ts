/**
 * Error handling tests for dCBOR TypeScript implementation.
 *
 * Tests the CborError class: its CborErrorCode discriminant, structured
 * details, static factories, messages, and the throw/Result paths.
 */

import { CborError, Ok, Err, type Result } from "../src/error";
import { cbor, encodeCbor } from "../src/cbor";
import { decodeCbor, tryDecode } from "../src/decode";
import { Tag } from "../src/tag";
import { CborMap } from "../src/map";
import { extractCbor } from "../src";

/** Helper to convert a hex string to a Uint8Array. */
function hexToBytes(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
  }
  return bytes;
}

describe("CborError", () => {
  describe("CborError class", () => {
    test("custom() carries the message and code", () => {
      const error = CborError.custom("Test error");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CborError);
      expect(error.name).toBe("CborError");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("Custom");
    });

    test("factories carry a default message", () => {
      const error = CborError.underrun();

      expect(error.message).toBe("early end of CBOR data");
      expect(error.code).toBe("Underrun");
    });

    test("has stack trace", () => {
      const error = CborError.custom("Stack test");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("CborError");
    });

    test("isCborError type guard works", () => {
      expect(CborError.isCborError(CborError.custom("CBOR error"))).toBe(true);
      expect(CborError.isCborError(new Error("Regular error"))).toBe(false);
      expect(CborError.isCborError(null)).toBe(false);
      expect(CborError.isCborError(undefined)).toBe(false);
      expect(CborError.isCborError("not an error")).toBe(false);
    });

    test("structured details are attached per code", () => {
      const unused = CborError.unusedData(5);
      expect(unused.code).toBe("UnusedData");
      expect(unused.details.count).toBe(5);

      const header = CborError.unsupportedHeaderValue(0xff);
      expect(header.details.headerValue).toBe(0xff);

      const t1 = Tag.from(1, "a");
      const t2 = Tag.from(2, "b");
      const wrong = CborError.wrongTag(t1, t2);
      expect(wrong.details.expectedTag).toBe(t1);
      expect(wrong.details.actualTag).toBe(t2);

      const utf8 = CborError.invalidUtf8("bad bytes");
      expect(utf8.details.cause).toBe("bad bytes");
    });
  });

  describe("factory messages", () => {
    test("Underrun", () => {
      expect(CborError.underrun().message).toBe("early end of CBOR data");
    });
    test("UnsupportedHeaderValue", () => {
      expect(CborError.unsupportedHeaderValue(0xff).message).toBe(
        "unsupported value in CBOR header",
      );
    });
    test("NonCanonicalNumeric", () => {
      expect(CborError.nonCanonicalNumeric().message).toBe(
        "a CBOR numeric value was encoded in non-canonical form",
      );
    });
    test("InvalidSimpleValue", () => {
      expect(CborError.invalidSimpleValue().message).toBe(
        "an invalid CBOR simple value was encountered",
      );
    });
    test("InvalidString", () => {
      expect(CborError.invalidString("bad UTF-8").message).toBe(
        "an invalidly-encoded UTF-8 string was encountered in the CBOR (bad UTF-8)",
      );
    });
    test("NonCanonicalString", () => {
      expect(CborError.nonCanonicalString().message).toBe(
        "a CBOR string was not encoded in Unicode Canonical Normalization Form C",
      );
    });
    test("UnusedData", () => {
      expect(CborError.unusedData(5).message).toBe("the decoded CBOR had 5 extra bytes at the end");
    });
    test("MisorderedMapKey", () => {
      expect(CborError.misorderedMapKey().message).toBe(
        "the decoded CBOR map has keys that are not in canonical order",
      );
    });
    test("DuplicateMapKey", () => {
      expect(CborError.duplicateMapKey().message).toBe("the decoded CBOR map has a duplicate key");
    });
    test("MissingMapKey", () => {
      expect(CborError.missingMapKey().message).toBe("missing CBOR map key");
    });
    test("OutOfRange", () => {
      expect(CborError.outOfRange().message).toBe(
        "the CBOR numeric value could not be represented in the specified numeric type",
      );
    });
    test("WrongType", () => {
      expect(CborError.wrongType().message).toBe(
        "the decoded CBOR value was not the expected type",
      );
    });
    test("WrongTag", () => {
      const msg = CborError.wrongTag(Tag.from(1, "tag1"), Tag.from(2, "tag2")).message;
      expect(msg).toContain("expected CBOR tag");
      expect(msg).toContain("but got");
    });
    test("InvalidUtf8", () => {
      const e = CborError.invalidUtf8("invalid byte sequence");
      expect(e.code).toBe("InvalidUtf8");
      expect(e.message).toContain("invalid byte sequence");
    });
    test("InvalidDate", () => {
      const e = CborError.invalidDate("not a valid ISO 8601 date");
      expect(e.code).toBe("InvalidDate");
      expect(e.message).toContain("not a valid ISO 8601 date");
    });
    test("Custom", () => {
      expect(CborError.custom("Something went wrong").message).toBe("Something went wrong");
    });
  });

  describe("Result type", () => {
    test("Ok creates successful result", () => {
      const result: Result<number> = Ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test("Err creates failed result carrying a CborError", () => {
      const result: Result<number> = Err(CborError.custom("Failed"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CborError);
        expect(result.error.code).toBe("Custom");
        expect(result.error.message).toBe("Failed");
      }
    });
  });

  describe("tryDecode (non-throwing decode)", () => {
    test("returns Ok for valid CBOR", () => {
      const result = tryDecode(new Uint8Array([0x00]));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe(0);
    });

    test("returns Err(CborError) for invalid CBOR", () => {
      const result = tryDecode(new Uint8Array([0x00, 0xff, 0xff]));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CborError);
        expect(result.error.code).toBe("UnusedData");
      }
    });
  });

  describe("Error handling in encoding", () => {
    test("throws CborError for unsupported type", () => {
      // Symbol is not supported by CborInput
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unsupported = Symbol("test") as any;

      expect(() => cbor(unsupported)).toThrow(CborError);

      try {
        cbor(unsupported);
      } catch (e) {
        if (CborError.isCborError(e)) {
          expect(e.code).toBe("Custom");
          expect(e.message).toContain("Unsupported type");
        }
      }
    });

    test("throws CborError for functions", () => {
      const func = () => "test";
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cbor(func as any);
      }).toThrow(CborError);
    });
  });

  describe("Error handling in decoding", () => {
    test("throws CborError for truncated data (Underrun)", () => {
      const truncated = new Uint8Array([0x4a, 0x01, 0x02]); // byte string of length 10, only 2 bytes
      expect(() => decodeCbor(truncated)).toThrow(CborError);
    });

    test("throws CborError for extra data after CBOR (UnusedData)", () => {
      const withExtra = new Uint8Array([0x00, 0xff, 0xff]);
      expect(() => decodeCbor(withExtra)).toThrow(CborError);
      try {
        decodeCbor(withExtra);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("UnusedData");
      }
    });

    test("throws CborError for non-canonical numeric encoding", () => {
      const nonCanonical = new Uint8Array([0x18, 0x17]); // Should be just 0x17
      expect(() => decodeCbor(nonCanonical)).toThrow(CborError);
      try {
        decodeCbor(nonCanonical);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("NonCanonicalNumeric");
      }
    });

    // Regression for C3: invalid UTF-8 must be rejected, not decoded to U+FFFD.
    test("throws InvalidUtf8 for invalid UTF-8 text strings (C3)", () => {
      const badUtf8 = new Uint8Array([0x62, 0xc3, 0x28]);
      expect(() => decodeCbor(badUtf8)).toThrow(CborError);
      try {
        decodeCbor(badUtf8);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("InvalidUtf8");
      }
      expect(() => decodeCbor(new Uint8Array([0x61, 0xff]))).toThrow(CborError);
    });

    test("accepts valid UTF-8 (incl. multibyte) text strings", () => {
      const ok = new Uint8Array([0x62, 0xc3, 0xa9]); // "é" NFC
      const c = decodeCbor(ok);
      expect(c.type).toBe(3);
      expect(c.value).toBe("é");
    });

    // Regression for C4: interleaved-misordered map keys must be rejected.
    test("throws MisorderedMapKey for interleaved-misordered map keys (C4)", () => {
      const interleaved = hexToBytes("a3010103030202");
      expect(() => decodeCbor(interleaved)).toThrow(CborError);
      try {
        decodeCbor(interleaved);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("MisorderedMapKey");
      }
    });

    test("accepts a canonically-ordered 3-key map (C4 control)", () => {
      const ordered = hexToBytes("a3010102020303");
      expect(decodeCbor(ordered).type).toBe(5);
    });

    // Regression for M3: a truncated inner item surfaces as Underrun even when
    // the input is a sub-array of a larger ArrayBuffer.
    test("does not read past the logical end of a sub-array input (M3)", () => {
      const backing = hexToBytes("8201ffff");
      const logical = backing.subarray(0, 2); // only `82 01`
      expect(() => decodeCbor(logical)).toThrow(CborError);
      try {
        decodeCbor(logical);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("Underrun");
      }
    });

    test("decodes a valid item that is a sub-array of a larger buffer (M3 control)", () => {
      const backing = hexToBytes("820102ffff");
      const logical = backing.subarray(0, 3); // `82 01 02`
      expect(decodeCbor(logical).type).toBe(4);
    });
  });

  describe("Error handling in map operations", () => {
    test("throws CborError for missing map key", () => {
      const map = new CborMap();
      map.set("key1", "value1");
      expect(() => extractCbor(map.getOrThrow("nonexistent"))).toThrow(CborError);
      try {
        extractCbor(map.getOrThrow("nonexistent"));
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("MissingMapKey");
      }
    });

    test("throws CborError (DuplicateMapKey) for a repeated setNext key", () => {
      const map = new CborMap();
      map.set("aaa", 1);
      expect(() => map.setNext("aaa", 2)).toThrow(CborError);
      try {
        map.setNext("aaa", 2);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("DuplicateMapKey");
      }
    });

    test("throws CborError for keys not in ascending order", () => {
      const map = new CborMap();
      map.set("bbb", 1);
      expect(() => map.setNext("aaa", 2)).toThrow(CborError);
      try {
        map.setNext("aaa", 2);
      } catch (e) {
        if (CborError.isCborError(e)) expect(e.code).toBe("MisorderedMapKey");
      }
    });
  });

  describe("Error context preservation", () => {
    test("error retains original information when caught", () => {
      const originalMessage = "Original error context";
      const error = CborError.custom(originalMessage);
      try {
        throw error;
      } catch (e) {
        expect(CborError.isCborError(e)).toBe(true);
        if (CborError.isCborError(e)) {
          expect(e.message).toBe(originalMessage);
          expect(e.code).toBe("Custom");
          expect(e.stack).toBeDefined();
        }
      }
    });

    test("error provides useful debugging information", () => {
      const error = CborError.wrongTag(Tag.from(1, "expected"), Tag.from(2, "actual"));
      expect(error.message).toContain("expected");
      expect(error.message).toContain("actual");
      expect(error.code).toBe("WrongTag");
    });
  });

  describe("Integration: error propagation", () => {
    test("encoding errors propagate correctly", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidValue = { fn: () => "test" } as any;
      expect(() => cbor(invalidValue)).toThrow(CborError);
      try {
        cbor(invalidValue);
      } catch (e) {
        expect(CborError.isCborError(e)).toBe(true);
        if (CborError.isCborError(e)) expect(e.code).toBe("Custom");
      }
    });

    test("decoding errors preserve error information", () => {
      const invalidCbor = new Uint8Array([0xff]); // Invalid header
      expect(() => decodeCbor(invalidCbor)).toThrow(CborError);
      try {
        decodeCbor(invalidCbor);
      } catch (e) {
        expect(CborError.isCborError(e)).toBe(true);
        if (CborError.isCborError(e)) {
          expect(e.code).toBeTruthy();
          expect(e.message).toBeTruthy();
        }
      }
    });
  });

  describe("Real-world error scenarios", () => {
    test("handles malformed CBOR gracefully", () => {
      const testCases = [
        new Uint8Array([0x1f]),
        new Uint8Array([0x5f]),
        new Uint8Array([0x7f]),
        new Uint8Array([0x9f]),
        new Uint8Array([0xbf]),
      ];
      for (const data of testCases) {
        expect(() => decodeCbor(data)).toThrow(CborError);
      }
    });

    test("provides clear error messages for common mistakes", () => {
      expect(encodeCbor(undefined)).toBeDefined();
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cbor(Symbol("test") as any);
      }).toThrow(CborError);
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cbor((() => {}) as any);
      }).toThrow(CborError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => cbor({ fn: () => "test" } as any)).toThrow(CborError);
    });
  });
});
