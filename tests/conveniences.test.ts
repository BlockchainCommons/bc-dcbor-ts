/**
 * Regression tests for the medium-severity parity fixes (M1, M4, M5) from the
 * dCBOR Rust parity audit.
 */

import { describe, test, expect } from "vitest";
import {
  cbor,
  taggedValue,
  hasTag,
  getTaggedContent,
  expectTaggedContent,
  expectUnsigned,
  validateTag,
  asFloat,
  expectFloat,
  TagsStore,
  CborError,
  Tag,
  decodeCbor,
  hexToBytes,
  registerStandardTags,
  getGlobalTagsStore,
} from "../src";
import { diagnostic } from "../src/diag";

describe("M1: value-normalized tag equality (number/bigint boundary)", () => {
  test("hasTag matches across the number/bigint divide", () => {
    const tagNum = taggedValue(100, 1); // tag stored as number 100
    const tagBig = taggedValue(100n, 1); // tag stored as bigint 100n
    // Rust's Tag equality is value-only over u64; in JS `100n === 100` is false,
    // so the raw === used previously would have rejected these.
    expect(hasTag(tagNum, 100n)).toBe(true);
    expect(hasTag(tagBig, 100)).toBe(true);
    expect(hasTag(tagNum, 100)).toBe(true);
    expect(hasTag(tagBig, 100n)).toBe(true);
    // Still rejects a genuinely different tag value.
    expect(hasTag(tagNum, 101)).toBe(false);
    expect(hasTag(tagNum, 101n)).toBe(false);
  });

  test("getTaggedContent / expectTaggedContent match across number/bigint", () => {
    const tagBig = taggedValue(100n, 7);
    expect(getTaggedContent(tagBig, 100)).not.toBeUndefined();
    expect(expectTaggedContent(tagBig, 100).type).toBeDefined();

    const tagNum = taggedValue(100, 7);
    expect(getTaggedContent(tagNum, 100n)).not.toBeUndefined();
    expect(expectTaggedContent(tagNum, 100n).type).toBeDefined();
  });

  test("expectTaggedContent still throws WrongTag for a real mismatch", () => {
    const t = taggedValue(100, 1);
    expect(() => expectTaggedContent(t, 101)).toThrow(CborError);
  });

  test("expectTaggedContent / validateTag match across number/bigint", () => {
    const tagBig = taggedValue(100n, 1);
    // a bigint-stored tag matches a number-declared expected tag.
    expect(() => expectTaggedContent(tagBig, 100)).not.toThrow();
    // validateTag returns the matching *expected* Tag object (declared as 100).
    expect(validateTag(tagBig, [{ value: 100 }]).value).toBe(100);
    // and a number-stored tag matches a bigint-declared expected tag.
    const tagNum = taggedValue(100, 1);
    expect(validateTag(tagNum, [{ value: 100n }]).value).toBe(100n);
  });
});

describe("expectTaggedContent names both tags like try_into_expected_tagged_value (DCBOR-10)", () => {
  // Executed on dcbor 0.25.2. A numeric expected tag is `Tag::with_value`
  // (unnamed, whatever the store knows); a `Tag` keeps its name; the actual
  // tag is the one the node carries (decoded nodes carry none).
  const message = (f: () => unknown): string => {
    try {
      f();
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "(no throw)";
  };
  const node = () => taggedValue(Tag.from(99, "x"), 0);

  test("numeric expected tags stay unnamed, before and after registration", () => {
    expect(message(() => expectTaggedContent(node(), 40000))).toBe(
      "expected CBOR tag 40000, but got x",
    );
    registerStandardTags();
    getGlobalTagsStore().register(Tag.from(40000, "kv"));
    expect(message(() => expectTaggedContent(node(), 40000))).toBe(
      "expected CBOR tag 40000, but got x",
    );
    expect(message(() => expectTaggedContent(node(), 40000n))).toBe(
      "expected CBOR tag 40000, but got x",
    );
  });

  test("a Tag argument keeps its name", () => {
    expect(message(() => expectTaggedContent(node(), Tag.from(40000, "kvexp")))).toBe(
      "expected CBOR tag kvexp, but got x",
    );
    expect(expectTaggedContent(node(), Tag.from(99, "anything")).type).toBe(0);
  });

  test("a decoded node reports its bare number", () => {
    expect(message(() => expectTaggedContent(decodeCbor(hexToBytes("d86300")), 40000))).toBe(
      "expected CBOR tag 40000, but got 99",
    );
  });
});

describe("expectUnsigned with a width wraps negatives like u*::try_from (COMP-01)", () => {
  // Executed on dcbor 0.25.2 (`u8/u32/u64::try_from(CBOR)`): the magnitude on
  // the wire must fit the width (else OutOfRange); a negative then wraps.
  const code = (f: () => unknown): string => {
    try {
      f();
    } catch (e) {
      return CborError.isCborError(e) ? e.code : "foreign";
    }
    return "(no throw)";
  };
  const wrap = (v: number | bigint, width: 8 | 16 | 32 | 64) =>
    expectUnsigned(cbor(v), { width, wrapNegative: true });

  test("width 8", () => {
    expect(wrap(-1, 8)).toBe(255);
    expect(wrap(-256, 8)).toBe(0);
    expect(code(() => wrap(-257, 8))).toBe("OutOfRange");
    expect(code(() => wrap(256, 8))).toBe("OutOfRange");
    expect(wrap(255, 8)).toBe(255);
    expect(wrap(0, 8)).toBe(0);
  });

  test("width 16 and 32", () => {
    expect(wrap(-1, 16)).toBe(65535);
    expect(code(() => wrap(65536, 16))).toBe("OutOfRange");
    expect(wrap(-1, 32)).toBe(4294967295);
    expect(wrap(-(2 ** 32), 32)).toBe(0);
    expect(code(() => wrap(-(2 ** 32) - 1, 32))).toBe("OutOfRange");
    expect(code(() => wrap(2 ** 32, 32))).toBe("OutOfRange");
  });

  test("width 64 returns bigint above the safe range", () => {
    expect(wrap(-(2n ** 64n), 64)).toBe(0);
    expect(wrap(-1, 64)).toBe(18446744073709551615n);
    expect(wrap(2n ** 64n - 1n, 64)).toBe(18446744073709551615n);
    expect(wrap(2n ** 53n, 64)).toBe(9007199254740992n);
    expect(wrap(5, 64)).toBe(5);
    // −2^64 is the 65-bit negative `3bffffffffffffffff`, decodable but not a JS number.
    expect(
      expectUnsigned(decodeCbor(hexToBytes("3bffffffffffffffff")), {
        width: 64,
        wrapNegative: true,
      }),
    ).toBe(0);
  });

  test("without wrapNegative a negative is WrongType; non-integers are WrongType", () => {
    expect(code(() => expectUnsigned(cbor(-1), { width: 8 }))).toBe("WrongType");
    expect(code(() => expectUnsigned(cbor(1.5), { width: 8, wrapNegative: true }))).toBe(
      "WrongType",
    );
    expect(code(() => expectUnsigned(cbor("1"), { width: 8, wrapNegative: true }))).toBe(
      "WrongType",
    );
    expect(code(() => expectUnsigned(cbor(300), { width: 8 }))).toBe("OutOfRange");
    expect(expectUnsigned(cbor(300), { width: 16 })).toBe(300);
  });

  test("without options the behaviour is unchanged", () => {
    expect(expectUnsigned(cbor(300))).toBe(300);
    expect(expectUnsigned(cbor(2n ** 64n - 1n))).toBe(18446744073709551615n);
    expect(code(() => expectUnsigned(cbor(-1)))).toBe("WrongType");
  });
});

describe("M5: asFloat/expectFloat coerce integers (Rust TryFrom<CBOR> for f64)", () => {
  test("asFloat coerces Unsigned/Negative and passes through floats", () => {
    expect(asFloat(cbor(42))).toBe(42);
    expect(asFloat(cbor(-5))).toBe(-5);
    expect(asFloat(cbor(0))).toBe(0);
    expect(asFloat(cbor(1.5))).toBe(1.5);
  });

  test("asFloat returns undefined for non-numeric and inexact integers", () => {
    expect(asFloat(cbor("hello"))).toBeUndefined();
    expect(asFloat(cbor(true))).toBeUndefined();
    // 2^63 + 1 is not exactly representable as f64 -> Rust OutOfRange -> undefined.
    expect(asFloat(cbor(9223372036854775809n))).toBeUndefined();
  });

  test("expectFloat coerces integers, throws WrongType / OutOfRange", () => {
    expect(expectFloat(cbor(42))).toBe(42);
    expect(expectFloat(cbor(-5))).toBe(-5);
    expect(expectFloat(cbor(1.5))).toBe(1.5);
    // non-numeric -> WrongType
    try {
      expectFloat(cbor("hello"));
      throw new Error("should have thrown");
    } catch (e) {
      expect(CborError.isCborError(e) && e.code).toBe("WrongType");
    }
    // numeric but inexact -> OutOfRange
    try {
      expectFloat(cbor(9223372036854775809n));
      throw new Error("should have thrown");
    } catch (e) {
      expect(CborError.isCborError(e) && e.code).toBe("OutOfRange");
    }
  });
});

describe("M4: summarizer error rendered via the full Error Display", () => {
  test("non-Custom/non-WrongTag summarizer errors show the Rust message", () => {
    const store = new TagsStore();
    store.register({ value: 1234, name: "thing" });
    // Summarizer that always fails with WrongType.
    store.setSummarizer(1234, () => ({ ok: false, error: CborError.wrongType() }));
    const tagged = taggedValue(1234, 1);
    const out = diagnostic(tagged, { summarize: true, tags: store });
    // Previously this rendered the bare variant id `<error: WrongType>`.
    expect(out).toBe("<error: the decoded CBOR value was not the expected type>");
  });

  test("WrongTag summarizer error is name-aware (uses tagToString)", () => {
    const store = new TagsStore();
    store.register({ value: 1234, name: "thing" });
    store.setSummarizer(1234, () => ({
      ok: false,
      error: CborError.wrongTag({ value: 1, name: "date" }, { value: 100 }),
    }));
    const tagged = taggedValue(1234, 1);
    const out = diagnostic(tagged, { summarize: true, tags: store });
    // Name-aware: expected tag prints its name "date", not the number 1.
    expect(out).toBe("<error: expected CBOR tag date, but got 100>");
  });
});
