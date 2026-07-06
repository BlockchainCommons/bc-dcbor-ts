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
import { tagValuesEqual } from "./tag";
import { CborError } from "./error";
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
 * Extract unsigned integer value, throwing if type doesn't match.
 *
 * @param cbor - CBOR value
 * @returns Unsigned integer
 * @throws {CborError} With type 'WrongType' if cbor is not an unsigned integer
 */
export const expectUnsigned = (cbor: Cbor): number | bigint => {
  const value = asUnsigned(cbor);
  if (value === undefined) {
    throw CborError.wrongType();
  }
  return value;
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
 * Extract content if has specific tag, throwing if not.
 *
 * Throws `{ type: "WrongType" }` if `cbor` is not tagged at all, otherwise
 * `{ type: "WrongTag", expected, actual }` if the tag doesn't match.
 *
 * @param cbor - CBOR value
 * @param tag - Expected tag value
 * @returns Tagged content
 */
export const expectTaggedContent = (cbor: Cbor, tag: number | bigint): Cbor => {
  if (cbor.type !== MajorType.Tagged) {
    throw CborError.wrongType();
  }
  if (!tagValuesEqual(cbor.tag, tag)) {
    throw CborError.wrongTag({ value: tag }, { value: cbor.tag });
  }
  return cbor.value;
};
