# Divergences from the Rust reference implementation

`@blockchaincommons/dcbor` is a port of [bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust)
(crate `dcbor`). It's committed golden wire vectors (`tests/vectors/*.json`)
have been cross-validated against the Rust reference, **pinned at
`dcbor = 0.25.2`**, using the harness in `tests/rust-validation/`:

```sh
cd tests/rust-validation
cargo run --release -- ../vectors
```

Validation result (2026-07-15):

```
encode: 346 vectors - 328 match, 6 emulated-throw, 11 skipped (JS-only), 1 expected-divergence, 0 MISMATCH
decode: 241 vectors - 241 match, 0 expected-divergence, 0 MISMATCH
```

Every byte that the two implementations can both produce is **identical**, and all
177 decode rejections agree **error-code-for-error-code** - including the
subtle frozen behaviors that look like porting artifacts but are genuine Rust
parity:

- the `Math.fround(-1 - n)` negative float reduction (mirror of Rust's
  `-1f32 - n`), including its byte **collisions** (e.g. the bare-Float value
  `-16777218.0` encodes as the bytes of semantic `-16777217`);
- f32-exact whole values ≥ 2³² staying `0xfa` floats in the bare-Float
  encoding ladder (no integer reduction), even though the decoder then
  rejects those very bytes as non-canonical;
- `-0.0` reducing to integer `0x00` (sign lost);
- canonical NaN `f97e00`, ±Infinity `f97c00`/`f9fc00`, all f16/f32/f64
  shortest-form selection edges and subnormals.

This document records everything that does **not** match 1:1, in three
classes. The machine-readable twin of class 1 is the
`expected_divergences()` allowlist in `tests/rust-validation/src/main.rs` -
keep the two in sync.

---

## 1. True behavioral divergences (same input, different outcome)

These are cases where both implementations can process the same conceptual
input but deliberately (or incidentally) behave differently. They are frozen
TS behavior: the API redesign must preserve them, and any change is a
wire-behavior change requiring the full vector-suite gate.

### 1.1 Non-finite date timestamps: TS guards, Rust saturates

| input | @blockchaincommons/dcbor | dcbor (Rust) |
|---|---|---|
| `CborDate.fromEpochSeconds(NaN)` / `(±Infinity)` (`fromTimestamp`) | throws `InvalidDate` ("non-finite timestamp") | `Date::from_timestamp` saturating-casts (NaN → epoch `0`, encodes `c100`) |

**Why:** the TS port added an explicit finiteness guard; Rust's
`Date::from_timestamp` does `trunc() as i64` / `fract() * 1e9 as u32`, and Rust
float→int casts saturate, silently yielding a valid (but almost certainly
unintended) date. The TS behavior is deliberately stricter.

**Affected vectors:** `date/non-finite-throws` (1 encode vector; also the
`date-nonfinite-*` differential corpus entries).

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

Related JS-only behaviors that DO have a byte-comparable target and were
validated against Rust via their mapping (class 3 below): `undefined`,
lone surrogates, JS `Set`/`Map` inputs, `{tag, value}` sniffing, protocol
objects.

---

## 3. Mapping equivalences (JS-specific inputs validated via their byte-target)

These are JS-specific input *routes* whose output bytes were validated
against the equivalent Rust construction. The byte-level wire behavior
matches Rust exactly; only the input-side convenience/coercion is TS-specific.

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
`Date::from_string`: both accept strict RFC 3339 (with mandatory offset) and
bare `YYYY-MM-DD`, and both reject the same malformed inputs
(`datestr/invalid-throws`, `datestr/missing-offset-throws` → `InvalidDate`).

---

## Maintenance

- **Adding vectors:** if a new vector diverges from Rust, either it is a bug
  (fix it) or it belongs in one of the classes above - document it HERE and
  add it to `expected_divergences()` in `tests/rust-validation/src/main.rs`
  in the same change.
- **Re-run the cross-validation** after every fixture regeneration
  (`bun run vectors:generate`) at proof re-baseline.
- **Version pin:** the harness pins `dcbor = 0.25.2`. When bumping, re-run
  and update the header of this file with the new result line.
