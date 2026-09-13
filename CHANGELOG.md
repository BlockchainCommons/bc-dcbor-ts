# Changelog

## 1.0.0-beta.2 - 2026-09-13

The review against `dcbor` 0.25.2 aligned diagnostic formatting, date
validation, and optional bignum tag registration.

### Changed

- **Diagnostic line breaking measures strings in UTF-8 bytes**, as the
  reference's `diag.rs` does (`str::len()`), where the port counted UTF-16
  units. A group holding a non-ASCII string of more than 20 bytes but at
  most 20 UTF-16 units - `["unicode ✓ ☺ 日本"]`, `["✓✓✓✓", "☺☺☺☺"]` - now
  breaks over several lines exactly as the reference prints it. ASCII
  output is unchanged.
- **Dates outside the reference's representable range are rejected.**
  `CborDate.fromEpochSeconds`, `CborDate.fromDate` and the decoders reject a
  timestamp outside chrono's `NaiveDateTime::MIN`/`MAX`
  (`[-8334601228800, 8210266876799]` seconds) with `InvalidDate`, and
  `fromDate` rejects an invalid `Date`; the reference panics there
  (`Date::from_timestamp`, `timestamp_opt(…).unwrap()`). Decoding an
  integer timestamp that `f64` cannot hold exactly is `OutOfRange`, the
  reference's own outcome (`f64::exact_from_u64`). Before, such values were
  accepted and encoded, and `toString()` later threw a raw
  `RangeError: Invalid Date`; `toString()` can no longer throw.
- **`registerStandardTags` names the bignum tags 2 and 3 only on request**
  (`registerStandardTags(store, { bignum: true })`). The reference names
  them only when built with its `num-bigint` feature, so a Rust peer built without that feature summarizes a bignum as
  `2(h'…')` and annotates `# tag(2)` - which the default store now matches.
  `RegisterStandardTagsOptions` is exported.
- A tag-registration conflict (and an unnamed tag) throws the package's
  `CborError` (`Custom`, same message) instead of a bare `Error`; the
  reference panics.
- **`CborDate.fromString` accepts and computes exactly what
  `Date::from_string` does.** The RFC 3339 form keeps up to nine fraction
  digits - the port kept three, so `…45.123456Z` encoded a different float -
  reads the `:60` leap second as chrono does (second 59 plus one second),
  takes `t` or a space as the separator and `−` (U+2212) in the offset,
  bounds the offset by ±23:59, and accepts years 0000–0099 (JS `Date.UTC`
  mapped them to 1900–1999, so they threw). The bare-date form is chrono's
  `%Y-%m-%d`: one- or two-digit month and day, a signed year of any length
  (`-0001-01-01`, `+262142-12-31`), whitespace before each number. The
  stored timestamp is the reference's `timestamp()` arithmetic (whole
  seconds plus nanoseconds over 10⁹), so a fraction encodes to the same
  bytes on both sides; `fromDate` computes a JS `Date`'s milliseconds the
  same way. 57 `datestr/*` vectors run every form through the reference.
- **`CborDate.fromYmd` / `fromYmdHms` validate their components** - year
  within ±262143, a calendar month and day, a time within 23:59:59 - and
  throw `InvalidDate` where the reference's `with_ymd_and_hms(…).unwrap()`
  panics. They used to roll over (`2023-13-01` became 2024-01-01) and mapped
  years 0–99 to 1900–1999.
- **`toString()` prints years outside 0–9999 as the reference does**: a sign
  and at least four digits (`-0004-02-29`, `+12023-02-08`), where JS
  `toISOString` gave six (`-000004-02-29`).

## 1.0.0-beta.1 - 2026-07-21

Initial beta implementation.