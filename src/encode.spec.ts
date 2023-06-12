import { cborDebug, cborDiagnostic } from "./debug";
import { cbor, cborData, encodeCbor, taggedCbor } from "./encode";
import { bytesToHex, hexToBytes } from "./data-utils";
import { extractCbor, getCborInteger, getCborNumber } from "./extract";
import { decodeCbor } from "./decode";

function runEncode(value: any, expectedDebug: string, expectedDiagnostic: string, expectedHex: string): Uint8Array {
  const c = cbor(value);

  expect(cborDebug(c)).toEqual(expectedDebug);
  expect(cborDiagnostic(c)).toEqual(expectedDiagnostic);

  const expectedBytes = hexToBytes(expectedHex);
  const encodedBytes = cborData(c);
  expect(encodedBytes).toEqual(expectedBytes);
  return encodedBytes;
}

function runEncodeDecode(value: any, expectedDebug: string, expectedDiagnostic: string, expectedHex: string) {
  const encodedBytes = runEncode(value, expectedDebug, expectedDiagnostic, expectedHex)
  const decoded = extractCbor(encodedBytes);
  expect(decoded).toEqual(value);
}

describe('encodes and decodes simple values', () => {
  test('encodes and decodes false', () => {
    runEncodeDecode(false, 'simple(false)', 'false', 'f4');
  });

  test('encodes and decodes true', () => {
    runEncodeDecode(true, 'simple(true)', 'true', 'f5');
  });

  test('encodes and decodes null', () => {
    runEncodeDecode(null, 'simple(null)', 'null', 'f6');
  });
});

describe('encodes and decodes unsigned', () => {
  test('encodes and decodes zero', () => {
    runEncodeDecode(0, 'unsigned(0)', '0', '00');
    runEncodeDecode(0.0, 'unsigned(0)', '0', '00');
  });

  test('encodes and decodes one', () => {
    runEncodeDecode(1, 'unsigned(1)', '1', '01');
    runEncodeDecode(1.0, 'unsigned(1)', '1', '01');
  });

  test('encodes and decodes 23 and 24', () => {
    runEncodeDecode(23, 'unsigned(23)', '23', '17');
    runEncodeDecode(24, 'unsigned(24)', '24', '1818');
  });

  test('encodes and decodes 127 and 255', () => {
    runEncodeDecode(127, 'unsigned(127)', '127', '187f');
    runEncodeDecode(255, 'unsigned(255)', '255', '18ff');
  });

  test('encodes and decodes 32767, 65535 and 65536', () => {
    runEncodeDecode(32767, 'unsigned(32767)', '32767', '197fff');
    runEncodeDecode(65535, 'unsigned(65535)', '65535', '19ffff');
    runEncodeDecode(65536, 'unsigned(65536)', '65536', '1a00010000');
  });

  test('encodes and decodes 2147483647, 4294967295 and 4294967296', () => {
    runEncodeDecode(2147483647, 'unsigned(2147483647)', '2147483647', '1a7fffffff');
    runEncodeDecode(4294967295, 'unsigned(4294967295)', '4294967295', '1affffffff');
    runEncodeDecode(4294967296, 'unsigned(4294967296)', '4294967296', '1b0000000100000000');
  });

  test('encodes and decodes 18446744073709551615 and 9223372036854775807', () => {
    runEncodeDecode(18446744073709551615n, 'unsigned(18446744073709551615)', '18446744073709551615', '1bffffffffffffffff');
    runEncodeDecode(9223372036854775807n, 'unsigned(9223372036854775807)', '9223372036854775807', '1b7fffffffffffffff');
  });
});

describe('encodes and decodes negative', () => {
  // Negative zero encodes as zero
  test('encodes negative zero', () => {
    runEncode(-0, 'unsigned(0)', '0', '00');
    runEncode(-0.0, 'unsigned(0)', '0', '00');
  });

  test('encodes and decodes -1 and -2', () => {
    runEncodeDecode(-1, 'negative(-1)', '-1', '20');
    runEncodeDecode(-2, 'negative(-2)', '-2', '21');
  });

  test('encodes and decodes -127 and -128', () => {
    runEncodeDecode(-127, 'negative(-127)', '-127', '387e');
    runEncodeDecode(-128, 'negative(-128)', '-128', '387f');
  });

  test('encodes and decodes -32768 and -2147483648', () => {
    runEncodeDecode(-32768, 'negative(-32768)', '-32768', '397fff');
    runEncodeDecode(-2147483648, 'negative(-2147483648)', '-2147483648', '3a7fffffff');
  });

  test('encodes and decodes -9223372036854775808', () => {
    runEncodeDecode(-9223372036854775808n, 'negative(-9223372036854775808)', '-9223372036854775808', '3b7fffffffffffffff');
  });
});

describe('encodes and decodes various', () => {
  test('encodes and decodes array', () => {
    runEncodeDecode([1, 2, 3], 'array([unsigned(1), unsigned(2), unsigned(3)])', '[1, 2, 3]', '83010203');
    runEncodeDecode([1, -2, 3], 'array([unsigned(1), negative(-2), unsigned(3)])', '[1, -2, 3]', '83012103');
  });

  test('encodes and decodes short bytestring', () => {
    runEncodeDecode(hexToBytes('112233'), 'bytes(112233)', "h'112233'", '43112233');
  });

  test('encodes and decodes long bytestring', () => {
    runEncodeDecode(
      hexToBytes('c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'),
      'bytes(c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7)',
      "h'c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'",
      '5820c0a7da14e5847c526244f7e083d26fe33f86d2313ad2b77164233444423a50a7'
    );
  });

  test('encodes and decodes a string', () => {
    runEncodeDecode('Hello', 'text("Hello")', '"Hello"', '6548656c6c6f');
  });

  test('encodes and decodes a tagged value', () => {
    runEncodeDecode(taggedCbor(1, "Hello"), 'tagged(1, text("Hello"))', '1("Hello")', 'c16548656c6c6f');
  });
});

describe('encodes and decodes floats', () => {
  test('encodes floats to shortest representations', () => {
    runEncodeDecode(1.5, 'simple(1.5)', '1.5', 'f93e00');
    runEncodeDecode(2345678.25, 'simple(2345678.25)', '2345678.25', 'fa4a0f2b39');
    runEncodeDecode(1.2, 'simple(1.2)', '1.2', 'fb3ff3333333333333');
  });

  test('encodes floats with no fractional part as integers if possible', () => {
    runEncodeDecode(42.0, 'unsigned(42)', '42', '182a');
    runEncodeDecode(2345678.0, 'unsigned(2345678)', '2345678', '1a0023cace');
    runEncodeDecode(-2345678.0, 'negative(-2345678)', '-2345678', '3a0023cacd');
  });

  test('encodes negative zero as integer zero', () => {
    runEncode(-0.0, 'unsigned(0)', '0', '00');
  });

  test('coerces integer value to generic number', () => {
    const n = 42;
    const c = decodeCbor(encodeCbor(n));
    const f = getCborNumber(c);
    expect(f).toBe(n);
  });

  test('cannot coerce numeric value with fractional part to integer', () => {
    const n = 42.5;
    const c = decodeCbor(encodeCbor(n));
    const f = getCborInteger(c);
    expect(f).toBe(undefined);
  });

  test('rejects non-canonical floats', () => {
    // Non-canonical representation of 1.5 that could be represented at a smaller width.
    const d = hexToBytes("fb3ff8000000000000");
    expect(() => decodeCbor(d)).toThrowError('Non-canonical encoding');
  });

  test('rejects non-canonical ints', () => {
    // Non-canonical representation of a floating point value that could be represented as an integer.
    const d = hexToBytes("f94a00");
    expect(() => decodeCbor(d)).toThrowError('Non-canonical encoding');
  });
});
