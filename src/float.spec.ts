import { bytesToHex } from "./data-utils";
import { binary16ToNumber, binary32ToNumber, binary64ToNumber, binaryToNumber, numberToBinary, numberToBinary16, numberToBinary32, numberToBinary64 } from "./float";

describe('encodes and decodes floats', () => {
  test('encodes and decodes 1.2, 64-bit', () => {
    let value = 1.2;
    let encoded = numberToBinary64(value);
    expect(bytesToHex(encoded)).toEqual("3ff3333333333333");
    let decoded = binary64ToNumber(encoded);
    expect(decoded).toEqual(value);
  });

  test('encodes and decodes 2345678.25, 32-bit', () => {
    let value = 2345678.25;
    let encoded = numberToBinary32(value);
    expect(bytesToHex(encoded)).toEqual("4a0f2b39");
    let decoded = binary32ToNumber(encoded);
    expect(decoded).toEqual(value);
  });

  test('encodes and decodes 1.5, 16-bit', () => {
    let value = 1.5;
    let encoded = numberToBinary16(value);
    expect(bytesToHex(encoded)).toEqual("3e00");
    let decoded = binary16ToNumber(encoded);
    expect(decoded).toEqual(value);
  });
});

describe('encodes and decodes minimal floats', () => {
  test('encodes and decodes 1.2, 64-bit', () => {
    let value = 1.2;
    let encoded = numberToBinary(value);
    expect(bytesToHex(encoded)).toEqual("3ff3333333333333");
    let decoded = binaryToNumber(encoded);
    expect(decoded).toEqual(value);
  });

  test('encodes and decodes 2345678.25, 32-bit', () => {
    let value = 2345678.25;
    let encoded = numberToBinary(value);
    expect(bytesToHex(encoded)).toEqual("4a0f2b39");
    let decoded = binaryToNumber(encoded);
    expect(decoded).toEqual(value);
  });

  test('encodes and decodes 1.5, 16-bit', () => {
    let value = 1.5;
    let encoded = numberToBinary(value);
    expect(bytesToHex(encoded)).toEqual("3e00");
    let decoded = binaryToNumber(encoded);
    expect(decoded).toEqual(value);
  });
});
