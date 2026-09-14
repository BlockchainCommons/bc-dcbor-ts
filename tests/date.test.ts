/**
 * `CborDate` tests against Rust's `Date`: string parsing, the representable
 * range, component constructors, the (seconds, nanoseconds) model, `WrongTag`
 * naming and display.
 */

import { describe, test, expect } from "vitest";
import {
  CborDate,
  CborError,
  decodeCbor,
  decodeWith,
  encodeCbor,
  bytesToHex,
  hexToBytes,
  taggedValue,
  Tag,
  registerStandardTags,
  getGlobalTagsStore,
  tagsForValues,
  cborEquals,
} from "../src";
import { diagnostic } from "../src/diag";
import { hexAnnotated } from "../src/dump";

describe("strict CborDate.fromString", () => {
  test("accepts strict RFC-3339 date-times", () => {
    expect(() => CborDate.fromString("2023-02-08T15:30:45Z")).not.toThrow();
    expect(() => CborDate.fromString("2023-02-08T15:30:45.5Z")).not.toThrow();
    expect(() => CborDate.fromString("2023-02-08T15:30:45+02:00")).not.toThrow();
    expect(() => CborDate.fromString("2023-02-08T15:30:45-05:00")).not.toThrow();
  });

  test("accepts bare YYYY-MM-DD as UTC midnight", () => {
    const d = CborDate.fromString("2023-02-08");
    // UTC midnight 2023-02-08 = 1675814400 seconds since epoch.
    expect(d.epochSeconds).toBe(1675814400);
  });

  test("rejects lenient / engine-dependent forms that new Date() would accept", () => {
    for (const bad of [
      "2023/02/08",
      "Feb 8 2023",
      "2023-02-08T15:30", // no seconds
      "2023-02-08 15:30:45", // space instead of T, no offset
      "2023-02-08T15:30:45", // no zone
      "garbage",
      "",
    ]) {
      expect(() => CborDate.fromString(bad), bad).toThrow(CborError);
    }
  });

  test("rejects impossible calendar dates (no silent rollover)", () => {
    for (const bad of [
      "2023-02-30",
      "2023-04-31",
      "2023-13-01",
      "2023-00-10",
      "2023-02-08T15:30:45Z".replace("02-08", "02-30"),
    ]) {
      expect(() => CborDate.fromString(bad), bad).toThrow(CborError);
    }
  });

  test("accepts a leap day in a leap year, rejects it in a common year", () => {
    expect(() => CborDate.fromString("2024-02-29")).not.toThrow();
    expect(() => CborDate.fromString("2023-02-29")).toThrow(CborError);
  });

  test("round-trips a whole-second timestamp through encode", () => {
    const d = CborDate.fromString("2022-03-21T18:24:31Z");
    // The instant of Rust's `format_date` vector.
    expect(d.epochSeconds).toBe(1647887071);
  });
});

describe("range: the reference's representable timestamps", () => {
  // chrono's NaiveDateTime::MIN / MAX as Unix seconds (executed on dcbor 0.25.2).
  const MIN = -8334601228800;
  const MAX = 8210266876799;
  const code = (f: () => unknown): string | undefined => {
    try {
      f();
      return undefined;
    } catch (e) {
      return CborError.isCborError(e) ? e.code : `foreign:${String(e).slice(0, 30)}`;
    }
  };
  test("accepts the bounds and renders them", () => {
    expect(CborDate.fromEpochSeconds(MAX).toString()).toBe("+262142-12-31T23:59:59Z");
    expect(CborDate.fromEpochSeconds(MIN).toString()).toBe("-262143-01-01");
    expect(CborDate.fromEpochSeconds(MAX + 0.999).toString()).toBe("+262142-12-31T23:59:59Z");
  });
  test("rejects beyond the bounds at construction with InvalidDate (the reference panics)", () => {
    for (const s of [MAX + 1, MIN - 1, 1e18, 2 ** 53, 1e300, -1e300, 8.64e12 + 1]) {
      expect(code(() => CborDate.fromEpochSeconds(s))).toBe("InvalidDate");
    }
    expect(() => CborDate.fromEpochSeconds(MAX + 1)).toThrow(
      "timestamp outside the representable range",
    );
  });
  test("decode: OutOfRange for an integer f64 cannot hold, InvalidDate beyond the range, never a RangeError", () => {
    const dec = (hex: string) =>
      CborDate.fromTaggedCbor(decodeCbor(new Uint8Array(Buffer.from(hex, "hex"))));
    expect(code(() => dec("c11b7fffffffffffffff"))).toBe("OutOfRange"); // 2^63-1: inexact in f64
    expect(code(() => dec("c13b7fffffffffffffff"))).toBe("OutOfRange");
    expect(code(() => dec("c11b1000000000000000"))).toBe("InvalidDate"); // 2^60: exact in f64, beyond the range
    expect(code(() => dec("c11b000007779a0a6b80"))).toBe("InvalidDate"); // MAX + 1
    expect(code(() => dec("c13b000007948cf21200"))).toBe("InvalidDate"); // MIN - 1
    expect(dec("c11b000007779a0a6b7f").toString()).toBe("+262142-12-31T23:59:59Z"); // MAX
    expect(dec("c13b000007948cf211ff").toString()).toBe("-262143-01-01"); // MIN
    expect(dec("c11a63a3b4c0").toString()).toBe("2022-12-22T01:37:04Z");
  });
});

describe("Date::from_string parity: the reference's grammar and arithmetic", () => {
  // Every row was executed on dcbor 0.25.2 / chrono 0.4.45 (`Date::from_string`
  // then `to_cbor_data()`); "throws" rows are `Err(InvalidDate)` there. The
  // same rows are golden vectors (`datestr/*`) checked by the Rust harness.
  const hexOf = (value: string): string =>
    bytesToHex(encodeCbor(CborDate.fromString(value).toCbor()));
  const rows: [string, string][] = [
    // fraction digits are kept to the nanosecond: `whole + ns / 1e9`
    ["2023-12-25T10:30:45.123456Z", "c1fb41d962567547e6b4"],
    ["2023-12-25T10:30:45.123456789Z", "c1fb41d962567547e6b7"],
    ["2023-12-25T10:30:45.1234567891Z", "c1fb41d962567547e6b7"], // tenth digit ignored
    ["2023-12-25T10:30:45.000000000Z", "c11a658959d5"],
    ["1969-12-31T23:59:59.5Z", "c1f9b800"], // -0.5
    // leap second: second 59 plus one second of nanoseconds
    ["2023-12-25T10:30:60Z", "c11a658959e4"],
    ["2023-12-25T10:30:60.5Z", "c1fb41d9625679200000"],
    // separators, case, offsets
    ["2023-12-25 10:30:45Z", "c11a658959d5"],
    ["2023-12-25t10:30:45z", "c11a658959d5"],
    ["2023-12-25T10:30:45.5+01:00", "c1fb41d96252f1600000"],
    ["2023-12-25T10:30:45-05:30", "c11a6589a72d"],
    ["2023-12-25T10:30:45−01:00", "c11a658967e5"], // U+2212 minus sign
    ["2023-12-25T10:30:45+23:59", "c11a65880891"],
    ["9999-12-31T23:59:59-23:59", "c11b0000003afff592c3"], // lands in year 10000
    ["0000-01-01T00:00:00+23:59", "c13b0000000e7975cd43"], // lands in year -1
    ["0000-01-01T00:00:00Z", "c13b0000000e79747bff"],
    ["2024-02-29T00:00:00Z", "c11a65dfc900"],
    // bare dates: chrono's `%Y-%m-%d`
    ["2023-02-08", "c11a63e2e600"],
    ["2023-2-8", "c11a63e2e600"],
    [" 2023-02-08", "c11a63e2e600"],
    ["\t2023-02-08", "c11a63e2e600"],
    [" 2023-02-08", "c11a63e2e600"],
    ["2023- 02- 08", "c11a63e2e600"],
    ["+2023-02-08", "c11a63e2e600"],
    ["-0001-01-01", "c13b0000000e7b55af7f"],
    ["+12023-02-08", "c11b00000049dd4ba380"],
    ["0-1-1", "c13b0000000e79747bff"],
    ["+262142-12-31", "c11b000007779a091a00"],
    ["-262143-01-01", "c13b000007948cf211ff"],
  ];
  test.each(rows)("%j encodes as the reference does", (value, hex) => {
    expect(hexOf(value)).toBe(hex);
  });

  const rejected = [
    "2023-12-25T10:30:45.Z",
    "2023-12-25T10:30:45,5Z",
    "2023-12-25T10:30:61Z",
    "2023-12-25T24:00:00Z",
    "2023-12-25T10:60:00Z",
    "2023-12-25T10:30:45+24:00",
    "2023-12-25T10:30:45+01:60",
    "2023-12-25T10:30:45+0100",
    "2023-12-25T10:30:45+01",
    "2023-12-25T10:30:45Z ",
    " 2023-12-25T10:30:45Z",
    "2023-1-25T10:30:45Z",
    "2023-02-29T00:00:00Z",
    "2023-02-08 ",
    "12023-02-08",
    "262142-12-31",
    "+262143-01-01",
    "-262144-01-01",
    "+99999999999999999999-01-01",
    "2023-002-08",
    "2023-02-08-",
    "2023-02-08T",
    "２０２３-02-08",
    "",
  ];
  test.each(rejected)("%j is InvalidDate, as the reference rejects it", (value) => {
    expect(() => CborDate.fromString(value)).toThrow(CborError);
    expect(() => CborDate.fromString(value)).toThrow("Invalid date string");
  });

  test("the stored timestamp is the reference's `timestamp()`", () => {
    expect(CborDate.fromString("2023-12-25T10:30:45.123456Z").epochSeconds).toBe(
      1703500245 + 123_456_000 / 1_000_000_000,
    );
    expect(CborDate.fromString("2023-12-25T10:30:60Z").epochSeconds).toBe(1703500260);
    expect(CborDate.fromString("1969-12-31T23:59:59.5Z").epochSeconds).toBe(-0.5);
  });
});

describe("component constructors validate as the reference's `with_ymd_and_hms(…).unwrap()`", () => {
  test("accept the calendar, years 0–99 and the chrono bounds", () => {
    expect(CborDate.fromYmd(2023, 2, 8).epochSeconds).toBe(1675814400);
    expect(CborDate.fromYmdHms(2023, 12, 25, 10, 30, 45).epochSeconds).toBe(1703500245);
    expect(CborDate.fromYmd(0, 1, 1).epochSeconds).toBe(-62167219200); // not 1900
    expect(CborDate.fromYmd(50, 1, 1).toString()).toBe("0050-01-01");
    expect(CborDate.fromYmd(-4, 2, 29).toString()).toBe("-0004-02-29");
    expect(CborDate.fromYmdHms(262142, 12, 31, 23, 59, 59).epochSeconds).toBe(8210266876799);
    expect(CborDate.fromYmd(-262143, 1, 1).epochSeconds).toBe(-8334601228800);
  });
  test("reject impossible components with InvalidDate instead of rolling over", () => {
    const bad: [number, number, number, number, number, number][] = [
      [2023, 13, 1, 0, 0, 0],
      [2023, 0, 1, 0, 0, 0],
      [2023, 2, 30, 0, 0, 0],
      [2023, 2, 29, 0, 0, 0],
      [2023, 12, 25, 24, 0, 0],
      [2023, 12, 25, 10, 60, 0],
      [2023, 12, 25, 10, 30, 60], // no leap second by components
      [262143, 1, 1, 0, 0, 0],
      [-262144, 12, 31, 0, 0, 0],
      [2023, 1, 1, 0, 0, 1.5],
    ];
    for (const [y, m, d, h, mi, s] of bad) {
      expect(
        () => CborDate.fromYmdHms(y, m, d, h, mi, s),
        `${y}-${m}-${d} ${h}:${mi}:${s}`,
      ).toThrow("Invalid date components");
    }
    expect(() => CborDate.fromYmd(2023, 2, 30)).toThrow(CborError);
  });
});

describe("fromDate follows `from_datetime`: exact milliseconds, chrono's range", () => {
  test("keeps the millisecond part as nanoseconds (the reference's `timestamp()`)", () => {
    const d = CborDate.fromDate(new Date(4190400121)); // 1970-02-18T12:00:00.121Z
    expect(d.epochSeconds).toBe(4190400 + 121_000_000 / 1_000_000_000);
    // `Date::from_datetime` with 121_000_000 ns encodes these bytes (executed)
    expect(bytesToHex(encodeCbor(d.toCbor()))).toBe("c1fb414ff8600f7ced91");
    expect(CborDate.fromDate(new Date(-500)).epochSeconds).toBe(-0.5);
    expect(CborDate.fromDate(new Date(-500)).toString()).toBe("1969-12-31T23:59:59Z");
  });
  test("rejects an invalid Date and one beyond chrono's range with InvalidDate", () => {
    expect(() => CborDate.fromDate(new Date(NaN))).toThrow("non-finite timestamp");
    expect(() => CborDate.fromDate(new Date(8.64e15))).toThrow(
      "timestamp outside the representable range",
    );
    expect(() => CborDate.fromDate(new Date(-8.64e15))).toThrow(CborError);
    expect(() => CborDate.withDurationFromNow(Infinity)).toThrow(CborError);
    expect(CborDate.fromDate(new Date(8210266876799_000)).toString()).toBe(
      "+262142-12-31T23:59:59Z",
    );
  });
});

describe("the (seconds, nanoseconds) model: chrono's instant, not one f64", () => {
  // Every expected string/byte sequence below was executed on dcbor 0.25.2
  // (`Date::from_string` / `from_timestamp`, then `to_string()` and
  // `to_cbor_data()`).
  const hexOf = (d: CborDate): string => bytesToHex(encodeCbor(d.toCbor()));
  const MIN = -8334601228800;

  test("a leap second displays as :60 and keeps its wire value", () => {
    const leap = CborDate.fromString("2023-12-25T10:30:60Z");
    expect(leap.toString()).toBe("2023-12-25T10:30:60Z");
    expect(leap.epochSeconds).toBe(1703500260);
    expect(hexOf(leap)).toBe("c11a658959e4");
    expect(CborDate.fromString("2023-12-25T23:59:60.5+01:00").toString()).toBe(
      "2023-12-25T22:59:60Z",
    );
    expect(CborDate.fromString("2023-12-31T23:59:60Z").toString()).toBe("2023-12-31T23:59:60Z");
    // After a CBOR round trip the leap second is an ordinary instant again.
    expect(CborDate.fromTaggedCbor(decodeCbor(encodeCbor(leap.toCbor()))).toString()).toBe(
      "2023-12-25T10:31:00Z",
    );
  });

  test("equality and ordering compare the pair, as chrono does", () => {
    const leap = CborDate.fromString("2023-12-25T10:30:60Z");
    const next = CborDate.fromEpochSeconds(1703500260);
    const before = CborDate.fromString("2023-12-25T10:30:59.999999999Z");
    expect(leap.epochSeconds).toBe(next.epochSeconds);
    expect(leap.equals(next)).toBe(false);
    expect(leap.compare(next)).toBe(-1);
    expect(next.compare(leap)).toBe(1);
    expect(before.compare(leap)).toBe(-1);
    expect(leap.equals(CborDate.fromString("2023-12-25T10:30:60Z"))).toBe(true);
    expect(CborDate.fromEpochSeconds(1.5).equals(CborDate.fromEpochSeconds(1.5))).toBe(true);
    expect(CborDate.fromEpochSeconds(1.5).compare(CborDate.fromEpochSeconds(1.25))).toBe(1);
  });

  test("sub-second rounding of the f64 wire value does not move the displayed second", () => {
    // 45.999999999 s: the f64 sum rounds up to …46.0 (that is the wire
    // value, on both sides), but the instant is still second 45.
    const d = CborDate.fromString("2023-12-25T10:30:45.999999999Z");
    expect(d.toString()).toBe("2023-12-25T10:30:45Z");
    expect(d.epochSeconds).toBe(1703500246);
    expect(hexOf(d)).toBe("c11a658959d6");
  });

  test("the range check applies to the truncated whole seconds", () => {
    const d = CborDate.fromEpochSeconds(MIN - 0.5);
    expect(hexOf(d)).toBe("c13b000007948cf211ff");
    expect(d.toString()).toBe("-262143-01-01");
    expect(CborDate.fromEpochSeconds(MIN - 0.999).toString()).toBe("-262143-01-01");
    expect(() => CborDate.fromEpochSeconds(MIN - 1)).toThrow(
      "timestamp outside the representable range",
    );
    // MIN - 0.5 as a tag-1 float decodes to MIN as well.
    const belowMin = decodeCbor(encodeCbor(taggedValue(1, MIN - 0.5)));
    expect(CborDate.fromTaggedCbor(belowMin).toString()).toBe("-262143-01-01");
    expect(hexOf(CborDate.fromTaggedCbor(belowMin))).toBe("c13b000007948cf211ff");
  });

  test("fromDate and toDate carry the millisecond part exactly", () => {
    const d = CborDate.fromDate(new Date(4190400121));
    expect(d.toDate().getTime()).toBe(4190400121);
    expect(CborDate.fromDate(new Date(-500)).toDate().getTime()).toBe(-500);
    expect(CborDate.fromDate(new Date(-500)).epochSeconds).toBe(-0.5);
    expect(CborDate.fromDate(new Date(-500)).compare(CborDate.fromEpochSeconds(-1))).toBe(1);
  });
});

describe("NaN saturates to the epoch, ±Infinity is InvalidDate (from_timestamp parity)", () => {
  const hexOf = (d: CborDate): string => bytesToHex(encodeCbor(d.toCbor()));
  test("construction", () => {
    const d = CborDate.fromEpochSeconds(NaN);
    expect(d.toString()).toBe("1970-01-01");
    expect(d.epochSeconds).toBe(0);
    expect(hexOf(d)).toBe("c100");
    expect(d.equals(CborDate.fromEpochSeconds(0))).toBe(true);
    for (const s of [Infinity, -Infinity]) {
      expect(() => CborDate.fromEpochSeconds(s)).toThrow("non-finite timestamp");
    }
    expect(() => CborDate.fromEpochSeconds(Infinity)).toThrow(CborError);
  });
  test("tag-1 decode", () => {
    const dec = (hex: string) => CborDate.fromTaggedCbor(decodeCbor(hexToBytes(hex)));
    expect(dec("c1f97e00").toString()).toBe("1970-01-01");
    expect(hexOf(dec("c1f97e00"))).toBe("c100");
    expect(() => dec("c1f97c00")).toThrow("non-finite timestamp");
    expect(() => dec("c1f9fc00")).toThrow("non-finite timestamp");
  });
  test("an invalid JS Date has no reference analog and is still rejected", () => {
    expect(() => CborDate.fromDate(new Date(NaN))).toThrow("non-finite timestamp");
  });
});

describe("WrongTag names the expected and actual tags as the reference does", () => {
  // Executed on dcbor 0.25.2: `Date::from_tagged_cbor` reports
  // `WrongTag(cbor_tags()[0], tag)`, where the expected tag's name comes from
  // the global store (`tags_for_values`) and the actual tag keeps the name it
  // was built with (a decoded tag has none). This file's global store starts
  // empty; the registered rows run after `registerStandardTags()`.
  const message = (f: () => unknown): string => {
    try {
      f();
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "(no throw)";
  };

  test("before any registration the expected tag is bare `1`", () => {
    expect(CborDate.fromEpochSeconds(0).cborTags()[0]?.name).toBeUndefined();
    expect(CborDate.codec.tags?.[0]?.name).toBeUndefined();
    expect(message(() => CborDate.fromTaggedCbor(taggedValue(2, 0)))).toBe(
      "expected CBOR tag 1, but got 2",
    );
    expect(message(() => CborDate.fromTaggedCbor(taggedValue(Tag.from(40000, "adhoc"), 0)))).toBe(
      "expected CBOR tag 1, but got adhoc",
    );
    expect(message(() => decodeWith(hexToBytes("d99c4000"), CborDate.codec))).toBe(
      "expected CBOR tag 1, but got 40000",
    );
  });

  test("after registration the expected tag is `date`; the actual tag keeps its own name", () => {
    registerStandardTags();
    getGlobalTagsStore().register(Tag.from(40000, "custom"));
    expect(CborDate.fromEpochSeconds(0).cborTags()[0]?.name).toBe("date");
    expect(CborDate.codec.tags?.[0]?.name).toBe("date");
    const [custom] = tagsForValues([40000]);
    expect(custom?.name).toBe("custom");
    expect(message(() => CborDate.fromTaggedCbor(taggedValue(custom ?? 40000, 0)))).toBe(
      "expected CBOR tag date, but got custom",
    );
    expect(message(() => CborDate.fromTaggedCbor(taggedValue(Tag.from(40000, "adhoc"), 0)))).toBe(
      "expected CBOR tag date, but got adhoc",
    );
    // A decoded node carries no name, even when the store knows one.
    expect(message(() => CborDate.fromTaggedCbor(decodeCbor(hexToBytes("d99c4000"))))).toBe(
      "expected CBOR tag date, but got 40000",
    );
    expect(message(() => CborDate.fromTaggedCbor(taggedValue(2, 0)))).toBe(
      "expected CBOR tag date, but got 2",
    );
    const err = (() => {
      try {
        CborDate.fromTaggedCbor(taggedValue(Tag.from(40000, "adhoc"), 0));
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(CborError.isCborError(err) && err.code).toBe("WrongTag");
  });

  test("the carried name never reaches the wire, the diagnostic or the hex dump", () => {
    const named = taggedValue(Tag.from(40000, "adhoc"), 0);
    const unnamed = taggedValue(40000, 0);
    expect(encodeCbor(named)).toEqual(encodeCbor(unnamed));
    expect(diagnostic(named)).toBe(diagnostic(unnamed));
    expect(hexAnnotated(named)).toBe(hexAnnotated(unnamed));
    expect(hexAnnotated(named)).toContain("custom"); // the store's name, not the node's
    expect(cborEquals(named, unnamed)).toBe(true);
    const dateNode = CborDate.fromEpochSeconds(0).taggedCbor();
    expect(dateNode.type === 7 ? undefined : dateNode.type === 6 ? dateNode.tagName : "").toBe(
      "date",
    );
  });
});

describe("toString prints the reference's Display", () => {
  // `%Y-%m-%d` at 00:00:00 (a fraction does not count), else RFC 3339 to the
  // second; years outside 0–9999 carry a sign and at least four digits.
  const rows: [number, string][] = [
    [1675814400.5, "2023-02-08"],
    [1.5, "1970-01-01T00:00:01Z"],
    [-0.5, "1970-01-01"], // `from_timestamp` truncates the fraction toward zero (executed)
    [-1, "1969-12-31T23:59:59Z"],
    [-86400, "1969-12-31"],
    [-62288352000, "-0004-02-29"],
    [-62167219200, "0000-01-01"],
    [-60589296000, "0050-01-01"],
    [253402300799, "9999-12-31T23:59:59Z"],
    [253402300800, "+10000-01-01"],
    [317245334400, "+12023-02-08"],
    [3093527980800, "+100000-01-01"],
  ];
  test.each(rows)("%d renders as %s", (seconds, text) => {
    expect(CborDate.fromEpochSeconds(seconds).toString()).toBe(text);
  });
});
