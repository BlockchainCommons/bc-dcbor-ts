/**
 * Set data structure for CBOR.
 *
 * A Set encodes to a plain (untagged) array of unique elements in canonical
 * ascending CBOR-byte order; it deliberately does not apply tag 258.
 *
 * `CborSet` mirrors the JS `Set` protocol: `add`, `has`, `delete`, `clear`,
 * `size`, `keys()`, `values()`, `entries()`, `forEach`, iteration, plus the
 * ES2025 algebra (`union`, `intersection`, `difference`, `isSubsetOf`,
 * `isSupersetOf`). Construct with `new CborSet()` or `CborSet.from(items)`.
 *
 * @module set
 */

import { type Cbor } from "./cbor";
import { MajorType, type CborInput } from "./cbor-types";
import { cbor, encodeCbor } from "./cbor";
import { CborMap } from "./map";
import { extractCbor, type CborNative } from "./extract";
import { CborError } from "./error";

/**
 * CBOR Set type, encoded as a plain (untagged) array.
 *
 * Internally uses a CborMap to ensure unique elements with deterministic ordering.
 * Elements are ordered by their CBOR encoding (lexicographic byte order).
 *
 * @example
 * ```typescript
 * const set = CborSet.from([3, 1, 2, 2]);
 * set.add(4);
 * set.has(2); // true
 * encodeCbor(set); // untagged array [1, 2, 3, 4] in canonical byte order
 * ```
 */
export class CborSet {
  /** Debug label: `Object.prototype.toString` reports `[object CborSet]`. */
  // A prototype getter has zero per-instance cost; the readonly field the
  // stylistic rule prefers would allocate one own property per instance.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag](): string {
    return "CborSet";
  }

  private readonly _map: CborMap;

  constructor() {
    this._map = new CborMap();
  }

  /**
   * Create a CborSet from any iterable of encodable items. Duplicates (by
   * canonical encoding) are removed.
   *
   * NOTE: strings are iterable - `CborSet.from("abc")` is a THREE-element
   * set of one-character strings, not a single-element set. Wrap in an
   * array (`CborSet.from(["abc"])`) for the latter.
   */
  static from(items: Iterable<CborInput>): CborSet {
    const set = new CborSet();
    for (const item of items) {
      set.add(item);
    }
    return set;
  }

  // =========================================================================
  // Core Methods (JS Set vocabulary)
  // =========================================================================

  /**
   * Add an element to the set (no effect if an element with the same
   * canonical encoding already exists). Returns `this` for chaining, like
   * JS `Set.add`.
   */
  add(value: CborInput): this {
    const cborValue = encodeCborValue(value);
    // In a set, key and value are the same
    this._map.set(cborValue, cborValue);
    return this;
  }

  /**
   * Add an element that must sort strictly after every element added so
   * far (canonical CBOR-byte order). The decoder uses this to reject
   * misordered or duplicate elements.
   *
   * @internal The decoder's append path; not part of the supported surface.
   *
   * @throws {CborError} `MisorderedMapKey` if `value` would not preserve
   *   strict ascending CBOR-byte order, or `DuplicateMapKey` for an exact
   *   repeat.
   */
  addNext(value: CborInput): void {
    const cborValue = encodeCborValue(value);
    // A set stores each element as its own map key and value, so append it
    // enforcing strict ascending order on the encoded key bytes.
    this._map.setNext(cborValue, cborValue);
  }

  /** Check whether the set contains an element (by canonical encoding). */
  has(value: CborInput): boolean {
    const cborValue = encodeCborValue(value);
    return this._map.has(cborValue);
  }

  /**
   * Remove an element from the set.
   *
   * @returns true if the element was removed, false if not found
   */
  delete(value: CborInput): boolean {
    const cborValue = encodeCborValue(value);
    return this._map.delete(cborValue);
  }

  /** Remove all elements from the set. */
  clear(): void {
    this._map.clear();
  }

  /** The number of elements in the set. */
  get size(): number {
    return this._map.size;
  }

  // =========================================================================
  // Set Operations (ES2025-Set-aligned)
  // =========================================================================

  /**
   * Create a new set containing elements in this set or the other set.
   */
  union(other: CborSet): CborSet {
    const result = new CborSet();
    for (const value of this) {
      result.add(value);
    }
    for (const value of other) {
      result.add(value);
    }
    return result;
  }

  /**
   * Create a new set containing elements in both this set and the other set.
   */
  intersection(other: CborSet): CborSet {
    const result = new CborSet();
    for (const value of this) {
      if (other.has(value)) {
        result.add(value);
      }
    }
    return result;
  }

  /**
   * Create a new set containing elements in this set but not in the other set.
   */
  difference(other: CborSet): CborSet {
    const result = new CborSet();
    for (const value of this) {
      if (!other.has(value)) {
        result.add(value);
      }
    }
    return result;
  }

  /** Check if every element of this set is in the other set. */
  isSubsetOf(other: CborSet): boolean {
    for (const value of this) {
      if (!other.has(value)) {
        return false;
      }
    }
    return true;
  }

  /** Check if every element of the other set is in this set. */
  isSupersetOf(other: CborSet): boolean {
    return other.isSubsetOf(this);
  }

  // =========================================================================
  // Iteration (canonical ascending CBOR-byte order)
  // =========================================================================

  *[Symbol.iterator](): Generator<Cbor, void, undefined> {
    for (const [, value] of this._map) {
      yield value;
    }
  }

  /**
   * Iterate the stored `Cbor` elements lazily in canonical order.
   *
   * NOTE: this yields the stored `Cbor` nodes. Use `toArray()` for an eager
   * array of extracted native values.
   */
  *values(): Generator<Cbor, void, undefined> {
    yield* this;
  }

  /** JS `Set.keys()` mirror - identical to `values()`. */
  *keys(): Generator<Cbor, void, undefined> {
    yield* this;
  }

  /** JS `Set.entries()` mirror - `[value, value]` tuples. */
  *entries(): Generator<[Cbor, Cbor], void, undefined> {
    for (const value of this) {
      yield [value, value];
    }
  }

  /** JS `Set.forEach` mirror (`value` twice, then the set). */
  forEach(callback: (value: Cbor, value2: Cbor, set: CborSet) => void, thisArg?: unknown): void {
    for (const value of this) {
      callback.call(thisArg, value, value, this);
    }
  }

  // =========================================================================
  // CBOR Encoding / Decoding (untagged array)
  // =========================================================================

  /**
   * Encode the set as an (untagged) CBOR array of its elements, in canonical
   * ascending CBOR-byte order.
   */
  untaggedCbor(): Cbor {
    return cbor([...this]);
  }

  /**
   * Decode a CborSet from a CBOR array into this instance.
   *
   * Calls `addNext` per item, so the array must already be in strict
   * ascending CBOR-byte order with no duplicates (else
   * `MisorderedMapKey`/`DuplicateMapKey`).
   *
   * @throws {CborError} `WrongType` if `c` is not an array.
   */
  fromUntaggedCbor(c: Cbor): CborSet {
    if (c.type !== MajorType.Array) {
      throw CborError.wrongType();
    }

    this.clear();
    for (const value of c.value) {
      this.addNext(value);
    }

    return this;
  }

  /**
   * Decode a CborSet from a CBOR array.
   */
  static fromCbor(c: Cbor): CborSet {
    return new CborSet().fromUntaggedCbor(c);
  }

  // =========================================================================
  // Conversion
  // =========================================================================

  /** The `ToCbor` protocol: encodes as the untagged canonical array. */
  toCbor(): Cbor {
    return this.untaggedCbor();
  }

  /** Encode straight to deterministic CBOR bytes. */
  toBytes(): Uint8Array<ArrayBuffer> {
    return encodeCbor(this.untaggedCbor());
  }

  /**
   * Convert to a JavaScript Set of extracted native values (see
   * {@link CborNative} for the Map/Tagged asymmetries).
   */
  toSet(): Set<CborNative> {
    const result = new Set<CborNative>();
    for (const value of this) {
      result.add(extractCbor(value));
    }
    return result;
  }

  /** Eagerly extract all elements as native values, in canonical order. */
  toArray(): CborNative[] {
    return Array.from(this.toSet());
  }

  /**
   * Convert to a string listing the extracted elements.
   */
  toString(): string {
    const items = [...this]
      .map((v) => {
        const extracted = extractCbor(v);
        if (typeof extracted === "string") {
          return `"${extracted}"`;
        }
        // Numbers/bigints/bools stringify natively; Cbor and CborMap provide
        // their own toString.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return String(extracted);
      })
      .join(", ");
    return `[${items}]`;
  }

  /** Convert to JSON (array of extracted values). */
  toJSON(): CborNative[] {
    return this.toArray();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a value to CBOR for use in set operations.
 *
 * @internal
 */
function encodeCborValue(value: CborInput): Cbor {
  if (typeof value === "object" && value !== null && "isCbor" in value && value.isCbor === true) {
    return value as Cbor;
  }
  return cbor(value);
}
