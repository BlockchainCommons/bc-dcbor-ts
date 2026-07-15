import { A as CborMap, C as CborDate, D as extractTaggedContent, E as decodeWith, F as isCborNaN, I as simpleName, M as CborNative, N as extractCbor, O as validateTag, P as Simple, S as isCborNumber, T as CborTagged, _ as CborTextType, a as taggedValue, b as ToCbor, c as CborArrayType, d as CborMapType, f as CborMethods, g as CborTaggedType, h as CborSimpleType, i as encodeCbor, j as MapEntry, k as ByteString, l as CborByteStringType, m as CborNumber, n as cbor, o as Tag, p as CborNegativeType, r as cborEquals, s as TagValue, t as Cbor, u as CborInput, v as CborUnsignedType, w as CborCodec, x as isCbor, y as MajorType } from "./cbor-C6QATcT9.mjs";
import { _ as Result, a as SummarizerResult, c as getGlobalTagsStore, d as CborErrorCode, f as CborErrorDetails, g as Ok, h as Err, i as ReadonlyTagsStore, l as withTags, m as CborErrorTyped, n as hexToBytes, o as TagsStore, p as CborErrorDetailsByCode, r as CborSummarizer, s as TagsStoreOpt, t as bytesToHex, u as CborError } from "./hex-1riAQGoa.mjs";

//#region src/decode.d.ts
/**
* Decode a single dCBOR item from `data`, enforcing every deterministic
* encoding rule (canonical numeric forms, NFC text, map-key order, no
* trailing bytes). Throws {@link CborError} on any violation.
*
* @example
* ```typescript
* const value = decodeCbor(hexToBytes("a1616101")); // {"a": 1}
* expectMap(value).size; // 1
* ```
*
* @throws {CborError} `Underrun` | `UnsupportedHeaderValue` |
*   `NonCanonicalNumeric` | `InvalidSimpleValue` | `InvalidUtf8` |
*   `NonCanonicalString` | `UnusedData` | `MisorderedMapKey` |
*   `DuplicateMapKey` - see {@link CborErrorDetailsByCode}.
* @public
*
* @remarks Decoded byte strings are zero-copy views aliasing the input
* buffer - mutating the input after decoding (or mutating the returned
* bytes) changes the other side. Call `.slice()` first if you need an
* independent copy. This is deliberate: the zero-copy decode performance
* profile is part of the library's contract.
*/
declare function decodeCbor(data: Uint8Array): Cbor;
/**
* Decode without throwing: returns a {@link Result} carrying the decoded value,
* or the {@link CborError} that {@link decodeCbor} would have thrown. Non-CBOR
* errors still propagate.
*
* The `try` prefix means "returns `Result`, never throws" - everywhere in
* this library.
*
* @example
* ```typescript
* const result = tryDecode(bytes);
* if (result.ok) use(result.value);
* else console.warn(result.error.code);
* ```
* @public
*/
declare function tryDecode(data: Uint8Array): Result<Cbor>;
//#endregion
//#region src/set.d.ts
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
declare class CborSet {
  /** Debug label: `Object.prototype.toString` reports `[object CborSet]`. */
  get [Symbol.toStringTag](): string;
  private readonly _map;
  constructor();
  /**
  * Create a CborSet from any iterable of encodable items. Duplicates (by
  * canonical encoding) are removed.
  *
  * NOTE: strings are iterable - `CborSet.from("abc")` is a THREE-element
  * set of one-character strings, not a single-element set. Wrap in an
  * array (`CborSet.from(["abc"])`) for the latter.
  */
  static from(items: Iterable<CborInput>): CborSet;
  /**
  * Add an element to the set (no effect if an element with the same
  * canonical encoding already exists). Returns `this` for chaining, like
  * JS `Set.add`.
  */
  add(value: CborInput): this;
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
  addNext(value: CborInput): void;
  /** Check whether the set contains an element (by canonical encoding). */
  has(value: CborInput): boolean;
  /**
  * Remove an element from the set.
  *
  * @returns true if the element was removed, false if not found
  */
  delete(value: CborInput): boolean;
  /** Remove all elements from the set. */
  clear(): void;
  /** The number of elements in the set. */
  get size(): number;
  /**
  * Create a new set containing elements in this set or the other set.
  */
  union(other: CborSet): CborSet;
  /**
  * Create a new set containing elements in both this set and the other set.
  */
  intersection(other: CborSet): CborSet;
  /**
  * Create a new set containing elements in this set but not in the other set.
  */
  difference(other: CborSet): CborSet;
  /** Check if every element of this set is in the other set. */
  isSubsetOf(other: CborSet): boolean;
  /** Check if every element of the other set is in this set. */
  isSupersetOf(other: CborSet): boolean;
  [Symbol.iterator](): Generator<Cbor, void, undefined>;
  /**
  * Iterate the stored `Cbor` elements lazily in canonical order.
  *
  * NOTE: this yields the stored `Cbor` nodes. Use `toArray()` for an eager
  * array of extracted native values.
  */
  values(): Generator<Cbor, void, undefined>;
  /** JS `Set.keys()` mirror - identical to `values()`. */
  keys(): Generator<Cbor, void, undefined>;
  /** JS `Set.entries()` mirror - `[value, value]` tuples. */
  entries(): Generator<[Cbor, Cbor], void, undefined>;
  /** JS `Set.forEach` mirror (`value` twice, then the set). */
  forEach(callback: (value: Cbor, value2: Cbor, set: CborSet) => void, thisArg?: unknown): void;
  /**
  * Encode the set as an (untagged) CBOR array of its elements, in canonical
  * ascending CBOR-byte order.
  */
  untaggedCbor(): Cbor;
  /**
  * Decode a CborSet from a CBOR array into this instance.
  *
  * Calls `addNext` per item, so the array must already be in strict
  * ascending CBOR-byte order with no duplicates (else
  * `MisorderedMapKey`/`DuplicateMapKey`).
  *
  * @throws {CborError} `WrongType` if `c` is not an array.
  */
  fromUntaggedCbor(c: Cbor): CborSet;
  /**
  * Decode a CborSet from a CBOR array.
  */
  static fromCbor(c: Cbor): CborSet;
  /** The `ToCbor` protocol: encodes as the untagged canonical array. */
  toCbor(): Cbor;
  /** Encode straight to deterministic CBOR bytes. */
  toBytes(): Uint8Array<ArrayBuffer>;
  /**
  * Convert to a JavaScript Set of extracted native values (see
  * {@link CborNative} for the Map/Tagged asymmetries).
  */
  toSet(): Set<CborNative>;
  /** Eagerly extract all elements as native values, in canonical order. */
  toArray(): CborNative[];
  /**
  * Convert to a string listing the extracted elements.
  */
  toString(): string;
  /** Convert to JSON (array of extracted values). */
  toJSON(): CborNative[];
}
//#endregion
//#region src/tags.d.ts
/**
* Tag 0: Standard date/time string (RFC 3339)
*/
declare const TAG_DATE_TIME_STRING = 0;
/**
* Tag 1: Epoch-based date/time (seconds since 1970-01-01T00:00:00Z)
*/
declare const TAG_EPOCH_DATE_TIME = 1;
/**
* Tag 100: Epoch-based date (days since 1970-01-01)
*/
declare const TAG_EPOCH_DATE = 100;
/**
* Tag 2: Positive bignum (unsigned arbitrary-precision integer)
*/
declare const TAG_POSITIVE_BIGNUM = 2;
/**
* Tag 3: Negative bignum (signed arbitrary-precision integer)
*/
declare const TAG_NEGATIVE_BIGNUM = 3;
/**
* Name for tag 2 (positive bignum).
*/
declare const TAG_NAME_POSITIVE_BIGNUM = "positive-bignum";
/**
* Name for tag 3 (negative bignum).
*/
declare const TAG_NAME_NEGATIVE_BIGNUM = "negative-bignum";
/**
* Tag 4: Decimal fraction [exponent, mantissa]
*/
declare const TAG_DECIMAL_FRACTION = 4;
/**
* Tag 5: Bigfloat [exponent, mantissa]
*/
declare const TAG_BIGFLOAT = 5;
/**
* Tag 21: Expected conversion to base64url encoding
*/
declare const TAG_BASE64URL = 21;
/**
* Tag 22: Expected conversion to base64 encoding
*/
declare const TAG_BASE64 = 22;
/**
* Tag 23: Expected conversion to base16 encoding
*/
declare const TAG_BASE16 = 23;
/**
* Tag 24: Encoded CBOR data item
*/
declare const TAG_ENCODED_CBOR = 24;
/**
* Tag 32: URI (text string)
*/
declare const TAG_URI = 32;
/**
* Tag 33: base64url-encoded text
*/
declare const TAG_BASE64URL_TEXT = 33;
/**
* Tag 34: base64-encoded text
*/
declare const TAG_BASE64_TEXT = 34;
/**
* Tag 35: Regular expression (PCRE/ECMA262)
*/
declare const TAG_REGEXP = 35;
/**
* Tag 36: MIME message
*/
declare const TAG_MIME_MESSAGE = 36;
/**
* Tag 37: Binary UUID
*/
declare const TAG_UUID = 37;
/**
* Tag 256: string reference (namespace)
*/
declare const TAG_STRING_REF_NAMESPACE = 256;
/**
* Tag 257: binary UUID reference
*/
declare const TAG_BINARY_UUID = 257;
/**
* Tag 258: Set of values (array with no duplicates)
*/
declare const TAG_SET = 258;
/**
* Tag 55799: Self-describe CBOR (magic number 0xd9d9f7)
*/
declare const TAG_SELF_DESCRIBE_CBOR = 55799;
declare const TAG_DATE = 1;
declare const TAG_NAME_DATE = "date";
/**
* Register the standard tags (date, bignums) and their summarizers into
* `store`.
*
* Idempotent: tags already registered under the same name are skipped;
* registering a value under a DIFFERENT name still throws via the store's
* conflict validation.
*
* @param store - Target store; defaults to the global tags store.
*/
declare const registerStandardTags: (store?: TagsStore) => void;
/**
* Converts an array of tag values to their corresponding Tag objects.
*
* This function looks up each tag value in the global tag registry and returns
* an array of complete Tag objects. For any tag values that aren't
* registered in the global registry, it creates a basic Tag with just the
* value (no name).
*
* @param values - Array of numeric tag values to convert
* @returns Array of Tag objects corresponding to the input values
*
* @example
* ```typescript
* // Register some tags first
* registerStandardTags();
*
* // Convert tag values to Tag objects
* const tags = tagsForValues([1, 42, 999]);
*
* // The first tag (value 1) should be registered as "date"
* console.log(tags[0].value); // 1
* console.log(tags[0].name); // "date"
*
* // Unregistered tags will have a value but no name
* console.log(tags[1].value); // 42
* console.log(tags[2].value); // 999
* ```
*/
declare const tagsForValues: (values: (number | bigint)[]) => Tag[];
//#endregion
//#region src/bignum.d.ts
/**
* Encode a non-negative bigint as a CBOR tag 2 (positive bignum).
*
* The value is always encoded as a bignum regardless of size.
* Zero is encoded as tag 2 with an empty byte string.
*
* @param value - A non-negative bigint (must be >= 0n)
* @returns CBOR tagged value
* @throws CborError with type OutOfRange if value is negative
*/
declare function biguintToCbor(value: bigint): Cbor;
/**
* Encode a bigint as a CBOR tag 2 or tag 3 bignum.
*
* - Non-negative values use tag 2 (positive bignum).
* - Negative values use tag 3 (negative bignum), where the encoded
*   magnitude is `|value| - 1` per RFC 8949.
*
* @param value - Any bigint value
* @returns CBOR tagged value
*/
declare function bigintToCbor(value: bigint): Cbor;
/**
* Decode a BigUint from an untagged CBOR byte string.
*
* This function is intended for use in tag summarizers where the tag has
* already been stripped. It expects a CBOR byte string representing the
* big-endian magnitude of a positive bignum (tag 2 content).
*
* Enforces canonical encoding: no leading zero bytes (except empty for zero).
*
* @param cbor - A CBOR value that should be a byte string
* @returns Non-negative bigint
* @throws CborError with type WrongType if not a byte string
* @throws CborError with type NonCanonicalNumeric if encoding is non-canonical
*/
declare function biguintFromUntaggedCbor(cbor: Cbor): bigint;
/**
* Decode a BigInt from an untagged CBOR byte string for a negative bignum.
*
* This function is intended for use in tag summarizers where the tag has
* already been stripped. It expects a CBOR byte string representing `n` where
* the actual value is `-1 - n` (tag 3 content per RFC 8949).
*
* Enforces canonical encoding: no leading zero bytes (except single `0x00`
* for -1).
*
* @param cbor - A CBOR value that should be a byte string
* @returns Negative bigint
* @throws CborError with type WrongType if not a byte string
* @throws CborError with type NonCanonicalNumeric if encoding is non-canonical
*/
declare function bigintFromNegativeUntaggedCbor(cbor: Cbor): bigint;
/**
* Convert CBOR to a non-negative bigint.
*
* Accepts:
* - Major type 0 (unsigned integer)
* - Tag 2 (positive bignum) with canonical byte string
*
* Rejects:
* - Major type 1 (negative integer) -> OutOfRange
* - Tag 3 (negative bignum) -> OutOfRange
* - Floating-point values -> WrongType
* - Non-canonical bignum encodings -> NonCanonicalNumeric
*
* @param cbor - The CBOR value to convert
* @returns Non-negative bigint
* @throws CborError
*/
declare function cborToBiguint(cbor: Cbor): bigint;
/**
* Convert CBOR to a bigint (any sign).
*
* Accepts:
* - Major type 0 (unsigned integer)
* - Major type 1 (negative integer)
* - Tag 2 (positive bignum) with canonical byte string
* - Tag 3 (negative bignum) with canonical byte string
*
* Rejects:
* - Floating-point values -> WrongType
* - Non-canonical bignum encodings -> NonCanonicalNumeric
*
* @param cbor - The CBOR value to convert
* @returns A bigint value
* @throws CborError
*/
declare function cborToBigint(cbor: Cbor): bigint;
//#endregion
//#region src/sortable.d.ts
/**
* Return a new array sorted by the bytewise lexicographic order of each
* element's CBOR encoding.
*
* @example
* ```typescript
* const sorted = sortArrayByCborEncoding([3, 1, 2]); // [1, 2, 3]
* ```
*/
declare function sortArrayByCborEncoding<T extends CborInput>(array: readonly T[]): T[];
/**
* Sortable-by-CBOR-encoding interface shape. The `arraySortable` /
* `setSortable` helpers wrap any iterable into a `CBORSortable` view.
*/
interface CBORSortable<T extends CborInput> {
  sortByCborEncoding(): T[];
}
/**
* Wrap a readonly array as a {@link CBORSortable}.
*/
declare function arraySortable<T extends CborInput>(array: readonly T[]): CBORSortable<T>;
/**
* Wrap a `Set<T>` as a {@link CBORSortable}.
*/
declare function setSortable<T extends CborInput>(set: ReadonlySet<T>): CBORSortable<T>;
//#endregion
//#region src/float.d.ts
/**
* Check if a number has a fractional part.
*/
declare const hasFractionalPart: (n: number) => boolean;
//#endregion
//#region src/varint.d.ts
declare const encodeVarInt: (value: CborNumber, majorType: MajorType) => Uint8Array<ArrayBuffer>;
declare const decodeVarIntData: (dataView: DataView, offset: number) => {
  majorType: MajorType;
  value: CborNumber;
  offset: number;
};
declare const decodeVarInt: (data: Uint8Array) => {
  majorType: MajorType;
  value: CborNumber;
  offset: number;
};
//#endregion
//#region src/conveniences-guards.d.ts
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
declare const isUnsigned: (cbor: Cbor) => cbor is CborUnsignedType & CborMethods;
/**
* Check if CBOR value is a negative integer.
*
* @param cbor - CBOR value to check
* @returns True if value is negative integer
*/
declare const isNegative: (cbor: Cbor) => cbor is CborNegativeType & CborMethods;
/**
* Check if CBOR value is any integer (unsigned or negative).
*
* @param cbor - CBOR value to check
* @returns True if value is an integer
*/
declare const isInteger: (cbor: Cbor) => cbor is (CborUnsignedType | CborNegativeType) & CborMethods;
/**
* Check if CBOR value is a byte string.
*
* @param cbor - CBOR value to check
* @returns True if value is byte string
*/
declare const isBytes: (cbor: Cbor) => cbor is CborByteStringType & CborMethods;
/**
* Check if CBOR value is a text string.
*
* @param cbor - CBOR value to check
* @returns True if value is text string
*/
declare const isText: (cbor: Cbor) => cbor is CborTextType & CborMethods;
/**
* Check if CBOR value is an array.
*
* @param cbor - CBOR value to check
* @returns True if value is array
*/
declare const isArray: (cbor: Cbor) => cbor is CborArrayType & CborMethods;
/**
* Check if CBOR value is a map.
*
* @param cbor - CBOR value to check
* @returns True if value is map
*/
declare const isMap: (cbor: Cbor) => cbor is CborMapType & CborMethods;
/**
* Check if CBOR value is tagged.
*
* @param cbor - CBOR value to check
* @returns True if value is tagged
*/
declare const isTagged: (cbor: Cbor) => cbor is CborTaggedType & CborMethods;
/**
* Check if CBOR value is a simple value.
*
* @param cbor - CBOR value to check
* @returns True if value is simple
*/
declare const isSimple: (cbor: Cbor) => cbor is CborSimpleType & CborMethods;
/**
* Check if CBOR value is a boolean (true or false).
*
* @param cbor - CBOR value to check
* @returns True if value is boolean
*/
declare const isBoolean: (cbor: Cbor) => cbor is CborSimpleType & CborMethods & {
  readonly value: {
    readonly type: "False";
  } | {
    readonly type: "True";
  };
};
/**
* Check if CBOR value is null.
*
* @param cbor - CBOR value to check
* @returns True if value is null
*/
declare const isNull: (cbor: Cbor) => cbor is CborSimpleType & CborMethods & {
  readonly value: {
    readonly type: "Null";
  };
};
/**
* Check if CBOR value is a float (f16, f32, or f64).
*
* @param cbor - CBOR value to check
* @returns True if value is float
*/
declare const isFloat: (cbor: Cbor) => cbor is CborSimpleType & CborMethods & {
  readonly value: {
    readonly type: "Float";
    readonly value: number;
  };
};
/**
* Check if CBOR value is any numeric type (unsigned, negative, or float).
*
* @param cbor - CBOR value
* @returns True if value is numeric
*/
declare const isNumber: (cbor: Cbor) => boolean;
//#endregion
//#region src/conveniences-accessors.d.ts
/**
* Extract unsigned integer value if type matches.
*
* @param cbor - CBOR value
* @returns Unsigned integer or undefined
*/
declare const asUnsigned: (cbor: Cbor) => number | bigint | undefined;
/**
* Extract negative integer value if type matches.
*
* @param cbor - CBOR value
* @returns Negative integer or undefined
*/
declare const asNegative: (cbor: Cbor) => number | bigint | undefined;
/**
* Extract any integer value (unsigned or negative) if type matches.
*
* @param cbor - CBOR value
* @returns Integer or undefined
*/
declare const asInteger: (cbor: Cbor) => number | bigint | undefined;
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
declare const asBytes: (cbor: Cbor) => Uint8Array | undefined;
/**
* Extract text string value if type matches.
*
* @param cbor - CBOR value
* @returns Text string or undefined
*/
declare const asText: (cbor: Cbor) => string | undefined;
/**
* Extract array value if type matches.
*
* @param cbor - CBOR value
* @returns Array or undefined
*/
declare const asArray: (cbor: Cbor) => readonly Cbor[] | undefined;
/**
* Extract map value if type matches.
*
* @param cbor - CBOR value
* @returns Map or undefined
*/
declare const asMap: (cbor: Cbor) => CborMap | undefined;
/**
* Extract boolean value if type matches.
*
* @param cbor - CBOR value
* @returns Boolean or undefined
*/
declare const asBoolean: (cbor: Cbor) => boolean | undefined;
/**
* Extract float value if type matches.
*
* @param cbor - CBOR value
* @returns Float or undefined
*/
declare const asFloat: (cbor: Cbor) => number | undefined;
/**
* Extract any numeric value (integer or float).
*
* @param cbor - CBOR value
* @returns Number or undefined
*/
declare const asNumber: (cbor: Cbor) => CborNumber | undefined;
/**
* Get array item at index.
*
* @param cbor - CBOR value (must be array)
* @param index - Array index
* @returns Item at index or undefined
*/
declare const arrayItem: (cbor: Cbor, index: number) => Cbor | undefined;
/**
* Get array length.
*
* @param cbor - CBOR value (must be array)
* @returns Array length or undefined
*/
declare const arrayLength: (cbor: Cbor) => number | undefined;
/**
* Check if array is empty.
*
* @param cbor - CBOR value (must be array)
* @returns True if empty, false if not empty, undefined if not array
*/
declare const arrayIsEmpty: (cbor: Cbor) => boolean;
/**
* Get map value by key.
*
* @param cbor - CBOR value (must be map)
* @param key - Map key
* @returns Value for key or undefined
*/
declare function mapValue(cbor: Cbor, key: CborInput): Cbor | undefined;
/**
* Check if map has key.
*
* @param cbor - CBOR value (must be map)
* @param key - Map key
* @returns True if key exists, false otherwise, undefined if not map
*/
declare function mapHas(cbor: Cbor, key: CborInput): boolean;
/**
* Get all map keys.
*
* @param cbor - CBOR value (must be map)
* @returns Array of keys or undefined
*/
declare const mapKeys: (cbor: Cbor) => Cbor[] | undefined;
/**
* Get all map values.
*
* @param cbor - CBOR value (must be map)
* @returns Array of values or undefined
*/
declare const mapValues: (cbor: Cbor) => Cbor[] | undefined;
/**
* Get map size.
*
* @param cbor - CBOR value (must be map)
* @returns Map size or undefined
*/
declare const mapSize: (cbor: Cbor) => number | undefined;
/**
* Check if map is empty.
*
* @param cbor - CBOR value (must be map)
* @returns True if empty, false if not empty, undefined if not map
*/
declare const mapIsEmpty: (cbor: Cbor) => boolean;
/**
* Get tag value from tagged CBOR.
*
* @param cbor - CBOR value (must be tagged)
* @returns Tag value or undefined
*/
declare const tagValue: (cbor: Cbor) => number | bigint | undefined;
/**
* Get content from tagged CBOR.
*
* @param cbor - CBOR value (must be tagged)
* @returns Tagged content or undefined
*/
declare const tagContent: (cbor: Cbor) => Cbor | undefined;
/**
* Check if CBOR has a specific tag.
*
* @param cbor - CBOR value
* @param tag - Tag value to check
* @returns True if has tag, false otherwise
*/
declare const hasTag: (cbor: Cbor, tag: number | bigint) => boolean;
/**
* Extract content if has specific tag.
*
* @param cbor - CBOR value
* @param tag - Expected tag value
* @returns Tagged content or undefined
*/
declare const getTaggedContent: (cbor: Cbor, tag: number | bigint) => Cbor | undefined;
/**
* Extract tagged value as tuple [Tag, Cbor] if CBOR is tagged.
*
* @param cbor - CBOR value
* @returns [Tag, Cbor] tuple or undefined
*/
declare const asTaggedValue: (cbor: Cbor) => [Tag, Cbor] | undefined;
//#endregion
//#region src/conveniences-expect.d.ts
/**
* Extract unsigned integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Unsigned integer
* @throws {CborError} With type 'WrongType' if cbor is not an unsigned integer
*/
declare const expectUnsigned: (cbor: Cbor) => number | bigint;
/**
* Extract negative integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Negative integer
* @throws {CborError} With type 'WrongType' if cbor is not a negative integer
*/
declare const expectNegative: (cbor: Cbor) => number | bigint;
/**
* Extract any integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Integer
* @throws {CborError} With type 'WrongType' if cbor is not an integer
*/
declare const expectInteger: (cbor: Cbor) => number | bigint;
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
declare const expectBytes: (cbor: Cbor) => Uint8Array;
/**
* Extract text string value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Text string
* @throws {CborError} With type 'WrongType' if cbor is not a text string
*/
declare const expectText: (cbor: Cbor) => string;
/**
* Extract array value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Array
* @throws {CborError} With type 'WrongType' if cbor is not an array
*/
declare const expectArray: (cbor: Cbor) => readonly Cbor[];
/**
* Extract map value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Map
* @throws {CborError} With type 'WrongType' if cbor is not a map
*/
declare const expectMap: (cbor: Cbor) => CborMap;
/**
* Extract boolean value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Boolean
* @throws {CborError} With type 'WrongType' if cbor is not a boolean
*/
declare const expectBoolean: (cbor: Cbor) => boolean;
/**
* Extract float value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Float
* @throws {CborError} With type 'WrongType' if cbor is not a float
*/
declare const expectFloat: (cbor: Cbor) => number;
/**
* Extract any numeric value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Number
* @throws {CborError} With type 'WrongType' if cbor is not a number
*/
declare const expectNumber: (cbor: Cbor) => CborNumber;
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
declare const expectTaggedContent: (cbor: Cbor, tag: number | bigint) => Cbor;
//#endregion
export { ByteString, type CBORSortable, type Cbor, type CborArrayType, type CborByteStringType, type CborCodec, CborDate, CborError, type CborErrorCode, type CborErrorDetails, type CborErrorDetailsByCode, type CborErrorTyped, type CborInput, CborMap, type CborMapType, type CborMethods, type CborNative, type CborNegativeType, type CborNumber, CborSet, type CborSimpleType, type CborSummarizer, type CborTagged, type CborTaggedType, type CborTextType, type CborUnsignedType, Err, MajorType, type MapEntry, Ok, type ReadonlyTagsStore, type Result, type Simple, type SummarizerResult, TAG_BASE16, TAG_BASE64, TAG_BASE64URL, TAG_BASE64URL_TEXT, TAG_BASE64_TEXT, TAG_BIGFLOAT, TAG_BINARY_UUID, TAG_DATE, TAG_DATE_TIME_STRING, TAG_DECIMAL_FRACTION, TAG_ENCODED_CBOR, TAG_EPOCH_DATE, TAG_EPOCH_DATE_TIME, TAG_MIME_MESSAGE, TAG_NAME_DATE, TAG_NAME_NEGATIVE_BIGNUM, TAG_NAME_POSITIVE_BIGNUM, TAG_NEGATIVE_BIGNUM, TAG_POSITIVE_BIGNUM, TAG_REGEXP, TAG_SELF_DESCRIBE_CBOR, TAG_SET, TAG_STRING_REF_NAMESPACE, TAG_URI, TAG_UUID, Tag, type TagValue, TagsStore, type TagsStoreOpt, type ToCbor, arrayIsEmpty, arrayItem, arrayLength, arraySortable, asArray, asBoolean, asBytes, asFloat, asInteger, asMap, asNegative, asNumber, asTaggedValue, asText, asUnsigned, bigintFromNegativeUntaggedCbor, bigintToCbor, biguintFromUntaggedCbor, biguintToCbor, bytesToHex, cbor, cborEquals, cborToBigint, cborToBiguint, decodeCbor, decodeVarInt, decodeVarIntData, decodeWith, encodeCbor, encodeVarInt, expectArray, expectBoolean, expectBytes, expectFloat, expectInteger, expectMap, expectNegative, expectNumber, expectTaggedContent, expectText, expectUnsigned, extractCbor, extractTaggedContent, getGlobalTagsStore, getTaggedContent, hasFractionalPart, hasTag, hexToBytes, isArray, isBoolean, isBytes, isCbor, isCborNaN, isCborNumber, isFloat, isInteger, isMap, isNegative, isNull, isNumber, isSimple, isTagged, isText, isUnsigned, mapHas, mapIsEmpty, mapKeys, mapSize, mapValue, mapValues, registerStandardTags, setSortable, simpleName, sortArrayByCborEncoding, tagContent, tagValue, taggedValue, tagsForValues, tryDecode, validateTag, withTags };
//# sourceMappingURL=index.d.mts.map