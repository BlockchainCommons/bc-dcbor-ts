import { CborNumber, MajorType, isCborNumber } from "./cbor";
import { hexToBytes } from "./data-utils";
import { encodeVarInt, decodeVarInt } from "./varint";


function testEncodeDecode(majorType: MajorType, value: CborNumber, expectedHex: string) {
  const expectedBytes = hexToBytes(expectedHex);
  const encodedBytes = encodeVarInt(majorType, value);

  expect(encodedBytes).toEqual(expectedBytes);
  const decoded = decodeVarInt(encodedBytes);

  let expectedValue = value;
  if (isCborNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
    expectedValue = Number(value);
  }
  expect(decoded).toEqual({ majorType, value: expectedValue, offset: expectedBytes.length });
}

function testEncodeDecodeUnsigned(value: CborNumber, expectedHex: string) {
  testEncodeDecode(MajorType.Unsigned, value, expectedHex);
}

describe('encodes and decodes varints', () => {
  test('encodes and decodes one byte encodings', () => {
    testEncodeDecodeUnsigned(0, "00");
    testEncodeDecodeUnsigned(0n, "00");
    testEncodeDecodeUnsigned(1, "01");
    testEncodeDecodeUnsigned(1n, "01");
    testEncodeDecodeUnsigned(23, "17");
    testEncodeDecodeUnsigned(23n, "17");
  });

  test('encodes and decodes two byte encodings', () => {
    testEncodeDecodeUnsigned(24, "1818");
    testEncodeDecodeUnsigned(24n, "1818");
    testEncodeDecodeUnsigned(255, "18ff");
    testEncodeDecodeUnsigned(255n, "18ff");
  });

  test('encodes and decodes three byte encodings', () => {
    testEncodeDecodeUnsigned(65535, "19ffff");
    testEncodeDecodeUnsigned(65535n, "19ffff");
  });

  test('encodes and decodes five byte encodings', () => {
    testEncodeDecodeUnsigned(65536, "1a00010000");
    testEncodeDecodeUnsigned(65536n, "1a00010000");
    testEncodeDecodeUnsigned(4294967295, "1affffffff");
    testEncodeDecodeUnsigned(4294967295n, "1affffffff");
  });

  test('encodes and decodes nine byte encodings', () => {
    testEncodeDecodeUnsigned(4294967296, "1b0000000100000000");
    testEncodeDecodeUnsigned(4294967296n, "1b0000000100000000");
    testEncodeDecodeUnsigned(18446744073709551615n, "1bffffffffffffffff");
  });
});
