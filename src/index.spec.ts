import { CBORNumber, isCBORNumber } from "./cbor";
import { MajorType, encodeVarInt, decodeVarInt } from "./varint";

function hexToBytes(hexString: string): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function testEncodeDecode(majorType: MajorType, value: CBORNumber, expectedHex: string) {
  const expectedBytes = hexToBytes(expectedHex);
  const encodedBytes = encodeVarInt(majorType, value);
  console.log(bytesToHex(encodedBytes));

  expect(encodedBytes).toEqual(expectedBytes);
  const decoded = decodeVarInt(encodedBytes);

  let expectedValue = value;
  if (isCBORNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
    expectedValue = Number(value);
  }
  expect(decoded).toEqual({ majorType, value: expectedValue, offset: expectedBytes.length });
}

function testEncodeDecodeUnsigned(value: CBORNumber, expectedHex: string) {
  testEncodeDecode(MajorType.Unsigned, value, expectedHex);
}

test('encodes and decodes unsigned', () => {
  testEncodeDecodeUnsigned(0, "00");
  testEncodeDecodeUnsigned(0n, "00");
  testEncodeDecodeUnsigned(1, "01");
  testEncodeDecodeUnsigned(1n, "01");
  testEncodeDecodeUnsigned(23, "17");
  testEncodeDecodeUnsigned(23n, "17");
  testEncodeDecodeUnsigned(24, "1818");
  testEncodeDecodeUnsigned(24n, "1818");
  testEncodeDecodeUnsigned(255, "18ff");
  testEncodeDecodeUnsigned(255n, "18ff");
  testEncodeDecodeUnsigned(65535, "19ffff");
  testEncodeDecodeUnsigned(65535n, "19ffff");
  testEncodeDecodeUnsigned(65536, "1a00010000");
  testEncodeDecodeUnsigned(65536n, "1a00010000");
  testEncodeDecodeUnsigned(4294967295, "1affffffff");
  testEncodeDecodeUnsigned(4294967295n, "1affffffff");
  testEncodeDecodeUnsigned(4294967296, "1b0000000100000000");
  testEncodeDecodeUnsigned(4294967296n, "1b0000000100000000");
  testEncodeDecodeUnsigned(18446744073709551615n, "1bffffffffffffffff");
});
