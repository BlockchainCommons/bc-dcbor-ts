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

export function isCBORNumber(value: any): value is CBORNumber {
  return typeof value === 'number' || typeof value === 'bigint';
}

export type CBORUnsigned = { type: CBORType.Unsigned, value: CBORNumber };
export type CBORNegative = { type: CBORType.Negative, value: CBORNumber };
export type CBORBytes = { type: CBORType.Bytes, value: Uint8Array };
export type CBORText = { type: CBORType.Text, value: string };
export type CBORArray = { type: CBORType.Array, value: CBOR[] };
export type CBORMap = { type: CBORType.Map, value: Map<CBOR, CBOR> };
export type CBORTagged = { type: CBORType.Tagged, tag: CBORNumber, value: CBOR };
export type CBORSimple = { type: CBORType.Simple, value: CBORNumber };

export type CBOR = CBORUnsigned |
  CBORNegative | CBORBytes | CBORText |
  CBORArray | CBORMap | CBORTagged |
  CBORSimple;

export const CBOR = {
  // The CBOR symbolic value for `false`.
  false: { type: CBORType.Simple, value: 20 } as CBOR,
  // The CBOR symbolic value for `true`.
  true: { type: CBORType.Simple, value: 21 } as CBOR,
  // The CBOR symbolic value for `null`.
  null: { type: CBORType.Simple, value: 22 } as CBOR,
};

/*```swift
public extension CBOR {
    /// The CBOR symbolic value for `false`.
    static let `false` = Bool.cborFalse
    /// The CBOR symbolic value for `true`.
    static let `true` = Bool.cborTrue
    /// The CBOR symbolic value for `null` (`nil`).
    static var null = Simple.null.cbor
}
```*/
