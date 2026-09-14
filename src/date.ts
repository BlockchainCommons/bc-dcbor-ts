/**
 * Date/time support for CBOR with tag 1 encoding.
 *
 * The `CborDate` type holds an instant as whole seconds since the Unix epoch
 * plus nanoseconds - the same model as the reference's `chrono::DateTime` -
 * and encodes and decodes it to/from CBOR with tag 1, following the CBOR
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
import { getGlobalTagsStore } from "./tags-store";
import { type CborTagged, type CborCodec, validateTag, extractTaggedContent } from "./codable";
import { CborError } from "./error";

/**
 * The reference's representable range: chrono's `NaiveDateTime::MIN`
 * (−262143-01-01T00:00:00) and `MAX` (262142-12-31T23:59:59.999999999) as
 * Unix seconds. Beyond it `Date::from_timestamp` panics (`timestamp_opt(…)
 * .unwrap()`); here it is `InvalidDate`. JS `Date` reaches further (±8.64e12
 * s), so `toDate()` can represent every accepted value.
 */
const MIN_TIMESTAMP_SECONDS = -8_334_601_228_800;
const MAX_TIMESTAMP_SECONDS = 8_210_266_876_799;

/** `f64::exact_from_u64`: the magnitude as a number, or `OutOfRange` when inexact. */
function exactNumber(magnitude: bigint): number {
  const n = Number(magnitude);
  if (!Number.isFinite(n) || BigInt(n) !== magnitude) throw CborError.outOfRange();
  return n;
}

/** chrono's `NaiveDate` year range (`MIN_YEAR` / `MAX_YEAR`). */
const MIN_YEAR = -262_143;
const MAX_YEAR = 262_142;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const daysInMonth = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);

/**
 * Days since 1970-01-01 of a proleptic-Gregorian civil date (the components
 * must already be valid). Pure integer arithmetic, as chrono computes it: JS
 * `Date.UTC` would map years 0–99 to 1900–1999.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** The civil date of a day count since 1970-01-01 (inverse of `daysFromCivil`). */
function civilFromDays(days: number): [number, number, number] {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return [year, month, day];
}

/**
 * Whole seconds since the Unix epoch of the given UTC components, or
 * `undefined` when they are not a valid date-time. The checks are chrono's
 * (`NaiveDate::from_ymd_opt`, `NaiveTime::from_hms_opt`): the year within
 * −262143…+262142, a calendar-valid month and day, and `hh:mm:ss` within 23:59:59.
 */
function civilSeconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | undefined {
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return undefined;
  if (year < MIN_YEAR || year > MAX_YEAR) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return undefined;
  }
  return daysFromCivil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second;
}

/** Rust's `char::is_whitespace` (Unicode `White_Space`), as a character class. */
const WHITESPACE =
  "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";

/**
 * chrono's fixed-layout RFC 3339 grammar (`DateTime::parse_from_rfc3339`):
 * `YYYY-MM-DD`, a `T`/`t`/space separator, `hh:mm:ss`, an optional fraction
 * of which the first nine digits count, then `Z`/`z` or `±hh:mm` (U+2212 is
 * accepted as the minus sign). Nothing may follow.
 */
const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9})\d*)?(?:[Zz]|([+\-\u2212])(\d{2}):(\d{2}))$/;

/**
 * chrono's strftime `%Y-%m-%d` (`NaiveDate::parse_from_str`): each number may
 * be preceded by whitespace; `%Y` is one to four digits, or a sign followed by
 * any number of digits; `%m` and `%d` are one or two digits; nothing may
 * follow.
 */
const YMD = new RegExp(
  `^${WHITESPACE}*(?:([+-])(\\d+)|(\\d{1,4}))-${WHITESPACE}*(\\d{1,2})-${WHITESPACE}*(\\d{1,2})$`,
);

/**
 * Split a timestamp (seconds since the Unix epoch) into the (whole seconds,
 * nanoseconds) pair the reference's `Date::from_timestamp` builds:
 *
 * - `trunc() as i64` for the seconds - NaN saturates to 0 (the epoch);
 *   ±Infinity saturates to the `i64` bounds, which chrono rejects and the
 *   reference then panics on, so here it is `InvalidDate`;
 * - `(fract() * 1e9) as u32` for the nanoseconds - truncated toward zero and
 *   saturated to `[0, u32::MAX]`, so a negative fraction is dropped (`-1.5`
 *   becomes `-1`) and sub-nanosecond precision is lost;
 * - `timestamp_opt(...)` then requires the whole seconds inside chrono's
 *   range (the fraction does not take part, so `MIN - 0.5` is `MIN`).
 *
 * @internal
 */
function timestampParts(seconds: number): [whole: number, nanoseconds: number] {
  if (Number.isNaN(seconds)) return [0, 0];
  if (!Number.isFinite(seconds)) throw CborError.invalidDate("non-finite timestamp");
  const whole = Math.trunc(seconds);
  if (whole < MIN_TIMESTAMP_SECONDS || whole > MAX_TIMESTAMP_SECONDS) {
    throw CborError.invalidDate("timestamp outside the representable range");
  }
  let nanoseconds = Math.trunc((seconds - whole) * 1_000_000_000);
  if (nanoseconds < 0) {
    nanoseconds = 0;
  } else if (nanoseconds > 0xffffffff) {
    nanoseconds = 0xffffffff;
  }
  return [whole, nanoseconds];
}

let dateCodec: CborCodec<CborDate> | undefined;

/**
 * A UTC date and time, encoded as CBOR tag 1 (RFC 8949 epoch-based
 * date/time).
 *
 * The instant is held as whole seconds since the Unix epoch plus nanoseconds.
 * On the wire it is tag 1 followed by the seconds since (or before)
 * 1970-01-01T00:00:00Z: an integer for whole seconds, a float otherwise.
 * Implements the `CborTagged` interface and the `ToCbor` protocol.
 *
 * @example
 * ```typescript
 * import { CborDate } from "@blockchaincommons/dcbor";
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
export class CborDate implements CborTagged {
  /** Debug label: `Object.prototype.toString` reports `[object CborDate]`. */
  // A prototype getter has zero per-instance cost; the readonly field the
  // stylistic rule prefers would allocate one own property per instance.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag](): string {
    return "CborDate";
  }

  /**
   * The instant as the reference's `chrono::DateTime<Utc>` holds it: whole
   * seconds since the Unix epoch plus a nanosecond part in
   * `[0, 1_999_999_999]` (values from 10⁹ up represent a leap second, e.g.
   * `23:59:60`, as chrono does). Keeping the pair rather than one `f64`
   * means display, equality and ordering see exactly what the reference
   * sees; the wire value is derived from it as `timestamp()` does.
   */
  private readonly _seconds: number;
  private readonly _nanoseconds: number;

  /**
   * Creates a new `CborDate` from the given JavaScript `Date`.
   *
   * @param dateTime - A `Date` instance
   *
   * @returns A new `CborDate` instance
   *
   * @throws `InvalidDate` for an invalid `Date` (`NaN` time) or one outside
   *   the reference's representable range (years −262143 to 262142), which a chrono
   *   value handed to `Date::from_datetime` can never be.
   *
   * @example
   * ```typescript
   * const datetime = new Date();
   * const date = CborDate.fromDate(datetime);
   * ```
   */
  static fromDate(dateTime: Date): CborDate {
    const ms = dateTime.getTime();
    // The reference's `from_datetime` receives a chrono value, which is
    // always finite and within chrono's range; a JS `Date` can be invalid
    // (NaN) or reach ±8.64e12 s, so those are rejected here as
    // `fromEpochSeconds` rejects them.
    if (!Number.isFinite(ms)) throw CborError.invalidDate("non-finite timestamp");
    const whole = Math.floor(ms / 1000);
    if (whole < MIN_TIMESTAMP_SECONDS || whole > MAX_TIMESTAMP_SECONDS) {
      throw CborError.invalidDate("timestamp outside the representable range");
    }
    // The millisecond part is exact in nanoseconds.
    return new CborDate(whole, (ms - whole * 1000) * 1_000_000);
  }

  /**
   * Creates a new `CborDate` from year, month, and day components, at
   * 00:00:00 UTC.
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
   * @throws `InvalidDate` if the components do not form a valid date (the
   *   reference panics there).
   */
  static fromYmd(year: number, month: number, day: number): CborDate {
    return CborDate.fromYmdHms(year, month, day, 0, 0, 0);
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
   * @throws `InvalidDate` if the components do not form a valid date and time
   *   — the checks the reference's `with_ymd_and_hms(…).unwrap()` panics on:
   *   a year outside −262143…+262142, an impossible month or day, or a time past
   *   23:59:59 (no leap second here; `fromString` accepts `:60`).
   */
  static fromYmdHms(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): CborDate {
    const seconds = civilSeconds(year, month, day, hour, minute, second);
    if (seconds === undefined) throw CborError.invalidDate("Invalid date components");
    return new CborDate(seconds, 0);
  }

  /**
   * Creates a new `CborDate` from seconds since the Unix epoch
   * (1970-01-01T00:00:00Z); negative values are before the epoch.
   *
   * The value is split as the reference's `from_timestamp` splits it: whole
   * seconds by truncation toward zero, then the fraction in nanoseconds
   * (truncated, never negative), so `-1.5` is the instant `-1` and
   * `1.0000000001` is `1`. `NaN` is the epoch, as the reference's saturating
   * cast makes it.
   *
   * @param secondsSinceUnixEpoch - Seconds from the Unix epoch (positive or
   *   negative), which can include a fractional part for sub-second
   *   precision
   *
   * @returns A new `CborDate` instance
   *
   * @throws `InvalidDate` for ±Infinity, or when the whole seconds fall
   *   outside the reference's representable range (years −262143 to 262142),
   *   where the reference panics.
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
    const [seconds, nanoseconds] = timestampParts(secondsSinceUnixEpoch);
    return new CborDate(seconds, nanoseconds);
  }

  /**
   * Creates a new `CborDate` from a string containing an ISO-8601 (RFC-3339)
   * date (with or without time).
   *
   * Accepts exactly what the reference's `Date::from_string` accepts:
   *
   * - An RFC 3339 date-time (`2023-02-08T15:30:45Z`, `…45.123456789+05:30`),
   *   with `T`, `t` or a space between date and time, up to nine fraction
   *   digits kept (further digits are ignored), `Z`/`z` or an offset within
   *   ±23:59, and the `:60` leap second (read as second 59 plus one second,
   *   as chrono represents it).
   * - A bare date read as UTC midnight, in chrono's `%Y-%m-%d` form: one to
   *   four year digits or a signed year of any length (`-0001-01-01`,
   *   `+12023-02-08`), one- or two-digit month and day, with whitespace
   *   allowed before each number (`2023-2-8`, ` 2023-02-08`).
   *
   * The fraction is kept exactly as nanoseconds, so a decimal fraction
   * encodes to the same bytes on both sides (`timestamp()`: whole seconds
   * plus nanoseconds over 10⁹) and a leap second still displays as `:60`.
   *
   * @param value - A string containing a date or date-time in ISO-8601/RFC-3339
   *   format
   *
   * @returns A new `CborDate` instance if parsing succeeds
   *
   * @throws `InvalidDate` if the string cannot be parsed as a valid date or
   *   date-time (an impossible calendar date, a time past `23:59:60`, an
   *   offset beyond ±23:59, a missing offset, or trailing characters).
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
    const invalidDate = (): CborError => CborError.invalidDate("Invalid date string");

    // RFC 3339 first, as the reference tries `DateTime::parse_from_rfc3339`
    // before the bare-date form.
    const dt = RFC3339.exec(value);
    if (dt !== null) {
      const [, y, mo, d, h, mi, sec, frac = "", sign, oh, om] = dt;
      let second = Number(sec);
      // `scan::nanosecond`: the digits scaled to nanoseconds; `:60` is the
      // leap second, second 59 plus 1_000_000_000 ns (`from_hms_nano_opt`
      // accepts up to 1_999_999_999).
      let nanoseconds = frac === "" ? 0 : Number(frac.padEnd(9, "0"));
      if (second === 60) {
        second = 59;
        nanoseconds += 1_000_000_000;
      }
      // `timezone_offset` + `FixedOffset::east_opt`: minutes 00–59, and the
      // whole offset under 24 h (so hours 00–23).
      const offsetHours = sign === undefined ? 0 : Number(oh);
      const offsetMinutes = sign === undefined ? 0 : Number(om);
      if (offsetHours > 23 || offsetMinutes > 59) throw invalidDate();
      const offset = (sign === "+" ? 1 : -1) * (offsetHours * 3_600 + offsetMinutes * 60);
      const whole = civilSeconds(Number(y), Number(mo), Number(d), Number(h), Number(mi), second);
      if (whole === undefined) throw invalidDate();
      return new CborDate(whole - offset, nanoseconds);
    }

    const ymd = YMD.exec(value);
    if (ymd !== null) {
      const [, sign, signedYear, plainYear, mo, d] = ymd;
      const year = sign === undefined ? Number(plainYear) : Number(`${sign}${signedYear}`);
      const whole = civilSeconds(year, Number(mo), Number(d), 0, 0, 0);
      if (whole === undefined) throw invalidDate();
      return new CborDate(whole, 0);
    }

    throw invalidDate();
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
   * Returns a new JavaScript `Date` for this instant (millisecond precision;
   * sub-millisecond digits are lost).
   *
   * @returns A new `Date` instance
   *
   * @example
   * ```typescript
   * const date = CborDate.now();
   * const datetime = date.toDate();
   * const year = datetime.getFullYear();
   * ```
   */
  toDate(): Date {
    return new Date(this.epochSeconds * 1000);
  }

  /**
   * The date as the number of seconds since the Unix epoch
   * (1970-01-01T00:00:00Z), as a floating-point `number`. Negative values
   * represent times before the epoch; the fractional part is sub-second
   * precision.
   *
   * This is the reference's `timestamp()`: whole seconds plus nanoseconds
   * over 10⁹, computed in `f64`, and it is the value that goes on the wire.
   *
   * @example
   * ```typescript
   * const date = CborDate.fromYmd(2023, 2, 8);
   * const timestamp = date.epochSeconds;
   * ```
   */
  get epochSeconds(): number {
    return this._seconds + this._nanoseconds / 1_000_000_000;
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
   * The CBOR tags for `CborDate`: tag 1, the RFC 8949 epoch-based date/time.
   *
   * The tag carries whatever name the global tags store has for 1 at the
   * time of the call (`tags_for_values` in the reference): `date` once
   * `registerStandardTags()` has run, otherwise none. That name is what a
   * `WrongTag` error prints as the expected tag.
   *
   * @returns An array containing tag 1
   */
  cborTags(): Tag[] {
    return [getGlobalTagsStore().tagForValue(TAG_EPOCH_DATE_TIME) ?? Tag.from(TAG_EPOCH_DATE_TIME)];
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
   * Creates a `CborDate` from an untagged CBOR value, which must be a number
   * (integer or floating-point) of seconds since the Unix epoch. The static
   * `CborDate.fromUntaggedCbor` is the usual entry point; this instance form
   * exists for the `CborTagged` protocol and returns a new instance.
   *
   * @param cbor - The untagged CBOR value
   *
   * @returns The decoded date
   *
   * @throws `WrongType` for a non-numeric value, `OutOfRange` for an integer
   *   `f64` cannot hold exactly, `InvalidDate` beyond the representable
   *   range. A float `NaN` is the epoch, as in the reference.
   */
  fromUntaggedCbor(cbor: Cbor): CborDate {
    let timestamp: number;

    // Only handle numeric types (Unsigned, Negative, Float); others are invalid for dates
    switch (cbor.type) {
      case MajorType.Unsigned:
        // The reference converts through `f64::exact_from_u64`: an integer
        // that `f64` cannot hold exactly is `OutOfRange`.
        timestamp = typeof cbor.value === "number" ? cbor.value : exactNumber(cbor.value);
        break;

      case MajorType.Negative:
        // Convert stored magnitude back to actual negative value (the same
        // exactness rule applies to the magnitude).
        if (typeof cbor.value === "bigint") {
          timestamp = -exactNumber(cbor.value) - 1;
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

    // Split as `from_timestamp` does, so e.g. a tag-1 float of -1.5 decodes
    // and re-encodes as the integer -1.
    return CborDate.fromEpochSeconds(timestamp);
  }

  /**
   * Creates a `CborDate` from a tag-1 CBOR value (the `CborTagged`
   * protocol's instance form; returns a new instance).
   *
   * @param cbor - Tagged CBOR value
   *
   * @returns The decoded date
   *
   * @throws {CborError} `WrongType` if the value is not tagged, `WrongTag`
   *   for a tag other than 1, or what `fromUntaggedCbor` throws for the content
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
    return CborDate.EPOCH.fromTaggedCbor(cbor);
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
      // Resolved per access, not memoized: the name follows the global store.
      get tags(): Tag[] {
        return CborDate.EPOCH.cborTags();
      },
      decode: (c: Cbor): CborDate => CborDate.fromTaggedCbor(c),
      encode: (value: CborDate): Cbor => value.taggedCbor(),
    };
    return dateCodec;
  }

  static fromUntaggedCbor(cbor: Cbor): CborDate {
    return CborDate.EPOCH.fromUntaggedCbor(cbor);
  }

  /** 1970-01-01T00:00:00Z: the receiver for the protocol's instance decoders. */
  private static readonly EPOCH = new CborDate(0, 0);

  /**
   * The date in ISO-8601 format: only the date part when the time is exactly
   * midnight (00:00:00), otherwise a date-time to the second with `Z`.
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
   * // Returns "2023-02-08T15:30:45Z"
   * console.log(date2.toString());
   * ```
   */
  toString(): string {
    // The reference's `Display`: `%Y-%m-%d` when the clock reads 00:00:00
    // (a fraction of a second does not count), otherwise RFC 3339 to the
    // second with `Z`. The year is four digits for 0–9999 and a sign plus at
    // least four digits beyond (`-0004`, `+12023`); JS `toISOString` would
    // print six digits there. A leap second (nanoseconds >= 10⁹) prints as
    // `:60`, as chrono formats it.
    const total = this._seconds;
    const days = Math.floor(total / 86_400);
    const secondOfDay = total - days * 86_400;
    const [year, month, day] = civilFromDays(days);
    const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
    const y =
      year >= 0 && year <= 9_999
        ? pad(year, 4)
        : `${year < 0 ? "-" : "+"}${pad(Math.abs(year), 4)}`;
    const date = `${y}-${pad(month)}-${pad(day)}`;
    if (secondOfDay === 0) return date;
    const hour = Math.floor(secondOfDay / 3_600);
    const minute = Math.floor((secondOfDay % 3_600) / 60);
    const second = (secondOfDay % 60) + (this._nanoseconds >= 1_000_000_000 ? 1 : 0);
    return `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`;
  }

  /**
   * Compare two dates for equality: the same whole seconds and the same
   * nanoseconds (chrono's `PartialEq`). A leap second `23:59:60` is a
   * different instant from the following `00:00:00`, although both encode
   * to the same wire value.
   *
   * @param other - Other CborDate to compare
   * @returns true if dates represent the same moment in time
   */
  equals(other: CborDate): boolean {
    return this._seconds === other._seconds && this._nanoseconds === other._nanoseconds;
  }

  /**
   * Compare two dates: by whole seconds, then by nanoseconds (chrono's
   * `Ord`, so a leap second sorts after `:59.999999999` and before the next
   * `:00`).
   *
   * @param other - Other CborDate to compare
   * @returns -1 if this < other, 0 if equal, 1 if this > other
   */
  compare(other: CborDate): number {
    if (this._seconds !== other._seconds) return this._seconds < other._seconds ? -1 : 1;
    if (this._nanoseconds !== other._nanoseconds) {
      return this._nanoseconds < other._nanoseconds ? -1 : 1;
    }
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

  private constructor(seconds: number, nanoseconds: number) {
    this._seconds = seconds;
    this._nanoseconds = nanoseconds;
  }
}
