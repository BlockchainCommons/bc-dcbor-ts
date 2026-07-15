import { type Cbor, encodeCbor, attachMethods } from "./cbor";
import { type CborNumber, MajorType } from "./cbor-types";
import { areBytesEqual } from "./stdlib";
import { binary16ToNumber, binary32ToNumber, binary64ToNumber } from "./float";
import { CborMap } from "./map";
import { CborError, Ok, Err, type Result } from "./error";
import { narrowInteger } from "./numeric";

/**
 * A forward-only cursor over the input bytes.
 *
 * Decoding advances a single `pos` through one shared `DataView` rather than
 * slicing a fresh sub-view per nested item and threading a consumed-length back
 * up the recursion. Every read is bounds-checked against the remaining bytes.
 */
class ByteReader {
  private readonly view: DataView;
  pos = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get byteLength(): number {
    return this.view.byteLength;
  }

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }

  /** Read the byte at `offset` relative to the current position (no advance). */
  peek(offset: number): number {
    return this.view.getUint8(this.pos + offset);
  }

  /** Advance the cursor by `count` bytes. */
  advance(count: number): void {
    this.pos += count;
  }

  /** A zero-copy view of `len` bytes at the given absolute offset. */
  bytesAt(offset: number, len: number): Uint8Array {
    return new Uint8Array(this.view.buffer, this.view.byteOffset + offset, len);
  }
}

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
export function decodeCbor(data: Uint8Array): Cbor {
  const reader = new ByteReader(data);
  const cbor = readCbor(reader);
  const remaining = reader.byteLength - reader.pos;
  if (remaining !== 0) {
    throw CborError.unusedData(remaining);
  }
  return cbor;
}

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
export function tryDecode(data: Uint8Array): Result<Cbor> {
  try {
    return Ok(decodeCbor(data));
  } catch (e) {
    if (CborError.isCborError(e)) return Err(e);
    throw e;
  }
}

function parseHeader(header: number): { majorType: MajorType; headerValue: number } {
  const majorType = (header >> 5) as MajorType;
  const headerValue = header & 31;
  return { majorType, headerValue };
}

/**
 * Read a CBOR head (major type + argument) at the cursor, advancing past it.
 * `varIntLen` is the head length (1/2/3/5/9); the argument value is validated
 * for canonical minimal-length encoding.
 */
function readHeaderVarint(reader: ByteReader): {
  majorType: MajorType;
  value: CborNumber;
  varIntLen: number;
} {
  if (reader.remaining < 1) {
    throw CborError.underrun();
  }

  const header = reader.peek(0);
  const { majorType, headerValue } = parseHeader(header);
  const dataRemaining = reader.remaining - 1;
  let value: CborNumber;
  let varIntLen: number;
  if (headerValue <= 23) {
    value = headerValue;
    varIntLen = 1;
  } else if (headerValue === 24) {
    if (dataRemaining < 1) {
      throw CborError.underrun();
    }
    value = reader.peek(1);
    if (value < 24) {
      throw CborError.nonCanonicalNumeric();
    }
    varIntLen = 2;
  } else if (headerValue === 25) {
    if (dataRemaining < 2) {
      throw CborError.underrun();
    }
    value = ((reader.peek(1) << 8) | reader.peek(2)) >>> 0;
    // Floats with header 0xf9 are allowed to have values <= 0xFF
    if (value <= 0xff && header !== 0xf9) {
      throw CborError.nonCanonicalNumeric();
    }
    varIntLen = 3;
  } else if (headerValue === 26) {
    if (dataRemaining < 4) {
      throw CborError.underrun();
    }
    value =
      ((reader.peek(1) << 24) | (reader.peek(2) << 16) | (reader.peek(3) << 8) | reader.peek(4)) >>>
      0;
    // Floats with header 0xfa are allowed to have values <= 0xFFFF
    if (value <= 0xffff && header !== 0xfa) {
      throw CborError.nonCanonicalNumeric();
    }
    varIntLen = 5;
  } else if (headerValue === 27) {
    if (dataRemaining < 8) {
      throw CborError.underrun();
    }
    const a = BigInt(reader.peek(1)) << 56n;
    const b = BigInt(reader.peek(2)) << 48n;
    const c = BigInt(reader.peek(3)) << 40n;
    const d = BigInt(reader.peek(4)) << 32n;
    const e = BigInt(reader.peek(5)) << 24n;
    const f = BigInt(reader.peek(6)) << 16n;
    const g = BigInt(reader.peek(7)) << 8n;
    const h = BigInt(reader.peek(8));
    value = narrowInteger(a | b | c | d | e | f | g | h);
    // Floats with header 0xfb are allowed to have values <= 0xFFFFFFFF
    if (value <= 0xffffffff && header !== 0xfb) {
      throw CborError.nonCanonicalNumeric();
    }
    varIntLen = 9;
  } else {
    throw CborError.unsupportedHeaderValue(headerValue);
  }
  reader.advance(varIntLen);
  return { majorType, value, varIntLen };
}

function readCbor(reader: ByteReader): Cbor {
  if (reader.remaining < 1) {
    throw CborError.underrun();
  }
  const headStart = reader.pos;
  const { majorType, value, varIntLen } = readHeaderVarint(reader);
  switch (majorType) {
    case MajorType.Unsigned: {
      const cbor = attachMethods({ isCbor: true, type: MajorType.Unsigned, value } as const);
      checkCanonicalEncoding(cbor, reader.bytesAt(headStart, varIntLen));
      return cbor;
    }
    case MajorType.Negative: {
      // Store the magnitude as-is: the decoded value is what gets encoded
      // (not the actual negative number).
      const cbor = attachMethods({ isCbor: true, type: MajorType.Negative, value } as const);
      checkCanonicalEncoding(cbor, reader.bytesAt(headStart, varIntLen));
      return cbor;
    }
    case MajorType.ByteString: {
      if (typeof value === "bigint") {
        // A length >= 2^53 stays a bigint after narrowing; no input can ever
        // satisfy it, so report the missing body exactly like Rust's usize
        // bounds check does.
        throw CborError.underrun();
      }
      if (reader.remaining < value) {
        throw CborError.underrun();
      }
      const bytes = reader.bytesAt(reader.pos, value);
      reader.advance(value);
      return attachMethods({ isCbor: true, type: MajorType.ByteString, value: bytes } as const);
    }
    case MajorType.Text: {
      if (typeof value === "bigint") {
        // Same as ByteString: an unsatisfiable bigint length is an Underrun.
        throw CborError.underrun();
      }
      if (reader.remaining < value) {
        throw CborError.underrun();
      }
      const textBytes = reader.bytesAt(reader.pos, value);
      reader.advance(value);
      // dCBOR text strings must be valid UTF-8 (RFC 8949). Use a fatal decoder
      // so invalid bytes throw rather than getting replaced with U+FFFD and
      // silently accepted.
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
      } catch (e) {
        throw CborError.invalidUtf8(e instanceof Error ? e.message : String(e));
      }
      // dCBOR requires all text strings to be in Unicode Normalization Form C
      // (NFC); reject any that are not already normalized.
      if (text.normalize("NFC") !== text) {
        throw CborError.nonCanonicalString();
      }
      return attachMethods({ isCbor: true, type: MajorType.Text, value: text } as const);
    }
    case MajorType.Array: {
      const items: Cbor[] = [];
      for (let i = 0; i < value; i++) {
        items.push(readCbor(reader));
      }
      return attachMethods({ isCbor: true, type: MajorType.Array, value: items } as const);
    }
    case MajorType.Map: {
      const map = new CborMap();
      for (let i = 0; i < value; i++) {
        const key = readCbor(reader);
        const val = readCbor(reader);
        map.setNext(key, val);
      }
      return attachMethods({ isCbor: true, type: MajorType.Map, value: map } as const);
    }
    case MajorType.Tagged: {
      const item = readCbor(reader);
      return attachMethods({
        isCbor: true,
        type: MajorType.Tagged,
        tag: value,
        value: item,
      } as const);
    }
    case MajorType.Simple:
      switch (varIntLen) {
        case 3: {
          const f = binary16ToNumber(reader.bytesAt(headStart + 1, 2));
          // dCBOR canonical-encoding check via re-encode-and-compare. JS's
          // `Number` type does not preserve NaN payload bits - every NaN
          // collapses to the same value - so a bit-level check is not possible.
          // Re-encoding round-trips through the canonicalising encoder, catching
          // every non-canonical NaN, ±Infinity, and integer-reducible float.
          checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
          return attachMethods({
            isCbor: true,
            type: MajorType.Simple,
            value: { type: "Float", value: f },
          } as const);
        }
        case 5: {
          const f = binary32ToNumber(reader.bytesAt(headStart + 1, 4));
          checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
          return attachMethods({
            isCbor: true,
            type: MajorType.Simple,
            value: { type: "Float", value: f },
          } as const);
        }
        case 9: {
          const f = binary64ToNumber(reader.bytesAt(headStart + 1, 8));
          checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
          return attachMethods({
            isCbor: true,
            type: MajorType.Simple,
            value: { type: "Float", value: f },
          } as const);
        }
        default:
          switch (value) {
            case 20:
              return attachMethods({
                isCbor: true,
                type: MajorType.Simple,
                value: { type: "False" },
              });
            case 21:
              return attachMethods({
                isCbor: true,
                type: MajorType.Simple,
                value: { type: "True" },
              });
            case 22:
              return attachMethods({
                isCbor: true,
                type: MajorType.Simple,
                value: { type: "Null" },
              });
            default:
              // Per dCBOR spec, only false/true/null/floats are valid.
              throw CborError.invalidSimpleValue();
          }
      }
  }
}

function checkCanonicalEncoding(cbor: Cbor | CborNumber, buf: Uint8Array): void {
  // encodeCbor accepts both decoded CBOR objects and native values (floats).
  const buf2 = encodeCbor(cbor);
  if (!areBytesEqual(buf, buf2)) {
    throw CborError.nonCanonicalNumeric();
  }
}
