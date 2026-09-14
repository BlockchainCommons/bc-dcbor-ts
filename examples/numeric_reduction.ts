/**
 * Numeric Reduction Example
 *
 * Port of: bc-dcbor-rust/examples/numeric_reduction.rs
 *
 * - Integer extraction works across every integer width and float type that
 *   can hold the value.
 * - A float with no fractional part (42.0) is reduced to an integer by dCBOR's
 *   canonical encoding rules, so it extracts as both a float and an integer.
 * - A float with a fractional part (1.5) stays a float. It extracts as a float
 *   but not as an integer: `expectInteger` throws `WrongType`.
 * - The last section reads the node's major type directly: unsigned, negative
 *   (which stores -1 - n) or a float simple value. 42.0 prints as unsigned(42)
 *   because numeric reduction already made it an integer at construction.
 */

import { cbor, MajorType, type Cbor } from "../src/cbor";
import { expectFloat, expectInteger, expectUnsigned } from "../src/conveniences-expect";
import { isFloat } from "../src/conveniences-guards";
import { CborError } from "../src/error";

function printNumeric(c: Cbor): void {
  if (c.type === MajorType.Unsigned) {
    console.log(`unsigned(${c.value})`);
  } else if (c.type === MajorType.Negative) {
    console.log(`negative(${-1n - BigInt(c.value)})`);
  } else if (isFloat(c)) {
    console.log(`float(${c.value.value})`);
  } else {
    throw new Error("not numeric");
  }
}

function main() {
  // Encode an integer and extract it at several widths.
  const int = cbor(42);
  const a = expectUnsigned(int, { width: 8 });
  const b = expectInteger(int);
  const c = expectUnsigned(int, { width: 64 });
  const d = expectFloat(int);
  console.log(`${a} ${b} ${c} ${d}`);
  // 42 42 42 42

  // A float with no fractional part: numeric reduction encodes 42.0 as the
  // integer 42.
  const whole = cbor(42.0);
  console.log(`${expectFloat(whole)} ${expectInteger(whole)}`);
  // 42 42

  // A float with a fractional part stays a float.
  const fraction = cbor(1.5);
  let asInt: string;
  try {
    asInt = String(expectInteger(fraction));
  } catch (e) {
    asInt = CborError.isCborError(e) ? `Err(${e.code})` : String(e);
  }
  console.log(`${expectFloat(fraction)} ${asInt}`);
  // 1.5 Err(WrongType)

  // Interrogate the CBOR type directly.
  printNumeric(cbor(42)); // unsigned(42)
  printNumeric(cbor(-7)); // negative(-7)
  printNumeric(cbor(42.0)); // unsigned(42) - numeric reduction
  printNumeric(cbor(1.5)); // float(1.5)
}

main();
