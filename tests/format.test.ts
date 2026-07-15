/**
 * Format tests - 1:1 translation from Rust's tests/format.rs
 *
 * Tests various formatting outputs including:
 * - Diagnostic notation (pretty, annotated, and flat)
 * - Summary format
 * - Hex encoding (plain and annotated)
 *
 * P3.8: the Display (`description`) and debug-string (`debug_description`)
 * surfaces were removed with no replacement; those assertions are gone.
 * Where the old expected description equalled the flat diagnostic, that
 * exact string is still asserted via the flat-diagnostic parameter.
 */

import type { CborInput } from "../src";
import { cbor, CborMap, registerStandardTags, CborDate, decodeCbor, taggedValue } from "../src";
import { diagnostic } from "../src/diag";
import { hexAnnotated } from "../src/dump";

/** Helper to convert a hex string to a Uint8Array. */
function hexToBytes(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
  }
  return bytes;
}

// Compare one formatted output against its expectation; an empty expectation
// just logs the actual output (matches the original helper's behavior).
function check(testName: string, label: string, actual: string, expected: string) {
  if (expected === "") {
    console.log(`${label}:`);
    console.log(actual);
    return;
  }
  if (actual !== expected) {
    console.log(`${label} mismatch in test '${testName}':`);
    console.log(`  expected:\n${JSON.stringify(expected)}`);
    console.log(`  actual  :\n${JSON.stringify(actual)}`);
  }
  expect(actual).toBe(expected);
}

// Main test runner function - matches Rust's run() function
// P3.8: description (Display) and debug-string parameters removed.
function run(
  testName: string,
  value: CborInput,
  expectedDiagnostic: string,
  expectedDiagnosticAnnotated: string,
  expectedDiagnosticFlat: string,
  expectedSummary: string,
  expectedHex: string,
  expectedHexAnnotated: string,
) {
  const c = cbor(value);

  check(testName, "diagnostic", diagnostic(c), expectedDiagnostic);
  check(
    testName,
    "diagnostic_annotated",
    diagnostic(c, { annotate: true }),
    expectedDiagnosticAnnotated,
  );
  check(testName, "diagnostic_flat", diagnostic(c, { flat: true }), expectedDiagnosticFlat);
  check(testName, "summary", diagnostic(c, { summarize: true }), expectedSummary);
  check(testName, "hex", c.toHex(), expectedHex);
  check(testName, "hex_annotated", hexAnnotated(c), expectedHexAnnotated);
}

describe("format tests", () => {
  test("format_simple_1", () => {
    run("format_simple_1", false, "false", "false", "false", "false", "f4", "f4  # false");
  });

  test("format_simple_2", () => {
    run("format_simple_2", true, "true", "true", "true", "true", "f5", "f5  # true");
  });

  test("format_simple_3", () => {
    run("format_simple_3", null, "null", "null", "null", "null", "f6", "f6  # null");
  });

  describe("format_unsigned", () => {
    test("format_unsigned_0", () => {
      run("format_unsigned_0", 0, "0", "0", "0", "0", "00", "00  # unsigned(0)");
    });

    test("format_unsigned_23", () => {
      run("format_unsigned_23", 23, "23", "23", "23", "23", "17", "17  # unsigned(23)");
    });

    test("format_unsigned_65546", () => {
      run(
        "format_unsigned_65546",
        65546,
        "65546",
        "65546",
        "65546",
        "65546",
        "1a0001000a",
        "1a0001000a  # unsigned(65546)",
      );
    });

    test("format_unsigned_1000000000", () => {
      run(
        "format_unsigned_1000000000",
        1000000000,
        "1000000000",
        "1000000000",
        "1000000000",
        "1000000000",
        "1a3b9aca00",
        "1a3b9aca00  # unsigned(1000000000)",
      );
    });
  });

  describe("format_negative", () => {
    test("format_negative_neg1", () => {
      run("format_negative_neg1", -1, "-1", "-1", "-1", "-1", "20", "20  # negative(-1)");
    });

    test("format_negative_neg1000", () => {
      run(
        "format_negative_neg1000",
        -1000,
        "-1000",
        "-1000",
        "-1000",
        "-1000",
        "3903e7",
        "3903e7  # negative(-1000)",
      );
    });

    test("format_negative_neg1000000", () => {
      run(
        "format_negative_neg1000000",
        -1000000,
        "-1000000",
        "-1000000",
        "-1000000",
        "-1000000",
        "3a000f423f",
        "3a000f423f  # negative(-1000000)",
      );
    });
  });

  test("format_string", () => {
    run(
      "format_string",
      "Test",
      '"Test"',
      '"Test"',
      '"Test"',
      '"Test"',
      "6454657374",
      `64              # text(4)
    54657374    # "Test"`,
    );
  });

  test("format_simple_array", () => {
    run(
      "format_simple_array",
      [1, 2, 3],
      "[1, 2, 3]",
      "[1, 2, 3]",
      "[1, 2, 3]",
      "[1, 2, 3]",
      "83010203",
      `83      # array(3)
    01  # unsigned(1)
    02  # unsigned(2)
    03  # unsigned(3)`,
    );
  });

  test("format_nested_array", () => {
    const a = [1, 2, 3];
    const b = ["A", "B", "C"];
    const c = [a, b];
    run(
      "format_nested_array",
      c,
      `[
    [1, 2, 3],
    ["A", "B", "C"]
]`,
      `[
    [1, 2, 3],
    ["A", "B", "C"]
]`,
      '[[1, 2, 3], ["A", "B", "C"]]',
      '[[1, 2, 3], ["A", "B", "C"]]',
      "828301020383614161426143",
      `82              # array(2)
    83          # array(3)
        01      # unsigned(1)
        02      # unsigned(2)
        03      # unsigned(3)
    83          # array(3)
        61      # text(1)
            41  # "A"
        61      # text(1)
            42  # "B"
        61      # text(1)
            43  # "C"`,
    );
  });

  test("format_map", () => {
    const map = new CborMap();
    map.set(1, "A");
    map.set(2, "B");
    run(
      "format_map",
      map,
      '{1: "A", 2: "B"}',
      '{1: "A", 2: "B"}',
      '{1: "A", 2: "B"}',
      '{1: "A", 2: "B"}',
      "a2016141026142",
      `a2          # map(2)
    01      # unsigned(1)
    61      # text(1)
        41  # "A"
    02      # unsigned(2)
    61      # text(1)
        42  # "B"`,
    );
  });

  test("format_tagged", () => {
    // Create tagged CBOR: tag 100 with value "Hello"
    const tagged = taggedValue(100, "Hello");
    run(
      "format_tagged",
      tagged,
      '100("Hello")',
      '100("Hello")',
      '100("Hello")',
      '100("Hello")',
      "d8646548656c6c6f",
      `d8 64               # tag(100)
    65              # text(5)
        48656c6c6f  # "Hello"`,
    );
  });

  test("format_date", () => {
    registerStandardTags();

    // Test negative timestamp
    const dateNeg = CborDate.fromEpochSeconds(-100);
    run(
      "format_date_negative",
      dateNeg,
      "1(-100)",
      "1(-100)   / date /",
      "1(-100)",
      "1969-12-31T23:58:20Z",
      "c13863",
      `c1          # tag(1) date
    3863    # negative(-100)`,
    );

    // Test positive timestamp
    const datePos = CborDate.fromEpochSeconds(1647887071);
    run(
      "format_date_positive",
      datePos,
      "1(1647887071)",
      "1(1647887071)   / date /",
      "1(1647887071)",
      "2022-03-21T18:24:31Z",
      "c11a6238c2df",
      `c1              # tag(1) date
    1a6238c2df  # unsigned(1647887071)`,
    );
  });

  test("format_fractional_date", () => {
    registerStandardTags();

    const date = CborDate.fromEpochSeconds(0.5);
    run(
      "format_fractional_date",
      date,
      "1(0.5)",
      "1(0.5)   / date /",
      "1(0.5)",
      "1970-01-01",
      "c1f93800",
      `c1          # tag(1) date
    f93800  # 0.5`,
    );
  });

  test("format_structure", () => {
    const encodedCborHex =
      "d83183015829536f6d65206d7973746572696573206172656e2774206d65616e7420746f20626520736f6c7665642e82d902c3820158402b9238e19eafbc154b49ec89edd4e0fb1368e97332c6913b4beb637d1875824f3e43bd7fb0c41fb574f08ce00247413d3ce2d9466e0ccfa4a89b92504982710ad902c3820158400f9c7af36804ffe5313c00115e5a31aa56814abaa77ff301da53d48613496e9c51a98b36d55f6fb5634fdb0123910cfa4904f1c60523df41013dc3749b377900";
    const cborValue = decodeCbor(hexToBytes(encodedCborHex));

    // P3.8: description (Display) and debug-string surfaces removed; the old
    // expected description equalled the flat diagnostic asserted below.
    const diagnosticStr = `49(
    [
        1,
        h'536f6d65206d7973746572696573206172656e2774206d65616e7420746f20626520736f6c7665642e',
        [
            707(
                [
                    1,
                    h'2b9238e19eafbc154b49ec89edd4e0fb1368e97332c6913b4beb637d1875824f3e43bd7fb0c41fb574f08ce00247413d3ce2d9466e0ccfa4a89b92504982710a'
                ]
            ),
            707(
                [
                    1,
                    h'0f9c7af36804ffe5313c00115e5a31aa56814abaa77ff301da53d48613496e9c51a98b36d55f6fb5634fdb0123910cfa4904f1c60523df41013dc3749b377900'
                ]
            )
        ]
    ]
)`;
    const diagnosticFlat =
      "49([1, h'536f6d65206d7973746572696573206172656e2774206d65616e7420746f20626520736f6c7665642e', [707([1, h'2b9238e19eafbc154b49ec89edd4e0fb1368e97332c6913b4beb637d1875824f3e43bd7fb0c41fb574f08ce00247413d3ce2d9466e0ccfa4a89b92504982710a']), 707([1, h'0f9c7af36804ffe5313c00115e5a31aa56814abaa77ff301da53d48613496e9c51a98b36d55f6fb5634fdb0123910cfa4904f1c60523df41013dc3749b377900'])]])";
    const hex =
      "d83183015829536f6d65206d7973746572696573206172656e2774206d65616e7420746f20626520736f6c7665642e82d902c3820158402b9238e19eafbc154b49ec89edd4e0fb1368e97332c6913b4beb637d1875824f3e43bd7fb0c41fb574f08ce00247413d3ce2d9466e0ccfa4a89b92504982710ad902c3820158400f9c7af36804ffe5313c00115e5a31aa56814abaa77ff301da53d48613496e9c51a98b36d55f6fb5634fdb0123910cfa4904f1c60523df41013dc3749b377900";
    const hexAnnotatedStr = `d8 31                                   # tag(49)
    83                                  # array(3)
        01                              # unsigned(1)
        5829                            # bytes(41)
            536f6d65206d7973746572696573206172656e2774206d65616e7420746f20626520736f6c7665642e # "Some mysteries aren't meant to be solved."
        82                              # array(2)
            d9 02c3                     # tag(707)
                82                      # array(2)
                    01                  # unsigned(1)
                    5840                # bytes(64)
                        2b9238e19eafbc154b49ec89edd4e0fb1368e97332c6913b4beb637d1875824f3e43bd7fb0c41fb574f08ce00247413d3ce2d9466e0ccfa4a89b92504982710a
            d9 02c3                     # tag(707)
                82                      # array(2)
                    01                  # unsigned(1)
                    5840                # bytes(64)
                        0f9c7af36804ffe5313c00115e5a31aa56814abaa77ff301da53d48613496e9c51a98b36d55f6fb5634fdb0123910cfa4904f1c60523df41013dc3749b377900`;

    run(
      "format_structure",
      cborValue,
      diagnosticStr,
      diagnosticStr,
      diagnosticFlat,
      diagnosticFlat,
      hex,
      hexAnnotatedStr,
    );
  });

  test("format_structure_2", () => {
    registerStandardTags();
    const encodedCborHex =
      "d9012ca4015059f2293a5bce7d4de59e71b4207ac5d202c11a6035970003754461726b20507572706c652041717561204c6f766504787b4c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e73656374657475722061646970697363696e6720656c69742c2073656420646f20656975736d6f642074656d706f7220696e6369646964756e74207574206c61626f726520657420646f6c6f7265206d61676e6120616c697175612e";
    const cborValue = decodeCbor(hexToBytes(encodedCborHex));

    const diagnosticStr = `300(
    {
        1:
        h'59f2293a5bce7d4de59e71b4207ac5d2',
        2:
        1(1614124800),
        3:
        "Dark Purple Aqua Love",
        4:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
    }
)`;
    const diagnosticAnnotated = `300(
    {
        1:
        h'59f2293a5bce7d4de59e71b4207ac5d2',
        2:
        1(1614124800),   / date /
        3:
        "Dark Purple Aqua Love",
        4:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
    }
)`;
    const diagnosticFlat =
      '300({1: h\'59f2293a5bce7d4de59e71b4207ac5d2\', 2: 1(1614124800), 3: "Dark Purple Aqua Love", 4: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."})';
    const summaryStr =
      '300({1: h\'59f2293a5bce7d4de59e71b4207ac5d2\', 2: 2021-02-24, 3: "Dark Purple Aqua Love", 4: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."})';
    const hex =
      "d9012ca4015059f2293a5bce7d4de59e71b4207ac5d202c11a6035970003754461726b20507572706c652041717561204c6f766504787b4c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e73656374657475722061646970697363696e6720656c69742c2073656420646f20656975736d6f642074656d706f7220696e6369646964756e74207574206c61626f726520657420646f6c6f7265206d61676e6120616c697175612e";
    const hexAnnotatedStr = `d9 012c                                 # tag(300)
    a4                                  # map(4)
        01                              # unsigned(1)
        50                              # bytes(16)
            59f2293a5bce7d4de59e71b4207ac5d2
        02                              # unsigned(2)
        c1                              # tag(1) date
            1a60359700                  # unsigned(1614124800)
        03                              # unsigned(3)
        75                              # text(21)
            4461726b20507572706c652041717561204c6f7665 # "Dark Purple Aqua Love"
        04                              # unsigned(4)
        78 7b                           # text(123)
            4c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e73656374657475722061646970697363696e6720656c69742c2073656420646f20656975736d6f642074656d706f7220696e6369646964756e74207574206c61626f726520657420646f6c6f7265206d61676e6120616c697175612e # "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."`;

    // Assert the LIBRARY outputs directly. The value is decoded (its tags carry
    // no name), so - exactly like Rust - the plain diagnostic path renders tag
    // numbers (`1(...)`), while only the annotated path resolves `/ date /` and
    // the summary renders `2021-02-24`.
    expect(diagnostic(cborValue)).toBe(diagnosticStr);
    expect(diagnostic(cborValue, { annotate: true })).toBe(diagnosticAnnotated);
    expect(diagnostic(cborValue, { flat: true })).toBe(diagnosticFlat);
    expect(diagnostic(cborValue, { summarize: true })).toBe(summaryStr);
    expect(cborValue.toHex()).toBe(hex);
    expect(hexAnnotated(cborValue)).toBe(hexAnnotatedStr);
    // P3.8: debug-string surface removed (old expected:
    // 'tagged(300, map({...}))'); Display description equalled the flat
    // diagnostic asserted above.
  });

  test("format_key_order", () => {
    const m = new CborMap();
    m.set(-1, 3);
    m.set([-1], 7);
    m.set("z", 4);
    m.set(10, 1);
    m.set(false, 8);
    m.set(100, 2);
    m.set("aa", 5);
    m.set([100], 6);

    // P3.8: description (Display) and debug-string surfaces removed; the old
    // expected description equalled the flat diagnostic asserted below.
    const diagnosticStr = `{
    10:
    1,
    100:
    2,
    -1:
    3,
    "z":
    4,
    "aa":
    5,
    [100]:
    6,
    [-1]:
    7,
    false:
    8
}`;
    const diagnosticFlat = '{10: 1, 100: 2, -1: 3, "z": 4, "aa": 5, [100]: 6, [-1]: 7, false: 8}';
    const hexValue = "a80a011864022003617a046261610581186406812007f408";
    const hexAnnotatedStr = `a8              # map(8)
    0a          # unsigned(10)
    01          # unsigned(1)
    1864        # unsigned(100)
    02          # unsigned(2)
    20          # negative(-1)
    03          # unsigned(3)
    61          # text(1)
        7a      # "z"
    04          # unsigned(4)
    62          # text(2)
        6161    # "aa"
    05          # unsigned(5)
    81          # array(1)
        1864    # unsigned(100)
    06          # unsigned(6)
    81          # array(1)
        20      # negative(-1)
    07          # unsigned(7)
    f4          # false
    08          # unsigned(8)`;

    run(
      "format_key_order",
      m,
      diagnosticStr,
      diagnosticStr,
      diagnosticFlat,
      diagnosticFlat,
      hexValue,
      hexAnnotatedStr,
    );
  });
});
