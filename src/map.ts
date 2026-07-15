/**
 * Map Support in dCBOR
 *
 * A deterministic CBOR map implementation that ensures maps with the same
 * content always produce identical binary encodings, regardless of insertion
 * order.
 *
 * ## Deterministic Map Representation
 *
 * The `CborMap` type follows strict deterministic encoding rules as specified by
 * dCBOR:
 *
 * - Map keys are always sorted in lexicographic order of their encoded CBOR bytes
 * - Duplicate keys are not allowed (enforced by the implementation)
 * - Keys and values can be any type that can be converted to CBOR
 * - Numeric reduction is applied (e.g., 3.0 is stored as integer 3)
 *
 * ## Vocabulary
 *
 * `CborMap` mirrors the JS `Map` protocol: `set`, `get`, `getOrThrow`, `has`,
 * `delete`, `clear`, `size`, `keys()`, `values()`, `entries()`, `forEach`,
 * iteration. `get` returns the STORED `Cbor` node (symmetric with
 * `entries()`); extract natives explicitly with `extractCbor(map.get(k))`.
 *
 * @module map
 */

import { SortedByteMap } from "./sorted-byte-map";
import { type Cbor } from "./cbor";
import { type CborInput } from "./cbor-types";
import { cbor, encodeCbor } from "./cbor";
import { lexicographicallyCompareBytes } from "./stdlib";
import { extractCbor, type CborNative } from "./extract";
import { CborError } from "./error";

type MapKey = Uint8Array;
export interface MapEntry {
  readonly key: Cbor;
  readonly value: Cbor;
}

/**
 * A deterministic CBOR map implementation.
 *
 * Maps are always encoded with keys sorted lexicographically by their
 * encoded CBOR representation, ensuring deterministic encoding.
 */
export class CborMap {
  /** Debug label: `Object.prototype.toString` reports `[object CborMap]`. */
  // A prototype getter has zero per-instance cost; the readonly field the
  // stylistic rule prefers would allocate one own property per instance.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag](): string {
    return "CborMap";
  }

  private _dict: SortedByteMap<MapEntry>;

  /**
   * Creates a new, empty CBOR Map.
   * Optionally initializes from a JavaScript Map (every key and value must
   * itself be encodable).
   */
  constructor(map?: ReadonlyMap<CborInput, CborInput>) {
    this._dict = new SortedByteMap();

    if (map !== undefined) {
      for (const [key, value] of map.entries()) {
        this.set(key, value);
      }
    }
  }

  /**
   * Inserts a key-value pair into the map (replacing any entry whose key has
   * the same canonical encoding). Any insertion order is accepted - entries
   * are kept in canonical ascending encoded-key order.
   *
   * @example
   * ```typescript
   * const m = new CborMap();
   * m.set("z", 1);
   * m.set(10, "ten"); // sorts before "z" in the encoding
   * encodeCbor(m);    // deterministic regardless of insertion order
   * ```
   * @public
   */
  set(key: CborInput, value: CborInput): void {
    const keyCbor = cbor(key);
    const valueCbor = cbor(value);
    const keyData = encodeCbor(keyCbor);
    this._dict.set(keyData, { key: keyCbor, value: valueCbor });
  }

  private _makeKey(key: CborInput): MapKey {
    return encodeCbor(cbor(key));
  }

  /**
   * Get the STORED `Cbor` node for a key, or `undefined` if absent.
   *
   * This is symmetric with `entries()` - no hidden native extraction, no
   * unwitnessed generics. To read a native value, compose explicitly:
   *
   * ```typescript
   * asNumber(map.get("age"));          // number | undefined, checked
   * extractCbor(map.getOrThrow("age")); // CborNative, throws if absent
   * ```
   * @public
   */
  get(key: CborInput): Cbor | undefined {
    const entry = this._dict.get(this._makeKey(key));
    return entry?.value;
  }

  /**
   * Get the stored `Cbor` node for a key.
   *
   * @throws {CborError} `MissingMapKey` - the key is not present.
   */
  getOrThrow(key: CborInput): Cbor {
    const value = this.get(key);
    if (value === undefined) {
      throw CborError.missingMapKey();
    }
    return value;
  }

  delete(key: CborInput): boolean {
    const keyData = this._makeKey(key);
    const existed = this._dict.has(keyData);
    this._dict.delete(keyData);
    return existed;
  }

  has(key: CborInput): boolean {
    return this._dict.has(this._makeKey(key));
  }

  clear(): void {
    this._dict = new SortedByteMap();
  }

  /** The number of entries in the map. */
  get size(): number {
    return this._dict.size;
  }

  /**
   * Get the entries of the map as an array, sorted in canonical ascending
   * encoded-key order.
   *
   * @internal Public because the encoder, diagnostic formatter, and hex
   * annotator consume it cross-module; not part of the supported surface.
   */
  get entriesArray(): MapEntry[] {
    return this._dict.map((value: MapEntry, _key: MapKey) => ({
      key: value.key,
      value: value.value,
    }));
  }

  /** Iterate keys in canonical (sorted encoded-key) order. */
  *keys(): Generator<Cbor, void, undefined> {
    for (const entry of this.entriesArray) {
      yield entry.key;
    }
  }

  /** Iterate values in canonical key order. */
  *values(): Generator<Cbor, void, undefined> {
    for (const entry of this.entriesArray) {
      yield entry.value;
    }
  }

  /**
   * Iterate `[key, value]` tuples in canonical key order (the JS
   * `Map.entries()` shape).
   */
  *entries(): Generator<[Cbor, Cbor], void, undefined> {
    for (const entry of this.entriesArray) {
      yield [entry.key, entry.value];
    }
  }

  /** JS `Map.forEach` mirror (value first, then key, then the map). */
  forEach(callback: (value: Cbor, key: Cbor, map: CborMap) => void, thisArg?: unknown): void {
    for (const entry of this.entriesArray) {
      callback.call(thisArg, entry.value, entry.key, this);
    }
  }

  *[Symbol.iterator](): Generator<[Cbor, Cbor], void, undefined> {
    for (const entry of this.entriesArray) {
      yield [entry.key, entry.value];
    }
  }

  /**
   * Inserts the next key-value pair into the map during decoding.
   * This is used for efficient map building during CBOR decoding.
   * Throws if the key is not in ascending order or is a duplicate.
   *
   * @internal The decoder's append path; not part of the supported surface.
   */
  setNext(key: CborInput, value: CborInput): void {
    const keyCbor = cbor(key);
    const newKey = encodeCbor(keyCbor);
    if (this._dict.has(newKey)) {
      throw CborError.duplicateMapKey();
    }
    // Enforce strict ascending order by comparing the new key against the
    // greatest existing encoded key.
    const greatest = this._dict.maxKey();
    if (greatest !== undefined) {
      if (lexicographicallyCompareBytes(newKey, greatest) <= 0) {
        throw CborError.misorderedMapKey();
      }
    }
    // The checks above guarantee newKey is strictly greater than every existing
    // key, so it can be appended without another search or shift.
    this._dict.appendGreatest(newKey, { key: keyCbor, value: cbor(value) });
  }

  /**
   * Convert to a plain JavaScript `Map` of extracted native values.
   * Tagged values come back as `Cbor` nodes and nested maps as `CborMap`
   * (the {@link CborNative} asymmetries).
   */
  toMap(): Map<CborNative, CborNative> {
    const map = new Map<CborNative, CborNative>();
    for (const entry of this.entriesArray) {
      map.set(extractCbor(entry.key), extractCbor(entry.value));
    }
    return map;
  }
}
