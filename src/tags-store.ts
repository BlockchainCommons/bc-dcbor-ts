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
import { Tag } from "./tag";
import { CborError } from "./error";

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
   * The store holds frozen tags, as the reference stores clones it owns: a
   * frozen argument (every `Tag.from` result) is kept by identity, an
   * unfrozen object literal is copied, so later mutation of the caller's
   * object never changes a lookup.
   *
   * @param tag - The tag to register (must have a non-empty name)
   * @throws {CborError} `Custom` if the tag has no name, an empty name, or
   *   conflicts with an existing registration
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
      throw CborError.custom(`Tag ${tag.value} must have a non-empty name`);
    }

    const key = this._valueKey(tag.value);
    const existing = this._tagsByValue.get(key);

    // Reject re-registering the same value under a conflicting name.
    if (existing?.name !== undefined && existing.name !== name) {
      throw CborError.custom(
        `Attempt to register tag: ${tag.value} '${existing.name}' with different name: '${name}'`,
      );
    }

    const stored = Object.isFrozen(tag) ? tag : Tag.from(tag.value, name);
    this._tagsByValue.set(key, stored);
    this._tagsByName.set(name, stored);
  }

  /**
   * Register multiple tags; the conflict-throwing validation in `register()`
   * applies per tag. Accepts any iterable, including a `readonly` array.
   */
  registerAll(tags: Iterable<Tag>): void {
    for (const tag of tags) {
      this.register(tag);
    }
  }

  /**
   * An independent copy of this store (the reference's `#[derive(Clone)]`
   * on `TagsStore`).
   *
   * The clone holds the same frozen tags by identity and shares the
   * summarizer functions, as the reference's `Arc` summarizers are shared.
   * Registering a tag or setting a summarizer on either store leaves the
   * other unchanged. The clone is a plain store; it never replaces the
   * global store.
   */
  clone(): TagsStore {
    const copy = new TagsStore();
    for (const [key, tag] of this._tagsByValue) copy._tagsByValue.set(key, tag);
    for (const [name, tag] of this._tagsByName) copy._tagsByName.set(name, tag);
    for (const [key, summarizer] of this._summarizers) copy._summarizers.set(key, summarizer);
    return copy;
  }

  /**
   * Register a custom summarizer function for a tag.
   *
   * @param tagValue - The numeric tag value
   * @param summarizer - The summarizer function
   *
   * @example
   * ```typescript
   * store.setSummarizer(1, (cbor, flat) => ({
   *   ok: true,
   *   value: `Date(${extractCbor(cbor)})`,
   * }));
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

  /** Map key for a tag value, equal for a `number` and the same `bigint`. */
  private _valueKey(value: CborNumber): string {
    return value.toString();
  }
}

// ============================================================================
// Global Tags Store Singleton
// ============================================================================

/**
 * The slot the global store lives in. It is keyed on `globalThis` by a
 * registered symbol rather than held in a module variable so that every copy
 * of this module in a process - the ESM and CommonJS builds, or two bundled
 * copies - resolves the SAME store, the way the reference's `GLOBAL_TAGS`
 * static is one per process. The `@1` names the store's major version; bump
 * it on a breaking `TagsStore` change so incompatible copies do not share.
 */
const GLOBAL_TAGS_KEY = Symbol.for("@blockchaincommons/dcbor/global-tags-store@1");

interface GlobalSlot {
  [GLOBAL_TAGS_KEY]?: TagsStore;
}

/**
 * Get the global tags store instance.
 *
 * Creates the instance on first access. One store per process for dcbor
 * 1.x, shared by the ESM and CommonJS builds (see `GLOBAL_TAGS_KEY`).
 *
 * @returns The global TagsStore instance
 *
 * @example
 * ```typescript
 * const store = getGlobalTagsStore();
 * store.register(Tag.from(999, 'myTag'));
 * ```
 */
export const getGlobalTagsStore = (): TagsStore =>
  ((globalThis as GlobalSlot)[GLOBAL_TAGS_KEY] ??= new TagsStore());

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
