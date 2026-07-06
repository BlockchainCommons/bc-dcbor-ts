/**
 * Type guards for CBOR values (`isUnsigned`, `isText`, `isFloat`, `isNumber`, …).
 * Each narrows a `Cbor` to a specific major-type shape.
 *
 * @module conveniences-guards
 */

import { type Cbor } from "./cbor";
import {
  MajorType,
  type CborUnsignedType,
  type CborNegativeType,
  type CborByteStringType,
  type CborTextType,
  type CborArrayType,
  type CborMapType,
  type CborTaggedType,
  type CborSimpleType,
  type CborMethods,
} from "./cbor-types";
import { isFloat as isSimpleFloat } from "./simple";

/**
 * Check if CBOR value is an unsigned integer.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is unsigned integer
 *
 * @example
 * ```typescript
 * if (isUnsigned(value)) {
 *   console.log('Unsigned:', value.value);
 * }
 * ```
 */
export const isUnsigned = (cbor: Cbor): cbor is CborUnsignedType & CborMethods => {
  return cbor.type === MajorType.Unsigned;
};

/**
 * Check if CBOR value is a negative integer.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is negative integer
 */
export const isNegative = (cbor: Cbor): cbor is CborNegativeType & CborMethods => {
  return cbor.type === MajorType.Negative;
};

/**
 * Check if CBOR value is any integer (unsigned or negative).
 *
 * @param cbor - CBOR value to check
 * @returns True if value is an integer
 */
export const isInteger = (
  cbor: Cbor,
): cbor is (CborUnsignedType | CborNegativeType) & CborMethods => {
  return cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative;
};

/**
 * Check if CBOR value is a byte string.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is byte string
 */
export const isBytes = (cbor: Cbor): cbor is CborByteStringType & CborMethods => {
  return cbor.type === MajorType.ByteString;
};

/**
 * Check if CBOR value is a text string.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is text string
 */
export const isText = (cbor: Cbor): cbor is CborTextType & CborMethods => {
  return cbor.type === MajorType.Text;
};

/**
 * Check if CBOR value is an array.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is array
 */
export const isArray = (cbor: Cbor): cbor is CborArrayType & CborMethods => {
  return cbor.type === MajorType.Array;
};

/**
 * Check if CBOR value is a map.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is map
 */
export const isMap = (cbor: Cbor): cbor is CborMapType & CborMethods => {
  return cbor.type === MajorType.Map;
};

/**
 * Check if CBOR value is tagged.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is tagged
 */
export const isTagged = (cbor: Cbor): cbor is CborTaggedType & CborMethods => {
  return cbor.type === MajorType.Tagged;
};

/**
 * Check if CBOR value is a simple value.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is simple
 */
export const isSimple = (cbor: Cbor): cbor is CborSimpleType & CborMethods => {
  return cbor.type === MajorType.Simple;
};

/**
 * Check if CBOR value is a boolean (true or false).
 *
 * @param cbor - CBOR value to check
 * @returns True if value is boolean
 */
export const isBoolean = (
  cbor: Cbor,
): cbor is CborSimpleType &
  CborMethods & { readonly value: { readonly type: "False" } | { readonly type: "True" } } => {
  if (cbor.type !== MajorType.Simple) {
    return false;
  }
  return cbor.value.type === "False" || cbor.value.type === "True";
};

/**
 * Check if CBOR value is null.
 *
 * @param cbor - CBOR value to check
 * @returns True if value is null
 */
export const isNull = (
  cbor: Cbor,
): cbor is CborSimpleType & CborMethods & { readonly value: { readonly type: "Null" } } => {
  if (cbor.type !== MajorType.Simple) {
    return false;
  }
  return cbor.value.type === "Null";
};

/**
 * Check if CBOR value is a float (f16, f32, or f64).
 *
 * @param cbor - CBOR value to check
 * @returns True if value is float
 */
export const isFloat = (
  cbor: Cbor,
): cbor is CborSimpleType &
  CborMethods & { readonly value: { readonly type: "Float"; readonly value: number } } => {
  if (cbor.type !== MajorType.Simple) {
    return false;
  }
  return isSimpleFloat(cbor.value);
};

/**
 * Check if CBOR value is any numeric type (unsigned, negative, or float).
 *
 * @param cbor - CBOR value
 * @returns True if value is numeric
 */
export const isNumber = (cbor: Cbor): boolean => {
  if (cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative) {
    return true;
  }
  if (cbor.type === MajorType.Simple) {
    return isSimpleFloat(cbor.value);
  }
  return false;
};
