# Rust reference cross-validation (P1.1 hardening)

Validates the committed golden wire vectors (`tests/vectors/*.json`) against
the Rust reference implementation this library is a port of
([bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust), crate
`dcbor`, pinned `=0.25.2`).

```sh
cd tests/rust-validation
cargo run --release -- ../vectors
```

Exit code 0 iff every vector either matches Rust byte-for-byte /
code-for-code, or falls into one of the small, explicitly-named classes:

- **skipped (3)** - JS-only inputs with no Rust analog: `Symbol`, function,
  malformed bare Cbor node.
- **emulated-throw (6)** - TS *input guards* the harness mirrors because
  Rust's typed API cannot express the input: `cbor(bigint)` range guard
  (Rust has no `i128 → CBOR`; its own tests use `CBORCase` directly),
  `biguintToCbor(<0)`, and two `Date::from_string` failures (those two are
  in fact validated through Rust's own parser).
- **expected-divergence (6)** - documented, allowlisted TS↔Rust behavioral
  differences:
  - 5 decode vectors: byte-string/text lengths ≥ 2^53 → TS `OutOfRange`
    (JS bigint length narrowing) vs Rust `Underrun` (usize length, body
    bounds check).
  - 1 encode vector: `CborDate.fromTimestamp(NaN)` → TS throws
    `InvalidDate`; Rust `Date::from_timestamp` saturating-casts to epoch.

Everything else - including the bare-Float-node quirk vectors (`fround`
negative-reduction collisions, f32-exact wholes ≥ 2^32 staying `0xfa`
floats) and all 177 decode rejections with exact error codes - matches the
Rust reference exactly, confirming the frozen TS behavior is genuine Rust
parity and not porting artifacts.

Every divergence class is documented in detail in
[`RUST_DIVERGENCES.md`](../../RUST_DIVERGENCES.md) at the repo root; the
`expected_divergences()` allowlist in `src/main.rs` is its machine-readable
twin - keep them in sync.

Re-run this after any fixture regeneration (and at the P4.1 proof
re-baseline). It is not wired into the JS CI job because it needs a Rust
toolchain; treat it as a mandatory manual gate at phase boundaries.
