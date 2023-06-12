import { Cbor, MajorType, CborTagged, CborArray, isCborNumber, CborNumber, isCbor, isCborFloat } from "./cbor";
import { concatUint8Arrays } from "./data-utils";
import { hasFractionalPart, numberToBinary } from "./float";
import { encodeBitPattern, encodeVarInt } from "./varint";

export interface ToCbor {
  toCbor(): Cbor;
}

export function cbor(value: any): Cbor {
  if (isCbor(value)) {
    return value;
  }

  if (isCborNumber(value)) {
    if (typeof value === 'number' && isNaN(value)) {
      return { isCbor: true, type: MajorType.Simple, value: { float: NaN } };
    } else if (typeof value === 'number' && hasFractionalPart(value)) {
      return { isCbor: true, type: MajorType.Simple, value: { float: value } };
    } else if (value == Infinity) {
      return { isCbor: true, type: MajorType.Simple, value: { float: Infinity } };
    } else if (value == -Infinity) {
      return { isCbor: true, type: MajorType.Simple, value: { float: -Infinity } };
    } else if (value < 0) {
      return { isCbor: true, type: MajorType.Negative, value: value };
    } else {
      return { isCbor: true, type: MajorType.Unsigned, value: value };
    }
  } else if (typeof value === 'string') {
    return { isCbor: true, type: MajorType.Text, value: value };
  } else if (value === null) {
    return Cbor.null;
  } else if (value === true) {
    return Cbor.true;
  } else if (value === false) {
    return Cbor.false;
  } else if (Array.isArray(value)) {
    return { isCbor: true, type: MajorType.Array, value: value.map(cbor) };
  } else if (value instanceof Uint8Array) {
    return { isCbor: true, type: MajorType.Bytes, value: value };
  } else if (value instanceof Map) {
    return { isCbor: true, type: MajorType.Map, value: new Map(Array.from(value.entries()).map(([k, v]) => [cbor(k), cbor(v)])) };
  } else if ('toCbor' in value && typeof value.toCbor === 'function') {
    return value.toCbor();
  }

  throw new Error("Not supported");
}

export function cborData(cbor: Cbor): Uint8Array {
  switch (cbor.type) {
    case MajorType.Unsigned:
      return encodeVarInt(MajorType.Unsigned, cbor.value);
    case MajorType.Negative:
      if (typeof cbor.value === 'bigint') {
        return encodeVarInt(MajorType.Negative, -cbor.value - 1n);
      } else if (typeof cbor.value === 'number') {
        return encodeVarInt(MajorType.Negative, -cbor.value - 1);
      }
      break;
    case MajorType.Bytes:
      if (cbor.value instanceof Uint8Array) {
        const lengthBytes = encodeVarInt(MajorType.Bytes, cbor.value.length);
        return new Uint8Array([...lengthBytes, ...cbor.value]);
      }
      break;
    case MajorType.Text:
      if (typeof cbor.value === 'string') {
        const utf8Bytes = new TextEncoder().encode(cbor.value);
        const lengthBytes = encodeVarInt(MajorType.Text, utf8Bytes.length);
        return new Uint8Array([...lengthBytes, ...utf8Bytes]);
      }
      break;
    case MajorType.Tagged:
      const tagged = cbor as CborTagged;
      if (typeof tagged.tag === 'bigint' || typeof tagged.tag === 'number') {
        const tagBytes = encodeVarInt(MajorType.Tagged, tagged.tag);
        const valueBytes = cborData(tagged.value);
        return new Uint8Array([...tagBytes, ...valueBytes]);
      }
      break;
    case MajorType.Simple:
      if (isCborNumber(cbor.value)) {
        return encodeVarInt(MajorType.Simple, cbor.value);
      } else if (isCborFloat(cbor.value)) {
        return encodeBitPattern(MajorType.Simple, numberToBinary(cbor.value.float));
      }
      break;
    case MajorType.Array:
      const array = cbor as CborArray;
      const arrayBytes = array.value.map(cborData);
      const flatArrayBytes = concatUint8Arrays(arrayBytes)
      const lengthBytes = encodeVarInt(MajorType.Array, array.value.length);
      return new Uint8Array([...lengthBytes, ...flatArrayBytes]);
    case MajorType.Map:
      throw new Error("Unimplemented");
  }
  throw new Error("Invalid CBOR");
}

export function encodeCbor(value: any): Uint8Array {
  return cborData(cbor(value));
}

export function taggedCbor(tag: CborNumber, value: any): Cbor {
  return {
    isCbor: true,
    type: MajorType.Tagged,
    tag: tag,
    value: cbor(value),
  };
}

export function simpleCborValue(value: CborNumber): Cbor {
  return {
    isCbor: true,
    type: MajorType.Simple,
    value: value,
  };
}
