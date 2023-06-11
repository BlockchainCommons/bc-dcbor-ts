import { CBOR, CBORType, CBORTagged, CBORArray, isCBORNumber } from "./cbor";
import { MajorType, encodeVarInt } from "./varint";

export function cbor(value: any): CBOR {
  if (isCBORNumber(value)) {
    if (value < 0) {
      return { type: CBORType.Negative, value: value };
    } else {
      return { type: CBORType.Unsigned, value: value };
    }
  } else if (typeof value === 'string') {
    return { type: CBORType.Text, value: value };
  } else if (value === null) {
    return CBOR.null;
  } else if (value === true) {
    return CBOR.true;
  } else if (value === false) {
    return CBOR.false;
  } else if (Array.isArray(value)) {
    return { type: CBORType.Array, value: value.map(cbor) };
  } else if (value instanceof Uint8Array) {
    return { type: CBORType.Bytes, value: value };
  } else if (value instanceof Map) {
    return { type: CBORType.Map, value: new Map(Array.from(value.entries()).map(([k, v]) => [cbor(k), cbor(v)])) };
  }
  throw new Error("Not supported");
}

export function cborData(cbor: CBOR): Uint8Array {
  switch (cbor.type) {
    case CBORType.Unsigned:
      return encodeVarInt(MajorType.Unsigned, cbor.value);
    case CBORType.Negative:
      if (typeof cbor.value === 'bigint') {
        return encodeVarInt(MajorType.Negative, 1n - cbor.value);
      } else if (typeof cbor.value === 'number') {
        return encodeVarInt(MajorType.Negative, 1 - cbor.value);
      }
    case CBORType.Bytes:
      if (cbor.value instanceof Uint8Array) {
        const lengthBytes = encodeVarInt(MajorType.Bytes, cbor.value.length);
        return new Uint8Array([...lengthBytes, ...cbor.value]);
      }
    case CBORType.Text:
      if (typeof cbor.value === 'string') {
        const utf8Bytes = new TextEncoder().encode(cbor.value);
        const lengthBytes = encodeVarInt(MajorType.Text, utf8Bytes.length);
        return new Uint8Array([...lengthBytes, ...utf8Bytes]);
      }
    case CBORType.Tagged:
      const tagged = cbor as CBORTagged;
      if (typeof tagged.tag === 'bigint' || typeof tagged.tag === 'number') {
        const tagBytes = encodeVarInt(MajorType.Tagged, tagged.tag);
        const valueBytes = cborData(tagged.value);
        return new Uint8Array([...tagBytes, ...valueBytes]);
      }
    case CBORType.Simple:
      if (isCBORNumber(cbor.value)) {
        return encodeVarInt(MajorType.Simple, cbor.value);
      }
    case CBORType.Array:
      const array = cbor as CBORArray;
      const arrayBytes = array.value.map(cborData);
      const flatArrayBytes = arrayBytes.flat();
      const lengthBytes = encodeVarInt(MajorType.Array, array.value.length);
      return new Uint8Array([...lengthBytes, ...flatArrayBytes[0]]);
    case CBORType.Map:
      throw new Error("Unimplemented");
  }
}
