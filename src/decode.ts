import { CBOR, CBORNumber, CBORType } from "./cbor";
import { MajorType } from "./varint";

export function decodeCBOR(data: Uint8Array): CBOR {
  const {cbor, len} = decodeCBORInternal(new DataView(data.buffer, data.byteOffset, data.byteLength));
  const remaining = data.length - len;
  if (remaining !== 0) {
    throw new Error(`Unused data: ${remaining}`);
  }
  return cbor;
}

function parseHeader(header: number): { majorType: MajorType, headerValue: number } {
  const majorType = header >> 5;
  const headerValue = header & 31;
  return { majorType, headerValue };
}

function at(data: DataView, index: number): number {
  return data.getUint8(index);
}

function from(data: DataView, index: number): DataView {
  return new DataView(data.buffer, data.byteOffset + index);
}

function range(data: DataView, start: number, end: number): DataView {
  return new DataView(data.buffer, data.byteOffset + start, end - start);
}

function parseBytes(data: DataView, len: number): DataView {
  if (data.byteLength < len) {
    throw new Error("Underrun");
  }
  return range(data, 0, len);
}

function parseHeaderVarint(data: DataView): { majorType: MajorType, value: CBORNumber, varIntLen: number } {
  if (data.byteLength < 1) {
    throw new Error("Underrun");
  }

  const { majorType, headerValue } = parseHeader(at(data, 0));
  const dataRemaining = data.byteLength - 1;
  let value: CBORNumber;
  let varIntLen: number;
  if (headerValue <= 23) {
    value = headerValue;
    varIntLen = 1;
  } else if (headerValue === 24) {
    if (dataRemaining < 1) {
      throw new Error("Underrun");
    }
    value = at(data, 1);
    if (value < 24) {
      throw new Error("Non-canonical numeric");
    }
    varIntLen = 2;
  } else if (headerValue === 25) {
    if (dataRemaining < 2) {
      throw new Error("Underrun");
    }
    value = (at(data, 1) << 8 | at(data, 2)) >>> 0;
    if (value <= 0xFF) {
      throw new Error("Non-canonical numeric");
    }
    varIntLen = 3;
  } else if (headerValue === 26) {
    if (dataRemaining < 4) {
      throw new Error("Underrun");
    }
    value = (at(data, 1) << 24 | at(data, 2) << 16 | at(data, 3) << 8 | at(data, 4)) >>> 0;
    if (value <= 0xFFFF) {
      throw new Error("Non-canonical numeric");
    }
    varIntLen = 5;
  } else if (headerValue === 27) {
    if (dataRemaining < 8) {
      throw new Error("Underrun");
    }
    const a = BigInt(at(data, 1)) << 56n;
    const b = BigInt(at(data, 2)) << 48n;
    const c = BigInt(at(data, 3)) << 40n;
    const d = BigInt(at(data, 4)) << 32n;
    const e = BigInt(at(data, 5)) << 24n;
    const f = BigInt(at(data, 6)) << 16n;
    const g = BigInt(at(data, 7)) << 8n;
    const h = BigInt(at(data, 8));
    value = a | b | c | d | e | f | g | h;
    if (value <= Number.MAX_SAFE_INTEGER) {
      value = Number(value);
    }
    if (value <= 0xFFFFFFFF) {
      throw new Error("Non-canonical numeric");
    }
    varIntLen = 9;
  } else {
    throw new Error("Bad header value");
  }
  return { majorType, value, varIntLen };
}

function decodeCBORInternal(data: DataView): { cbor: CBOR, len: number } {
  if (data.byteLength < 1) {
    throw new Error("Underrun");
  }
  let { majorType, value, varIntLen } = parseHeaderVarint(data);
  switch (majorType) {
    case MajorType.Unsigned:
      return { cbor: { isCBOR: true, type: CBORType.Unsigned, value: value }, len: varIntLen };
    case MajorType.Negative:
      if (typeof value === 'bigint') {
        if (value == 18446744073709551615n) {
          return { cbor: { isCBOR: true, type: CBORType.Negative, value: -9223372036854775808n }, len: varIntLen };
        } else {
          return { cbor: { isCBOR: true, type: CBORType.Negative, value: -value - 1n }, len: varIntLen };
        }
      } else if (typeof value == 'number') {
        return { cbor: { isCBOR: true, type: CBORType.Negative, value: -value - 1 }, len: varIntLen };
      }
    case MajorType.Bytes:
      let dataLen = value;
      if (typeof dataLen === 'bigint') {
        throw new Error("Value out of range")
      }
      let buf = parseBytes(from(data, varIntLen), dataLen);
      let bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return { cbor: { isCBOR: true, type: CBORType.Bytes, value: bytes }, len: varIntLen + dataLen };
    case MajorType.Text:
      let textLen = value;
      if (typeof textLen === 'bigint') {
        throw new Error("Value out of range")
      }
      let textBuf = parseBytes(from(data, varIntLen), textLen);
      let text = new TextDecoder().decode(textBuf);
      return { cbor: { isCBOR: true, type: CBORType.Text, value: text }, len: varIntLen + textLen };
    case MajorType.Array:
      let pos = varIntLen;
      let items: CBOR[] = [];
      for (let i = 0; i < value; i++) {
        let { cbor: item, len: itemLen } = decodeCBORInternal(from(data, pos));
        items.push(item);
        pos += itemLen;
      }
      return { cbor: { isCBOR: true, type: CBORType.Array, value: items }, len: pos };
    case MajorType.Map:
      throw new Error("TODO");
    case MajorType.Tagged:
      let { cbor: item, len: itemLen } = decodeCBORInternal(from(data, varIntLen));
      return { cbor: { isCBOR: true, type: CBORType.Tagged, tag: value, value: item }, len: varIntLen + itemLen };
    case MajorType.Simple:
      switch (varIntLen) {
        case 3:
          // 16-bit float
          throw new Error("TODO");
        case 5:
          // 32-bit float
          throw new Error("TODO");
        case 9:
          // 64-bit float
          throw new Error("TODO");
        default:
          switch (value) {
            case 20:
              return { cbor: CBOR.false, len: varIntLen };
            case 21:
              return { cbor: CBOR.true, len: varIntLen };
            case 22:
              return { cbor: CBOR.null, len: varIntLen };
            default:
              return { cbor: { isCBOR: true, type: CBORType.Simple, value: value }, len: varIntLen };
          }
      }
  }
  throw new Error("Not implemented");
}
