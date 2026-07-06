/**
 * Errors for CBOR encoding and decoding.
 *
 * All failures surface as a single {@link CborError} (a real `Error` subclass,
 * so `instanceof`/stack traces work). Each carries a machine-readable
 * {@link CborErrorCode} discriminant plus optional structured {@link
 * CborErrorDetails}. Construct them via the static factories
 * (`CborError.wrongType()`, `CborError.wrongTag(a, b)`, …) rather than by hand.
 *
 * @module error
 */

import type { Tag } from "./tag";
import { tagToString } from "./tag";

/**
 * Machine-readable discriminant for a {@link CborError}.
 *
 * These cover the deterministic-encoding validation failures from RFC 8949
 * §4.2.1 and the dCBOR application profile, plus type/range errors raised while
 * extracting values.
 */
export type CborErrorCode =
  | "Underrun"
  | "UnsupportedHeaderValue"
  | "NonCanonicalNumeric"
  | "InvalidSimpleValue"
  | "InvalidString"
  | "NonCanonicalString"
  | "UnusedData"
  | "MisorderedMapKey"
  | "DuplicateMapKey"
  | "MissingMapKey"
  | "OutOfRange"
  | "WrongType"
  | "WrongTag"
  | "InvalidUtf8"
  | "InvalidDate"
  | "Custom";

/**
 * Optional structured data attached to a {@link CborError}, keyed by the codes
 * that carry it. Everything is optional so callers can narrow on `code` and
 * read only the fields relevant to that code.
 *
 * @deprecated Use {@link CborErrorDetailsByCode} (per-code payloads) with
 * {@link CborErrorTyped} - narrowing on `error.code` then makes the matching
 * detail fields non-optional. This undiscriminated bag remains for
 * compatibility and is removed at 2.0.
 */
export interface CborErrorDetails {
  /** `UnsupportedHeaderValue`: the offending CBOR header byte. */
  readonly headerValue?: number | undefined;
  /** `UnusedData`: number of trailing bytes left unconsumed. */
  readonly count?: number | undefined;
  /** `WrongTag`: the tag that was expected. */
  readonly expectedTag?: Tag | undefined;
  /** `WrongTag`: the tag actually found. */
  readonly actualTag?: Tag | undefined;
  /** `InvalidString`/`InvalidUtf8`/`InvalidDate`: the underlying reason. */
  readonly cause?: string | undefined;
}

/**
 * The structured detail payload each {@link CborErrorCode} carries.
 * Codes mapped to `unknown` attach no structured details.
 *
 * Prefer consuming this through {@link CborErrorTyped}: narrowing on
 * `error.code` makes the matching payload fields non-optional.
 */
export interface CborErrorDetailsByCode {
  Underrun: unknown;
  UnsupportedHeaderValue: { readonly headerValue: number };
  NonCanonicalNumeric: unknown;
  InvalidSimpleValue: unknown;
  InvalidString: { readonly cause: string };
  NonCanonicalString: unknown;
  UnusedData: { readonly count: number };
  MisorderedMapKey: unknown;
  DuplicateMapKey: unknown;
  MissingMapKey: unknown;
  OutOfRange: unknown;
  WrongType: unknown;
  WrongTag: { readonly expectedTag: Tag; readonly actualTag: Tag };
  InvalidUtf8: { readonly cause: string };
  InvalidDate: { readonly cause: string };
  Custom: unknown;
}

/**
 * A {@link CborError} whose `details` payload is discriminated by its `code`.
 * With the default type argument this is the distributed union over all codes,
 * so narrowing on `error.code` narrows `error.details` to exactly the fields
 * that code carries:
 *
 * ```typescript
 * try {
 *   decodeCbor(bytes);
 * } catch (e) {
 *   if (CborError.isCborError(e) && e.code === "WrongTag") {
 *     e.details.expectedTag; // Tag - non-optional after narrowing
 *   }
 * }
 * ```
 *
 * The intersection with the legacy {@link CborErrorDetails} bag keeps
 * un-narrowed `details` access compiling exactly as before.
 */
export type CborErrorTyped<C extends CborErrorCode = CborErrorCode> = C extends CborErrorCode
  ? CborError & {
      readonly code: C;
      readonly details: Readonly<CborErrorDetailsByCode[C]> & CborErrorDetails;
    }
  : never;

const captureStackTrace = (
  Error as unknown as {
    captureStackTrace?: (target: object, ctor: unknown) => void;
  }
).captureStackTrace;

/**
 * The single error type thrown by dCBOR encoding, decoding, and extraction.
 *
 * @example
 * ```typescript
 * try {
 *   decodeCbor(bytes);
 * } catch (e) {
 *   if (CborError.isCborError(e) && e.code === "WrongTag") {
 *     console.log(e.details.expectedTag, e.details.actualTag);
 *   }
 * }
 * ```
 */
export class CborError extends Error {
  /** Machine-readable discriminant; switch on this to handle errors. */
  readonly code: CborErrorCode;
  /** Structured, code-specific data (see {@link CborErrorDetails}). */
  readonly details: CborErrorDetails;

  constructor(code: CborErrorCode, message: string, details: CborErrorDetails = {}) {
    super(message);
    this.name = "CborError";
    this.code = code;
    this.details = details;
    // Keep `instanceof CborError` working when compiled to older targets.
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof captureStackTrace === "function") {
      captureStackTrace(this, CborError);
    }
  }

  /** Type guard: is `value` a {@link CborError}? Narrows to the
   * code-discriminated {@link CborErrorTyped} union. */
  static isCborError(value: unknown): value is CborErrorTyped {
    return value instanceof CborError;
  }

  /** The CBOR data ended before a complete item could be decoded. */
  static underrun(): CborErrorTyped<"Underrun"> {
    return new CborError("Underrun", "early end of CBOR data") as CborErrorTyped<"Underrun">;
  }

  /** An unsupported/invalid value was found in a CBOR header byte. */
  static unsupportedHeaderValue(headerValue: number): CborErrorTyped<"UnsupportedHeaderValue"> {
    return new CborError("UnsupportedHeaderValue", "unsupported value in CBOR header", {
      headerValue,
    }) as CborErrorTyped<"UnsupportedHeaderValue">;
  }

  /** A numeric value was not in its shortest/canonical dCBOR form. */
  static nonCanonicalNumeric(): CborErrorTyped<"NonCanonicalNumeric"> {
    return new CborError(
      "NonCanonicalNumeric",
      "a CBOR numeric value was encoded in non-canonical form",
    ) as CborErrorTyped<"NonCanonicalNumeric">;
  }

  /** A major-type-7 simple value other than false/true/null/float. */
  static invalidSimpleValue(): CborErrorTyped<"InvalidSimpleValue"> {
    return new CborError(
      "InvalidSimpleValue",
      "an invalid CBOR simple value was encountered",
    ) as CborErrorTyped<"InvalidSimpleValue">;
  }

  /** A text string was not valid UTF-8 (with the underlying reason). */
  static invalidString(cause: string): CborErrorTyped<"InvalidString"> {
    return new CborError(
      "InvalidString",
      `an invalidly-encoded UTF-8 string was encountered in the CBOR (${cause})`,
      { cause },
    ) as CborErrorTyped<"InvalidString">;
  }

  /** A text string was not in Unicode NFC. */
  static nonCanonicalString(): CborErrorTyped<"NonCanonicalString"> {
    return new CborError(
      "NonCanonicalString",
      "a CBOR string was not encoded in Unicode Canonical Normalization Form C",
    ) as CborErrorTyped<"NonCanonicalString">;
  }

  /** The decoded item left `count` trailing bytes unconsumed. */
  static unusedData(count: number): CborErrorTyped<"UnusedData"> {
    return new CborError("UnusedData", `the decoded CBOR had ${count} extra bytes at the end`, {
      count,
    }) as CborErrorTyped<"UnusedData">;
  }

  /** Map keys were not in canonical ascending byte order. */
  static misorderedMapKey(): CborErrorTyped<"MisorderedMapKey"> {
    return new CborError(
      "MisorderedMapKey",
      "the decoded CBOR map has keys that are not in canonical order",
    ) as CborErrorTyped<"MisorderedMapKey">;
  }

  /** A map contained a duplicate key. */
  static duplicateMapKey(): CborErrorTyped<"DuplicateMapKey"> {
    return new CborError(
      "DuplicateMapKey",
      "the decoded CBOR map has a duplicate key",
    ) as CborErrorTyped<"DuplicateMapKey">;
  }

  /** A requested map key was not present. */
  static missingMapKey(): CborErrorTyped<"MissingMapKey"> {
    return new CborError(
      "MissingMapKey",
      "missing CBOR map key",
    ) as CborErrorTyped<"MissingMapKey">;
  }

  /** A numeric value could not be represented in the target type. */
  static outOfRange(): CborErrorTyped<"OutOfRange"> {
    return new CborError(
      "OutOfRange",
      "the CBOR numeric value could not be represented in the specified numeric type",
    ) as CborErrorTyped<"OutOfRange">;
  }

  /** The CBOR value was not the type expected by a conversion. */
  static wrongType(): CborErrorTyped<"WrongType"> {
    return new CborError(
      "WrongType",
      "the decoded CBOR value was not the expected type",
    ) as CborErrorTyped<"WrongType">;
  }

  /** A tagged value had a tag other than the one expected. */
  static wrongTag(expected: Tag, actual: Tag): CborErrorTyped<"WrongTag"> {
    return new CborError(
      "WrongTag",
      `expected CBOR tag ${tagToString(expected)}, but got ${tagToString(actual)}`,
      { expectedTag: expected, actualTag: actual },
    ) as CborErrorTyped<"WrongTag">;
  }

  /** Invalid UTF-8 in a text string (with the underlying reason). */
  static invalidUtf8(cause: string): CborErrorTyped<"InvalidUtf8"> {
    return new CborError("InvalidUtf8", `invalid UTF‑8 string: ${cause}`, {
      cause,
    }) as CborErrorTyped<"InvalidUtf8">;
  }

  /** Invalid ISO 8601 / RFC 3339 date string (with the underlying reason). */
  static invalidDate(cause: string): CborErrorTyped<"InvalidDate"> {
    return new CborError("InvalidDate", `invalid ISO 8601 date string: ${cause}`, {
      cause,
    }) as CborErrorTyped<"InvalidDate">;
  }

  /** An arbitrary error carrying a custom message. */
  static custom(message: string): CborErrorTyped<"Custom"> {
    return new CborError("Custom", message) as CborErrorTyped<"Custom">;
  }
}

/**
 * A success/failure result carrying a {@link CborError} on failure.
 *
 * The primary API throws {@link CborError}; `Result` is used where a value is
 * produced fallibly without exceptions (e.g. tag summarizers and the
 * `tryDecode` helper).
 */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CborErrorTyped };

/** Construct a successful {@link Result}. */
export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** Construct a failed {@link Result}. */
export const Err = <T>(error: CborError): Result<T> => ({
  ok: false,
  // Every runtime CborError carries one of the known codes.
  error: error as CborErrorTyped,
});
