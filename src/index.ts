/**
 * @blockchaincommons/dcbor - Deterministic CBOR (dCBOR) for TypeScript.
 *
 * ## Public surface
 *
 * - **Construct:** `cbor(input)` - the single polymorphic constructor.
 *   `taggedValue(tag, content)` is the only explicit tagged-value
 *   constructor. Custom types implement `ToCbor { toCbor(): Cbor }`.
 * - **Encode:** `encodeCbor(value): Uint8Array<ArrayBuffer>`.
 * - **Decode:** `decodeCbor(bytes)` throws `CborError`; `tryDecode(bytes)`
 *   is the non-throwing twin returning `Result<Cbor>`. The `try` prefix
 *   means "returns `Result`, never throws" - everywhere.
 * - **Read:** free accessors with fixed prefix semantics: `isX(c)` =
 *   type-narrowing guard; `asX(c)` = `T | undefined`; `expectX(c)` = `T` or
 *   throw. Containers mirror the JS `Map`/`Set` vocabulary.
 * - **Format/traverse:** `import { diagnostic, hexAnnotated } from
 *   "@blockchaincommons/dcbor/diagnostic"`; `import { walk } from "@blockchaincommons/dcbor/walk"`;
 *   opt-in debug output via `@blockchaincommons/dcbor/debug`.
 *
 * @module @blockchaincommons/dcbor
 */

// Core CBOR types and encoding/decoding. `Cbor` is a type-only export.
export {
  type Cbor,
  type CborInput,
  type CborNumber,
  type CborMethods,
  MajorType,
  type CborUnsignedType,
  type CborNegativeType,
  type CborByteStringType,
  type CborTextType,
  type CborArrayType,
  type CborMapType,
  type CborTaggedType,
  type CborSimpleType,
  // The ONE structural conversion protocol accepted by `cbor()`.
  type ToCbor,
} from "./cbor";

// Simple value types
export { type Simple, simpleName, isCborNaN } from "./simple";

// Construction / Encoding / Decoding
export { cbor, encodeCbor, taggedValue, cborEquals } from "./cbor";
export { decodeCbor, tryDecode } from "./decode";

// Typed decode (@beta)
export { type CborCodec, decodeWith } from "./codable";

// Map and Set
export { CborMap, type MapEntry } from "./map";
export { CborSet } from "./set";

// Tags and Tagged values
export { Tag, type TagValue } from "./tag";
export { type CborTagged, validateTag, extractTaggedContent } from "./codable";
export {
  TagsStore,
  type ReadonlyTagsStore,
  type CborSummarizer,
  type SummarizerResult,
  type TagsStoreOpt,
  getGlobalTagsStore,
  withTags,
} from "./tags-store";
// The standard CBOR tags this library defines.
export {
  TAG_DATE_TIME_STRING,
  TAG_EPOCH_DATE_TIME,
  TAG_EPOCH_DATE,
  TAG_POSITIVE_BIGNUM,
  TAG_NEGATIVE_BIGNUM,
  TAG_NAME_POSITIVE_BIGNUM,
  TAG_NAME_NEGATIVE_BIGNUM,
  TAG_DECIMAL_FRACTION,
  TAG_BIGFLOAT,
  TAG_BASE64URL,
  TAG_BASE64,
  TAG_BASE16,
  TAG_ENCODED_CBOR,
  TAG_URI,
  TAG_BASE64URL_TEXT,
  TAG_BASE64_TEXT,
  TAG_REGEXP,
  TAG_MIME_MESSAGE,
  TAG_UUID,
  TAG_STRING_REF_NAMESPACE,
  TAG_BINARY_UUID,
  TAG_SET,
  TAG_SELF_DESCRIBE_CBOR,
  TAG_DATE,
  TAG_NAME_DATE,
  registerStandardTags,
  tagsForValues,
} from "./tags";

// Date utilities
export { CborDate } from "./date";

// Hex byte utilities (the names match `Uint8Array.toHex`/`fromHex`; the
// diagnostic/annotated formatters live in the `@blockchaincommons/dcbor/diagnostic` subpath).
export { hexToBytes, bytesToHex } from "./hex";

// Error types
export {
  type CborErrorCode,
  type CborErrorDetails,
  type CborErrorDetailsByCode,
  type CborErrorTyped,
  type Result,
  Ok,
  Err,
  CborError,
} from "./error";

// BigNum support (CBOR tags 2/3, RFC 8949 §3.4.3)
export {
  biguintToCbor,
  bigintToCbor,
  cborToBiguint,
  cborToBigint,
  biguintFromUntaggedCbor,
  bigintFromNegativeUntaggedCbor,
} from "./bignum";

// CBOR-encoding-based array sorting.
export { sortArrayByCborEncoding, arraySortable, setSortable, type CBORSortable } from "./sortable";

// Float utilities
export { hasFractionalPart } from "./float";

// Varint utilities
export { encodeVarInt, decodeVarInt, decodeVarIntData } from "./varint";

// Type utilities
export { ByteString } from "./byte-string";
export { isCbor, isCborNumber } from "./cbor";

// Convenience utilities - type guards (`is*` = type-narrowing boolean)
export {
  isUnsigned,
  isNegative,
  isInteger,
  isBytes,
  isText,
  isArray,
  isMap,
  isTagged,
  isSimple,
  isBoolean,
  isNull,
  isFloat,
  isNumber,
} from "./conveniences";

// Convenience utilities - safe extraction (`as*` = `T | undefined`)
export {
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
  asTaggedValue,
} from "./conveniences";

// Convenience utilities - expectations (`expect*` = `T` or throw CborError)
export {
  expectUnsigned,
  expectNegative,
  expectInteger,
  expectBytes,
  expectText,
  expectArray,
  expectMap,
  expectBoolean,
  expectFloat,
  expectNumber,
} from "./conveniences";

// Convenience utilities - array/map/tagged operations
export { arrayItem, arrayLength, arrayIsEmpty } from "./conveniences";
export { mapValue, mapHas, mapKeys, mapValues, mapSize, mapIsEmpty } from "./conveniences";
export {
  tagValue,
  tagContent,
  hasTag,
  getTaggedContent,
  expectTaggedContent,
} from "./conveniences";

// Extract native JavaScript value from CBOR
export { extractCbor, type CborNative } from "./conveniences";
