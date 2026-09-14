/**
 * Float encoding and conversion utilities for dCBOR.
 *
 * # Floating Point Number Support in dCBOR
 *
 * dCBOR provides canonical encoding for floating point values.
 *
 * Per the dCBOR specification, the canonical encoding rules ensure
 * deterministic representation:
 *
 * - Numeric reduction: Floating point values with zero fractional part in
 *   range [-2^63, 2^64-1] are automatically encoded as integers (e.g., 42.0
 *   becomes 42)
 * - Values are encoded in the smallest possible representation that preserves
 *   their value
 * - All NaN values are canonicalized to a single representation: 0xf97e00
 * - Positive/negative infinity are canonicalized to half-precision
 *   representations
 *
 * @module float
 */

import { encodeVarInt } from "./varint";
import {
  type CborNegativeType,
  type CborSimpleType,
  type CborUnsignedType,
  MajorType,
} from "./cbor-types";
import { ExactU64, ExactU32, ExactU16, ExactI128 } from "./exact";
import { CborError } from "./error";

/**
 * Canonical NaN representation in CBOR: 0xf97e00
 */
export const CBOR_NAN: Uint8Array<ArrayBuffer> = new Uint8Array([0xf9, 0x7e, 0x00]);

/**
 * Check if a number has a fractional part.
 */
export const hasFractionalPart = (n: number): boolean => n !== Math.floor(n);

/**
 * Read a big-endian IEEE-754 double from the first 8 bytes of `data`.
 * @internal
 */
export const binary64ToNumber = (data: Uint8Array): number =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat64(0, false);

/**
 * Encode a number as 4 big-endian bytes of an IEEE-754 single (f32).
 */
export const numberToBinary32 = (n: number): Uint8Array<ArrayBuffer> => {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setFloat32(0, n, false);
  return data;
};

/**
 * Read a big-endian IEEE-754 single (f32) from the first 4 bytes of `data`.
 */
export const binary32ToNumber = (data: Uint8Array): number =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat32(0, false);

// Reused scratch view for reading a number's f32 bit pattern. Single-threaded
// and never held across an await, so sharing it is safe and avoids a per-call
// allocation on the encode hot path.
const f32ScratchView = new DataView(new ArrayBuffer(4));

/**
 * Compute the 16-bit pattern of the IEEE-754 half-precision value nearest `n`,
 * rounding ties to even.
 *
 * All call sites pass values already exactly representable in binary16 (the
 * reduction gates in {@link f16CborData} ensure this), so no rounding occurs on
 * a value that is actually stored; the rounding path exists only so the
 * reduction round-trip probe (`binary16ToNumber(numberToBinary16(n)) === n`)
 * answers correctly for non-representable inputs.
 */
const float16Bits = (n: number): number => {
  f32ScratchView.setFloat32(0, n, false);
  const f = f32ScratchView.getUint32(0, false);

  const sign = (f >>> 16) & 0x8000;
  const exp = (f >>> 23) & 0xff;
  const mant = f & 0x7fffff;

  // Inf / NaN: preserve infinity, collapse any NaN to a quiet half NaN.
  if (exp === 0xff) return sign | (mant !== 0 ? 0x7e00 : 0x7c00);

  // Rebias the exponent from f32 (bias 127) to f16 (bias 15).
  const e = exp - 127 + 15;

  // Overflow to infinity.
  if (e >= 0x1f) return sign | 0x7c00;

  // Subnormal half or underflow to zero.
  if (e <= 0) {
    if (e < -10) return sign; // too small even for a subnormal -> signed zero
    const significand = mant | 0x800000; // restore the implicit leading 1
    const shift = 14 - e; // 14..24
    let result = significand >>> shift;
    const remainder = significand & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && (result & 1) === 1)) result += 1;
    return sign | result; // 0x400 correctly rolls a rounded subnormal into the smallest normal
  }

  // Normal half: round the 23-bit fraction down to 10 bits, ties to even.
  let fraction = mant >>> 13;
  const remainder = mant & 0x1fff;
  let exponent = e;
  if (remainder > 0x1000 || (remainder === 0x1000 && (fraction & 1) === 1)) {
    fraction += 1;
    if (fraction === 0x400) {
      // Mantissa overflow carries into the exponent.
      fraction = 0;
      exponent += 1;
      if (exponent >= 0x1f) return sign | 0x7c00;
    }
  }
  return sign | (exponent << 10) | fraction;
};

/**
 * Encode a number as 2 big-endian bytes of an IEEE-754 half (f16).
 */
export const numberToBinary16 = (n: number): Uint8Array<ArrayBuffer> => {
  const bits = float16Bits(n);
  return new Uint8Array([(bits >> 8) & 0xff, bits & 0xff]);
};

/**
 * Read a big-endian IEEE-754 half (f16) from the first 2 bytes of `data`.
 */
export const binary16ToNumber = (data: Uint8Array): number => {
  const bits = (data[0] << 8) | data[1];
  const sign = (bits & 0x8000) !== 0 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;

  if (exponent === 0) return sign * fraction * 2 ** -24; // subnormal / signed zero
  if (exponent === 0x1f) return fraction !== 0 ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15); // normal
};

/**
 * Encode f64 value to CBOR data bytes.
 * Implements numeric reduction and canonical encoding rules.
 * @internal
 */
export const f64CborData = (value: number): Uint8Array<ArrayBuffer> => {
  const n = value;

  // Try to reduce to f32 first
  const f32Bytes = numberToBinary32(n);
  const f = binary32ToNumber(f32Bytes);
  if (f === n) {
    return f32CborData(f);
  }

  // Try numeric reduction to negative integer
  if (n < 0.0) {
    const i128 = ExactI128.exactFromF64(n);
    if (i128 !== undefined) {
      const i = ExactU64.exactFromI128(-1n - i128);
      if (i !== undefined) {
        // Encode as a negative integer. Pass the bigint straight through:
        // encodeVarInt handles u64 losslessly via setBigUint64, whereas
        // narrowing through Number() would round magnitudes above 2^53.
        return encodeVarInt(i, MajorType.Negative);
      }
    }
  }

  // Try numeric reduction to unsigned integer
  const u = ExactU64.exactFromF64(n);
  if (u !== undefined) {
    return encodeVarInt(u, MajorType.Unsigned);
  }

  // Canonical NaN
  if (Number.isNaN(value)) {
    return CBOR_NAN;
  }

  // Encode as f64 - create binary manually (always 8 bytes with 0xfb prefix)
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, n, false); // big-endian
  const bytes = new Uint8Array(buffer);
  const majorByte = 0xfb; // 0x1b | (MajorType.Simple << 5) = 0x1b | 0xe0 = 0xfb
  return new Uint8Array([majorByte, ...bytes]);
};

/**
 * Encode f32 value to CBOR data bytes.
 * Implements numeric reduction and canonical encoding rules.
 * @internal
 */
export const f32CborData = (value: number): Uint8Array<ArrayBuffer> => {
  const n = value;

  // Try to reduce to f16
  const f16Bytes = numberToBinary16(n);
  const f = binary16ToNumber(f16Bytes);
  if (f === n) {
    return f16CborData(f);
  }

  // Try numeric reduction to negative integer. Math.fround keeps `-1 - n` in
  // f32 precision.
  if (n < 0.0) {
    const u = ExactU64.exactFromF32(Math.fround(-1.0 - n));
    if (u !== undefined) {
      return encodeVarInt(u, MajorType.Negative);
    }
  }

  // Try numeric reduction to unsigned integer
  const u = ExactU32.exactFromF32(n);
  if (u !== undefined) {
    return encodeVarInt(u, MajorType.Unsigned);
  }

  // Canonical NaN
  if (Number.isNaN(value)) {
    return CBOR_NAN;
  }

  // Encode as f32 - always use 0xfa prefix with 4 bytes
  const bytes = numberToBinary32(n);
  return new Uint8Array([0xfa, ...bytes]);
};

/**
 * Encode f16 value to CBOR data bytes.
 * Implements numeric reduction and canonical encoding rules.
 * @internal
 */
export const f16CborData = (value: number): Uint8Array<ArrayBuffer> => {
  const n = value;

  // Try numeric reduction to negative integer
  if (n < 0.0) {
    const u = ExactU64.exactFromF64(-1.0 - n);
    if (u !== undefined) {
      return encodeVarInt(u, MajorType.Negative);
    }
  }

  // Try numeric reduction to unsigned integer
  const u = ExactU16.exactFromF64(n);
  if (u !== undefined) {
    return encodeVarInt(u, MajorType.Unsigned);
  }

  // Canonical NaN
  if (Number.isNaN(value)) {
    return CBOR_NAN;
  }

  // Encode as f16 - always use 0xf9 prefix with 2 bytes
  const bytes = numberToBinary16(value);
  return new Uint8Array([0xf9, ...bytes]);
};

// ============================================================================
// Decoder-side canonicality predicates and node construction
//
// Ports of `validate_canonical_f16/f32/f64` and `From<f16/f32/f64> for CBOR`
// in the reference's float.rs. The predicates use Rust's saturating `as`
// casts on purpose: a whole-valued f32 head at or beyond 2^31 (or an f64 head
// at or beyond 2^63) does NOT compare equal to its saturated integer image,
// so the reference accepts it, and its `From` impl then reduces it to an
// integer node where one fits. The decoder must reproduce that accept set
// and those nodes byte-for-byte.
// ============================================================================

const TWO_POW_63 = 2 ** 63;

/**
 * Rust `n as i64 as f64`: NaN → 0; saturates at the i64 bounds. `i64::MAX`
 * (2^63 - 1) is not a double, so the saturated image converts back to 2^63,
 * and every double at or above 2^63 saturates to it.
 */
const saturatingI64AsF64 = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  if (n >= TWO_POW_63) return TWO_POW_63; // i64::MAX as f64
  if (n <= -TWO_POW_63) return -TWO_POW_63; // i64::MIN
  return Math.trunc(n);
};

/** Rust `n as i32 as f32` for an f32 value: NaN → 0; saturates at the i32 bounds. */
const saturatingI32AsF32 = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  if (n >= 2147483647) return Math.fround(2147483647); // i32::MAX as f32 = 2^31
  if (n <= -2147483648) return -2147483648; // i32::MIN
  return Math.fround(Math.trunc(n));
};

/**
 * `validate_canonical_f16`: a half head is non-canonical when it is
 * whole-valued (must be an integer) or a NaN other than `0x7e00`.
 * @internal
 */
export const validateCanonicalF16 = (bits: number, n: number): void => {
  if (n === saturatingI64AsF64(n) || (Number.isNaN(n) && bits !== 0x7e00)) {
    throw CborError.nonCanonicalNumeric();
  }
};

/**
 * `validate_canonical_f32`: a single head is non-canonical when it fits a half
 * (including ±0 and ±Infinity), equals its saturating `i32` image, or is NaN.
 * @internal
 */
export const validateCanonicalF32 = (n: number): void => {
  if (
    n === binary16ToNumber(numberToBinary16(n)) ||
    n === saturatingI32AsF32(n) ||
    Number.isNaN(n)
  ) {
    throw CborError.nonCanonicalNumeric();
  }
};

/**
 * `validate_canonical_f64`: a double head is non-canonical when it fits a
 * single, equals its saturating `i64` image, or is NaN.
 * @internal
 */
export const validateCanonicalF64 = (n: number): void => {
  if (n === Math.fround(n) || n === saturatingI64AsF64(n) || Number.isNaN(n)) {
    throw CborError.nonCanonicalNumeric();
  }
};

/** A bare (methodless) node a float head decodes to. */
export type FloatHeadNode = CborUnsignedType | CborNegativeType | CborSimpleType;

const unsignedNode = (value: number | bigint): CborUnsignedType => ({
  isCbor: true,
  type: MajorType.Unsigned,
  value,
});
const negativeNode = (magnitude: number | bigint): CborNegativeType => ({
  isCbor: true,
  type: MajorType.Negative,
  value: magnitude,
});
const floatNode = (value: number): CborSimpleType => ({
  isCbor: true,
  type: MajorType.Simple,
  value: { type: "Float", value },
});

/** `From<f16> for CBOR`. @internal */
export const cborNodeFromF16 = (n: number): FloatHeadNode => {
  if (n < 0) {
    const i = ExactU64.exactFromF64(-1 - n);
    if (i !== undefined) return negativeNode(i);
  }
  const u = ExactU16.exactFromF64(n);
  if (u !== undefined) return unsignedNode(u);
  return floatNode(n);
};

/**
 * `From<f32> for CBOR`. The negative magnitude is computed in f32 arithmetic
 * (`-1f32 - n`): `Math.fround(-1 - n)` is exactly that, since a double holds
 * the difference of two singles with at most one rounding.
 * @internal
 */
export const cborNodeFromF32 = (n: number): FloatHeadNode => {
  if (n < 0) {
    const i = ExactU64.exactFromF32(Math.fround(-1 - n));
    if (i !== undefined) return negativeNode(i);
  }
  const u = ExactU32.exactFromF32(n);
  if (u !== undefined) return unsignedNode(u);
  return floatNode(n);
};

/** `From<f64> for CBOR`. @internal */
export const cborNodeFromF64 = (n: number): FloatHeadNode => {
  if (n < 0) {
    const i128 = ExactI128.exactFromF64(n);
    if (i128 !== undefined) {
      const i = ExactU64.exactFromI128(-1n - i128);
      if (i !== undefined) return negativeNode(i);
    }
  }
  const u = ExactU64.exactFromF64(n);
  if (u !== undefined) return unsignedNode(u);
  return floatNode(n);
};

/**
 * Shortest round-trip decimal digits of a finite positive double, as the pair
 * (significant digits without trailing zeros, scientific exponent), where the
 * value is `d1.d2…dk × 10^exp10`.
 *
 * `String(x)` already yields the shortest digit string; this only re-shapes
 * it (ECMAScript picks between "123.45", "1.5e-7", "1e+21" and "0.000001" by
 * magnitude) so the caller can apply Rust's notation rules.
 */
const shortestDigits = (abs: number): { digits: string; exp10: number } => {
  const text = String(abs);
  const eIndex = text.indexOf("e");
  const mantissa = eIndex === -1 ? text : text.slice(0, eIndex);
  const exponent = eIndex === -1 ? 0 : Number(text.slice(eIndex + 1));
  const dot = mantissa.indexOf(".");
  let digits = dot === -1 ? mantissa : mantissa.slice(0, dot) + mantissa.slice(dot + 1);
  let pointPos = dot === -1 ? mantissa.length : dot;
  while (digits.length > 1 && digits.startsWith("0")) {
    digits = digits.slice(1);
    pointPos--;
  }
  digits = digits.replace(/0+$/, "");
  if (digits === "") digits = "0";
  return { digits, exp10: pointPos - 1 + exponent };
};

/** The exact value of a finite positive double as `mantissa × 2^exp2`. */
const exactBinary = (abs: number): { mantissa: bigint; exp2: number } => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, abs, false);
  const hi = view.getUint32(0, false);
  const lo = view.getUint32(4, false);
  const biasedExp = (hi >>> 20) & 0x7ff;
  const fraction = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  return biasedExp === 0
    ? { mantissa: fraction, exp2: -1074 }
    : { mantissa: fraction | (1n << 52n), exp2: biasedExp - 1075 };
};

/**
 * The exact decimal expansion of a finite positive double, as its significant
 * digits (no trailing zeros). Every double is a dyadic rational, so
 * `m × 2^q = m × 5^-q / 10^-q` for negative `q` gives the digits exactly.
 */
const exactDecimalDigits = (abs: number): string => {
  const { mantissa, exp2 } = exactBinary(abs);
  const scaled = exp2 >= 0 ? mantissa << BigInt(exp2) : mantissa * 5n ** BigInt(-exp2);
  return scaled.toString().replace(/0+$/, "");
};

/**
 * Shortest round-trip digits the way Rust's `{:?}` produces them.
 *
 * JS and Rust agree on the shortest digit string except when the exact value
 * sits precisely halfway between the two shortest candidates: ECMAScript
 * (`Number::toString`) picks the even candidate, Rust's `flt2dec` rounds the
 * magnitude up. `10 × 2^-24` is exactly `5.9604644775390625e-7`, which JS
 * prints as `…062e-7` and Rust as `…063e-7`. Detect the tie exactly and take
 * the upper candidate when it also round-trips.
 */
const rustShortestDigits = (abs: number): { digits: string; exp10: number } => {
  const shortest = shortestDigits(abs);
  const k = shortest.digits.length;
  // Cheap filter: a tie means the (k+1)-digit rounding ends in exactly 5.
  const probe = abs.toPrecision(k + 1);
  const probeIndex = probe.indexOf("e");
  if (!(probeIndex === -1 ? probe : probe.slice(0, probeIndex)).endsWith("5")) return shortest;
  const exact = exactDecimalDigits(abs);
  if (exact.length !== k + 1 || !exact.endsWith("5")) return shortest;
  // Exact tie: the upper candidate is the truncated expansion plus one unit.
  let upper = (BigInt(exact.slice(0, k)) + 1n).toString();
  let exp10 = shortest.exp10;
  if (upper.length > k) {
    // A carry (…999 + 1) shifts the decimal point.
    exp10 += 1;
  }
  upper = upper.replace(/0+$/, "");
  if (upper === "") upper = "0";
  const candidate = Number(`${upper[0]}.${upper.slice(1)}e${exp10}`);
  return candidate === abs ? { digits: upper, exp10 } : shortest;
};

/**
 * Render a float to its diagnostic string, the reference's `Display for
 * Simple` (`simple.rs`) - the rendering `diagnostic()` and `hexAnnotated()`
 * use.
 *
 * Non-finite values print as `NaN`, `Infinity` and `-Infinity`, exactly as the
 * reference's `Display` does - not the `inf`/`-inf` of Rust's `{:?}`, which is
 * `Simple::name()`'s rendering and is ported as `simpleName` (`simple.ts`).
 *
 * Finite values match Rust's `{:?}` for `f64`: non-zero values with magnitude
 * in [1e-4, 1e16) print in decimal with at least one fractional digit (whole
 * values get a trailing `.0`); everything else prints in exponential form
 * (`1.5e20`, `5e-324` - no `+`, no padding). Zero prints as `0.0`/`-0.0`.
 * Digits are the shortest round-trip sequence, with exact decimal ties rounded
 * up like Rust (see {@link rustShortestDigits}).
 *
 * @param value - The float value
 * @returns The diagnostic string
 */
export const floatDisplayString = (value: number): string => {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";

  const sign = value < 0 ? "-" : "";
  const { digits, exp10 } = rustShortestDigits(Math.abs(value));

  if (exp10 >= -4 && exp10 < 16) {
    if (exp10 < 0) {
      return `${sign}0.${"0".repeat(-exp10 - 1)}${digits}`;
    }
    const intLen = exp10 + 1;
    const intPart = digits.length >= intLen ? digits.slice(0, intLen) : digits.padEnd(intLen, "0");
    const fracPart = digits.length > intLen ? digits.slice(intLen) : "0";
    return `${sign}${intPart}.${fracPart}`;
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}e${exp10}`;
};

/**
 * Encode `n` as the shortest float binary (f16, f32, or f64) that round-trips
 * back to exactly `n`.
 * @internal
 */
export const numberToBinary = (n: number): Uint8Array<ArrayBuffer> => {
  if (Number.isNaN(n)) {
    return new Uint8Array([0x7e, 0x00]);
  }

  const n32 = numberToBinary32(n);
  const f32 = binary32ToNumber(n32);
  if (f32 === n) {
    const n16 = numberToBinary16(n);
    const f16 = binary16ToNumber(n16);
    if (f16 === n) {
      return n16;
    }
    return n32;
  }

  // Create a 64-bit float binary inline
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, n, false); // big-endian
  return new Uint8Array(buffer);
};
