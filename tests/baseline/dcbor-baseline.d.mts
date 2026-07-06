/**
 * Type shim for the frozen pre-redesign baseline bundle (see README.md).
 *
 * Only the members the differential harness's adapter touches are declared.
 * These signatures are FROZEN with the bundle: the baseline never changes
 * (except at a deliberate P4.1 re-baseline), so this file never drifts.
 */

export declare function cborData(value: unknown): Uint8Array;
export declare function decodeCbor(data: Uint8Array): unknown;
export declare function cbor(value: unknown): unknown;
export declare const CborMap: new () => { set(key: unknown, value: unknown): void };
export declare const CborSet: { fromArray(items: unknown[]): unknown };
export declare const CborDate: {
  fromTimestamp(secondsSinceUnixEpoch: number): unknown;
  fromString(value: string): unknown;
};
export declare const ByteString: new (data: Uint8Array) => unknown;
export declare function toTaggedValue(tag: number | bigint, item: unknown): unknown;
export declare function biguintToCbor(value: bigint): unknown;
export declare function bigintToCbor(value: bigint): unknown;
export declare function hexToBytes(hex: string): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
