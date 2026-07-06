/**
 * CBOR Tag support for semantic tagging of values.
 *
 * Tags provide semantic information about CBOR data items.
 * For example, tag 1 indicates a date/time value.
 *
 * @module tag
 */

import { type CborNumber } from "./cbor-types";

/**
 * Numeric tag value type alias.
 *
 * A tag value is a u64. Since JavaScript has no native u64, this accepts the
 * broader `CborNumber` (`number | bigint`); the runtime guards in
 * `encodeVarInt` enforce the 0..=2^64-1 range.
 */
export type TagValue = CborNumber;

/**
 * A CBOR tag with an optional name.
 *
 * Tags consist of a numeric value and an optional human-readable name.
 *
 * Note on equality: tags compare by `value` only - two tags with the same
 * value but different names are equal. Use `Tag.equals` for this; raw
 * `===` on `Tag` objects compares by reference.
 */
export interface Tag {
  /** The numeric tag value */
  readonly value: TagValue;
  /** Optional human-readable name for the tag */
  readonly name?: string | undefined;
}

/**
 * Compare two tag values for equality, normalizing `number` vs `bigint`.
 * A raw `===` would treat `100n` and `100` as unequal, so a large tag that
 * decoded to a `bigint` wouldn't match the same value written as a `number`.
 *
 * @internal Exported for cross-module use; not part of the public surface -
 * use `Tag.equals` instead.
 */
export const tagValuesEqual = (a: TagValue, b: TagValue): boolean => {
  if (typeof a === "bigint" || typeof b === "bigint") {
    return BigInt(a) === BigInt(b);
  }
  return a === b;
};

/**
 * Value-type companion for the `Tag` interface: an interface plus a merged
 * `const` with a handful of members. It stays small and must not import the
 * encode/format graph.
 */
export const Tag = {
  /**
   * Create a Tag from its numeric value, optionally with a name.
   *
   * ```typescript
   * Tag.from(1, "date");
   * Tag.from(12345);
   * ```
   */
  from(value: TagValue, name?: string): Tag {
    if (name !== undefined) {
      return { value, name };
    }
    return { value };
  },

  /**
   * Compare two tags for equality: compares by `value` only (normalizing
   * `number` vs `bigint`) and ignores the optional `name`.
   */
  equals(a: Tag, b: Tag): boolean {
    return tagValuesEqual(a.value, b.value);
  },
} as const;

/**
 * Get the string representation of a tag.
 * Internal function used for error messages.
 *
 * @param tag - The tag to represent
 * @returns String representation (name if available, otherwise value)
 *
 * @internal
 */
export const tagToString = (tag: Tag): string => tag.name ?? tag.value.toString();
