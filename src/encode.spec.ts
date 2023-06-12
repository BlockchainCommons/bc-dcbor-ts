import { cborDebug, cborDiagnostic } from "./debug";
import { cbor, cborData, taggedCBOR } from "./encode";
import { hexToBytes } from "./data-utils";

function testEncodeDecode(value: any, expectedDebug: string, expectedDiagnostic: string, expectedHex: string) {
  const c = cbor(value);

  expect(cborDebug(c)).toEqual(expectedDebug);
  expect(cborDiagnostic(c)).toEqual(expectedDiagnostic);

  const expectedBytes = hexToBytes(expectedHex);
  const encodedBytes = cborData(c);
  expect(encodedBytes).toEqual(expectedBytes);
}

describe('encodes and decodes simple values', () => {
  test('encodes and decodes false', () => {
    testEncodeDecode(false, 'simple(false)', 'false', 'f4');
  });

  test('encodes and decodes true', () => {
    testEncodeDecode(true, 'simple(true)', 'true', 'f5');
  });

  test('encodes and decodes null', () => {
    testEncodeDecode(null, 'simple(null)', 'null', 'f6');
  });
});

describe('encodes and decodes unsigned', () => {
  test('encodes and decodes zero', () => {
    testEncodeDecode(0, 'unsigned(0)', '0', '00');
    testEncodeDecode(0.0, 'unsigned(0)', '0', '00');
  });

  test('encodes and decodes one', () => {
    testEncodeDecode(1, 'unsigned(1)', '1', '01');
    testEncodeDecode(1.0, 'unsigned(1)', '1', '01');
  });

  test('encodes and decodes 23 and 24', () => {
    testEncodeDecode(23, 'unsigned(23)', '23', '17');
    testEncodeDecode(24, 'unsigned(24)', '24', '1818');
  });

  test('encodes and decodes 127 and 255', () => {
    testEncodeDecode(127, 'unsigned(127)', '127', '187f');
    testEncodeDecode(255, 'unsigned(255)', '255', '18ff');
  });

  test('encodes and decodes 32767, 65535 and 65536', () => {
    testEncodeDecode(32767, 'unsigned(32767)', '32767', '197fff');
    testEncodeDecode(65535, 'unsigned(65535)', '65535', '19ffff');
    testEncodeDecode(65536, 'unsigned(65536)', '65536', '1a00010000');
  });

  test('encodes and decodes 2147483647, 4294967295 and 4294967296', () => {
    testEncodeDecode(2147483647, 'unsigned(2147483647)', '2147483647', '1a7fffffff');
    testEncodeDecode(4294967295, 'unsigned(4294967295)', '4294967295', '1affffffff');
    testEncodeDecode(4294967296, 'unsigned(4294967296)', '4294967296', '1b0000000100000000');
  });

  test('encodes and decodes 18446744073709551615 and 9223372036854775807', () => {
    testEncodeDecode(18446744073709551615n, 'unsigned(18446744073709551615)', '18446744073709551615', '1bffffffffffffffff');
    testEncodeDecode(9223372036854775807n, 'unsigned(9223372036854775807)', '9223372036854775807', '1b7fffffffffffffff');
  });
});

describe('encodes and decodes negative', () => {
  test('encodes and decodes negative zero', () => {
    testEncodeDecode(-0, 'unsigned(0)', '0', '00');
    testEncodeDecode(-0.0, 'unsigned(0)', '0', '00');
  });

  test('encodes and decodes -1 and -2', () => {
    testEncodeDecode(-1, 'negative(-1)', '-1', '20');
    testEncodeDecode(-2, 'negative(-2)', '-2', '21');
  });

  test('encodes and decodes -127 and -128', () => {
    testEncodeDecode(-127, 'negative(-127)', '-127', '387e');
    testEncodeDecode(-128, 'negative(-128)', '-128', '387f');
  });

  test('encodes and decodes -32768 and -2147483648', () => {
    testEncodeDecode(-32768, 'negative(-32768)', '-32768', '397fff');
    testEncodeDecode(-2147483648, 'negative(-2147483648)', '-2147483648', '3a7fffffff');
  });

  test('encodes and decodes -9223372036854775808', () => {
    testEncodeDecode(-9223372036854775808n, 'negative(-9223372036854775808)', '-9223372036854775808', '3b7fffffffffffffff');
  });
});

describe('encodes and decodes various', () => {
  test('encodes and decodes array', () => {
    testEncodeDecode([1, 2, 3], 'array([unsigned(1), unsigned(2), unsigned(3)])', '[1, 2, 3]', '83010203');
    testEncodeDecode([1, -2, 3], 'array([unsigned(1), negative(-2), unsigned(3)])', '[1, -2, 3]', '83012103');
  });

  test('encodes and decodes short bytestring', () => {
    testEncodeDecode(hexToBytes('112233'), 'bytes(112233)', "h'112233'", '43112233');
  });

  test('encodes and decodes long bytestring', () => {
    testEncodeDecode(
      hexToBytes('c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'),
      'bytes(c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7)',
      "h'c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'",
      '5820c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'
    );
  });

  test('encodes and decodes a string', () => {
    testEncodeDecode('Hello', 'text("Hello")', '"Hello"', '6548656c6c6f');
  });

  test('encodes and decodes a tagged value', () => {
    const tagged = taggedCBOR(1, "Hello");
    testEncodeDecode(tagged, 'tagged(1, text("Hello"))', '1("Hello")', 'c16548656c6c6f');
  });
});
