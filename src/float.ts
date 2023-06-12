import * as byteData from "byte-data";

export function numberToBinary64(n: number): Uint8Array {
  var data = new Uint8Array(8);
  byteData.packTo(n, { bits: 64, fp: true, be: true }, data);
  return data;
}

export function binary64ToNumber(data: Uint8Array): number {
  return byteData.unpack(data, { bits: 64, fp: true, be: true });
}

export function numberToBinary32(n: number): Uint8Array {
  var data = new Uint8Array(4);
  byteData.packTo(n, { bits: 32, fp: true, be: true }, data);
  return data;
}

export function binary32ToNumber(data: Uint8Array): number {
  return byteData.unpack(data, { bits: 32, fp: true, be: true });
}

export function numberToBinary16(n: number): Uint8Array {
  var data = new Uint8Array(2);
  byteData.packTo(n, { bits: 16, fp: true, be: true }, data);
  return data;
}

export function binary16ToNumber(data: Uint8Array): number {
  return byteData.unpack(data, { bits: 16, fp: true, be: true });
}
