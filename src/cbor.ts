/**
 * The dCBOR value core: the `Cbor` union type, the polymorphic constructor
 * `cbor()`, the encoder entry `encodeCbor()`, and the tagged-value
 * constructor `taggedValue()`.
 *
 * ## The API in one paragraph
 *
 * Construct with `cbor(input)` (the single polymorphic constructor) or
 * `taggedValue(tag, content)` (the only explicit tagged-value constructor);
 * custom types participate by implementing the one structural protocol
 * `ToCbor { toCbor(): Cbor }`. Encode with `encodeCbor(value)`. Decode with
 * `decodeCbor(bytes)` (throws) or `tryDecode(bytes)` (returns `Result`).
 * Read with the free `isX`/`asX`/`expectX` accessor functions. The only
 * instance conveniences on a `Cbor` value are `toData()`, `toHex()`, and a
 * cheap `toString()`.
 *
 * @module cbor
 */

import { CborMap } from "./map";
import { simpleCborData, simpleEquals } from "./simple";
import { hasFractionalPart } from "./float";
import { encodeVarInt, writeVarInt } from "./varint";
import { BufWriter } from "./buf-writer";
import { bytesToHex } from "./hex";
import { areBytesEqual } from "./stdlib";
import { type Tag, tagValuesEqual } from "./tag";
import { CborError } from "./error";
import { U64_MAX, CBOR_INT_MIN, CBOR_INT_MAX } from "./numeric";
import {
  MajorType,
  isCbor,
  isCborNumber,
  type CborInput,
  type CborNumber,
  type CborMethods,
  type ToCbor,
  type CborUnsignedType,
  type CborNegativeType,
  type CborByteStringType,
  type CborTextType,
  type CborArrayType,
  type CborMapType,
  type CborTaggedType,
  type CborSimpleType,
} from "./cbor-types";

// The CBOR type foundation (the `MajorType` enum, the constituent `CborXxxType`
// interfaces, `CborInput`/`CborNumber`, `CborMethods`, and the `isCbor`/
// `isCborNumber` guards) lives in ./cbor-types - a dependency leaf. Re-export it
// so ./cbor stays the single public entry for these symbols (index.ts imports
// them from here).
export { MajorType, isCbor, isCborNumber } from "./cbor-types";
export type { Simple } from "./simple";
export type {
  CborNumber,
  CborInput,
  CborMethods,
  ToCbor,
  CborUnsignedType,
  CborNegativeType,
  CborByteStringType,
  CborTextType,
  CborArrayType,
  CborMapType,
  CborTaggedType,
  CborSimpleType,
} from "./cbor-types";

/**
 * A decoded/constructed CBOR value: one of the eight major-type shapes, with
 * the (deliberately tiny) instance-method set from {@link CborMethods}
 * attached. The constituent interfaces live in ./cbor-types.
 *
 * This is a TYPE-ONLY export. Construct values with `cbor(x)` and decode with
 * `decodeCbor(bytes)`.
 */
export type Cbor = (
  | CborUnsignedType
  | CborNegativeType
  | CborByteStringType
  | CborTextType
  | CborArrayType
  | CborMapType
  | CborTaggedType
  | CborSimpleType
) &
  CborMethods;

// ============================================================================
// The shared prototype
// ============================================================================

/**
 * The instance methods shared by every `Cbor` value: exactly three cheap
 * conveniences (plus debug symbols below). Everything else is a free function
 * so decode-only bundles never carry the diagnostic formatter, hex annotator,
 * tag store, or walker.
 *
 * `String(c)`/template literals/`console.log` produce `Cbor(0x…)`. Diagnostic
 * rendering lives in `@blockchaincommons/dcbor/diagnostic`; opt-in diag-flavored debug
 * output lives in `@blockchaincommons/dcbor/debug` (`installDebugHooks()`).
 */
// The debug niceties (toStringTag, inspect hook) are PLAIN DATA properties
// in the literal: defining them afterwards via Object.defineProperty (and
// especially as accessors) flips the shared prototype into
// dictionary/slow mode in JSC & V8, taxing every attachMethods [[Set]] -
// measured at -25..-55% encode/decode throughput.
const CBOR_METHODS: CborMethods = {
  toData(this: Cbor): Uint8Array<ArrayBuffer> {
    return encodeCbor(this);
  },
  toHex(this: Cbor): string {
    return bytesToHex(encodeCbor(this));
  },
  toString(this: Cbor): string {
    return `Cbor(0x${bytesToHex(encodeCbor(this))})`;
  },
  [Symbol.toStringTag]: "Cbor",
  [Symbol.for("nodejs.util.inspect.custom")](this: Cbor): string {
    return this.toString();
  },
} as CborMethods;

/**
 * Decorate a bare CBOR value (`{ isCbor, type, value[, tag] }`) with the shared
 * instance methods. The methods live on {@link CBOR_METHODS} and are installed
 * via the prototype - constructed with `Object.create` (not `setPrototypeOf`,
 * which would drop the object off V8's fast path). Only the handful of data
 * properties are own-properties; the methods are shared, not per-object.
 *
 * @internal
 */
export const attachMethods = <T extends Omit<Cbor, keyof CborMethods>>(obj: T): T & CborMethods => {
  const decorated = Object.create(CBOR_METHODS) as T & CborMethods;
  return Object.assign(decorated, obj);
};

/**
 * Replace the prototype's inspect/`toJSON` hooks with a richer formatter.
 * Used exclusively by `@blockchaincommons/dcbor/debug`'s `installDebugHooks()`.
 *
 * @internal
 */
export const __installDebugHooks = (format: (c: Cbor) => string): void => {
  Object.defineProperty(CBOR_METHODS, Symbol.for("nodejs.util.inspect.custom"), {
    value(this: Cbor): string {
      return format(this);
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(CBOR_METHODS, "toJSON", {
    value(this: Cbor): string {
      return format(this);
    },
    writable: true,
    configurable: true,
  });
};

// Memoized immutable simple values: `cbor(true/false/null/undefined)`
// returns these singletons instead of allocating per call. They are
// structurally identical to freshly-built nodes; identity comparisons are
// unreliable for decoded values, so sharing is safe.
const CBOR_FALSE = attachMethods({
  isCbor: true,
  type: MajorType.Simple,
  value: { type: "False" },
} as const) as Cbor;
const CBOR_TRUE = attachMethods({
  isCbor: true,
  type: MajorType.Simple,
  value: { type: "True" },
} as const) as Cbor;
const CBOR_NULL = attachMethods({
  isCbor: true,
  type: MajorType.Simple,
  value: { type: "Null" },
} as const) as Cbor;

// ============================================================================
// Structural equality
// ============================================================================

/**
 * Structural CBOR value equality, the reference's `PartialEq for CBOR`
 * (`cbor.rs`): two values are equal when they have the same major type and
 * equal contents, compared recursively.
 *
 * This is NOT "encode to the same bytes": a float node whose value is whole
 * (`Float(2.0)`, reachable through a bare node) encodes as the integer `2`
 * but is not equal to the integer node; a text node keeps the string it was
 * built from, so a decomposed `"é"` is not equal to the composed one although
 * both encode composed. Integers compare by value across `number`/`bigint`;
 * tags compare by value only (the carried name is ignored); NaN equals NaN;
 * maps compare entry by entry in canonical key order, keys and values both
 * structurally.
 *
 * Use this rather than `===` (which compares JS object references) when
 * you need value equality across two `Cbor` instances built independently.
 */
export const cborEquals = (a: Cbor, b: Cbor): boolean => {
  if (a === b) return true;
  switch (a.type) {
    case MajorType.Unsigned:
      return b.type === MajorType.Unsigned && BigInt(a.value) === BigInt(b.value);
    case MajorType.Negative:
      return b.type === MajorType.Negative && BigInt(a.value) === BigInt(b.value);
    case MajorType.ByteString:
      return b.type === MajorType.ByteString && areBytesEqual(a.value, b.value);
    case MajorType.Text:
      return b.type === MajorType.Text && a.value === b.value;
    case MajorType.Array:
      return (
        b.type === MajorType.Array &&
        a.value.length === b.value.length &&
        a.value.every((item, i) => cborEquals(item, b.value[i]))
      );
    case MajorType.Map:
      return b.type === MajorType.Map && mapEquals(a.value, b.value);
    case MajorType.Tagged:
      return (
        b.type === MajorType.Tagged && tagValuesEqual(a.tag, b.tag) && cborEquals(a.value, b.value)
      );
    case MajorType.Simple:
      return b.type === MajorType.Simple && simpleEquals(a.value, b.value);
  }
};

/**
 * `PartialEq for Map` (`map.rs`): the same entries in canonical key order,
 * each with a structurally equal stored key node and value node. Both maps
 * iterate in encoded-key order, so a lockstep walk is exact.
 */
const mapEquals = (a: CborMap, b: CborMap): boolean => {
  if (a.size !== b.size) return false;
  const left = a.entriesArray;
  const right = b.entriesArray;
  for (let i = 0; i < left.length; i++) {
    const l = left[i];
    const r = right[i];
    if (!cborEquals(l.key, r.key) || !cborEquals(l.value, r.value)) return false;
  }
  return true;
};

// ============================================================================
// The polymorphic constructor
// ============================================================================

const hasTaggedCbor = (value: unknown): value is { taggedCbor(): Cbor } => {
  return (
    typeof value === "object" &&
    value !== null &&
    "taggedCbor" in value &&
    typeof value.taggedCbor === "function"
  );
};

const hasToCbor = (value: unknown): value is ToCbor => {
  return (
    typeof value === "object" &&
    value !== null &&
    "toCbor" in value &&
    typeof (value as ToCbor).toCbor === "function"
  );
};

/**
 * Convert any supported value to its CBOR representation - the single
 * polymorphic constructor.
 *
 * Custom types participate by implementing {@link ToCbor}
 * (`toCbor(): Cbor` - the `toJSON` precedent). Tagged values are built with
 * {@link taggedValue}.
 *
 * @example
 * ```typescript
 * cbor(42);                          // integer
 * cbor("héllo");                     // text (NFC-normalized when encoded)
 * cbor([1, "two", true, null]);      // array
 * cbor(new Map([["k", 1]]));         // map (canonical key order)
 * cbor({ name: "Alice", age: 30 });  // plain object -> map
 * ```
 *
 * @throws {CborError} `OutOfRange` - bigint outside `[-(2^64), 2^64 - 1]`.
 * @throws {CborError} `Custom` - unsupported input type, or one of the two
 *   directive errors below.
 * @public
 *
 * ## Directive errors
 *
 * Two input shapes throw a directive `CborError` because encoding them
 * silently would produce ambiguous or divergent bytes:
 *
 * - plain objects shaped exactly `{tag, value}`: use
 *   `taggedValue(tag, content)` for a tagged value, or add/rename a key for
 *   a map;
 * - objects implementing `taggedCbor()` but not `toCbor()`: add
 *   `toCbor() { return this.taggedCbor(); }`.
 */
export const cbor = (value: CborInput): Cbor => {
  // If already CBOR and has methods, return as-is
  if (isCbor(value) && "toData" in value) {
    return value;
  }

  // If CBOR but no methods, attach them
  if (isCbor(value)) {
    return attachMethods(value as Omit<Cbor, keyof CborMethods>) as Cbor;
  }

  let result: Omit<Cbor, keyof CborMethods>;

  if (isCborNumber(value)) {
    if (typeof value === "number" && Number.isNaN(value)) {
      result = { isCbor: true, type: MajorType.Simple, value: { type: "Float", value: NaN } };
    } else if (typeof value === "number" && hasFractionalPart(value)) {
      result = { isCbor: true, type: MajorType.Simple, value: { type: "Float", value: value } };
    } else if (value == Infinity) {
      result = { isCbor: true, type: MajorType.Simple, value: { type: "Float", value: Infinity } };
    } else if (value == -Infinity) {
      result = { isCbor: true, type: MajorType.Simple, value: { type: "Float", value: -Infinity } };
    } else if (typeof value === "number" && !Number.isSafeInteger(value)) {
      // A finite, whole-valued `number` beyond the safe-integer range (NaN,
      // ±Infinity, and fractional values are handled above). Reduce any whole
      // value in `[-(2^64), 2^64)` to a CBOR integer; values outside that range
      // (e.g. `1e21`) stay floats. Go through BigInt so we don't lose
      // precision above 2^53.
      const big = BigInt(value);
      if (big >= 0n && big <= U64_MAX) {
        result = { isCbor: true, type: MajorType.Unsigned, value: big };
      } else if (big < 0n && big >= CBOR_INT_MIN) {
        result = { isCbor: true, type: MajorType.Negative, value: -big - 1n };
      } else {
        result = { isCbor: true, type: MajorType.Simple, value: { type: "Float", value: value } };
      }
    } else if (typeof value === "bigint" && (value > CBOR_INT_MAX || value < CBOR_INT_MIN)) {
      // bigint outside the [-(2^64), 2^64 - 1] CBOR-encodable integer
      // range. Surface immediately rather than crashing in encodeVarInt.
      throw CborError.outOfRange();
    } else if (value < 0) {
      // Store the magnitude to encode: for a negative value n, CBOR encodes
      // it as -1-n, so we store -n-1.
      if (typeof value === "bigint") {
        result = { isCbor: true, type: MajorType.Negative, value: -value - 1n };
      } else {
        result = { isCbor: true, type: MajorType.Negative, value: -value - 1 };
      }
    } else {
      result = { isCbor: true, type: MajorType.Unsigned, value: value };
    }
  } else if (typeof value === "string") {
    // The node keeps the string exactly as given (the reference's
    // `CBORCase::Text(String)` does the same); dCBOR's NFC requirement is
    // applied when the node is encoded, see `writeCborInto`.
    result = { isCbor: true, type: MajorType.Text, value };
  } else if (value === null || value === undefined) {
    return CBOR_NULL;
  } else if (value === true) {
    return CBOR_TRUE;
  } else if (value === false) {
    return CBOR_FALSE;
  } else if (Array.isArray(value)) {
    result = { isCbor: true, type: MajorType.Array, value: (value as CborInput[]).map(cbor) };
  } else if (value instanceof Uint8Array) {
    result = { isCbor: true, type: MajorType.ByteString, value: value };
  } else if (value instanceof CborMap) {
    result = { isCbor: true, type: MajorType.Map, value: value };
  } else if (value instanceof Map) {
    result = { isCbor: true, type: MajorType.Map, value: new CborMap(value) };
  } else if (value instanceof Set) {
    result = {
      isCbor: true,
      type: MajorType.Array,
      value: Array.from(value as Set<CborInput>).map(cbor),
    };
  } else if (hasToCbor(value)) {
    // The one structural protocol. Checked before the taggedCbor() branch
    // below, so types implementing both use toCbor().
    return value.toCbor();
  } else if (hasTaggedCbor(value)) {
    // Directive error: objects implementing taggedCbor() are not auto-wrapped.
    // Auto-wrapping would change bytes for structural call sites, so throw.
    throw CborError.custom(
      "objects implementing taggedCbor() are no longer auto-wrapped by cbor(); " +
        "implement toCbor() (e.g. `toCbor() { return this.taggedCbor(); }`)",
    );
  } else if (typeof value === "object" && "tag" in value && "value" in value) {
    const keys = Object.keys(value);
    if (keys.length === 2 && keys.includes("tag") && keys.includes("value")) {
      // Directive error: a bare two-key {tag, value} object is ambiguous -
      // it could be a tagged value or a legitimate data record like
      // {tag: "release", value: 3}. Refuse it rather than guess.
      throw CborError.custom(
        "plain { tag, value } objects are ambiguous and no longer encode as tagged values; " +
          "use taggedValue(tag, content) for a tagged value, or add/rename a key to encode a map",
      );
    }
    // Inherited tag/value (or extra keys): fall through to the plain-object
    // → map conversion.
    const map = new CborMap();
    for (const [key, val] of Object.entries(value)) {
      map.set(cbor(key), cbor(val));
    }
    result = { isCbor: true, type: MajorType.Map, value: map };
  } else if (typeof value === "object") {
    // Handle plain objects by converting to CborMap
    const map = new CborMap();
    for (const [key, val] of Object.entries(value)) {
      map.set(cbor(key), cbor(val as CborInput));
    }
    result = { isCbor: true, type: MajorType.Map, value: map };
  } else {
    throw CborError.custom("Unsupported type for CBOR encoding");
  }

  return attachMethods(result) as Cbor;
};

// ============================================================================
// Encoding
// ============================================================================

// One reused UTF-8 encoder; TextEncoder is stateless, so sharing it is safe and
// avoids a per-string allocation on the encode path.
const textEncoder = new TextEncoder();

/**
 * dCBOR requires every encoded text string to be in Unicode Normalization
 * Form C. Like the reference (`cbor.rs`: `x.nfc().collect()` inside
 * `cbor_data`), normalization happens here at encode time, so the node keeps
 * the string it was built from. Strings whose code units are all below U+0300
 * (the first combining mark) contain nothing that can compose or decompose
 * and are already NFC; skipping `normalize` for them keeps the ASCII/Latin-1
 * hot path allocation-free.
 */
const toNfc = (text: string): string => {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0x300) return text.normalize("NFC");
  }
  return text;
};

/**
 * Write a CBOR value into `writer`. The whole tree encodes into one growable
 * buffer, so nested containers don't allocate-and-concatenate a fresh array
 * per level.
 */
const writeCborInto = (writer: BufWriter, value: CborInput): void => {
  const c = cbor(value);
  switch (c.type) {
    case MajorType.Unsigned:
      writeVarInt(writer, c.value, MajorType.Unsigned);
      return;
    case MajorType.Negative:
      // Value is already stored as the magnitude to encode.
      writeVarInt(writer, c.value, MajorType.Negative);
      return;
    case MajorType.ByteString:
      if (c.value instanceof Uint8Array) {
        writeVarInt(writer, c.value.length, MajorType.ByteString);
        writer.writeBytes(c.value);
        return;
      }
      break;
    case MajorType.Text:
      if (typeof c.value === "string") {
        const utf8Bytes = textEncoder.encode(toNfc(c.value));
        writeVarInt(writer, utf8Bytes.length, MajorType.Text);
        writer.writeBytes(utf8Bytes);
        return;
      }
      break;
    case MajorType.Tagged:
      if (typeof c.tag === "bigint" || typeof c.tag === "number") {
        writeVarInt(writer, c.tag, MajorType.Tagged);
        writeCborInto(writer, c.value);
        return;
      }
      break;
    case MajorType.Simple:
      writer.writeBytes(simpleCborData(c.value));
      return;
    case MajorType.Array:
      writeVarInt(writer, c.value.length, MajorType.Array);
      for (const item of c.value) {
        writeCborInto(writer, item);
      }
      return;
    case MajorType.Map: {
      const entries = c.value.entriesArray;
      writeVarInt(writer, entries.length, MajorType.Map);
      for (const { key, value: entryValue } of entries) {
        writeCborInto(writer, key);
        writeCborInto(writer, entryValue);
      }
      return;
    }
  }
  throw CborError.wrongType();
};

/**
 * Encode a value to deterministic CBOR bytes. Accepts anything `cbor()`
 * accepts; equal values always produce identical bytes (dCBOR determinism).
 *
 * @example
 * ```typescript
 * encodeCbor({ a: 1 });            // Uint8Array [0xa1, 0x61, 0x61, 0x01]
 * bytesToHex(encodeCbor("Hello")); // "6548656c6c6f"
 * ```
 *
 * @throws {CborError} Whatever `cbor(value)` throws for unsupported inputs
 *   (`OutOfRange`, `Custom`).
 * @remarks The decoder's canonicality check re-encodes every decoded value
 *   through this function, so it is wire-critical.
 * @public
 */
export const encodeCbor = (value: CborInput): Uint8Array<ArrayBuffer> => {
  const c = cbor(value);
  // Scalars encode straight to a right-sized array - no writer/copy overhead.
  switch (c.type) {
    case MajorType.Unsigned:
      return encodeVarInt(c.value, MajorType.Unsigned);
    case MajorType.Negative:
      return encodeVarInt(c.value, MajorType.Negative);
    case MajorType.Simple:
      return simpleCborData(c.value);
    default: {
      // Variable-length / composite values share one growable buffer.
      const writer = new BufWriter();
      writeCborInto(writer, c);
      return writer.toBytes();
    }
  }
};

// ============================================================================
// The tagged-value constructor
// ============================================================================

/**
 * Construct a tagged value - the ONLY explicit tagged-value constructor.
 *
 * @example
 * ```typescript
 * taggedValue(1, 1675854714);        // epoch date, tag 1
 * taggedValue(Tag.from(32), "https://example.com/"); // URI, tag 32
 * ```
 *
 * @param tag - The tag number (`number | bigint`) or a `Tag` object. Its
 *   `.value` goes on the wire; a `.name` is kept on the node (see
 *   `CborTaggedType.tagName`) so a `WrongTag` error can name the tag that
 *   was found, as the reference does.
 * @param content - Anything `cbor()` accepts.
 * @public
 */
export const taggedValue = (tag: CborNumber | Tag, content: CborInput): Cbor => {
  if (typeof tag === "object" && "value" in tag) {
    if (tag.name !== undefined) {
      return attachMethods({
        isCbor: true,
        type: MajorType.Tagged,
        tag: tag.value,
        tagName: tag.name,
        value: cbor(content),
      });
    }
    return attachMethods({
      isCbor: true,
      type: MajorType.Tagged,
      tag: tag.value,
      value: cbor(content),
    });
  }
  return attachMethods({ isCbor: true, type: MajorType.Tagged, tag, value: cbor(content) });
};
