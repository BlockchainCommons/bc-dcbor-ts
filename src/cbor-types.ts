/**
 * The CBOR type foundation: the `MajorType` enum, the `Cbor` discriminated
 * union and its constituent interfaces, the `CborInput`/`CborNumber` aliases,
 * and the `isCbor`/`isCborNumber` guards.
 *
 * This module is a dependency leaf: every module import below is `import type`
 * (erased at compile time) and the only runtime values here - `MajorType`,
 * `isCbor`, `isCborNumber` - reference nothing outside this file. That lets the
 * whole tree depend on the type foundation without pulling in the recursive
 * encoder/constructor core in `cbor.ts`.
 *
 * @module cbor-types
 */

import type { Cbor } from "./cbor";
import type { Simple } from "./simple";
import type { CborMap } from "./map";
import type { ByteString } from "./byte-string";
import type { CborDate } from "./date";

export type { Simple };

export const MajorType = {
  Unsigned: 0,
  Negative: 1,
  ByteString: 2,
  Text: 3,
  Array: 4,
  Map: 5,
  Tagged: 6,
  Simple: 7,
} as const;

export type MajorType = (typeof MajorType)[keyof typeof MajorType];

/**
 * Numeric type that can be encoded in CBOR.
 *
 * Supports both standard JavaScript numbers and BigInt for large integers.
 * Numbers are automatically encoded as either unsigned or negative integers
 * depending on their value, following dCBOR canonical encoding rules.
 *
 * @example
 * ```typescript
 * const smallNum: CborNumber = 42;
 * const largeNum: CborNumber = 9007199254740992n;
 * ```
 */
export type CborNumber = number | bigint;

/**
 * Type for values that can be converted to CBOR.
 *
 * This is a comprehensive union type representing all values that can be encoded
 * as CBOR using the `cbor()` function. It includes:
 * - Already-encoded CBOR values (`Cbor`)
 * - Primitive types: numbers, bigints, strings, booleans, null, undefined
 * - Binary data: `Uint8Array`, `ByteString`
 * - Dates: `CborDate`
 * - Collections: `CborMap`, arrays, JavaScript `Map`, JavaScript `Set`
 * - Objects: Plain objects are converted to CBOR maps
 *
 * @example
 * ```typescript
 * cbor(42);                              // number
 * cbor("hello");                         // string
 * cbor([1, 2, 3]);                       // array
 * cbor(new Map([["key", "value"]]));     // Map
 * cbor({ name: "Alice", age: 30 });      // plain object -> CborMap
 * ```
 */
export type CborInput =
  | Cbor
  | CborNumber
  | string
  | boolean
  | null
  | undefined
  | Uint8Array
  | ByteString
  | CborDate
  | CborMap
  | readonly CborInput[]
  | ReadonlyMap<CborInput, CborInput>
  | ReadonlySet<CborInput>
  // Values that convert themselves to CBOR (e.g. CborSet); `cbor()`
  // dispatches on the structural `toCbor()` protocol at runtime.
  | ToCbor
  // Plain objects encode as maps; every value must itself be encodable.
  | { readonly [key: string]: CborInput };

export const isCborNumber = (value: unknown): value is CborNumber => {
  return typeof value === "number" || typeof value === "bigint";
};

export const isCbor = (value: unknown): value is Cbor => {
  return value !== null && typeof value === "object" && "isCbor" in value && value.isCbor === true;
};

export interface CborUnsignedType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Unsigned;
  readonly value: CborNumber;
}
export interface CborNegativeType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Negative;
  readonly value: CborNumber;
}
export interface CborByteStringType {
  readonly isCbor: true;
  readonly type: typeof MajorType.ByteString;
  /**
   * The byte-string content. For DECODED values this is a zero-copy view
   * aliasing the input buffer passed to `decodeCbor` - call `.slice()`
   * before mutating either side, since this deliberately does not copy.
   */
  readonly value: Uint8Array;
}
export interface CborTextType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Text;
  readonly value: string;
}
export interface CborArrayType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Array;
  readonly value: readonly Cbor[];
}
export interface CborMapType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Map;
  readonly value: CborMap;
}
export interface CborTaggedType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Tagged;
  readonly tag: CborNumber;
  readonly value: Cbor;
}
export interface CborSimpleType {
  readonly isCbor: true;
  readonly type: typeof MajorType.Simple;
  readonly value: Simple;
}

/**
 * The instance methods every `Cbor` value carries.
 *
 * Exactly three cheap conveniences; everything else is a free function.
 */
export interface CborMethods {
  /** Encode to deterministic CBOR bytes (same as `encodeCbor(this)`). */
  toData(): Uint8Array<ArrayBuffer>;
  /** Encode and render as lowercase hex. */
  toHex(): string;
  /**
   * Cheap debug string: `Cbor(0x…)` with the encoded hex.
   *
   * For the flat diagnostic form use `diagnostic(c, { flat: true })` from
   * `@blockchaincommons/dcbor/diagnostic`, or `installDebugHooks()` from `@blockchaincommons/dcbor/debug`
   * for diag-flavored console output.
   */
  toString(): string;
}

// The `Cbor` union type is defined in ./cbor (where it merges with the `Cbor`
// namespace value); it is imported above as a type-only reference so the
// interfaces here can name it without a runtime dependency.

/**
 * The structural encode protocol: types that can convert themselves to CBOR.
 * `cbor()` dispatches on it, following the `toJSON` precedent.
 *
 * Tagged types conventionally also keep `cborTags()` / `untaggedCbor()` /
 * `taggedCbor()` as ordinary members and implement `toCbor()` as
 * `return this.taggedCbor();`.
 */
export interface ToCbor {
  toCbor(): Cbor;
}
