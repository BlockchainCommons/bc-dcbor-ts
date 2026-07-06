/**
 * Tag registry and management system.
 *
 * The TagsStore provides a centralized registry for CBOR tags,
 * including name resolution and custom summarizer functions.
 *
 * @module tags-store
 */

import { type Cbor } from "./cbor";
import { type CborNumber } from "./cbor-types";
import type { Tag } from "./tag";
import type { CborError } from "./error";

/**
 * Result type for summarizer functions: a summary string or a CborError.
 */
export type SummarizerResult =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: CborError };

/**
 * Function type for custom CBOR value summarizers.
 *
 * Summarizers provide custom string representations for tagged values.
 * Returns a summary string on success, or a CborError on failure.
 *
 * @param cbor - The CBOR value to summarize
 * @param flat - If true, produce single-line output
 * @returns Result with summary string on success, or error on failure
 */
export type CborSummarizer = (cbor: Cbor, flat: boolean) => SummarizerResult;

/**
 * Selects which tag store the diagnostic/hex formatters consult when resolving
 * tag names and summarizers:
 *
 * - a concrete {@link TagsStore} to use
 * - `"global"` for the process-wide store
 * - `"none"` to skip name/summary resolution
 */
export type TagsStoreOpt = TagsStore | "global" | "none";

/**
 * The read-only tags-store surface.
 */
export interface ReadonlyTagsStore {
  /**
   * Get the assigned name for a tag, if any.
   *
   * @param tag - The tag to look up
   * @returns The assigned name, or undefined if no name is registered
   */
  assignedNameForTag(tag: Tag): string | undefined;

  /**
   * Get a display name for a tag.
   *
   * @param tag - The tag to get a name for
   * @returns The assigned name if available, otherwise the tag value as a string
   */
  nameForTag(tag: Tag): string;

  /**
   * Look up a tag by its numeric value.
   *
   * @param value - The numeric tag value
   * @returns The Tag object if found, undefined otherwise
   */
  tagForValue(value: CborNumber): Tag | undefined;

  /**
   * Look up a tag by its name.
   *
   * @param name - The tag name
   * @returns The Tag object if found, undefined otherwise
   */
  tagForName(name: string): Tag | undefined;

  /**
   * Get a display name for a tag value.
   *
   * @param value - The numeric tag value
   * @returns The tag name if registered, otherwise the value as a string
   */
  nameForValue(value: CborNumber): string;

  /**
   * Get a custom summarizer function for a tag, if registered.
   *
   * @param tag - The numeric tag value
   * @returns The summarizer function if registered, undefined otherwise
   */
  summarizer(tag: CborNumber): CborSummarizer | undefined;
}

/**
 * Tag registry implementation.
 *
 * Stores tags with their names and optional summarizer functions.
 */
export class TagsStore implements ReadonlyTagsStore {
  /** Debug label: `Object.prototype.toString` reports `[object TagsStore]`. */
  // A prototype getter has zero per-instance cost; the readonly field the
  // stylistic rule prefers would allocate one own property per instance.
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag](): string {
    return "TagsStore";
  }

  private readonly _tagsByValue = new Map<string, Tag>();
  private readonly _tagsByName = new Map<string, Tag>();
  private readonly _summarizers = new Map<string, CborSummarizer>();

  constructor() {
    // Starts empty; tags must be explicitly registered via register() or registerAll().
  }

  /**
   * Insert a tag into the registry.
   *
   * - Throws if the tag name is undefined or empty
   * - Throws if a tag with the same value exists with a different name
   * - Allows re-registering the same tag value with the same name
   *
   * @param tag - The tag to register (must have a non-empty name)
   * @throws Error if tag has no name, empty name, or conflicts with existing registration
   *
   * @example
   * ```typescript
   * const store = new TagsStore();
   * store.register(Tag.from(12345, 'myCustomTag'));
   * ```
   */
  register(tag: Tag): void {
    const name = tag.name;

    // A tag must carry a non-empty name to be registered.
    if (name === undefined || name === "") {
      throw new Error(`Tag ${tag.value} must have a non-empty name`);
    }

    const key = this._valueKey(tag.value);
    const existing = this._tagsByValue.get(key);

    // Reject re-registering the same value under a conflicting name.
    if (existing?.name !== undefined && existing.name !== name) {
      throw new Error(
        `Attempt to register tag: ${tag.value} '${existing.name}' with different name: '${name}'`,
      );
    }

    this._tagsByValue.set(key, tag);
    this._tagsByName.set(name, tag);
  }

  /**
   * Register multiple tags; the conflict-throwing validation in `register()`
   * applies per tag.
   */
  registerAll(tags: Tag[]): void {
    for (const tag of tags) {
      this.register(tag);
    }
  }

  /**
   * Register a custom summarizer function for a tag.
   *
   * @param tagValue - The numeric tag value
   * @param summarizer - The summarizer function
   *
   * @example
   * ```typescript
   * store.setSummarizer(1, (cbor, flat) => {
   *   // Custom date formatting
   *   return `Date(${extractCbor(cbor)})`;
   * });
   * ```
   */
  setSummarizer(tagValue: CborNumber, summarizer: CborSummarizer): void {
    const key = this._valueKey(tagValue);
    this._summarizers.set(key, summarizer);
  }

  assignedNameForTag(tag: Tag): string | undefined {
    const key = this._valueKey(tag.value);
    const stored = this._tagsByValue.get(key);
    return stored?.name;
  }

  nameForTag(tag: Tag): string {
    return this.assignedNameForTag(tag) ?? tag.value.toString();
  }

  tagForValue(value: CborNumber): Tag | undefined {
    const key = this._valueKey(value);
    return this._tagsByValue.get(key);
  }

  tagForName(name: string): Tag | undefined {
    return this._tagsByName.get(name);
  }

  nameForValue(value: CborNumber): string {
    const tag = this.tagForValue(value);
    return tag !== undefined ? this.nameForTag(tag) : value.toString();
  }

  summarizer(tag: CborNumber): CborSummarizer | undefined {
    const key = this._valueKey(tag);
    return this._summarizers.get(key);
  }

  /**
   * Create a string key for a numeric tag value.
   * Handles both number and bigint types.
   *
   * @private
   */
  private _valueKey(value: CborNumber): string {
    return value.toString();
  }
}

// ============================================================================
// Global Tags Store Singleton
// ============================================================================

/**
 * Global singleton instance of the tags store.
 */
let globalTagsStore: TagsStore | undefined;

/**
 * Get the global tags store instance.
 *
 * Creates the instance on first access.
 *
 * @returns The global TagsStore instance
 *
 * @example
 * ```typescript
 * const store = getGlobalTagsStore();
 * store.register(Tag.from(999, 'myTag'));
 * ```
 */
export const getGlobalTagsStore = (): TagsStore => {
  globalTagsStore ??= new TagsStore();
  return globalTagsStore;
};

/**
 * Execute a function with access to the global tags store.
 *
 * @template T - Return type of the action function
 * @param action - Function to execute with the tags store
 * @returns Result of the action function
 *
 * @example
 * ```typescript
 * const tagName = withTags(store => store.nameForValue(1));
 * console.log(tagName); // 'date'
 * ```
 */
export const withTags = <T>(action: (tags: TagsStore) => T): T => {
  return action(getGlobalTagsStore());
};
