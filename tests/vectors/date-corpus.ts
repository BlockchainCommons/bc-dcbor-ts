/**
 * Curated DATE corpus (DCBOR-12): `CborDate` decoding and display.
 *
 * - `decode` rows: tag-1 bytes -> `CborDate.fromTaggedCbor(decodeCbor(hex))`
 *   -> the re-encoded bytes and `toString()`, or the `CborError` code and
 *   message. The Rust harness runs `Date::from_tagged_cbor` on the same
 *   bytes; where the reference would panic (`from_timestamp` on ±Infinity
 *   or whole seconds outside chrono's range) it probes chrono first and
 *   emulates the port's `InvalidDate`.
 * - `display` rows: a `date` / `datestr` recipe -> bytes and `toString()`,
 *   or the code. The reference renders `Display`.
 *
 * Expectations are generated with the working tree
 * (`scripts/generate-vectors.ts`) into `tests/vectors/date-vectors.json`.
 */

import type { Recipe } from "./recipes";

export type DateCorpusEntry =
  | { name: string; kind: "decode"; hex: string; note?: string }
  | { name: string; kind: "display"; recipe: Recipe; note?: string };

const decode = (name: string, hex: string, note?: string): DateCorpusEntry =>
  note === undefined ? { name, kind: "decode", hex } : { name, kind: "decode", hex, note };
const display = (name: string, recipe: Recipe, note?: string): DateCorpusEntry =>
  note === undefined ? { name, kind: "display", recipe } : { name, kind: "display", recipe, note };
const date = (seconds: number | string): Recipe => ({ k: "date", seconds: String(seconds) });
const datestr = (v: string): Recipe => ({ k: "datestr", v });

export const dateCorpus: DateCorpusEntry[] = [
  // ---- decode: accepted instants
  decode("decode/epoch", "c100"),
  decode("decode/minus-one", "c120"),
  decode("decode/2022-12-22", "c11a63a3b4c0"),
  decode("decode/fraction-half", "c1fb41d962825c200000", "1703545200.5: a plain instant"),
  decode("decode/f16-1.5", "c1f93e00"),
  decode(
    "decode/one-plus-epsilon",
    "c1fb3ff0000000000001",
    "sub-nanosecond fraction is dropped: re-encodes as 1",
  ),
  decode("decode/nan-saturates-to-epoch", "c1f97e00"),
  decode("decode/max", "c11b000007779a0a6b7f"),
  decode("decode/min", "c13b000007948cf211ff"),
  decode(
    "decode/min-minus-half-truncates",
    "c1fbc29e5233c8480200",
    "MIN - 0.5: the truncated whole seconds are MIN",
  ),
  decode("decode/max-plus-fraction", "c1fb429dde6829adffff"),
  // ---- decode: rejected
  decode("decode/infinity-throws", "c1f97c00", "the reference panics; emulated InvalidDate"),
  decode(
    "decode/negative-infinity-throws",
    "c1f9fc00",
    "the reference panics; emulated InvalidDate",
  ),
  decode(
    "decode/2^60-beyond-range-throws",
    "c11b1000000000000000",
    "exact in f64, beyond chrono's range: the reference panics",
  ),
  decode("decode/max-plus-one-throws", "c11b000007779a0a6b80"),
  decode("decode/min-minus-one-throws", "c13b000007948cf21200"),
  decode(
    "decode/i64-max-inexact-out-of-range",
    "c11b7fffffffffffffff",
    "f64::exact_from_u64 fails: OutOfRange",
  ),
  decode("decode/negative-inexact-out-of-range", "c13b7fffffffffffffff"),
  decode("decode/65-bit-negative-out-of-range", "c13b80000000000007ff"),
  decode("decode/text-content-wrong-type", "c16161"),
  decode("decode/false-content-wrong-type", "c1f4"),
  decode("decode/tag-of-tag-wrong-type", "c1c100"),
  decode("decode/untagged-wrong-type", "6161"),
  decode("decode/wrong-tag", "c26161"),
  decode("decode/wrong-tag-40000", "d99c4000"),
  decode("decode/truncated-underrun", "c1"),
  decode("decode/non-canonical-numeric", "c1f94200"),
  // ---- display: from_timestamp
  display("display/midnight-with-fraction", date(1675814400.5)),
  display("display/1.5", date(1.5)),
  display("display/-0.5-truncates-toward-zero", date(-0.5)),
  display("display/-1", date(-1)),
  display("display/-86400", date(-86400)),
  display("display/year--4-leap-day", date(-62288352000)),
  display("display/year-0", date(-62167219200)),
  display("display/year-50", date(-60589296000)),
  display("display/9999-12-31", date(253402300799)),
  display("display/year-10000", date(253402300800)),
  display("display/year-12023", date(317245334400)),
  display("display/year-100000", date(3093527980800)),
  display("display/max", date(8210266876799)),
  display("display/max-plus-0.999", date(8210266876799.999)),
  display("display/min", date(-8334601228800)),
  display("display/min-minus-0.5", date(-8334601228800.5)),
  display("display/min-minus-0.999", date(-8334601228800.999)),
  display("display/nan", date("NaN")),
  display("display/infinity-throws", date("Infinity")),
  display("display/max-plus-one-throws", date(8210266876800)),
  display("display/min-minus-one-throws", date(-8334601228801)),
  display("display/nanosecond-fraction-rounds-in-f64", date("1703500245.999999999")),
  // ---- display: from_string
  display("display/bare-date", datestr("2023-02-08")),
  display("display/rfc3339", datestr("2023-02-08T15:30:45Z")),
  display("display/rfc3339-offset", datestr("2023-02-08T15:30:45+05:30")),
  display(
    "display/rfc3339-fraction",
    datestr("2023-12-25T10:30:45.999999999Z"),
    "second 45 on display, 46 on the wire",
  ),
  display("display/leap-second", datestr("2023-12-25T10:30:60Z")),
  display("display/leap-second-fraction-offset", datestr("2023-12-25T23:59:60.5+01:00")),
  display("display/leap-second-end-of-year", datestr("2023-12-31T23:59:60Z")),
  display("display/negative-year", datestr("-0001-01-01")),
  display("display/five-digit-year", datestr("+12023-02-08")),
  display("display/invalid-string-throws", datestr("not-a-date")),
  display("display/second-61-throws", datestr("2023-12-25T10:30:61Z")),
];

{
  const seen = new Set<string>();
  for (const { name } of dateCorpus) {
    if (seen.has(name)) throw new Error(`duplicate date-corpus name: ${name}`);
    seen.add(name);
  }
}
