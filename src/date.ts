/**
 * Date/time support for CBOR with tag(1) encoding.
 *
 * A CBOR-friendly representation of a date and time.
 *
 * The `CborDate` type provides a wrapper around JavaScript's native `Date` that
 * supports encoding and decoding to/from CBOR with tag 1, following the CBOR
 * date/time standard specified in RFC 8949.
 *
 * When encoded to CBOR, dates are represented as tag 1 followed by a numeric
 * value representing the number of seconds since (or before) the Unix epoch
 * (1970-01-01T00:00:00Z). The numeric value can be a positive or negative
 * integer, or a floating-point value for dates with fractional seconds.
 *
 * @module date
 */

import { type Cbor } from "./cbor";
import { MajorType } from "./cbor-types";
import { cbor, taggedValue } from "./cbor";
import { Tag } from "./tag";
import { TAG_EPOCH_DATE_TIME } from "./tags";
import { type CborTagged, type CborCodec, validateTag, extractTaggedContent } from "./codable";
import { CborError } from "./error";

/**
 * Normalize a timestamp (seconds since the Unix epoch) to whole seconds plus a
 * non-negative, sub-second nanosecond part, so dates round-trip byte-identically.
 *
 * The nanosecond part is truncated toward zero and clamped to [0, u32::MAX]. So
 * a negative fraction floors the value (`-1.5` becomes `-1.0`) and sub-nanosecond
 * precision is dropped (`1.0000000005` becomes `1.0`).
 *
 * @internal
 */
function normalizeTimestampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    // There is no representation for a non-finite instant; reject with a
    // typed error.
    throw CborError.invalidDate("non-finite timestamp");
  }
  const whole = Math.trunc(seconds);
  let nsecs = Math.trunc((seconds - whole) * 1_000_000_000);
  if (nsecs < 0) {
    nsecs = 0;
  } else if (nsecs > 0xffffffff) {
    nsecs = 0xffffffff;
  }
  return whole + nsecs / 1_000_000_000;
}

/**
 * A CBOR-friendly representation of a date and time.
 *
 * The `CborDate` type provides a wrapper around JavaScript's native `Date` that
 * supports encoding and decoding to/from CBOR with tag 1, following the CBOR
 * date/time standard specified in RFC 8949.
 *
 * When encoded to CBOR, dates are represented as tag 1 followed by a numeric
 * value representing the number of seconds since (or before) the Unix epoch
 * (1970-01-01T00:00:00Z). The numeric value can be a positive or negative
 * integer, or a floating-point value for dates with fractional seconds.
 *
 * # Features
 *
 * - Supports UTC dates with optional fractional seconds
 * - Provides convenient constructors for common date creation patterns
 * - Implements the `CborTagged` interface and the `ToCbor` protocol
 * - Supports arithmetic operations with durations and between dates
 *
 * @example
 * ```typescript
 * import { CborDate } from './date';
 *
 * // Create a date from a timestamp (seconds since Unix epoch)
 * const date = CborDate.fromEpochSeconds(1675854714.0);
 *
 * // Create a date from year, month, day
 * const date2 = CborDate.fromYmd(2023, 2, 8);
 *
 * // Convert to CBOR
 * const cborValue = date.taggedCbor();
 *
 * // Decode from CBOR
 * const decoded = CborDate.fromTaggedCbor(cborValue);
 * ```
 */
let dateCodec: CborCodec<CborDate> | undefined;

export class CborDate implements CborTagged {
  /** Debug label: `Object.prototype.toString` reports `[object CborDate]`. */
  // A prototype getter has zero per-instance cost; the readonly field the
  // stylistic rule prefers would allocate one own property per instance.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag](): string {
    return "CborDate";
  }

  /**
   * Canonical timestamp in seconds since the Unix epoch as a JS `number`
   * (`f64`). dCBOR encodes Date (tag 1) as a numeric value in seconds, so
   * keeping `_seconds` as the source of truth avoids the millisecond-only
   * round-trip precision loss that going through a JS `Date` instance would
   * introduce.
   *
   * f64 bounds the achievable precision (~16 decimal digits, so roughly
   * microseconds for current epoch values), but the encode/decode round-trip
   * is byte-identical.
   */
  private _seconds: number;

  /**
   * Creates a new `CborDate` from the given JavaScript `Date`.
   *
   * This method creates a new `CborDate` instance by wrapping a
   * JavaScript `Date`.
   *
   * @param dateTime - A `Date` instance to wrap
   *
   * @returns A new `CborDate` instance
   *
   * @example
   * ```typescript
   * const datetime = new Date();
   * const date = CborDate.fromDate(datetime);
   * ```
   */
  static fromDate(dateTime: Date): CborDate {
    const instance = new CborDate();
    instance._seconds = dateTime.getTime() / 1000;
    return instance;
  }

  /**
   * Creates a new `CborDate` from year, month, and day components.
   *
   * This method creates a new `CborDate` with the time set to 00:00:00 UTC.
   *
   * @param year - The year component (e.g., 2023)
   * @param month - The month component (1-12)
   * @param day - The day component (1-31)
   *
   * @returns A new `CborDate` instance
   *
   * @example
   * ```typescript
   * // Create February 8, 2023
   * const date = CborDate.fromYmd(2023, 2, 8);
   * ```
   *
   * @throws Error if the provided components do not form a valid date.
   */
  static fromYmd(year: number, month: number, day: number): CborDate {
    const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return CborDate.fromDate(dt);
  }

  /**
   * Creates a new `CborDate` from year, month, day, hour, minute, and second
   * components.
   *
   * @param year - The year component (e.g., 2023)
   * @param month - The month component (1-12)
   * @param day - The day component (1-31)
   * @param hour - The hour component (0-23)
   * @param minute - The minute component (0-59)
   * @param second - The second component (0-59)
   *
   * @returns A new `CborDate` instance
   *
   * @example
   * ```typescript
   * // Create February 8, 2023, 15:30:45 UTC
   * const date = CborDate.fromYmdHms(2023, 2, 8, 15, 30, 45);
   * ```
   *
   * @throws Error if the provided components do not form a valid date and time.
   */
  static fromYmdHms(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): CborDate {
    const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
    return CborDate.fromDate(dt);
  }

  /**
   * Creates a new `CborDate` from seconds since (or before) the Unix epoch.
   *
   * This method creates a new `CborDate` representing the specified number of
   * seconds since the Unix epoch (1970-01-01T00:00:00Z). Negative values
   * represent times before the epoch.
   *
   * @param secondsSinceUnixEpoch - Seconds from the Unix epoch (positive or
   *   negative), which can include a fractional part for sub-second
   *   precision
   *
   * @returns A new `CborDate` instance
   *
   * @example
   * ```typescript
   * // Create a date from a timestamp
   * const date = CborDate.fromEpochSeconds(1675854714.0);
   *
   * // Create a date one second before the Unix epoch
   * const beforeEpoch = CborDate.fromEpochSeconds(-1.0);
   *
   * // Create a date with fractional seconds
   * const withFraction = CborDate.fromEpochSeconds(1675854714.5);
   * ```
   */
  static fromEpochSeconds(secondsSinceUnixEpoch: number): CborDate {
    const instance = new CborDate();
    // Normalize on construction so the stored value (and thus its encoding,
    // equality, and ordering) is canonical.
    instance._seconds = normalizeTimestampSeconds(secondsSinceUnixEpoch);
    return instance;
  }

  /**
   * Creates a new `CborDate` from a string containing an ISO-8601 (RFC-3339)
   * date (with or without time).
   *
   * This method parses a string representation of a date or date-time in
   * ISO-8601/RFC-3339 format and creates a new `CborDate` instance. It
   * supports both full date-time strings (e.g., "2023-02-08T15:30:45Z")
   * and date-only strings (e.g., "2023-02-08").
   *
   * @param value - A string containing a date or date-time in ISO-8601/RFC-3339
   *   format
   *
   * @returns A new `CborDate` instance if parsing succeeds
   *
   * @throws Error if the string cannot be parsed as a valid date or date-time
   *
   * @example
   * ```typescript
   * // Parse a date-time string
   * const date = CborDate.fromString("2023-02-08T15:30:45Z");
   *
   * // Parse a date-only string (time will be set to 00:00:00)
   * const date2 = CborDate.fromString("2023-02-08");
   * ```
   */
  static fromString(value: string): CborDate {
    // Accept only strict RFC-3339 date-times (with seconds and an explicit
    // `Z`/±HH:MM offset) or bare `YYYY-MM-DD` dates (read as UTC midnight).
    // The plain `new Date()` parser is far more lenient (and engine-dependent),
    // so we gate it behind explicit regexes.
    const invalidDate = CborError.invalidDate("Invalid date string");

    // RFC-3339 date-time: `YYYY-MM-DDThh:mm:ss[.frac](Z|±hh:mm)`.
    const rfc3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
    // Date-only: `YYYY-MM-DD`.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

    let parsed: Date;
    if (rfc3339.test(value)) {
      parsed = new Date(value);
    } else if (dateOnly.test(value)) {
      // Treat a bare date as UTC midnight (00:00:00 UTC).
      parsed = new Date(`${value}T00:00:00Z`);
    } else {
      throw invalidDate;
    }

    // `new Date` rolls impossible dates over (`2023-02-30` becomes Mar 2)
    // rather than failing, so check the `YYYY-MM-DD` portion is a real calendar
    // date. The first 10 chars are always `YYYY-MM-DD` given the regexes above.
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    const calendarValid =
      probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;

    // ...and reject any residual unparseable input (e.g. an out-of-range time).
    if (!calendarValid || isNaN(parsed.getTime())) {
      throw invalidDate;
    }
    return CborDate.fromDate(parsed);
  }

  /**
   * Creates a new `CborDate` containing the current date and time.
   *
   * @returns A new `CborDate` instance representing the current UTC date and time
   *
   * @example
   * ```typescript
   * const now = CborDate.now();
   * ```
   */
  static now(): CborDate {
    return CborDate.fromDate(new Date());
  }

  /**
   * Creates a new `CborDate` containing the current date and time plus the given
   * duration.
   *
   * @param durationMs - The duration in milliseconds to add to the current time
   *
   * @returns A new `CborDate` instance representing the current UTC date and time plus
   * the duration
   *
   * @example
   * ```typescript
   * // Get a date 1 hour from now
   * const oneHourLater = CborDate.withDurationFromNow(3600 * 1000);
   * ```
   */
  static withDurationFromNow(durationMs: number): CborDate {
    const now = new Date();
    const future = new Date(now.getTime() + durationMs);
    return CborDate.fromDate(future);
  }

  /**
   * Returns the underlying JavaScript `Date` object.
   *
   * This method provides access to the wrapped JavaScript `Date`
   * instance.
   *
   * @returns The wrapped `Date` instance
   *
   * @example
   * ```typescript
   * const date = CborDate.now();
   * const datetime = date.toDate();
   * const year = datetime.getFullYear();
   * ```
   */
  toDate(): Date {
    return new Date(this._seconds * 1000);
  }

  /**
   * The date as the number of seconds since the Unix epoch
   * (1970-01-01T00:00:00Z), as a floating-point `number`. Negative values
   * represent times before the epoch; the fractional part is sub-second
   * precision.
   *
   * @example
   * ```typescript
   * const date = CborDate.fromYmd(2023, 2, 8);
   * const timestamp = date.epochSeconds;
   * ```
   */
  get epochSeconds(): number {
    return this._seconds;
  }

  /**
   * Add seconds to this date.
   *
   * @param seconds - Seconds to add (can be fractional)
   * @returns New CborDate instance
   *
   * @example
   * ```typescript
   * const date = CborDate.fromYmd(2022, 3, 21);
   * const tomorrow = date.add(24 * 60 * 60);
   * ```
   */
  add(seconds: number): CborDate {
    return CborDate.fromEpochSeconds(this.epochSeconds + seconds);
  }

  /**
   * Subtract seconds from this date.
   *
   * @param seconds - Seconds to subtract (can be fractional)
   * @returns New CborDate instance
   *
   * @example
   * ```typescript
   * const date = CborDate.fromYmd(2022, 3, 21);
   * const yesterday = date.subtract(24 * 60 * 60);
   * ```
   */
  subtract(seconds: number): CborDate {
    return CborDate.fromEpochSeconds(this.epochSeconds - seconds);
  }

  /**
   * Get the difference in seconds between this date and another.
   *
   * @param other - Other CborDate to compare with
   * @returns Difference in seconds (this - other)
   *
   * @example
   * ```typescript
   * const date1 = CborDate.fromYmd(2022, 3, 22);
   * const date2 = CborDate.fromYmd(2022, 3, 21);
   * const diff = date1.difference(date2);
   * // Returns 86400 (one day in seconds)
   * ```
   */
  difference(other: CborDate): number {
    return this.epochSeconds - other.epochSeconds;
  }

  /**
   * Implementation of the `CborTagged` interface for `CborDate`.
   *
   * This implementation specifies that `CborDate` values are tagged with CBOR tag 1,
   * which is the standard CBOR tag for date/time values represented as seconds
   * since the Unix epoch per RFC 8949.
   *
   * @returns A vector containing tag 1
   */
  cborTags(): Tag[] {
    return [Tag.from(TAG_EPOCH_DATE_TIME, "date")];
  }

  /**
   * Converts this `CborDate` to its untagged CBOR content: the epoch-seconds
   * numeric value. It may be an integer or a floating-point number,
   * depending on whether the date has fractional seconds.
   *
   * @returns A CBOR value representing the timestamp
   */
  untaggedCbor(): Cbor {
    return cbor(this.epochSeconds);
  }

  /**
   * Converts this `CborDate` to a tagged CBOR value with tag 1.
   *
   * @returns Tagged CBOR value
   */
  taggedCbor(): Cbor {
    const tags = this.cborTags();
    const tag = tags[0];
    if (tag === undefined) {
      throw CborError.custom("No tags defined for this type");
    }
    return taggedValue(tag, this.untaggedCbor());
  }

  /**
   * The `ToCbor` protocol: dates encode as their tagged form.
   */
  toCbor(): Cbor {
    return this.taggedCbor();
  }

  /**
   * Populates this `CborDate` in place from an untagged CBOR value, which
   * must be a number (integer or floating-point) of seconds since the Unix
   * epoch. The static `CborDate.fromUntaggedCbor` is the usual entry point;
   * this instance form exists for reuse.
   *
   * @param cbor - The untagged CBOR value
   *
   * @returns this (populated in place)
   *
   * @throws Error if the CBOR value is not a valid timestamp
   */
  fromUntaggedCbor(cbor: Cbor): CborDate {
    let timestamp: number;

    // Only handle numeric types (Unsigned, Negative, Float); others are invalid for dates
    switch (cbor.type) {
      case MajorType.Unsigned:
        timestamp = typeof cbor.value === "number" ? cbor.value : Number(cbor.value);
        break;

      case MajorType.Negative:
        // Convert stored magnitude back to actual negative value
        if (typeof cbor.value === "bigint") {
          timestamp = Number(-cbor.value - 1n);
        } else {
          timestamp = -cbor.value - 1;
        }
        break;

      case MajorType.Simple:
        if (cbor.value.type === "Float") {
          timestamp = cbor.value.value;
        } else {
          // Non-Float Simple values are not valid timestamps.
          throw CborError.wrongType();
        }
        break;

      default:
        throw CborError.wrongType();
    }

    // Normalize the decoded value so it re-encodes canonically (e.g. a tag-1
    // float of -1.5 decodes and re-encodes as integer -1).
    this._seconds = normalizeTimestampSeconds(timestamp);
    return this;
  }

  /**
   * Populates this `CborDate` in place from a tag-1 CBOR value.
   *
   * @param cbor - Tagged CBOR value
   *
   * @returns this (populated in place)
   *
   * @throws Error if the CBOR value has the wrong tag or cannot be decoded
   */
  fromTaggedCbor(cbor: Cbor): CborDate {
    const expectedTags = this.cborTags();
    validateTag(cbor, expectedTags);
    const content = extractTaggedContent(cbor);
    return this.fromUntaggedCbor(content);
  }

  /**
   * Static method to create a CborDate from tagged CBOR.
   *
   * @param cbor - Tagged CBOR value
   * @returns New CborDate instance
   */
  static fromTaggedCbor(cbor: Cbor): CborDate {
    const instance = new CborDate();
    return instance.fromTaggedCbor(cbor);
  }

  /**
   * The {@link CborCodec} exemplar: a runtime witness that binds
   * `T = CborDate` for `decodeWith(bytes, CborDate.codec)`.
   *
   * A lazy getter (memoized) rather than a static field: the date ↔ tags
   * module cycle makes an eager initializer hit the temporal dead zone.
   *
   * @beta
   */
  static get codec(): CborCodec<CborDate> {
    dateCodec ??= {
      tags: [Tag.from(TAG_EPOCH_DATE_TIME, "date")],
      decode: (c: Cbor): CborDate => CborDate.fromTaggedCbor(c),
      encode: (value: CborDate): Cbor => value.taggedCbor(),
    };
    return dateCodec;
  }

  static fromUntaggedCbor(cbor: Cbor): CborDate {
    const instance = new CborDate();
    return instance.fromUntaggedCbor(cbor);
  }

  /**
   * Implementation of the `toString` method for `CborDate`.
   *
   * This implementation provides a string representation of a `CborDate` in ISO-8601
   * format. For dates with time exactly at midnight (00:00:00), only the date
   * part is shown. For other times, a full date-time string is shown.
   *
   * @returns String representation in ISO-8601 format
   *
   * @example
   * ```typescript
   * // A date at midnight will display as just the date
   * const date = CborDate.fromYmd(2023, 2, 8);
   * // Returns "2023-02-08"
   * console.log(date.toString());
   *
   * // A date with time will display as date and time
   * const date2 = CborDate.fromYmdHms(2023, 2, 8, 15, 30, 45);
   * // Returns "2023-02-08T15:30:45.000Z"
   * console.log(date2.toString());
   * ```
   */
  toString(): string {
    const dt = new Date(this._seconds * 1000);
    // Check only hours, minutes, and seconds (not milliseconds).
    const hasTime = dt.getUTCHours() !== 0 || dt.getUTCMinutes() !== 0 || dt.getUTCSeconds() !== 0;

    if (!hasTime) {
      // Midnight (with possible subsecond precision) - show only date
      const datePart = dt.toISOString().split("T")[0];
      if (datePart === undefined) {
        throw CborError.custom("Invalid ISO string format");
      }
      return datePart;
    } else {
      // Show full ISO datetime without milliseconds (seconds precision).
      const iso = dt.toISOString();
      // Remove milliseconds: "2023-02-08T15:30:45.000Z" -> "2023-02-08T15:30:45Z"
      return iso.replace(/\.\d{3}Z$/, "Z");
    }
  }

  /**
   * Compare two dates for equality.
   *
   * @param other - Other CborDate to compare
   * @returns true if dates represent the same moment in time
   */
  equals(other: CborDate): boolean {
    return this._seconds === other._seconds;
  }

  /**
   * Compare two dates.
   *
   * @param other - Other CborDate to compare
   * @returns -1 if this < other, 0 if equal, 1 if this > other
   */
  compare(other: CborDate): number {
    if (this._seconds < other._seconds) return -1;
    if (this._seconds > other._seconds) return 1;
    return 0;
  }

  /**
   * Convert to JSON (returns ISO 8601 string).
   *
   * @returns ISO 8601 string
   */
  toJSON(): string {
    return this.toString();
  }

  private constructor() {
    this._seconds = Date.now() / 1000;
  }
}
