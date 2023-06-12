export enum CBORType {
  Unsigned,
  Negative,
  Bytes,
  Text,
  Array,
  Map,
  Tagged,
  Simple,
}

export type CBORNumber = number | bigint;
export type CBORFloat = { float: number };

export function isCBORNumber(value: any): value is CBORNumber {
  return typeof value === 'number' || typeof value === 'bigint';
}

export function isCBOR(value: any): boolean {
  return value && typeof value === 'object' && 'isCBOR' in value && value.isCBOR === true;
}

export function isCBORFloat(value: any): value is CBORFloat {
  return value && typeof value === 'object' && 'float' in value && typeof value.float === 'number';
}

export type CBORUnsigned = { isCBOR: true, type: CBORType.Unsigned, value: CBORNumber };
export type CBORNegative = { isCBOR: true, type: CBORType.Negative, value: CBORNumber };
export type CBORBytes = { isCBOR: true, type: CBORType.Bytes, value: Uint8Array };
export type CBORText = { isCBOR: true, type: CBORType.Text, value: string };
export type CBORArray = { isCBOR: true, type: CBORType.Array, value: CBOR[] };
export type CBORMap = { isCBOR: true, type: CBORType.Map, value: Map<CBOR, CBOR> };
export type CBORTagged = { isCBOR: true, type: CBORType.Tagged, tag: CBORNumber, value: CBOR };
export type CBORSimple = { isCBOR: true, type: CBORType.Simple, value: CBORNumber | CBORFloat };

export type CBOR = CBORUnsigned |
  CBORNegative | CBORBytes | CBORText |
  CBORArray | CBORMap | CBORTagged |
  CBORSimple;

export const CBOR = {
  // The CBOR symbolic value for `false`.
  false: { isCBOR: true, type: CBORType.Simple, value: 0x14 } as CBORSimple,
  // The CBOR symbolic value for `true`.
  true: { isCBOR: true, type: CBORType.Simple, value: 0x15 } as CBORSimple,
  // The CBOR symbolic value for `null`.
  null: { isCBOR: true, type: CBORType.Simple, value: 0x16 } as CBORSimple,
};
