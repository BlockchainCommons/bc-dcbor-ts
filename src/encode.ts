import { Cbor, MajorType, CborTaggedType, CborArrayType, isCborNumber, CborNumber, isCbor, isCborFloat, CborMapType } from "./cbor";
import { concatBytes } from "./data-utils";
import { hasFractionalPart, numberToBinary } from "./float";
import { CborMap } from "./map";
import { encodeBitPattern, encodeVarInt } from "./varint";

export interface ToCbor {
  toCbor(): Cbor;
}

export function cbor(value: Cbor | any): Cbor {
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
  } else if (value instanceof CborMap) {
    return { isCbor: true, type: MajorType.Map, value: value };
  } else if (value instanceof Map) {
    return { isCbor: true, type: MajorType.Map, value: new CborMap(value) };
  } else if ('toCbor' in value && typeof value.toCbor === 'function') {
    return value.toCbor();
  }

  throw new Error("Not supported");
}

export function cborData(value: any): Uint8Array {
  const c = cbor(value);
  switch (c.type) {
    case MajorType.Unsigned: {
      return encodeVarInt(MajorType.Unsigned, c.value);
    } case MajorType.Negative: {
      if (typeof c.value === 'bigint') {
        return encodeVarInt(MajorType.Negative, -c.value - 1n);
      } else if (typeof c.value === 'number') {
        return encodeVarInt(MajorType.Negative, -c.value - 1);
      }
      break;
    } case MajorType.Bytes: {
      if (c.value instanceof Uint8Array) {
        const lengthBytes = encodeVarInt(MajorType.Bytes, c.value.length);
        return new Uint8Array([...lengthBytes, ...c.value]);
      }
      break;
    } case MajorType.Text: {
      if (typeof c.value === 'string') {
        const utf8Bytes = new TextEncoder().encode(c.value);
        const lengthBytes = encodeVarInt(MajorType.Text, utf8Bytes.length);
        return new Uint8Array([...lengthBytes, ...utf8Bytes]);
      }
      break;
    } case MajorType.Tagged: {
      const tagged = c as CborTaggedType;
      if (typeof tagged.tag === 'bigint' || typeof tagged.tag === 'number') {
        const tagBytes = encodeVarInt(MajorType.Tagged, tagged.tag);
        const valueBytes = cborData(tagged.value);
        return new Uint8Array([...tagBytes, ...valueBytes]);
      }
      break;
    } case MajorType.Simple: {
      if (isCborNumber(c.value)) {
        return encodeVarInt(MajorType.Simple, c.value);
      } else if (isCborFloat(c.value)) {
        return encodeBitPattern(MajorType.Simple, numberToBinary(c.value.float));
      }
      break;
    } case MajorType.Array: {
      const array = c as CborArrayType;
      const arrayBytes = array.value.map(cborData);
      const flatArrayBytes = concatBytes(arrayBytes)
      const lengthBytes = encodeVarInt(MajorType.Array, array.value.length);
      return new Uint8Array([...lengthBytes, ...flatArrayBytes]);
    } case MajorType.Map: {
      let map = c as CborMapType;
      let entries = map.value.entries;
      const arrayBytes = entries.map(({key, value}) => concatBytes([cborData(key), cborData(value)]));
      const flatArrayBytes = concatBytes(arrayBytes)
      const lengthBytes = encodeVarInt(MajorType.Map, entries.length);
      return new Uint8Array([...lengthBytes, ...flatArrayBytes]);
    }
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
