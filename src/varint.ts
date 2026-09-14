import { type CborNumber, isCborNumber, type MajorType } from "./cbor-types";
import { hasFractionalPart } from "./float";
import { CborError } from "./error";
import { U64_MAX } from "./numeric";
import { type BufWriter } from "./buf-writer";

const typeBits = (t: MajorType): number => {
  return t << 5;
};

/**
 * Write a CBOR head (major type + argument) straight into `writer`, avoiding
 * the intermediate `Uint8Array` that {@link encodeVarInt} allocates. This is
 * the encoder hot path (every node emits a head). It must stay byte-identical
 * to {@link encodeVarInt}; the golden vectors cover both.
 */
export const writeVarInt = (writer: BufWriter, value: CborNumber, majorType: MajorType): void => {
  if (value < 0) {
    throw CborError.outOfRange();
  }
  if (typeof value === "number" && hasFractionalPart(value)) {
    throw CborError.outOfRange();
  }
  const type = typeBits(majorType);
  if (isCborNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
    const n = Number(value);
    if (n <= 23) {
      writer.writeByte(n | type);
    } else if (n <= 0xff) {
      writer.writeByte(0x18 | type);
      writer.writeByte(n);
    } else if (n <= 0xffff) {
      writer.writeByte(0x19 | type);
      writer.writeUint16(n);
    } else if (n <= 0xffffffff) {
      writer.writeByte(0x1a | type);
      writer.writeUint32(n);
    } else {
      writer.writeByte(0x1b | type);
      writer.writeBigUint64(BigInt(n));
    }
  } else {
    // Past MAX_SAFE_INTEGER the head is always the 9-byte u64 form
    // (OutOfRange above u64::MAX). BigInt keeps the value lossless.
    const big = BigInt(value);
    if (big > U64_MAX) {
      throw CborError.outOfRange();
    }
    writer.writeByte(0x1b | type);
    writer.writeBigUint64(big);
  }
};

/**
 * Encode a CBOR head (major type + argument) in its shortest form.
 *
 * @throws {CborError} `OutOfRange` for a negative, fractional, or
 *   above-u64 argument.
 */
export const encodeVarInt = (value: CborNumber, majorType: MajorType): Uint8Array<ArrayBuffer> => {
  if (value < 0) {
    throw CborError.outOfRange();
  }
  if (typeof value === "number" && hasFractionalPart(value)) {
    throw CborError.outOfRange();
  }
  const type = typeBits(majorType);
  if (isCborNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
    value = Number(value);
    if (value <= 23) {
      return new Uint8Array([value | type]);
    } else if (value <= 0xff) {
      // Fits in UInt8
      return new Uint8Array([0x18 | type, value]);
    } else if (value <= 0xffff) {
      // Fits in UInt16
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x19 | type);
      view.setUint16(1, value);
      return new Uint8Array(buffer);
    } else if (value <= 0xffffffff) {
      // Fits in UInt32
      const buffer = new ArrayBuffer(5);
      const view = new DataView(buffer);
      view.setUint8(0, 0x1a | type);
      view.setUint32(1, value);
      return new Uint8Array(buffer);
    } else {
      // Above u32, within the safe-integer range: UInt64
      const buffer = new ArrayBuffer(9);
      const view = new DataView(buffer);
      view.setUint8(0, 0x1b | type);
      view.setBigUint64(1, BigInt(value));
      return new Uint8Array(buffer);
    }
  } else {
    // Above MAX_SAFE_INTEGER (so above u32): the 9-byte u64 form if the value
    // fits, otherwise OutOfRange. Compared as a bigint, since `Number(value)`
    // is lossy here.
    const big = BigInt(value);
    if (big > U64_MAX) {
      throw CborError.outOfRange();
    }
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, 0x1b | type);
    view.setBigUint64(1, big);
    return new Uint8Array(buffer);
  }
};

export const decodeVarIntData = (
  dataView: DataView,
  offset: number,
): { majorType: MajorType; value: CborNumber; offset: number } => {
  const initialByte = dataView.getUint8(offset);
  const majorType = (initialByte >> 5) as MajorType;
  const additionalInfo = initialByte & 0x1f;
  let value: CborNumber;
  offset += 1;
  switch (additionalInfo) {
    case 24: // 1-byte additional info
      value = dataView.getUint8(offset);
      offset += 1;
      break;
    case 25: // 2-byte additional info
      value = ((dataView.getUint8(offset) << 8) | dataView.getUint8(offset + 1)) >>> 0;
      offset += 2;
      break;
    case 26: // 4-byte additional info
      value =
        ((dataView.getUint8(offset) << 24) |
          (dataView.getUint8(offset + 1) << 16) |
          (dataView.getUint8(offset + 2) << 8) |
          dataView.getUint8(offset + 3)) >>>
        0;
      offset += 4;
      break;
    case 27: // 8-byte additional info
      value = getUint64(dataView, offset, false);
      if (value <= Number.MAX_SAFE_INTEGER) {
        value = Number(value);
      }
      offset += 8;
      break;
    default: // 0-23: the argument is the additional info itself
      value = additionalInfo;
      break;
  }
  return { majorType, value, offset };
};

export const decodeVarInt = (
  data: Uint8Array,
): { majorType: MajorType; value: CborNumber; offset: number } => {
  return decodeVarIntData(new DataView(data.buffer, data.byteOffset, data.byteLength), 0);
};

function getUint64(view: DataView, byteOffset: number, littleEndian: boolean): bigint {
  const lowWord = littleEndian
    ? view.getUint32(byteOffset, true)
    : view.getUint32(byteOffset + 4, false);
  const highWord = littleEndian
    ? view.getUint32(byteOffset + 4, true)
    : view.getUint32(byteOffset, false);
  return (BigInt(highWord) << BigInt(32)) + BigInt(lowWord);
}
