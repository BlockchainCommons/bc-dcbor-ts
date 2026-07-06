/**
 * Safe accessors for CBOR values: `asX` readers (value or `undefined`), and
 * array, map, and tagged-value readers.
 *
 * @module conveniences-accessors
 */

import { type Cbor } from "./cbor";
import { MajorType, type CborNumber, type CborInput } from "./cbor-types";
import type { CborMap } from "./map";
import { isFloat as isSimpleFloat } from "./simple";
import { ExactF64 } from "./exact";
import { tagValuesEqual, type Tag } from "./tag";
import { getGlobalTagsStore } from "./tags-store";

/**
 * Extract unsigned integer value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Unsigned integer or undefined
 */
export const asUnsigned = (cbor: Cbor): number | bigint | undefined => {
  if (cbor.type === MajorType.Unsigned) {
    return cbor.value;
  }
  return undefined;
};

/**
 * Extract negative integer value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Negative integer or undefined
 */
export const asNegative = (cbor: Cbor): number | bigint | undefined => {
  if (cbor.type === MajorType.Negative) {
    // Convert stored magnitude back to actual negative value
    if (typeof cbor.value === "bigint") {
      return -cbor.value - 1n;
    } else {
      return -cbor.value - 1;
    }
  }
  return undefined;
};

/**
 * Extract any integer value (unsigned or negative) if type matches.
 *
 * @param cbor - CBOR value
 * @returns Integer or undefined
 */
export const asInteger = (cbor: Cbor): number | bigint | undefined => {
  if (cbor.type === MajorType.Unsigned) {
    return cbor.value;
  } else if (cbor.type === MajorType.Negative) {
    // Convert stored magnitude back to actual negative value
    if (typeof cbor.value === "bigint") {
      return -cbor.value - 1n;
    } else {
      return -cbor.value - 1;
    }
  }
  return undefined;
};

/**
 * Extract byte string value if type matches.
 *
 * Decoded byte strings are zero-copy views aliasing the input buffer -
 * mutating the input after decoding (or mutating the returned bytes) changes
 * the other side. Call `.slice()` first if you need an independent copy. This
 * is deliberate: the zero-copy decode performance profile is part of the
 * library's contract.
 *
 * @param cbor - CBOR value
 * @returns Byte string or undefined
 */
export const asBytes = (cbor: Cbor): Uint8Array | undefined => {
  if (cbor.type === MajorType.ByteString) {
    return cbor.value;
  }
  return undefined;
};

/**
 * Extract text string value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Text string or undefined
 */
export const asText = (cbor: Cbor): string | undefined => {
  if (cbor.type === MajorType.Text) {
    return cbor.value;
  }
  return undefined;
};

/**
 * Extract array value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Array or undefined
 */
export const asArray = (cbor: Cbor): readonly Cbor[] | undefined => {
  if (cbor.type === MajorType.Array) {
    return cbor.value;
  }
  return undefined;
};

/**
 * Extract map value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Map or undefined
 */
export const asMap = (cbor: Cbor): CborMap | undefined => {
  if (cbor.type === MajorType.Map) {
    return cbor.value;
  }
  return undefined;
};

/**
 * Extract boolean value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Boolean or undefined
 */
export const asBoolean = (cbor: Cbor): boolean | undefined => {
  if (cbor.type !== MajorType.Simple) {
    return undefined;
  }
  if (cbor.value.type === "True") {
    return true;
  }
  if (cbor.value.type === "False") {
    return false;
  }
  return undefined;
};

/**
 * Extract float value if type matches.
 *
 * @param cbor - CBOR value
 * @returns Float or undefined
 */
export const asFloat = (cbor: Cbor): number | undefined => {
  // Integers coerce to float too. dCBOR reduces whole-valued floats to
  // integers (42.0 encodes as 42), so a float-only accessor would wrongly
  // reject them. Returns undefined for non-numeric types and for integers not
  // exactly representable as f64.
  if (cbor.type === MajorType.Unsigned) {
    return ExactF64.exactFromU64(cbor.value);
  }
  if (cbor.type === MajorType.Negative) {
    // cbor.value holds the raw magnitude n; the actual value is -1 - n.
    const f = ExactF64.exactFromU64(cbor.value);
    return f === undefined ? undefined : -1 - f;
  }
  if (cbor.type === MajorType.Simple) {
    return isSimpleFloat(cbor.value) ? cbor.value.value : undefined;
  }
  return undefined;
};

/**
 * Extract any numeric value (integer or float).
 *
 * @param cbor - CBOR value
 * @returns Number or undefined
 */
export const asNumber = (cbor: Cbor): CborNumber | undefined => {
  if (cbor.type === MajorType.Unsigned) {
    return cbor.value;
  }
  if (cbor.type === MajorType.Negative) {
    // Convert stored magnitude back to actual negative value
    if (typeof cbor.value === "bigint") {
      return -cbor.value - 1n;
    } else {
      return -cbor.value - 1;
    }
  }
  if (cbor.type === MajorType.Simple) {
    const simple = cbor.value;
    if (isSimpleFloat(simple)) {
      return simple.value;
    }
  }
  return undefined;
};

// ============================================================================
// Array Operations
// ============================================================================

/**
 * Get array item at index.
 *
 * @param cbor - CBOR value (must be array)
 * @param index - Array index
 * @returns Item at index or undefined
 */
export const arrayItem = (cbor: Cbor, index: number): Cbor | undefined => {
  if (cbor.type !== MajorType.Array) {
    return undefined;
  }
  const array = cbor.value;
  if (index < 0 || index >= array.length) {
    return undefined;
  }
  return array[index];
};

/**
 * Get array length.
 *
 * @param cbor - CBOR value (must be array)
 * @returns Array length or undefined
 */
export const arrayLength = (cbor: Cbor): number | undefined => {
  if (cbor.type !== MajorType.Array) {
    return undefined;
  }
  return cbor.value.length;
};

/**
 * Check if array is empty.
 *
 * @param cbor - CBOR value (must be array)
 * @returns True if empty, false if not empty, undefined if not array
 */
export const arrayIsEmpty = (cbor: Cbor): boolean => {
  // A wrong major type returns plain `false` (matching hasTag).
  if (cbor.type !== MajorType.Array) {
    return false;
  }
  return cbor.value.length === 0;
};

// ============================================================================
// Map Operations
// ============================================================================

/**
 * Get map value by key.
 *
 * @param cbor - CBOR value (must be map)
 * @param key - Map key
 * @returns Value for key or undefined
 */
export function mapValue(cbor: Cbor, key: CborInput): Cbor | undefined {
  // Returns the stored node (like CborMap.get).
  if (cbor.type !== MajorType.Map) {
    return undefined;
  }
  return cbor.value.get(key);
}

/**
 * Check if map has key.
 *
 * @param cbor - CBOR value (must be map)
 * @param key - Map key
 * @returns True if key exists, false otherwise, undefined if not map
 */
export function mapHas(cbor: Cbor, key: CborInput): boolean {
  // A wrong major type returns plain `false` (matching hasTag).
  if (cbor.type !== MajorType.Map) {
    return false;
  }
  return cbor.value.has(key);
}

/**
 * Get all map keys.
 *
 * @param cbor - CBOR value (must be map)
 * @returns Array of keys or undefined
 */
export const mapKeys = (cbor: Cbor): Cbor[] | undefined => {
  if (cbor.type !== MajorType.Map) {
    return undefined;
  }
  return cbor.value.entriesArray.map((e) => e.key);
};

/**
 * Get all map values.
 *
 * @param cbor - CBOR value (must be map)
 * @returns Array of values or undefined
 */
export const mapValues = (cbor: Cbor): Cbor[] | undefined => {
  if (cbor.type !== MajorType.Map) {
    return undefined;
  }
  return cbor.value.entriesArray.map((e) => e.value);
};

/**
 * Get map size.
 *
 * @param cbor - CBOR value (must be map)
 * @returns Map size or undefined
 */
export const mapSize = (cbor: Cbor): number | undefined => {
  if (cbor.type !== MajorType.Map) {
    return undefined;
  }
  return cbor.value.size;
};

/**
 * Check if map is empty.
 *
 * @param cbor - CBOR value (must be map)
 * @returns True if empty, false if not empty, undefined if not map
 */
export const mapIsEmpty = (cbor: Cbor): boolean => {
  // A wrong major type returns plain `false` (matching hasTag).
  if (cbor.type !== MajorType.Map) {
    return false;
  }
  return cbor.value.size === 0;
};

// ============================================================================
// Tagged Value Operations
// ============================================================================

/**
 * Get tag value from tagged CBOR.
 *
 * @param cbor - CBOR value (must be tagged)
 * @returns Tag value or undefined
 */
export const tagValue = (cbor: Cbor): number | bigint | undefined => {
  if (cbor.type !== MajorType.Tagged) {
    return undefined;
  }
  return cbor.tag;
};

/**
 * Get content from tagged CBOR.
 *
 * @param cbor - CBOR value (must be tagged)
 * @returns Tagged content or undefined
 */
export const tagContent = (cbor: Cbor): Cbor | undefined => {
  if (cbor.type !== MajorType.Tagged) {
    return undefined;
  }
  return cbor.value;
};

/**
 * Check if CBOR has a specific tag.
 *
 * @param cbor - CBOR value
 * @param tag - Tag value to check
 * @returns True if has tag, false otherwise
 */
export const hasTag = (cbor: Cbor, tag: number | bigint): boolean => {
  if (cbor.type !== MajorType.Tagged) {
    return false;
  }
  return tagValuesEqual(cbor.tag, tag);
};

/**
 * Extract content if has specific tag.
 *
 * @param cbor - CBOR value
 * @param tag - Expected tag value
 * @returns Tagged content or undefined
 */
export const getTaggedContent = (cbor: Cbor, tag: number | bigint): Cbor | undefined => {
  if (cbor.type === MajorType.Tagged && tagValuesEqual(cbor.tag, tag)) {
    return cbor.value;
  }
  return undefined;
};

// ============================================================================
// Tagged-value tuple accessor
// ============================================================================

/**
 * Extract tagged value as tuple [Tag, Cbor] if CBOR is tagged.
 *
 * @param cbor - CBOR value
 * @returns [Tag, Cbor] tuple or undefined
 */
export const asTaggedValue = (cbor: Cbor): [Tag, Cbor] | undefined => {
  if (cbor.type !== MajorType.Tagged) {
    return undefined;
  }
  // Resolve the canonical name (if any) via the global tags store rather
  // than synthesizing a `tag-${value}` placeholder.
  const resolved = getGlobalTagsStore().tagForValue(cbor.tag);
  const tag: Tag = resolved ?? { value: cbor.tag };
  return [tag, cbor.value];
};
