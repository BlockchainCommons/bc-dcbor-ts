import { CBOR, CBORType, CBORTagged, CBORArray, isCBORNumber, CBORNumber, isCBOR, isCBORFloat } from "./cbor";
import { concatUint8Arrays } from "./data-utils";
import { hasFractionalPart, numberToBinary } from "./float";
import { MajorType, encodeBitPattern, encodeVarInt } from "./varint";

export interface ToCBOR {
  toCBOR(): CBOR;
}

export function cbor(value: any): CBOR {
  if (isCBOR(value)) {
    return value;
  }

  if (isCBORNumber(value)) {
    if (typeof value === 'number' && hasFractionalPart(value)) {
      return { isCBOR: true, type: CBORType.Simple, value: { float: value } };
    } else if (value < 0) {
      return { isCBOR: true, type: CBORType.Negative, value: value };
    } else {
      return { isCBOR: true, type: CBORType.Unsigned, value: value };
    }
  } else if (typeof value === 'string') {
    return { isCBOR: true, type: CBORType.Text, value: value };
  } else if (value === null) {
    return CBOR.null;
  } else if (value === true) {
    return CBOR.true;
  } else if (value === false) {
    return CBOR.false;
  } else if (Array.isArray(value)) {
    return { isCBOR: true, type: CBORType.Array, value: value.map(cbor) };
  } else if (value instanceof Uint8Array) {
    return { isCBOR: true, type: CBORType.Bytes, value: value };
  } else if (value instanceof Map) {
    return { isCBOR: true, type: CBORType.Map, value: new Map(Array.from(value.entries()).map(([k, v]) => [cbor(k), cbor(v)])) };
  } else if ('toCBOR' in value && typeof value.toCBOR === 'function') {
    return value.toCBOR();
  }

  throw new Error("Not supported");
}

export function cborData(cbor: CBOR): Uint8Array {
  switch (cbor.type) {
    case CBORType.Unsigned:
      return encodeVarInt(MajorType.Unsigned, cbor.value);
    case CBORType.Negative:
      if (typeof cbor.value === 'bigint') {
        return encodeVarInt(MajorType.Negative, -cbor.value - 1n);
      } else if (typeof cbor.value === 'number') {
        return encodeVarInt(MajorType.Negative, -cbor.value - 1);
      }
      break;
    case CBORType.Bytes:
      if (cbor.value instanceof Uint8Array) {
        const lengthBytes = encodeVarInt(MajorType.Bytes, cbor.value.length);
        return new Uint8Array([...lengthBytes, ...cbor.value]);
      }
      break;
    case CBORType.Text:
      if (typeof cbor.value === 'string') {
        const utf8Bytes = new TextEncoder().encode(cbor.value);
        const lengthBytes = encodeVarInt(MajorType.Text, utf8Bytes.length);
        return new Uint8Array([...lengthBytes, ...utf8Bytes]);
      }
      break;
    case CBORType.Tagged:
      const tagged = cbor as CBORTagged;
      if (typeof tagged.tag === 'bigint' || typeof tagged.tag === 'number') {
        const tagBytes = encodeVarInt(MajorType.Tagged, tagged.tag);
        const valueBytes = cborData(tagged.value);
        return new Uint8Array([...tagBytes, ...valueBytes]);
      }
      break;
    case CBORType.Simple:
      if (isCBORNumber(cbor.value)) {
        return encodeVarInt(MajorType.Simple, cbor.value);
      } else if (isCBORFloat(cbor.value)) {
        return encodeBitPattern(MajorType.Simple, numberToBinary(cbor.value.float));
      }
      break;
    case CBORType.Array:
      const array = cbor as CBORArray;
      const arrayBytes = array.value.map(cborData);
      const flatArrayBytes = concatUint8Arrays(arrayBytes)
      const lengthBytes = encodeVarInt(MajorType.Array, array.value.length);
      return new Uint8Array([...lengthBytes, ...flatArrayBytes]);
    case CBORType.Map:
      throw new Error("Unimplemented");
  }
  throw new Error("Invalid CBOR");
}

export function encodeCBOR(value: any): Uint8Array {
  return cborData(cbor(value));
}

export function taggedCBOR(tag: CBORNumber, value: any): CBOR {
  return {
    isCBOR: true,
    type: CBORType.Tagged,
    tag: tag,
    value: cbor(value),
  };
}
