/**
 * CBOR-encoding-based array sorting helpers.
 *
 * dCBOR / CDE deterministic ordering is bytewise lexicographic over the CBOR
 * encoding of each element - this is the same comparator that `Map`/`Set` use
 * internally for key ordering.
 *
 * @module sortable
 */

import { cbor } from "./cbor";
import { type CborInput } from "./cbor-types";
import { lexicographicallyCompareBytes } from "./stdlib";

/**
 * Return a new array sorted by the bytewise lexicographic order of each
 * element's CBOR encoding.
 *
 * @example
 * ```typescript
 * const sorted = sortArrayByCborEncoding([3, 1, 2]); // [1, 2, 3]
 * ```
 */
export function sortArrayByCborEncoding<T extends CborInput>(array: readonly T[]): T[] {
  const annotated: { encoding: Uint8Array; item: T }[] = array.map((item) => ({
    encoding: cbor(item).toData(),
    item,
  }));
  annotated.sort((a, b) => lexicographicallyCompareBytes(a.encoding, b.encoding));
  return annotated.map((entry) => entry.item);
}

/**
 * Sortable-by-CBOR-encoding interface shape. The `arraySortable` /
 * `setSortable` helpers wrap any iterable into a `CBORSortable` view.
 */
export interface CBORSortable<T extends CborInput> {
  sortByCborEncoding(): T[];
}

/**
 * Wrap a readonly array as a {@link CBORSortable}.
 */
export function arraySortable<T extends CborInput>(array: readonly T[]): CBORSortable<T> {
  return {
    sortByCborEncoding: () => sortArrayByCborEncoding(array),
  };
}

/**
 * Wrap a `Set<T>` as a {@link CBORSortable}.
 */
export function setSortable<T extends CborInput>(set: ReadonlySet<T>): CBORSortable<T> {
  return {
    sortByCborEncoding: () => sortArrayByCborEncoding(Array.from(set)),
  };
}
