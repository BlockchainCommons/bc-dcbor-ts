export enum MajorType {
  Unsigned = 0,
  Negative = 1,
  Bytes = 2,
  Text = 3,
  Array = 4,
  Map = 5,
  Tagged = 6,
  Simple = 7,
}

export type CborNumber = number | bigint;
export type CborFloat = { float: number };

export function isCborNumber(value: any): value is CborNumber {
  return typeof value === 'number' || typeof value === 'bigint';
}

export function isCbor(value: any): boolean {
  return value && typeof value === 'object' && 'isCbor' in value && value.isCbor === true;
}

export function isCborFloat(value: any): value is CborFloat {
  return value && typeof value === 'object' && 'float' in value && typeof value.float === 'number';
}

export type CborUnsigned = { isCbor: true, type: MajorType.Unsigned, value: CborNumber };
export type CborNegative = { isCbor: true, type: MajorType.Negative, value: CborNumber };
export type CborBytes = { isCbor: true, type: MajorType.Bytes, value: Uint8Array };
export type CborText = { isCbor: true, type: MajorType.Text, value: string };
export type CborArray = { isCbor: true, type: MajorType.Array, value: Cbor[] };
export type CborMap = { isCbor: true, type: MajorType.Map, value: Map<Cbor, Cbor> };
export type CborTagged = { isCbor: true, type: MajorType.Tagged, tag: CborNumber, value: Cbor };
export type CborSimple = { isCbor: true, type: MajorType.Simple, value: CborNumber | CborFloat };

export type Cbor = CborUnsigned |
  CborNegative | CborBytes | CborText |
  CborArray | CborMap | CborTagged |
  CborSimple;

export const Cbor = {
  // The CBOR symbolic value for `false`.
  false: { isCbor: true, type: MajorType.Simple, value: 0x14 } as CborSimple,
  // The CBOR symbolic value for `true`.
  true: { isCbor: true, type: MajorType.Simple, value: 0x15 } as CborSimple,
  // The CBOR symbolic value for `null`.
  null: { isCbor: true, type: MajorType.Simple, value: 0x16 } as CborSimple,
};
