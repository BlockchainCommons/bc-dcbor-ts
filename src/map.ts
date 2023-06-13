import { SortedMap } from 'collections/sorted-map';
import { Cbor } from './cbor';
import { cbor, cborData, encodeCbor } from './encode';
import { areBytesEqual, bytesToHex, lexicographicallyCompareBytes } from './data-utils';
import { cborDebug, cborDiagnostic } from './debug';
import { extractCbor } from './extract';

type MapKey = Uint8Array;
export type MapEntry = { key: Cbor, value: Cbor };

export class CborMap {
  private dict: SortedMap<MapKey, MapEntry>;

  constructor(map?: Map<any, any>) {
    this.dict = new SortedMap(null, areBytesEqual, lexicographicallyCompareBytes);

    if (map !== undefined) {
      for (let [key, value] of map.entries()) {
        this.set(key, value);
      }
    }
  }

  set<K, V>(key: K, value: V): void {
    let keyCbor = cbor(key);
    let valueCbor = cbor(value);
    let keyData = cborData(keyCbor);
    this.dict.set(keyData, { key: keyCbor, value: valueCbor });
  }

  private makeKey<K>(key: K): MapKey {
    let keyCbor = cbor(key);
    return cborData(keyCbor);
  }

  get<K, V>(key: K): V | undefined {
    let keyData = this.makeKey(key);
    let value = this.dict.get(keyData);
    if (value === undefined) {
      return undefined;
    }
    return value.value.value as V;
  }

  delete<K>(key: K): void {
    let keyData = this.makeKey(key);
    this.dict.delete(keyData);
  }

  get length(): number {
    return this.dict.length;
  }

  get entries(): MapEntry[] {
    return this.dict.map((value, key) => ({ key: value.key, value: value.value }));
  }

  setNext<K, V>(key: K, value: V): void {
    const lastEntry = this.dict.max();
    if (lastEntry === undefined) {
      this.set(key, value);
      return;
    }
    const keyCbor = cbor(key);
    const newKey = cborData(keyCbor);
    if (this.dict.has(newKey)) {
      throw new Error('duplicate map key');
    }
    const lastEntryKey = this.makeKey(lastEntry.key);
    if(lexicographicallyCompareBytes(newKey, lastEntryKey) <= 0) {
      throw new Error('map keys must be in ascending order');
    }
    this.dict.set(newKey, { key: keyCbor, value: cbor(value) });
  }

  get debug(): string {
    return `map({${this.entries.map(CborMap.entryDebug).join(', ')}})`;
  }

  get diagnostic(): string {
    return `{${this.entries.map(CborMap.entryDiagnostic).join(', ')}}`;
  }

  private static entryDebug(entry: MapEntry): string {
    return `0x${bytesToHex(encodeCbor(entry.key))}: (${cborDebug(entry.key)}, ${cborDebug(entry.value)})`;
  }

  private static entryDiagnostic(entry: MapEntry): string {
    return `${cborDiagnostic(entry.key)}: ${cborDiagnostic(entry.value)}`;
  }

  toMap<K, V>(): Map<K, V> {
    const map = new Map<K, V>();
    for (let entry of this.entries) {
      map.set(extractCbor(entry.key) as K, extractCbor(entry.value) as V);
    }
    return map;
  }
}
