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
  bare node), the rejected legacy protocol shapes (`{tag, value}` literals
  and `taggedCbor()`-only objects), rows pinned to the other build, and the
  bignum recipes in the default build.
- Decode vectors whose accepted input re-encodes differently (whole-valued
  f32/f64 heads) carry the reference's re-encoded bytes.
- Format vectors cover diagnostic notation (plain, annotated, flat,
  summarized) and annotated hex under `TagsStoreOpt::None` and a fresh store
  after `register_tags_in`. Each row that depends on the build is pinned to it.
- Date vectors cover `CborDate` decoding and display, including leap seconds,
  the range bounds and `NaN`.
- Unsigned vectors compare `u8`/`u16`/`u32`/`u64::try_from` with
  `expectUnsigned(cbor, { width, wrapNegative: true })` (§1.1).
- The allowlist `expected_divergences()` in `tests/rust-validation/src/main.rs`
  is empty.
- This verifies the committed vectors, not every input. The entries below
  are the behavioral differences that remain.

Where the reference panics (an impossible date, a tag registered without a
name or under a conflicting name), the port throws a `CborError` at the same
call. Where the outcome depends on the host rather than the port (recursion
depth, clock resolution, cloning of visitor state), neither side defines a
contract. Neither kind is a divergence and neither is recorded here.

---

## 1. True behavioral divergences (same input, different outcome)

These cases differ in accepted inputs or error handling. Changes should be
reviewed against both the TypeScript tests and the Rust reference.

### 1.1 Negative integers converted to unsigned (reference defect)

The reference's `u8`…`u64` `TryFrom<CBOR>` wraps a negative integer instead
of rejecting it (`int.rs`, `Ok((-1 - a) as $type)`; executed:
`u8::try_from(-1) = 255`, `u64::try_from(-2^64) = 0`).
`expectUnsigned(cbor, { width, wrapNegative: true })` matches
`u8`…`u64`/`usize::try_from`, including the wrap and the `OutOfRange`
beyond the width (harness `uint` vectors). Without options,
`expectUnsigned` still throws `WrongType` for any negative integer. A
consumer that ports a field decoded with `u*::try_from` records whether it
matches the wrap: bc-components-ts uses the helper, and bc-known-values-ts
records its choice. Reported upstream (issue link pending).

### 1.2 Hex input tolerates whitespace

`hexToBytes` strips whitespace before decoding, so `"a1 61 61 01"` yields
the bytes of `"a1616101"`; an odd length or a non-hex digit throws
`CborError` `Custom`. The reference's `CBOR::try_from_hex` unwraps
`hex::decode`, which rejects whitespace, so it panics on every malformed
input, whitespace included. The port therefore accepts an input the
reference does not. Covered by `tests/hex.property.test.ts`.

---

## 2. Reference quirks the port reproduces

### 2.1 `i16::exact_from_f16` excludes -32768

The reference's `exact_from_f16` for `i16` tests `source <= -32768.0`
(`exact.rs`), so `-32768.0`, which binary16 represents exactly, is `None`,
while `exact_from_f32(-32768.0)` and `exact_from_f64(-32768.0)` are
`Some(-32768)`. `ExactI16.exactFromF16(-32768)` is `undefined` to match;
`tests/exact.test.ts` pins it. Nothing on the wire depends on it. Reported
upstream (issue link pending).

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
