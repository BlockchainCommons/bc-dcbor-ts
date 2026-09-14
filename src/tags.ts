/**
 * Standard CBOR tag definitions from the IANA registry.
 *
 * This module defines the tag constants the library itself needs - most
 * importantly the date and bignum tags - along with helpers to register them
 * in a tags store and to resolve tag values to {@link Tag} objects.
 *
 * @module tags
 * @see https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml
 */

import { Tag } from "./tag";

// ============================================================================
// Standard Date/Time Tags
// ============================================================================

/**
 * Tag 0: Standard date/time string (RFC 3339)
 */
export const TAG_DATE_TIME_STRING = 0;

/**
 * Tag 1: Epoch-based date/time (seconds since 1970-01-01T00:00:00Z)
 */
export const TAG_EPOCH_DATE_TIME = 1;

/**
 * Tag 100: Epoch-based date (days since 1970-01-01)
 */
export const TAG_EPOCH_DATE = 100;

// ============================================================================
// Numeric Tags
// ============================================================================

/**
 * Tag 2: Positive bignum (unsigned arbitrary-precision integer)
 */
export const TAG_POSITIVE_BIGNUM = 2;

/**
 * Tag 3: Negative bignum (signed arbitrary-precision integer)
 */
export const TAG_NEGATIVE_BIGNUM = 3;

/**
 * Name for tag 2 (positive bignum).
 */
export const TAG_NAME_POSITIVE_BIGNUM = "positive-bignum";

/**
 * Name for tag 3 (negative bignum).
 */
export const TAG_NAME_NEGATIVE_BIGNUM = "negative-bignum";

/**
 * Tag 4: Decimal fraction [exponent, mantissa]
 */
export const TAG_DECIMAL_FRACTION = 4;

/**
 * Tag 5: Bigfloat [exponent, mantissa]
 */
export const TAG_BIGFLOAT = 5;

// ============================================================================
// Encoding Hints
// ============================================================================

/**
 * Tag 21: Expected conversion to base64url encoding
 */
export const TAG_BASE64URL = 21;

/**
 * Tag 22: Expected conversion to base64 encoding
 */
export const TAG_BASE64 = 22;

/**
 * Tag 23: Expected conversion to base16 encoding
 */
export const TAG_BASE16 = 23;

/**
 * Tag 24: Encoded CBOR data item
 */
export const TAG_ENCODED_CBOR = 24;

// ============================================================================
// URI and Network Tags
// ============================================================================

/**
 * Tag 32: URI (text string)
 */
export const TAG_URI = 32;

/**
 * Tag 33: base64url-encoded text
 */
export const TAG_BASE64URL_TEXT = 33;

/**
 * Tag 34: base64-encoded text
 */
export const TAG_BASE64_TEXT = 34;

/**
 * Tag 35: Regular expression (PCRE/ECMA262)
 */
export const TAG_REGEXP = 35;

/**
 * Tag 36: MIME message
 */
export const TAG_MIME_MESSAGE = 36;

/**
 * Tag 37: Binary UUID
 */
export const TAG_UUID = 37;

// ============================================================================
// Reference / UUID / Set Tags
// ============================================================================

/**
 * Tag 256: string reference (namespace)
 */
export const TAG_STRING_REF_NAMESPACE = 256;

/**
 * Tag 257: binary UUID reference
 */
export const TAG_BINARY_UUID = 257;

/**
 * Tag 258: Set of values (array with no duplicates)
 */
export const TAG_SET = 258;

// ============================================================================
// Self-describing CBOR
// ============================================================================

/**
 * Tag 55799: Self-describe CBOR (magic number 0xd9d9f7)
 */
export const TAG_SELF_DESCRIBE_CBOR = 55799;

// ============================================================================
// Global Tags Store Registration
// ============================================================================

import type { TagsStore, SummarizerResult } from "./tags-store";
import { getGlobalTagsStore } from "./tags-store";
import { CborDate } from "./date";
import { CborError } from "./error";
import { type Cbor } from "./cbor";
import { biguintFromUntaggedCbor, bigintFromNegativeUntaggedCbor } from "./bignum";

export const TAG_DATE = 1;
export const TAG_NAME_DATE = "date";

/**
 * Register the standard tags (date, bignums) and their summarizers into
 * `store`.
 *
 * Re-registering is idempotent and moves each standard name back to its
 * standard value, as the reference's `insert_all` does: a store that had
 * named tag 99 `date` names tag 1 `date` afterwards. Registering tag 1 (or
 * 2/3 with `bignum`) under a different name throws `CborError` `Custom`
 * from the store's conflict validation, before any summarizer is set.
 *
 * @param store - Target store; defaults to the global tags store.
 */
/** Options for {@link registerStandardTags}. */
export interface RegisterStandardTagsOptions {
  /**
   * Also register the bignum tags 2 and 3 with their names and summarizers.
   * Off by default: the reference names them only when built with its
   * `num-bigint` feature, which no crate in the Blockchain Commons stack
   * enables, so a Rust peer prints `2(h'…')` where an opted-in store prints
   * `bignum(…)`.
   */
  readonly bignum?: boolean | undefined;
}

export const registerStandardTags = (
  store: TagsStore = getGlobalTagsStore(),
  options: RegisterStandardTagsOptions = {},
): void => {
  const bignum = options.bignum ?? false;
  const tagsStore = store;
  tagsStore.registerAll([Tag.from(TAG_DATE, TAG_NAME_DATE)]);

  // Set summarizer for date tag
  tagsStore.setSummarizer(TAG_DATE, (untaggedCbor: Cbor, _flat: boolean): SummarizerResult => {
    try {
      return { ok: true, value: CborDate.fromUntaggedCbor(untaggedCbor).toString() };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: CborError.custom(message) };
    }
  });

  if (!bignum) return;

  // Register bignum tags (the reference's `num-bigint` build).
  tagsStore.registerAll([
    Tag.from(TAG_POSITIVE_BIGNUM, TAG_NAME_POSITIVE_BIGNUM),
    Tag.from(TAG_NEGATIVE_BIGNUM, TAG_NAME_NEGATIVE_BIGNUM),
  ]);

  // Summarizer for tag 2 (positive bignum)
  tagsStore.setSummarizer(
    TAG_POSITIVE_BIGNUM,
    (untaggedCbor: Cbor, _flat: boolean): SummarizerResult => {
      try {
        const value = biguintFromUntaggedCbor(untaggedCbor);
        return { ok: true, value: `bignum(${value})` };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: CborError.custom(message) };
      }
    },
  );

  // Summarizer for tag 3 (negative bignum)
  tagsStore.setSummarizer(
    TAG_NEGATIVE_BIGNUM,
    (untaggedCbor: Cbor, _flat: boolean): SummarizerResult => {
      try {
        const value = bigintFromNegativeUntaggedCbor(untaggedCbor);
        return { ok: true, value: `bignum(${value})` };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: CborError.custom(message) };
      }
    },
  );
};

/**
 * Converts an array of tag values to their corresponding Tag objects.
 *
 * This function looks up each tag value in the global tag registry and returns
 * an array of complete Tag objects. For any tag values that aren't
 * registered in the global registry, it creates a basic Tag with just the
 * value (no name).
 *
 * @param values - Array of numeric tag values to convert
 * @returns Array of Tag objects corresponding to the input values
 *
 * @example
 * ```typescript
 * // Register some tags first
 * registerStandardTags();
 *
 * // Convert tag values to Tag objects
 * const tags = tagsForValues([1, 42, 999]);
 *
 * // The first tag (value 1) should be registered as "date"
 * console.log(tags[0].value); // 1
 * console.log(tags[0].name); // "date"
 *
 * // Unregistered tags will have a value but no name
 * console.log(tags[1].value); // 42
 * console.log(tags[2].value); // 999
 * ```
 */
export const tagsForValues = (values: (number | bigint)[]): Tag[] => {
  const globalStore = getGlobalTagsStore();
  return values.map((value) => {
    const tag = globalStore.tagForValue(value);
    if (tag !== undefined) {
      return tag;
    }
    // Create basic tag with just the value
    return Tag.from(value);
  });
};
