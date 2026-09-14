# Divergences from the Rust reference implementation

`@blockchaincommons/dcbor` is a port of [bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust)
(crate `dcbor`). Its committed vectors (`tests/vectors/*.json`) are
cross-validated against the Rust reference, **pinned at `dcbor = 0.25.2`**,
by the harness in `tests/rust-validation/`. It runs twice: once against the
default build every Rust consumer uses, once with dcbor's `num-bigint`
feature. Both runs are a CI job.

```sh
cd tests/rust-validation
cargo run --release -- ../vectors
cargo run --release --features bignum -- ../vectors
```

Validation result (2026-09-14), default build:

```
encode: 416 vectors - 348 match, 30 reference-throw, 8 emulated-throw, 30 skipped, 0 expected-divergence, 0 MISMATCH
decode: 267 vectors - 79 match, 188 reference-throw, 0 expected-divergence, 0 MISMATCH
format: 102 vectors - 94 match, 8 skipped, 0 expected-divergence, 0 MISMATCH
date: 60 vectors - 39 match, 13 reference-throw, 8 emulated-throw, 0 expected-divergence, 0 MISMATCH
uint: 19 vectors - 11 match, 8 reference-throw, 0 expected-divergence, 0 MISMATCH
```

`--features bignum`:

```
encode: 416 vectors - 367 match, 30 reference-throw, 8 emulated-throw, 11 skipped, 0 expected-divergence, 0 MISMATCH
decode: 267 vectors - 79 match, 188 reference-throw, 0 expected-divergence, 0 MISMATCH
format: 102 vectors - 99 match, 3 skipped, 0 expected-divergence, 0 MISMATCH
date: 60 vectors - 39 match, 13 reference-throw, 8 emulated-throw, 0 expected-divergence, 0 MISMATCH
uint: 19 vectors - 11 match, 8 reference-throw, 0 expected-divergence, 0 MISMATCH
```

- Encoded bytes match byte for byte, and every decode rejection matches by
  error code **and** by the error's `Display` message (a `reference-throw`
  on the decode, date and uint lines is a rejection both sides produce).
- **reference-throw** counts inputs the reference itself rejects
  (`Date::from_string`, decoders). **emulated-throw** counts TypeScript
  guards for inputs the reference cannot express (`cbor(bigint)` outside
  the CBOR integer range, a negative `biguintToCbor`) or on which it panics
  (`fromEpochSeconds(±Infinity)`, whole seconds outside chrono's range); the
  harness probes chrono's `timestamp_opt` with the reference's own
  arithmetic before calling into it.
- **skipped** counts JS-only input shapes (`Symbol`, function, malformed
  bare node), tombstoned recipes, rows pinned to the other build, and the
  bignum recipes in the default build.
- Decode vectors whose accepted input re-encodes differently (whole-valued
  f32/f64 heads) carry the reference's re-encoded bytes.
- Format vectors cover diagnostic notation (plain, annotated, flat,
  summarized) and annotated hex under `TagsStoreOpt::None` and a fresh store
  after `register_tags_in`. Each row that depends on the build is pinned to it.
- Date vectors cover `CborDate` decoding and display, including leap seconds,
  the range bounds and `NaN`.
- Unsigned vectors compare `u8`/`u16`/`u32`/`u64::try_from` with
  `expectUnsigned(cbor, { width, wrapNegative: true })` (§1.6).
- The allowlist `expected_divergences()` in `tests/rust-validation/src/main.rs`
  is empty.
- This verifies the committed vectors, not every input. The classes below
  are what remains.

This document records known differences and JavaScript input mappings.

---

## 1. True behavioral divergences (same input, different outcome)

These cases differ in accepted inputs or error handling. Changes should be
reviewed against both the TypeScript tests and the Rust reference.

### 1.1 Reference panics on dates become `InvalidDate`

`Date::from_timestamp` unwraps chrono's `timestamp_opt`, and
`from_ymd`/`from_ymd_hms` unwrap `with_ymd_and_hms`. Where the reference
panics, the port throws `CborError` `InvalidDate` at the same point
(construction or decode):

| input | @blockchaincommons/dcbor | dcbor (Rust) |
|---|---|---|
| `fromEpochSeconds(±Infinity)`, decode of `1(±Infinity)` (`c1f97c00`) | `InvalidDate` | **panics** (`No such local time`) |
| a timestamp whose **truncated** whole seconds fall outside `[-8334601228800, 8210266876799]` (`c11b000007779a0a6b80`) | `InvalidDate` | **panics** |
| `fromYmd`/`fromYmdHms` with an impossible month, day or time, or a year outside −262143…+262142 | `InvalidDate` ("Invalid date components") | **panics** (`with_ymd_and_hms(…).unwrap()`) |

**Why:** a library cannot reproduce a process abort; a typed error at the
same call is the faithful mapping. A summarizer prints `<error: …>` where
the reference aborts. Values the reference accepts are accepted
identically: a fraction just below the minimum truncates into range
(`MIN - 0.5` is `MIN`), a `NaN` timestamp saturates to the epoch (`c100`,
printed `1970-01-01`), and an integer timestamp `f64` cannot hold exactly is
`OutOfRange` on both sides (`c11b7fffffffffffffff`). Executed on the
reference at the exact bounds (`date-vectors.json`). Reported upstream
(issue link pending; drafts in the bc-typescript audit).

### 1.2 Tag registration errors

Registering a tag without a name, or a tag value under a different name,
panics in the reference's `TagsStore::insert`. The port throws `CborError`
`Custom`. The conflict message is the reference's text
(`Attempt to register tag: 1 'date' with different name: 'other'`). A
missing or empty name reads `Tag N must have a non-empty name`, because the
reference's text there is a panic payload. After a conflict the rejected
value's entry and both maps are unchanged; the reference has already
replaced the value entry when it panics. That state is not a contract.
Covered by `tests/tags-store.test.ts`. Reported upstream (issue link
pending).

### 1.3 Nesting depth is bounded by the host stack

Decoding, encoding, formatting and walking recurse on both sides. The
reference aborts on stack overflow at a depth set by the thread's stack
(executed: 30,000 levels decode on an 8 MiB main thread and 40,000 abort;
5,000 decode on a 2 MiB spawned thread and 10,000 abort). The port throws
the engine's `RangeError` (executed: node 24 accepts 3,000 and fails at
4,000; bun 1.4 accepts 25,000 and fails at 30,000). `tryDecode` lets it
propagate, as it does every non-`CborError`. Neither side defines a limit,
so there is no reference accept set to match. `tests/encode.test.ts` pins a
1,000-level floor.

### 1.4 Walk state cloning

`walk` passes each subtree `structuredClone(state)` for object state
(primitives pass through), where the reference calls `State::clone`. Plain
data behaves identically. JavaScript has no user-defined `Clone`, so state
holding functions or class instances cannot follow a Rust `Clone` impl.

### 1.5 Clock resolution

`CborDate.now()` and `withDurationFromNow(ms)` read the JavaScript wall
clock, which has millisecond resolution; the reference reads nanoseconds.
Neither value is reproducible.

### 1.6 Negative integers converted to unsigned (reference defect)

The reference's `u8`…`u64` `TryFrom<CBOR>` wraps a negative integer instead
of rejecting it (`int.rs`, `Ok((-1 - a) as $type)`; executed:
`u8::try_from(-1) = 255`, `u64::try_from(-2^64) = 0`).
`expectUnsigned(cbor, { width, wrapNegative: true })` matches
`u8`…`u64`/`usize::try_from`, including the wrap and the `OutOfRange`
beyond the width (harness `uint` vectors). Without options,
`expectUnsigned` still throws `WrongType` for any negative integer. A
consumer that ports a field decoded with `u*::try_from` records whether it
matches the wrap: bc-components-ts (COMP-05, COMP-09) uses the helper, and
bc-known-values-ts (KV-04, D2) records its choice. Reported upstream (issue
link pending).

---

## 2. JS-only input domain (no Rust analog exists)

These inputs cannot be expressed against the Rust API at all, so there is
nothing to compare - the TS behavior is frozen by the golden vectors alone.
The Rust harness **skips** them.

| input shape | frozen TS behavior | vector |
|---|---|---|
| `Symbol` passed to `cbor()` | throws `CborError` `Custom` ("Unsupported type for CBOR encoding") | `unsupported/symbol-throws` |
| function passed to `cbor()` | throws `Custom` | `unsupported/function-throws` |
| malformed bare Cbor node (`{isCbor: true, type: ByteString, value: 42}`) | throws `WrongType` at encode | `rawbad/malformed-bytestring-node-throws` |
| `CborDate.fromDate(new Date(NaN))` | throws `InvalidDate` (a chrono value cannot be invalid) | `tests/date.test.ts` |
| non-integer date components (`fromYmd(2023.5, 1, 1)`) | throws `InvalidDate` (Rust takes `i32`/`u32`) | `tests/date.test.ts` |
| `hexToBytes` with whitespace, odd length or non-hex digits | ignores whitespace; throws `Custom` otherwise (the reference's `try_from_hex` panics on any malformed input) | `tests/hex.property.test.ts` |

Reference surfaces without a port counterpart, API shape only:
`Display`/`Debug` for `CBOR` (use `diagnostic(c, { flat: true })`), and
`TagsStoreOpt::None` (pass `tags: "none"` to `diagnostic`, or an empty
`TagsStore` to `hexAnnotated`). A `Tag` name carried by a tagged value
built with `taggedValue(tag, …)` appears only in `WrongTag` messages, as in
the reference.

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
`Date::from_string` by execution (the `datestr/*` vectors run each form
through the reference): the RFC 3339 form keeps nine fraction digits and
the `:60` leap second, takes `T`/`t`/space and `−` (U+2212) in the offset,
and bounds the offset by ±23:59; the bare form is chrono's `%Y-%m-%d` (one-
or two-digit month and day, a signed year of any length, whitespace before
each number); both reject the same malformed inputs
(`datestr/invalid-throws`, `datestr/missing-offset-throws` → `InvalidDate`).
The instant is held as whole seconds plus nanoseconds, the reference's
`chrono::DateTime` model, and the wire value is its `timestamp()`
arithmetic (whole seconds plus nanoseconds over 10⁹), so a fraction encodes
to the same bytes on both sides; `fromDate` computes a JS `Date`'s
milliseconds the same way. The impossible-component case is §1.1; display
matches the reference, including a leap second (`10:30:60Z`), and equality
and ordering compare the pair (`date-vectors.json`, `tests/date.test.ts`).

- **Text normalization.** `cbor(string)` keeps the string as given;
  encoding normalizes to NFC, as the reference's `to_cbor_data` does.
  Extraction, equality, diagnostic notation and annotated hex therefore see
  the original string on both sides (`rawtext/*`, `text/nfd-bare-node`).
  Decoding rejects non-NFC text with `NonCanonicalString` using the engine's
  `String.prototype.normalize`. This is identical to the reference's
  `unicode-normalization` tables when the engine's Unicode version equals
  the crate's (Unicode 17, verified exhaustively on bun and node).
  `tests/unicode.test.ts` fails on an engine reporting an older Unicode
  version. (The reference's `hex_annotated` dumps the un-normalized bytes of
  such a node while `to_cbor_data` normalizes; the port mirrors that, and it
  is reported upstream.)
- **Whole-valued float heads.** Decoding judges a float head with the
  reference's `validate_canonical_f16/f32/f64` predicates (saturating
  `as i32`/`as i64` images) and builds the node its `From<f32>`/`From<f64>`
  build, so `fa4f000001` decodes to the integer `2147483904` and re-encodes
  as `1a80000100`, and `fa4f800000` stays a float (`accept/fa4f000001-as-1a80000100`
  and neighbours). That accept set is reported upstream as a determinism gap.
- **Standard tags 2 and 3.** The reference names `positive-bignum` /
  `negative-bignum` (and summarises `bignum(…)`) only when built with its
  `num-bigint` feature; when that feature is disabled, a Rust peer prints
  `2(h'…')` and annotates `# tag(2)`. `registerStandardTags(store)` matches
  that, and `registerStandardTags(store, { bignum: true })` matches the
  `num-bigint` build. Both configurations are harness format vectors
  (`tag/bignum-*`).
- **Global tags store.** `getGlobalTagsStore()` ↔ `GLOBAL_TAGS`: one store
  per process for dcbor 1.x, shared by the ESM and CommonJS builds (held at
  `globalThis[Symbol.for("@blockchaincommons/dcbor/global-tags-store@1")]`).
- **Frozen tags.** Tags created by `Tag.from` and tags held by a
  `TagsStore` are frozen; the reference stores clones.
- **Bulk registration.** `registerAll(tags: Iterable<Tag>)` ↔ `insert_all`.
  `registerStandardTags()` registers its tags unconditionally through it,
  as `register_tags_in` does.
- **Store cloning.** `TagsStore.clone()` ↔ `#[derive(Clone)] TagsStore`.
  Both tag maps and the summarizer map are copied, so registering on the
  clone leaves the original unchanged. Frozen tags are shared by identity,
  and summarizer functions are shared, as the reference's `Arc` summarizers
  are.
- **`WrongTag` names.** `CborDate.cborTags()` resolves tag 1 through the
  global store (`tags_for_values`); `taggedValue(tag, …)` keeps a named
  `Tag`'s name on the node (`tagName`, never on the wire), so
  `validateTag`/`expectTaggedContent` print `expected CBOR tag date, but got
  custom` exactly as the reference's `WrongTag(Tag, Tag)` does.

---

## Maintenance

- **Adding vectors:** a vector that diverges from Rust is a bug to fix,
  unless it belongs to a class above. Document such a case here and, when
  the harness covers it, add it to `expected_divergences()` in
  `tests/rust-validation/src/main.rs` in the same change. The allowlist is
  empty today.
- **Re-run the cross-validation** in both builds (default and
  `--features bignum`) after every fixture regeneration
  (`bun run vectors:generate`), and update the header result lines.
- **Version pin:** the harness pins `dcbor = 0.25.2`. When bumping, re-run
  both builds and update the header.
