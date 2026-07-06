/**
 * A map keyed by encoded CBOR key bytes, kept in canonical (lexicographic)
 * byte order.
 *
 * dCBOR needs exactly one specialised container: keys are the encoded bytes of
 * a CBOR value, and the map must iterate in ascending lexicographic byte order
 * (that ordering is the deterministic wire contract). This is a thin,
 * dependency-free structure over a sorted array with binary-search insertion -
 * it gives the exact ordering dCBOR requires, and lets the decode hot path
 * append in O(1) since canonical input already arrives sorted.
 *
 * @module sorted-byte-map
 */

import { lexicographicallyCompareBytes } from "./stdlib";

interface Entry<V> {
  readonly key: Uint8Array;
  readonly value: V;
}

export class SortedByteMap<V> {
  private readonly items: Entry<V>[] = [];

  /** Number of entries. */
  get size(): number {
    return this.items.length;
  }

  /**
   * Binary search for `key`. Returns the index of an exact match, or the
   * negative value `-(insertionPoint) - 1` when absent, so a single search both
   * tests membership and locates where an insert would go (Java
   * `Arrays.binarySearch` convention).
   */
  private indexOf(key: Uint8Array): number {
    let lo = 0;
    let hi = this.items.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = lexicographicallyCompareBytes(this.items[mid].key, key);
      if (cmp < 0) lo = mid + 1;
      else if (cmp > 0) hi = mid - 1;
      else return mid;
    }
    return -(lo + 1);
  }

  /** Insert or replace the entry for `key`. */
  set(key: Uint8Array, value: V): void {
    const i = this.indexOf(key);
    if (i >= 0) this.items[i] = { key, value };
    else this.items.splice(-i - 1, 0, { key, value });
  }

  /**
   * Append an entry whose key is strictly greater than every existing key.
   * Used by canonical decode, where keys arrive already sorted; the caller must
   * guarantee the ordering (this skips the search + shift that {@link set} does).
   */
  appendGreatest(key: Uint8Array, value: V): void {
    this.items.push({ key, value });
  }

  /** The value for `key`, or `undefined` if absent. */
  get(key: Uint8Array): V | undefined {
    const i = this.indexOf(key);
    return i >= 0 ? this.items[i].value : undefined;
  }

  /** Whether `key` is present. */
  has(key: Uint8Array): boolean {
    return this.indexOf(key) >= 0;
  }

  /** Remove `key`; returns whether it was present. */
  delete(key: Uint8Array): boolean {
    const i = this.indexOf(key);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  /** The greatest key currently stored (ascending order), or `undefined`. */
  maxKey(): Uint8Array | undefined {
    const n = this.items.length;
    return n > 0 ? this.items[n - 1].key : undefined;
  }

  /** Map over each value (with its key) in ascending key order. */
  map<T>(fn: (value: V, key: Uint8Array) => T): T[] {
    return this.items.map((e) => fn(e.value, e.key));
  }
}
