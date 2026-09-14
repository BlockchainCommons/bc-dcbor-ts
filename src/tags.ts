/**
 * The tags the library itself defines - date (1) and the bignums (2, 3), as
 * the reference's `tags.rs` - with helpers to register them in a tags store
 * and to resolve tag values to {@link Tag} objects.
 *
 * @module tags
 * @see https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml
 */

import { Tag } from "./tag";

/**
 * Tag 2: Positive bignum (unsigned arbitrary-precision integer)
 */
export const TAG_POSITIVE_BIGNUM = 2;

/**
 * Tag 3: Negative bignum (arbitrary-precision negative integer)
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

// ============================================================================
// Global Tags Store Registration
// ============================================================================

import type { TagsStore, SummarizerResult } from "./tags-store";
import { getGlobalTagsStore } from "./tags-store";
import { CborDate } from "./date";
import { CborError } from "./error";
import { type Cbor } from "./cbor";
import { biguintFromUntaggedCbor, bigintFromNegativeUntaggedCbor } from "./bignum";

/**
 * Tag 1: Epoch-based date/time (seconds since 1970-01-01T00:00:00Z)
 */
export const TAG_DATE = 1;

/**
 * Name for tag 1 (date).
 */
export const TAG_NAME_DATE = "date";

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

/**
 * Register the standard tags (date, and the bignums with `bignum`) and their
 * summarizers into `store`.
 *
 * Re-registering is idempotent and moves each standard name back to its
 * standard value, as the reference's `insert_all` does: a store that had
 * named tag 99 `date` names tag 1 `date` afterwards. Registering tag 1 (or
 * 2/3 with `bignum`) under a different name throws `CborError` `Custom`
 * from the store's conflict validation, before any summarizer is set.
 *
 * @param store - Target store; defaults to the global tags store.
 */
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
 * Resolve tag values through the global tags store. A value the store does
 * not know becomes an unnamed `Tag`.
 *
 * @example
 * ```typescript
 * registerStandardTags();
 * const tags = tagsForValues([1, 42]);
 * tags[0].name; // "date"
 * tags[1].name; // undefined
 * ```
 */
export const tagsForValues = (values: (number | bigint)[]): Tag[] => {
  const globalStore = getGlobalTagsStore();
  return values.map((value) => {
    const tag = globalStore.tagForValue(value);
    if (tag !== undefined) {
      return tag;
    }
    return Tag.from(value);
  });
};
