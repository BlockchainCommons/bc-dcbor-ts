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
import { MajorType } from "./cbor-types";
import { ExactU64, ExactU32, ExactU16, ExactI128 } from "./exact";

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

/**
 * Render a float to its diagnostic string.
 *
 * Finite non-zero values with magnitude in [1e-4, 1e16) print in decimal with
 * at least one fractional digit (whole values get a trailing `.0`); everything
 * else prints in exponential form. Zero prints as `0.0`/`-0.0`.
 *
 * JS already produces the same shortest round-tripping digits; we only fix up
 * the notation threshold, the `e+` → `e` exponent, and the `.0` suffix.
 *
 * @param value - The float value
 * @returns The diagnostic string
 */
export const floatDisplayString = (value: number): string => {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";

  const abs = Math.abs(value);
  if (abs >= 1e-4 && abs < 1e16) {
    // In this range String() never switches to exponential. Ensure at least
    // one fractional digit.
    let str = String(value);
    if (!str.includes(".")) {
      str = `${str}.0`;
    }
    return str;
  }

  // Drop the `+` in the exponent (`1.5e+20` → `1.5e20`); negative exponents
  // keep their sign.
  return value.toExponential().replace("e+", "e");
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
