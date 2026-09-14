# Changelog

## Unreleased

The divergence audit against `dcbor` 0.25.2 (bc-typescript `Docs/divergence`,
tasks DCBOR-01 to DCBOR-15, TAGS-01 to TAGS-03 and COMP-01) closed every
recorded and unrecorded behavioral difference the Rust harness can observe.
The harness now runs in two builds (default and `num-bigint`) over five
fixture files and its divergence allowlist is empty.

### Changed

- **Decoding keeps a leading U+FEFF** in a text string, as the reference's
  `String::from_utf8` does; the WHATWG `TextDecoder` default stripped it, so
  `64efbbbf61` did not round-trip.
- **`cbor(string)` keeps the string as given; encoding normalizes to NFC**
  (the reference's `cbor_data` does the same). `expectText`, `cborEquals`,
  `diagnostic` and `hexAnnotated` now see the original string; the wire
  bytes are unchanged. Byte-string annotations in `hexAnnotated` keep astral
  characters (`"😀"`) instead of dotting them.
- **`InvalidUtf8` messages mirror `core::str::Utf8Error`**
  (`invalid utf-8 sequence of 1 bytes from index 3`, `incomplete utf-8 byte
  sequence from index 0`) instead of the host decoder's text.
- **Float heads are validated with the reference's `validate_canonical_*`
  predicates** and decode to the node its `From<f32>`/`From<f64>` build. A
  whole-valued f32 head at or beyond 2^31 (or an f64 head at or beyond
  2^63) is accepted and reduces to an integer where one fits: `fa4f000001`
  decodes to `2147483904` and re-encodes as `1a80000100`; `fa4f800000`
  stays a float. Before, every such head was `NonCanonicalNumeric`.
- **Float diagnostics round exact decimal ties up**, as Rust's `{:?}` does
  (`f9000a` prints `5.960464477539063e-7`, not `…062e-7`); `simpleName`
  prints `inf`/`-inf`/`42.0` like `Simple`'s `Debug`.
- **`CborDate` holds whole seconds plus nanoseconds**, the reference's
  `chrono::DateTime` model. A parsed leap second displays as `:60`
  (`2023-12-25T10:30:60Z`), `equals`/`compare` distinguish it from the next
  second, a sub-second fraction can no longer move the displayed second, and
  the range check applies to the truncated whole seconds (`MIN - 0.5` is
  `MIN`). `fromUntaggedCbor`/`fromTaggedCbor` return a new instance.
- **`CborDate.fromEpochSeconds(NaN)` and a decoded tag-1 `NaN` are the
  epoch** (`c100`, `1970-01-01`), as the reference's saturating cast makes
  them; ±Infinity is still `InvalidDate` (the reference panics). This
  reverses the 1.0.0-beta.2 guard.
- **`WrongTag` errors name both tags as the reference does.** `CborDate`'s
  expected tag carries the global store's name for tag 1 (`date` once
  `registerStandardTags()` has run, else `1`); `taggedValue(tag, …)` keeps a
  named `Tag`'s name on the node (`CborTaggedType.tagName`, never on the
  wire) so the actual tag is named too; `expectTaggedContent` accepts a
  `Tag` and keeps its name.
- **`cborEquals` is structural** (`PartialEq for CBOR`): a whole-valued
  float node is not equal to the integer it encodes as, a decomposed string
  is not equal to its composed form, `NaN` equals `NaN`, tags compare by
  value, maps entry by entry. It compared encodings before.
- **`registerStandardTags` registers unconditionally** through
  `registerAll`, as `insert_all` does: it moves each standard name back to
  its standard value instead of skipping a store that already had the name.
  `registerAll` accepts any `Iterable<Tag>`.
- **Tags are frozen values.** `Tag.from` returns a frozen object and a
  `TagsStore` keeps frozen tags by identity (an unfrozen literal is copied).
- **One global tags store per process.** `getGlobalTagsStore()` keeps the
  store on `globalThis` under `Symbol.for("@blockchaincommons/dcbor/global-tags-store@1")`,
  so the ESM and CommonJS builds share it, as the reference's `GLOBAL_TAGS`.

### Added

- `expectUnsigned(cbor, { width, wrapNegative })` extracts into a fixed
  width like `u8`…`u64::try_from`, including the reference's wrap of a
  negative integer (`-1` → `255` at width 8; RUST_DIVERGENCES.md §1.6).
  Without options the behaviour is unchanged.
- `TagsStore.clone()` mirrors `#[derive(Clone)]`: an independent copy that
  shares frozen tags and summarizer functions.
- Harness: `format-vectors.json`, `date-vectors.json` and
  `uint-vectors.json`; decode rejections pin the reference's error message;
  a `bignum` feature runs the reference's `num-bigint` build; both builds
  run in CI. Guard tests for the engine's Unicode version and a 1,000-deep
  array.

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
  same way. 62 `datestr/*` vectors run every form through the reference.
- **`CborDate.fromYmd` / `fromYmdHms` validate their components** - year
  within −262143…+262142, a calendar month and day, a time within 23:59:59 - and
  throw `InvalidDate` where the reference's `with_ymd_and_hms(…).unwrap()`
  panics. They used to roll over (`2023-13-01` became 2024-01-01) and mapped
  years 0–99 to 1900–1999.
- **`toString()` prints years outside 0–9999 as the reference does**: a sign
  and at least four digits (`-0004-02-29`, `+12023-02-08`), where JS
  `toISOString` gave six (`-000004-02-29`).

## 1.0.0-beta.1 - 2026-07-21

Initial beta implementation.