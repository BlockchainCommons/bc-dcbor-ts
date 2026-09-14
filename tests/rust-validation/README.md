# Rust reference cross-validation

Validates the committed golden vectors (`tests/vectors/*.json`) against the
Rust reference implementation this library is a port of
([bc-dcbor-rust](https://github.com/BlockchainCommons/bc-dcbor-rust), crate
`dcbor`, pinned `=0.25.2`).

The harness runs twice: once against the default build every Rust consumer
in the Blockchain Commons stack uses, once with dcbor's `num-bigint`
feature, which names tags 2/3 and can materialize the bignum recipes.

```sh
cd tests/rust-validation
cargo run --release -- ../vectors
cargo run --release --features bignum -- ../vectors
```

Both runs are a CI job (`.github/workflows/ci.yml`, `rust-validation`).

## What is compared

| file | Rust side | compared |
|---|---|---|
| `encode-vectors.json` | the recipe materialized with the `dcbor` API, `to_cbor_data()` | bytes (or digest + length), or the error code |
| `decode-vectors.json` | `CBOR::try_from_data`, then `to_cbor_data()` | re-encoded bytes (the fixture may pin a different re-encoding for whole-valued float heads), or the error code **and** its `Display` message |
| `format-vectors.json` | `diagnostic_opt` (plain, annotated, flat, summarized) and `hex_opt` under `TagsStoreOpt::None` or a fresh store after `register_tags_in` | all five strings |
| `date-vectors.json` | `Date::from_tagged_cbor`, `Date::from_timestamp`, `Date::from_string`, then `to_cbor_data()` and `Display` | bytes + display, or the error code (and message for decode rows) |
| `uint-vectors.json` | `u8`/`u16`/`u32`/`u64::try_from(CBOR)` | the value, or the error code |

Exit code 0 iff every vector either matches, or falls into one of the
explicitly named classes:

- **reference-throw** - the reference itself rejects the input
  (`Date::from_string` on an unparsable string) with the fixture's code.
- **emulated-throw** - a TypeScript guard the harness mirrors because the
  reference cannot express the input (`cbor(bigint)` outside the CBOR integer
  range, a negative `biguintToCbor`) or would panic on it
  (`Date::from_timestamp` on ±Infinity or on whole seconds outside chrono's
  range, probed with chrono's own `timestamp_opt` before the call).
- **skipped** - JS-only inputs with no Rust analog (`Symbol`, function,
  malformed bare node), the rejected `{tag, value}` literal and
  `taggedCbor()`-only shapes (fixtures marked `tombstone`), rows pinned to
  the other build, and the bignum recipes in the default build.
- **expected-divergence** - a documented TS↔Rust difference allowlisted by
  vector name in `expected_divergences()` in `src/main.rs`. The list is
  empty: every recorded divergence is closed. The mechanism stays so a
  deliberate future divergence is recorded in
  [`RUST_DIVERGENCES.md`](../../RUST_DIVERGENCES.md) and allowlisted here in
  the same change.

Everything else - the whole-valued float heads that decode to integers, the
bare-Float-node quirks, every decode rejection with its exact code and
message, every diagnostic and annotated-hex rendering, every date display
including leap seconds - matches the reference exactly.

Re-run both builds after any fixture regeneration (`bun run vectors:generate`)
and update the result lines in `RUST_DIVERGENCES.md`. When bumping the
`dcbor` pin, re-run both builds and update the header there too.
