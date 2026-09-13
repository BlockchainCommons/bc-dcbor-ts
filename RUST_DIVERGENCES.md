# Divergences from the Rust reference implementation

`@blockchaincommons/dcbor` is a port of [bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust)
(crate `dcbor`). Its committed golden wire vectors (`tests/vectors/*.json`)
have been cross-validated against the Rust reference, **pinned at
`dcbor = 0.25.2`**, using the harness in `tests/rust-validation/`:

```sh
cd tests/rust-validation
cargo run --release -- ../vectors
```

Validation result (2026-09-13):

```
encode: 403 vectors - 357 match, 34 emulated-throw, 11 skipped (JS-only), 1 expected-divergence, 0 MISMATCH
decode: 241 vectors - 241 match, 0 expected-divergence, 0 MISMATCH
```

The compared wire vectors match except for the documented date case. All
177 decode rejections in this corpus match by error code, and the 34
emulated throws are inputs both sides reject (the harness runs the
reference's constructor — `Date::from_string`, `BigUint` parsing — and
expects the port's error code). This verifies the selected fixtures, not
every possible input. Bare-float reduction quirks, negative zero, canonical
NaN, infinities, float-width selection, and the date-string grammar are
covered by the corpus.

The harness compares bytes and error codes. Format output — diagnostic
notation in its flat, annotated and summarised modes, and annotated hex —
was validated by execution against the reference over a 35-value probe
corpus during the 1.0.0-beta.2 review; the rows that differed (the
line-breaking threshold, which counts UTF-8 bytes on both sides) are pinned
in `tests/format.test.ts`, and since 1.0.0-beta.2 every row matches.
`CborDate.toString()` was validated the same way (§1.3).

This document records known differences and JavaScript input mappings.
The date-vector exception is recorded in the
`expected_divergences()` allowlist in `tests/rust-validation/src/main.rs` -
keep the two in sync.

---

## 1. True behavioral divergences (same input, different outcome)

These cases differ in accepted inputs or error handling. Changes should be
reviewed against both the TypeScript tests and the Rust reference.

### 1.1 Non-finite and out-of-range date timestamps: TS guards, Rust saturates or panics

| input | @blockchaincommons/dcbor | dcbor (Rust) |
|---|---|---|
| `CborDate.fromEpochSeconds(NaN)` (`from_timestamp`) | throws `InvalidDate` ("non-finite timestamp") | saturating-casts NaN to epoch `0`, encodes `c100` |
| `CborDate.fromEpochSeconds(±Infinity)` | throws `InvalidDate` | **panics** (`No such local time`, `date.rs:191`: `timestamp_opt(…).unwrap()`) |
| a finite timestamp outside chrono's range `[-8334601228800, 8210266876799]` s, at construction (`fromEpochSeconds`, `fromDate`) or decode (`c11b000007779a0a6b80`) | throws `InvalidDate` ("timestamp outside the representable range") | **panics** (`from_timestamp`); a chrono value given to `from_datetime` cannot be outside it |
| `CborDate.fromDate(new Date(NaN))` (`from_datetime`) | throws `InvalidDate` ("non-finite timestamp") | no analog: a chrono `DateTime` is always valid |
| impossible components — `fromYmd(2023, 13, 1)`, `fromYmdHms(…, 10, 30, 60)`, a year beyond ±262143 (`from_ymd`, `from_ymd_hms`) | throws `InvalidDate` ("Invalid date components") | **panics** (`with_ymd_and_hms(…).unwrap()`) |
| decode of an integer timestamp `f64` cannot hold exactly (`c11b7fffffffffffffff`) | throws `OutOfRange` | `OutOfRange` (`f64::exact_from_u64`) — identical |

**Why:** the reference's `Date::from_timestamp` does `trunc() as i64` /
`fract() * 1e9 as u32` (saturating casts) and then `unwrap`s chrono's
`timestamp_opt`, so only NaN yields a (wrong) date and everything else
outside the range panics. The port rejects all of it with its
own `InvalidDate` at the same point (construction or decode) and reports the
reference's `OutOfRange` where the reference does; every accepted value also
renders (`toString()` never throws). Executed on the reference at the exact
bounds (`+262142-12-31T23:59:59Z` and `-262143-01-01` decode on both sides;
one second beyond panics there). A fallible Rust constructor would allow callers to handle these invalid inputs.

**Affected vectors:** `date/non-finite-throws` (1 encode vector). The
differential corpus (`tests/corpus/corpus.ts`) carries no date recipes.

---

### 1.2 Tag registration errors

An unnamed tag or a tag value re-registered with a different name throws
`CborError` with code `Custom` in TypeScript. Rust uses an assertion or panic.
Both reject the registration, but the error mechanism differs. This is covered
by `tests/tags-store.test.ts`, not by the wire-vector allowlist.

### 1.3 A parsed leap second displays differently until it is encoded

`CborDate.fromString("2023-12-25T10:30:60Z").toString()` prints
`2023-12-25T10:31:00Z`; the reference's `Date` prints `2023-12-25T10:30:60Z`.
chrono keeps the leap second as second 59 plus a second of nanoseconds,
while the port stores the timestamp — which is what both sides encode
(`c11a658959e4`, identical). After a CBOR round trip the reference prints
`10:31:00Z` too (executed). Every other `Display` row matches: `%Y-%m-%d`
when the clock reads 00:00:00 (a fraction of a second does not count),
otherwise RFC 3339 to the second, years outside 0–9999 with a sign and at
least four digits (`-0004-02-29`, `+12023-02-08`); pinned in
`tests/date.test.ts`.

## 2. JS-only input domain (no Rust analog exists)

These inputs cannot be expressed against the Rust API at all, so there is
nothing to compare - the TS behavior is frozen by the golden vectors alone.
The Rust harness **skips** them.

| input shape | frozen TS behavior | vector |
|---|---|---|
| `Symbol` passed to `cbor()` | throws `CborError` `Custom` ("Unsupported type for CBOR encoding") | `unsupported/symbol-throws` |
| function passed to `cbor()` | throws `Custom` | `unsupported/function-throws` |
| malformed bare Cbor node (`{isCbor: true, type: ByteString, value: 42}`) | throws `WrongType` at encode | `rawbad/malformed-bytestring-node-throws` |

Section 3 describes additional input mappings and rejected legacy protocol
shapes; the rejected legacy shapes are also skipped by the harness.

---

## 3. Mapping equivalences (JS-specific inputs validated via their byte-target)

These are JS-specific input *routes* whose output bytes were validated
against the equivalent Rust construction. Where a row has a Rust byte target, the corpus compares those bytes.
Rows documenting rejected legacy inputs are TypeScript-only checks.

| JS-specific input | maps to (validated against Rust) | notes / vector |
|---|---|---|
| `cbor(undefined)` | CBOR `null` (`f6`) | Rust has no `undefined`; dCBOR forbids simple 23 (`f7`) - both decoders reject it. `simple/undefined-maps-to-null` |
| lone surrogate strings (`"\ud800"`) | U+FFFD replacement (`63efbfbd` for the 3-byte text) | JS `TextEncoder` replacement semantics; Rust `String` cannot hold lone surrogates. `str/lone-surrogate-becomes-replacement` |
| JS `Set` input | plain array in **insertion order** (SameValueZero dedup) | unlike `CborSet` (canonical sort + dedup), which matches Rust `Set` exactly. `jsset/*` |
| JS `Map` / plain-object input | `CborMap` → canonical key-byte order, duplicate canonical keys last-write-wins | Rust `Map::insert` behaves identically once constructed. `jsmap/*`, `obj/*` |
| `{tag: T, value: V}` two-own-key literal | **throws directive `Custom`** (was: `to_tagged_value(T, V)` bytes) | TS-only tombstone; skipped by the Rust harness. `tagobjlit/*` |
| objects with inherited `tag`/`value` (prototype) | plain-object→map of OWN keys only | freezes the sniffing arm's own-keys boundary. `protoobj/*` |
| `toCbor()` protocol objects | the underlying value's bytes | the ONE encode protocol. `tocbor/*` |
| `taggedCbor()`-only objects | **throws directive `Custom`** (was: auto-wrapped) | TS-only tombstone; skipped by the Rust harness. `taggedproto/*` |
| objects with BOTH protocols | `["toCbor-won", inner]` bytes - **`toCbor` wins** (was: `taggedCbor` won) | the harness mirrors the new precedence. `bothproto/*` |
| `cbor(bigint)` outside `[-(2⁶⁴), 2⁶⁴−1]` | throws `OutOfRange` | Rust cannot express this input: it has **no** `i128`/`u128 → CBOR` conversion (its own tests construct via `CBORCase`), so the range guard is TS surface behavior. The in-range bigint bytes match Rust's `CBORCase::Unsigned`/`Negative` exactly. `int/2^64-bigint-throws`, `int/below-cbor-int-min-throws` |
| `biguintToCbor(negative)` | throws `OutOfRange` | Rust's `From<BigUint>` cannot receive a negative - type-level in Rust, runtime guard in TS. `biguint/negative-throws` |
| number vs bigint input forms | JS `number` follows Rust's `From<f64>` semantics; JS `bigint` follows `CBORCase` integer construction | e.g. the **number** literal `18446744073709551615` is the double 2⁶⁴ → float `fa5f800000` in both (`From<f64>` parity), while `18446744073709551615n` → `1bffffffffffffffff`. `int/u64-max-as-number-is-float` |

`CborDate.fromString` was validated directly against Rust's
`Date::from_string` by execution (66 strings, byte-identical outcomes; the
`datestr/*` vectors run each form through the reference): the RFC 3339 form
keeps nine fraction digits and the `:60` leap second, takes `T`/`t`/space
and `−` (U+2212) in the offset, and bounds the offset by ±23:59; the bare
form is chrono's `%Y-%m-%d` (one- or two-digit month and day, a signed year
of any length, whitespace before each number); both reject the same
malformed inputs (`datestr/invalid-throws`, `datestr/missing-offset-throws`
→ `InvalidDate`). The stored timestamp is the reference's `timestamp()`
arithmetic — whole seconds plus nanoseconds over 10⁹ — and `fromDate`
computes a JS `Date`'s milliseconds the same way, so a fraction encodes to
the same bytes as `Date::from_datetime`. The impossible-component and
leap-second-display cases are §1.1 and §1.3.

- **Standard tags 2 and 3.** The reference names `positive-bignum` /
  `negative-bignum` (and summarises `bignum(…)`) only when built with its
  `num-bigint` feature; when that feature is disabled, a Rust peer prints `2(h'…')` and annotates `# tag(2)`. Since
  1.0.0-beta.2 `registerStandardTags(store)` matches that, and
  `registerStandardTags(store, { bignum: true })` matches the `num-bigint`
  build (executed: identical output in both configurations).

---

## Maintenance

- **Adding vectors:** if a new vector diverges from Rust, either it is a bug
  (fix it) or it belongs in one of the classes above - document it here and, when the wire harness covers it,
  add it to `expected_divergences()` in `tests/rust-validation/src/main.rs`
  in the same change.
- **Re-run the cross-validation** after every fixture regeneration
  (`bun run vectors:generate`) and update this document when the result changes.
- **Version pin:** the harness pins `dcbor = 0.25.2`. When bumping, re-run
  and update the header of this file with the new result line.
