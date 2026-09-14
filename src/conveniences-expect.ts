/**
 * Throwing accessors (`expectX`): each delegates to its `asX` partner and
 * throws a `CborError` on type mismatch.
 *
 * @module conveniences-expect
 */

import { type Cbor } from "./cbor";
import { MajorType, type CborNumber } from "./cbor-types";
import type { CborMap } from "./map";
import { isFloat as isSimpleFloat } from "./simple";
import { Tag, tagValuesEqual } from "./tag";
import { CborError } from "./error";
import { narrowInteger } from "./numeric";
import {
  asUnsigned,
  asNegative,
  asInteger,
  asBytes,
  asText,
  asArray,
  asMap,
  asBoolean,
  asFloat,
  asNumber,
} from "./conveniences-accessors";

/**
 * Options for {@link expectUnsigned}: extract into a fixed-width unsigned
 * integer the way the reference's `u8`/`u16`/`u32`/`u64: TryFrom<CBOR>`
 * do (dcbor 0.25.2 `int.rs`).
 */
export interface ExpectUnsignedOptions {
  /** Target width in bits; an unsigned value above 2^width − 1 is `OutOfRange`. */
  readonly width: 8 | 16 | 32 | 64;
  /**
   * Also accept a negative integer node and wrap it as the reference does:
   * a value `v` in [−2^width, −1] yields `2^width + v` (so −1 is 255 at
   * width 8), and a value below −2^width is `OutOfRange`. Off by default:
   * without it a negative node is `WrongType`, as for every other type. See
   * RUST_DIVERGENCES.md §1.6.
   */
  readonly wrapNegative?: boolean | undefined;
}

/**
 * Extract unsigned integer value, throwing if type doesn't match.
 *
 * With `options`, the value is checked against a fixed width and, when
 * `wrapNegative` is set, a negative node is wrapped exactly as the
 * reference's `u*::try_from` wraps it (see {@link ExpectUnsignedOptions}).
 *
 * @param cbor - CBOR value
 * @param options - Fixed-width extraction (optional; without it the
 *   behaviour is the plain `Unsigned`-or-`WrongType` check)
 * @returns Unsigned integer (`bigint` above `Number.MAX_SAFE_INTEGER`)
 * @throws {CborError} `WrongType` if cbor is not an unsigned integer (or,
 *   with `wrapNegative`, not an integer); `OutOfRange` when the value does
 *   not fit `width`
 */
export const expectUnsigned = (cbor: Cbor, options?: ExpectUnsignedOptions): number | bigint => {
  if (options === undefined) {
    const value = asUnsigned(cbor);
    if (value === undefined) {
      throw CborError.wrongType();
    }
    return value;
  }
  // `From64::from_u64(n, MAX)`: the magnitude on the wire must fit the width.
  const max = (1n << BigInt(options.width)) - 1n;
  if (cbor.type === MajorType.Unsigned) {
    const value = BigInt(cbor.value);
    if (value > max) throw CborError.outOfRange();
    return narrowInteger(value);
  }
  if (cbor.type === MajorType.Negative && options.wrapNegative === true) {
    // The node stores the magnitude m = −1 − v; the reference computes
    // `(-1 - m) as uN`, i.e. 2^width + v = max − m, after the same range check.
    const magnitude = BigInt(cbor.value);
    if (magnitude > max) throw CborError.outOfRange();
    return narrowInteger(max - magnitude);
  }
  throw CborError.wrongType();
};

/**
 * Extract negative integer value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Negative integer
 * @throws {CborError} With type 'WrongType' if cbor is not a negative integer
 */
export const expectNegative = (cbor: Cbor): number | bigint => {
  const value = asNegative(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract any integer value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Integer
 * @throws {CborError} With type 'WrongType' if cbor is not an integer
 */
export const expectInteger = (cbor: Cbor): number | bigint => {
  const value = asInteger(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract byte string value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Byte string
 * @throws {CborError} With type 'WrongType' if cbor is not a byte string
 *
 * NOTE: decoded byte strings are zero-copy views aliasing the input
 * buffer - mutating the input after decoding (or mutating the returned
 * bytes) changes the other side. Call `.slice()` first if you need an
 * independent copy. This is deliberate: the zero-copy decode performance
 * profile is part of the library's contract.
 */
export const expectBytes = (cbor: Cbor): Uint8Array => {
  const value = asBytes(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract text string value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Text string
 * @throws {CborError} With type 'WrongType' if cbor is not a text string
 */
export const expectText = (cbor: Cbor): string => {
  const value = asText(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract array value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Array
 * @throws {CborError} With type 'WrongType' if cbor is not an array
 */
export const expectArray = (cbor: Cbor): readonly Cbor[] => {
  const value = asArray(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract map value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Map
 * @throws {CborError} With type 'WrongType' if cbor is not a map
 */
export const expectMap = (cbor: Cbor): CborMap => {
  const value = asMap(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract boolean value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Boolean
 * @throws {CborError} With type 'WrongType' if cbor is not a boolean
 */
export const expectBoolean = (cbor: Cbor): boolean => {
  const value = asBoolean(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract float value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Float
 * @throws {CborError} With type 'WrongType' if cbor is not a float
 */
export const expectFloat = (cbor: Cbor): number => {
  // Numeric types coerce to float (OutOfRange if an integer isn't exactly
  // representable as f64); anything else is WrongType.
  if (cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative) {
    const value = asFloat(cbor);
    if (value === undefined) {
      throw CborError.outOfRange();
    }
    return value;
  }
  if (cbor.type === MajorType.Simple && isSimpleFloat(cbor.value)) {
    return cbor.value.value;
  }
  throw CborError.wrongType();
};

/**
 * Extract any numeric value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Number
 * @throws {CborError} With type 'WrongType' if cbor is not a number
 */
export const expectNumber = (cbor: Cbor): CborNumber => {
  const value = asNumber(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
};

/**
 * Extract content if has specific tag, throwing if not (the reference's
 * `try_into_expected_tagged_value`).
 *
 * Throws `{ type: "WrongType" }` if `cbor` is not tagged at all, otherwise
 * `{ type: "WrongTag", expected, actual }` if the tag doesn't match. The
 * error names the expected tag as it was given (a `Tag` keeps its name; a
 * number or bigint stays unnamed) and the actual tag as the node carries it.
 *
 * @param cbor - CBOR value
 * @param tag - Expected tag value, or a `Tag`
 * @returns Tagged content
 */
export const expectTaggedContent = (cbor: Cbor, tag: number | bigint | Tag): Cbor => {
  if (cbor.type !== MajorType.Tagged) {
    throw CborError.wrongType();
  }
  const expected = typeof tag === "object" ? tag : Tag.from(tag);
  if (!tagValuesEqual(cbor.tag, expected.value)) {
    throw CborError.wrongTag(expected, Tag.from(cbor.tag, cbor.tagName));
  }
  return cbor.value;
};
