/**
 * Numeric boundary contract and helpers.
 *
 * ## The `number` / `bigint` contract
 *
 * dCBOR integers span `[-(2^64), 2^64)`, which exceeds JavaScript's safe
 * integer range (`±(2^53 − 1)`). The single, repo-wide rule is:
 *
 * - An integer that fits in the IEEE-754 **safe** range is represented as a
 *   `number`; anything larger (in magnitude) is a `bigint`.
 * - Decoding returns the **narrowest exact** representation via
 *   {@link narrowInteger}, so small values are ergonomic `number`s and large
 *   ones remain lossless `bigint`s.
 * - Encoding accepts either at the public edge and normalises once.
 *
 * Every module funnels its boundary logic through this file - nothing else
 * should hard-code `Number.MAX_SAFE_INTEGER`, `2^64`, etc.
 *
 * @module numeric
 */

/** `BigInt(Number.MAX_SAFE_INTEGER)` - largest integer exact as a `number`. */
export const SAFE_MAX_BIG: bigint = BigInt(Number.MAX_SAFE_INTEGER);
/** `BigInt(Number.MIN_SAFE_INTEGER)`. */
export const SAFE_MIN_BIG: bigint = BigInt(Number.MIN_SAFE_INTEGER);

/** `u64::MAX` = 2^64 − 1. */
export const U64_MAX = 0xffff_ffff_ffff_ffffn;
/** `i64::MAX` = 2^63 − 1. */
export const I64_MAX = 0x7fff_ffff_ffff_ffffn;
/** `i64::MIN` = −2^63. */
export const I64_MIN = -0x8000_0000_0000_0000n;
/** `u128::MAX` = 2^128 − 1. */
export const U128_MAX: bigint = (1n << 128n) - 1n;
/** `i128::MAX` = 2^127 − 1. */
export const I128_MAX: bigint = (1n << 127n) - 1n;
/** `i128::MIN` = −2^127. */
export const I128_MIN: bigint = -(1n << 127n);

/** Smallest dCBOR-encodable integer: −(2^64). */
export const CBOR_INT_MIN: bigint = -(1n << 64n);
/** Largest dCBOR-encodable integer: 2^64 − 1. */
export const CBOR_INT_MAX: bigint = U64_MAX;

/**
 * Return the narrowest exact representation of an integer: a `number` when it
 * fits the safe-integer range, otherwise the `bigint` unchanged. This is the
 * canonical way to hand an integer back to callers.
 */
export const narrowInteger = (value: bigint): number | bigint =>
  value >= SAFE_MIN_BIG && value <= SAFE_MAX_BIG ? Number(value) : value;

/** True when `value` is within the dCBOR integer range `[-(2^64), 2^64)`. */
export const isCborEncodableInteger = (value: bigint): boolean =>
  value >= CBOR_INT_MIN && value <= CBOR_INT_MAX;

/**
 * Truncate a float to `u64` with saturating semantics: NaN and negatives clamp
 * to 0, values at/above 2^64 clamp to `u64::MAX`. Lets the exact-float checks
 * verify the `(f as u64) == source` round-trip.
 */
export const saturateFloatToU64 = (f: number): bigint => {
  if (Number.isNaN(f)) return 0n;
  const t = Math.trunc(f);
  if (t <= 0) return 0n;
  const big = BigInt(t);
  return big > U64_MAX ? U64_MAX : big;
};

/**
 * Truncate a float to `i64` with saturating semantics: NaN clamps to 0, values
 * clamp to `i64::MAX`/`i64::MIN` at the bounds.
 */
export const saturateFloatToI64 = (f: number): bigint => {
  if (Number.isNaN(f)) return 0n;
  const t = Math.trunc(f);
  const big = BigInt(t);
  if (big > I64_MAX) return I64_MAX;
  if (big < I64_MIN) return I64_MIN;
  return big;
};

/**
 * Truncate a float to `u128` with saturating semantics: NaN and negatives clamp
 * to 0, values at/above 2^128 clamp to `u128::MAX`.
 */
export const saturateFloatToU128 = (f: number): bigint => {
  if (Number.isNaN(f)) return 0n;
  const t = Math.trunc(f);
  if (t <= 0) return 0n;
  const big = BigInt(t);
  return big > U128_MAX ? U128_MAX : big;
};
