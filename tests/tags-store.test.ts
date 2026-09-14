/**
 * Tests for TagsStore validation matching Rust bc-dcbor-rust behavior.
 */

import { TagsStore, Tag } from "../src";

describe("TagsStore", () => {
  let store: TagsStore;

  beforeEach(() => {
    store = new TagsStore();
  });

  describe("register validation (matching Rust behavior)", () => {
    it("should register a tag with a valid name", () => {
      const tag = Tag.from(100, "test-tag");
      expect(() => store.register(tag)).not.toThrow();
      expect(store.tagForValue(100)).toEqual(tag);
      expect(store.tagForName("test-tag")).toEqual(tag);
    });

    it("should throw when inserting a tag without a name", () => {
      const tag = Tag.from(100);
      expect(() => store.register(tag)).toThrow("Tag 100 must have a non-empty name");
    });

    it("should throw when inserting a tag with empty name", () => {
      const tag = Tag.from(100, "");
      expect(() => store.register(tag)).toThrow("Tag 100 must have a non-empty name");
    });

    it("should throw when registering tag with conflicting name", () => {
      store.register(Tag.from(100, "first-name"));
      expect(() => store.register(Tag.from(100, "different-name"))).toThrow(
        "Attempt to register tag: 100 'first-name' with different name: 'different-name'",
      );
    });

    it("should allow re-registering tag with same name", () => {
      store.register(Tag.from(100, "same-name"));
      expect(() => store.register(Tag.from(100, "same-name"))).not.toThrow();
    });

    it("should allow different tags with different values", () => {
      store.register(Tag.from(100, "tag-100"));
      store.register(Tag.from(200, "tag-200"));
      expect(store.tagForValue(100)?.name).toBe("tag-100");
      expect(store.tagForValue(200)?.name).toBe("tag-200");
    });

    it("should handle bigint tag values", () => {
      const bigValue = 9007199254740993n; // Larger than MAX_SAFE_INTEGER
      store.register(Tag.from(bigValue, "big-tag"));
      expect(store.tagForValue(bigValue)?.name).toBe("big-tag");

      // Should also throw on conflict with bigint
      expect(() => store.register(Tag.from(bigValue, "different-name"))).toThrow(
        `Attempt to register tag: ${bigValue} 'big-tag' with different name: 'different-name'`,
      );
    });
  });

  describe("registerAll validation", () => {
    it("should register all valid tags", () => {
      const tags = [Tag.from(1, "one"), Tag.from(2, "two"), Tag.from(3, "three")];
      expect(() => store.registerAll(tags)).not.toThrow();
      expect(store.tagForValue(1)?.name).toBe("one");
      expect(store.tagForValue(2)?.name).toBe("two");
      expect(store.tagForValue(3)?.name).toBe("three");
    });

    it("should throw on first invalid tag", () => {
      const tags = [
        Tag.from(1, "one"),
        Tag.from(2), // Invalid - no name
        Tag.from(3, "three"),
      ];
      expect(() => store.registerAll(tags)).toThrow("Tag 2 must have a non-empty name");
      // First tag should have been inserted before the error
      expect(store.tagForValue(1)?.name).toBe("one");
    });

    it("should throw on conflicting tag in batch", () => {
      store.register(Tag.from(2, "original-name"));
      const tags = [Tag.from(1, "one"), Tag.from(2, "different-name"), Tag.from(3, "three")];
      expect(() => store.registerAll(tags)).toThrow(
        "Attempt to register tag: 2 'original-name' with different name: 'different-name'",
      );
    });
  });

  describe("lookup operations (matching Rust trait, TS ReadonlyTagsStore)", () => {
    it("should look up tag by value", () => {
      store.register(Tag.from(42, "answer"));
      expect(store.tagForValue(42)?.name).toBe("answer");
      expect(store.tagForValue(999)).toBeUndefined();
    });

    it("should look up tag by name", () => {
      store.register(Tag.from(42, "answer"));
      expect(store.tagForName("answer")?.value).toBe(42);
      expect(store.tagForName("unknown")).toBeUndefined();
    });

    it("should get name for value", () => {
      store.register(Tag.from(42, "answer"));
      expect(store.nameForValue(42)).toBe("answer");
      expect(store.nameForValue(999)).toBe("999"); // Falls back to string value
    });

    it("should get assigned name for tag", () => {
      store.register(Tag.from(42, "answer"));
      expect(store.assignedNameForTag(Tag.from(42, "any"))).toBe("answer");
      expect(store.assignedNameForTag(Tag.from(999, "unknown"))).toBeUndefined();
    });

    it("should get name for tag", () => {
      store.register(Tag.from(42, "answer"));
      expect(store.nameForTag(Tag.from(42, "any"))).toBe("answer");
      // Falls back to string value when not registered
      expect(store.nameForTag(Tag.from(999, "unknown"))).toBe("999");
    });
  });

  describe("summarizers", () => {
    it("should set and get summarizers", () => {
      const summarizer = () => ({ ok: true as const, value: "summary" });
      store.setSummarizer(42, summarizer);
      expect(store.summarizer(42)).toBe(summarizer);
      expect(store.summarizer(999)).toBeUndefined();
    });
  });
});

describe("registerStandardTags registers unconditionally, like insert_all", () => {
  it("moves the standard name back to the standard value", async () => {
    const { registerStandardTags } = await import("../src/tags");
    const store = new TagsStore();
    store.register(Tag.from(1, "date"));
    store.register(Tag.from(99, "date"));
    expect(store.tagForName("date")?.value).toBe(99);
    registerStandardTags(store);
    expect(store.tagForName("date")?.value).toBe(1);
    expect(store.nameForValue(99)).toBe("date"); // the by-value entry stays, as in the reference
    expect(store.nameForValue(1)).toBe("date");
  });
  it("does the same for the bignum tags with { bignum: true }", async () => {
    const { registerStandardTags } = await import("../src/tags");
    const store = new TagsStore();
    store.register(Tag.from(2, "positive-bignum"));
    store.register(Tag.from(98, "positive-bignum"));
    registerStandardTags(store, { bignum: true });
    expect(store.tagForName("positive-bignum")?.value).toBe(2);
    expect(store.tagForName("negative-bignum")?.value).toBe(3);
  });
  it("throws Custom for a conflicting name on tag 1 and sets no summarizer", async () => {
    const { registerStandardTags } = await import("../src/tags");
    const { CborError } = await import("../src");
    const store = new TagsStore();
    store.register(Tag.from(1, "other"));
    let error: unknown;
    try {
      registerStandardTags(store);
    } catch (e) {
      error = e;
    }
    expect(CborError.isCborError(error) && error.code).toBe("Custom");
    expect(CborError.isCborError(error) && error.message).toBe(
      "Attempt to register tag: 1 'other' with different name: 'date'",
    );
    expect(store.summarizer(1)).toBeUndefined();
    expect(store.nameForValue(1)).toBe("other");
  });
  it("registerAll accepts a readonly array or any iterable", () => {
    const store = new TagsStore();
    const frozen: readonly Tag[] = Object.freeze([Tag.from(5, "five")]);
    store.registerAll(frozen);
    store.registerAll(new Set([Tag.from(6, "six")]));
    expect(store.nameForValue(5)).toBe("five");
    expect(store.nameForValue(6)).toBe("six");
  });
});

describe("tags are frozen values; the store keeps them by identity", () => {
  it("Tag.from returns a frozen object", () => {
    expect(Object.isFrozen(Tag.from(1, "date"))).toBe(true);
    expect(Object.isFrozen(Tag.from(12345))).toBe(true);
  });
  it("a mutable literal is copied, so later mutation does not reach the store", () => {
    const store = new TagsStore();
    const literal = { value: 7, name: "seven" };
    store.register(literal);
    literal.name = "changed";
    expect(store.nameForValue(7)).toBe("seven");
    expect(store.tagForName("seven")?.value).toBe(7);
    expect(Object.isFrozen(store.tagForValue(7))).toBe(true);
  });
  it("a frozen caller tag is stored by identity", async () => {
    const { registerStandardTags } = await import("../src/tags");
    const store = new TagsStore();
    const eight = Tag.from(8, "eight");
    store.register(eight);
    expect(store.tagForValue(8)).toBe(eight);
    expect(store.tagForName("eight")).toBe(eight);
    registerStandardTags(store);
    expect(Object.isFrozen(store.tagForValue(1))).toBe(true);
  });
});

describe("TagsStore.clone mirrors #[derive(Clone)]", () => {
  it("answers every lookup like the original and shares frozen tags and summarizers", () => {
    const store = new TagsStore();
    const answer = Tag.from(42, "answer");
    store.register(answer);
    const summarizer = () => ({ ok: true as const, value: "summary" });
    store.setSummarizer(42, summarizer);
    const copy = store.clone();
    expect(copy).toBeInstanceOf(TagsStore);
    expect(copy).not.toBe(store);
    expect(copy.tagForValue(42)).toBe(answer);
    expect(copy.tagForName("answer")).toBe(answer);
    expect(copy.nameForValue(42)).toBe("answer");
    expect(copy.summarizer(42)).toBe(summarizer);
  });
  it("registrations and summarizers set on one store do not reach the other", () => {
    const store = new TagsStore();
    store.register(Tag.from(1, "one"));
    const copy = store.clone();
    copy.register(Tag.from(2, "two"));
    copy.setSummarizer(2, () => ({ ok: true as const, value: "two" }));
    store.register(Tag.from(3, "three"));
    expect(store.tagForValue(2)).toBeUndefined();
    expect(store.summarizer(2)).toBeUndefined();
    expect(copy.tagForValue(3)).toBeUndefined();
    expect(copy.nameForValue(1)).toBe("one");
  });
});

describe("one global tags store per process", () => {
  it("lives on globalThis under the registered symbol", async () => {
    const { getGlobalTagsStore } = await import("../src");
    const slot = globalThis as { [k: symbol]: unknown };
    const key = Symbol.for("@blockchaincommons/dcbor/global-tags-store@1");
    const store = getGlobalTagsStore();
    expect(slot[key]).toBe(store);
    expect(getGlobalTagsStore()).toBe(getGlobalTagsStore());
    expect(getGlobalTagsStore().clone()).not.toBe(getGlobalTagsStore());
  });
});

describe("registerStandardTags: the bignum tags are opt-in", () => {
  it("names only the date tag by default, as the reference without num-bigint", async () => {
    const { registerStandardTags, TAG_DATE, TAG_POSITIVE_BIGNUM, TAG_NEGATIVE_BIGNUM } =
      await import("../src/tags");
    const store = new TagsStore();
    registerStandardTags(store);
    expect(store.tagForValue(TAG_DATE)?.name).toBe("date");
    expect(store.tagForValue(TAG_POSITIVE_BIGNUM)).toBeUndefined();
    expect(store.tagForValue(TAG_NEGATIVE_BIGNUM)).toBeUndefined();
    expect(store.summarizer(BigInt(TAG_POSITIVE_BIGNUM))).toBeUndefined();
  });
  it("names them with { bignum: true }, as the reference's num-bigint build", async () => {
    const { registerStandardTags, TAG_POSITIVE_BIGNUM, TAG_NEGATIVE_BIGNUM } =
      await import("../src/tags");
    const store = new TagsStore();
    registerStandardTags(store, { bignum: true });
    expect(store.tagForValue(TAG_POSITIVE_BIGNUM)?.name).toBe("positive-bignum");
    expect(store.tagForValue(TAG_NEGATIVE_BIGNUM)?.name).toBe("negative-bignum");
    expect(store.summarizer(BigInt(TAG_POSITIVE_BIGNUM))).toBeDefined();
  });
  it("a registration conflict is the package's CborError", async () => {
    const { CborError } = await import("../src");
    const store = new TagsStore();
    store.register(Tag.from(100, "first-name"));
    try {
      store.register(Tag.from(100, "different-name"));
      expect.unreachable();
    } catch (e) {
      expect(CborError.isCborError(e)).toBe(true);
      expect(CborError.isCborError(e) && e.code).toBe("Custom");
    }
  });
});
