/**
 * Curated golden ENCODE corpus (API_REDESIGN_PLAN P1.1a).
 *
 * Every entry is a named, build-agnostic construction recipe. The generator
 * (`scripts/generate-vectors.mjs`) encodes each with the working tree and
 * commits the expected outcome (hex, or CborError code for inputs that throw)
 * to `tests/vectors/encode-vectors.json`; `tests/golden-vectors.test.ts`
 * verifies the working tree against that fixture on every run.
 *
 * Entries marked `tombstone` are the two input shapes the redesign will make
 * throw (P3.5 `{tag,value}` sniffing, P3.7 `taggedCbor`-without-`toCbor`
 * auto-wrap). They MUST keep their baseline bytes until the breaking wave
 * lands; the golden test asserts them via the same fixture, and flipping them
 * to expected-throw is a deliberate, reviewed fixture regeneration.
 *
 * Sources for the boundary/quirk values: live-verified recon of
 * src/float.ts + src/varint.ts + src/cbor.ts dispatch (see P1.1 notes in
 * API_REDESIGN_PLAN.md §6). The three frozen encoder quirks deliberately
 * covered:
 *   Q1 f32 negative reduction uses Math.fround(-1-n) (Rust parity), which
 *      COLLIDES byte-wise for f32-exact negatives beyond 2^24
 *      (e.g. -16777218.0 encodes as semantic -16777217);
 *   Q2 f32-exact whole values >= 2^32 do NOT integer-reduce (stay 0xfa);
 *   Q3 -0.0 encodes as integer 0x00 (sign lost).
 * Q1/Q2 live in the float encoder's own reduction ladder, which plain whole
 * numbers NEVER reach (cbor() dispatch integer-reduces them exactly first) -
 * they are pinned via the bare-Float-node vectors in section 2b. Q3 is
 * visible through both routes.
 */

import type { Recipe } from "./recipes";

// Terse constructors - keep the table readable.
const n = (v: number | string): Recipe => ({ k: "n", v: String(v) });
const bi = (v: string): Recipe => ({ k: "bi", v });
const s = (v: string): Recipe => ({ k: "s", v });
const sr = (unit: string, count: number): Recipe => ({ k: "sr", unit, count });
const b = (v: boolean): Recipe => ({ k: "b", v });
const NULL: Recipe = { k: "null" };
const UNDEF: Recipe = { k: "undef" };
const bytes = (hex: string): Recipe => ({ k: "bytes", hex });
const br = (start: number, count: number): Recipe => ({ k: "br", start, count });
const arr = (...items: Recipe[]): Recipe => ({ k: "arr", items });
const obj = (...entries: [string, Recipe][]): Recipe => ({ k: "obj", entries });
const jsmap = (...entries: [Recipe, Recipe][]): Recipe => ({ k: "jsmap", entries });
const jsset = (...items: Recipe[]): Recipe => ({ k: "jsset", items });
const map = (...entries: [Recipe, Recipe][]): Recipe => ({ k: "map", entries });
const set = (...items: Recipe[]): Recipe => ({ k: "set", items });
const tagged = (tag: string | number, content: Recipe): Recipe => ({
  k: "tagged",
  tag: String(tag),
  content,
});
const tagobjlit = (tag: Recipe, content: Recipe): Recipe => ({ k: "tagobjlit", tag, content });
const date = (seconds: number | string): Recipe => ({ k: "date", seconds: String(seconds) });
const datestr = (v: string): Recipe => ({ k: "datestr", v });
const bytestring = (hex: string): Recipe => ({ k: "bytestring", hex });
const biguint = (v: string): Recipe => ({ k: "biguint", v });
const bignum = (v: string): Recipe => ({ k: "bignum", v });
const tocbor = (inner: Recipe): Recipe => ({ k: "tocbor", inner });
const taggedproto = (tag: string | number, inner: Recipe): Recipe => ({
  k: "taggedproto",
  tag: String(tag),
  inner,
});

export interface EncodeCorpusEntry {
  name: string;
  recipe: Recipe;
  /** Set on the two redesign tombstone shapes (P3.5 / P3.7). */
  tombstone?: "P3.5" | "P3.7";
}

const e = (name: string, recipe: Recipe, tombstone?: "P3.5" | "P3.7"): EncodeCorpusEntry =>
  tombstone === undefined ? { name, recipe } : { name, recipe, tombstone };

// ---------------------------------------------------------------------------
// 1. Integer boundaries - every head-width cliff, as number AND bigint forms.
// ---------------------------------------------------------------------------

const integers: EncodeCorpusEntry[] = [
  e("int/zero", n(0)),
  e("int/neg-zero-loses-sign", n("-0")), // Q3: encodes 00
  e("int/one", n(1)),
  e("int/22", n(22)),
  e("int/23-max-immediate", n(23)),
  e("int/24-first-u8-head", n(24)),
  e("int/25", n(25)),
  e("int/254", n(254)),
  e("int/255-max-u8", n(255)),
  e("int/256-first-u16", n(256)),
  e("int/257", n(257)),
  e("int/65534", n(65534)),
  e("int/65535-max-u16", n(65535)),
  e("int/65536-first-u32", n(65536)),
  e("int/65537", n(65537)),
  e("int/1000000", n(1000000)),
  e("int/u32-max", n(4294967295)),
  e("int/u32-max+1-first-u64", n(4294967296)),
  e("int/u32-max+2", n(4294967297)),
  e("int/2^53-2", n(9007199254740990)),
  e("int/max-safe-integer", n(9007199254740991)),
  e("int/2^53-whole-number-route", n("9007199254740992")), // BigInt route inside cbor()
  e("int/2^53-bigint", bi("9007199254740992")),
  e("int/2^53+2-whole-number", n("9007199254740994")),
  e("int/2^60-whole-number", n("1152921504606846976")),
  e("int/i64-max-bigint", bi("9223372036854775807")),
  e("int/2^63-bigint", bi("9223372036854775808")),
  e("int/2^63+1-bigint", bi("9223372036854775809")),
  e("int/u64-max-bigint", bi("18446744073709551615")),
  e("int/u64-max-as-number-is-float", n("18446744073709551615")), // double rounds to 2^64 → f32 float
  e("int/2^64-bigint-throws", bi("18446744073709551616")),
  e("int/2^64+1-bigint-throws", bi("18446744073709551617")),
  e("int/small-bigint-same-bytes-as-number", bi("5")),
  e("int/zero-bigint", bi("0")),
  e("int/23-bigint", bi("23")),
  e("int/24-bigint", bi("24")),
  e("int/neg-1", n(-1)),
  e("int/neg-2", n(-2)),
  e("int/neg-23", n(-23)),
  e("int/neg-24-max-immediate", n(-24)),
  e("int/neg-25-first-u8-head", n(-25)),
  e("int/neg-127", n(-127)),
  e("int/neg-128", n(-128)),
  e("int/neg-255", n(-255)),
  e("int/neg-256-max-u8-arg", n(-256)),
  e("int/neg-257-first-u16-arg", n(-257)),
  e("int/neg-65536-max-u16-arg", n(-65536)),
  e("int/neg-65537-first-u32-arg", n(-65537)),
  e("int/neg-u32-arg-max", n(-4294967296)),
  e("int/neg-first-u64-arg", n(-4294967297)),
  e("int/min-safe-integer", n(-9007199254740991)),
  e("int/neg-2^53-whole-number-route", n("-9007199254740992")),
  e("int/neg-2^53-bigint", bi("-9007199254740992")),
  e("int/i64-min-bigint", bi("-9223372036854775808")),
  e("int/i64-min-1-bigint", bi("-9223372036854775809")),
  e("int/neg-2^64+1-bigint", bi("-18446744073709551615")),
  e("int/cbor-int-min-bigint", bi("-18446744073709551616")), // -2^64 → 3bffffffffffffffff
  e("int/below-cbor-int-min-throws", bi("-18446744073709551617")),
  e("int/neg-1-bigint", bi("-1")),
  e("int/neg-24-bigint", bi("-24")),
  e("int/neg-25-bigint", bi("-25")),
];

// ---------------------------------------------------------------------------
// 2. Floats - every f16/f32/f64 canonical edge and the three frozen quirks.
//    (The full 77-value adversarial pool also runs in the differential
//    corpus; these are the named, committed subset.)
// ---------------------------------------------------------------------------

const FLOAT_POOL_VALUES: string[] = [
  // zeros / specials
  "0",
  "-0",
  "NaN",
  "Infinity",
  "-Infinity",
  // simple fractions across widths
  "0.5",
  "-0.5",
  "1.5",
  "-1.5",
  "0.25",
  "0.1",
  "1.1",
  "0.30000000000000004",
  "3.141592653589793",
  "1023.5", // largest fractional f16
  "2047.5", // first fractional value forced to f32
  "123456.7890123",
  // whole floats → integer reduction
  "42",
  "-42",
  "65504", // f16 max is integral → reduces to 19ffe0
  "65505",
  "65534",
  "65535",
  "65536",
  "-65504",
  "-65505",
  "-65536",
  "-2048",
  "-2049",
  "-2050",
  // f16 subnormal edges
  "6.103515625e-5", // min f16 normal
  "6.097555160522461e-5", // max f16 subnormal
  "5.960464477539063e-8", // min f16 subnormal
  "5.960464477539064e-8", // next double up - NOT f16-exact → f64
  "2.9802322387695312e-8", // below min f16 subnormal → f32? (frozen behavior)
  // f32 precision cliff at 2^24. NOTE: whole values here integer-reduce in
  // cbor() DISPATCH (exact, no fround) - the Q1 fround collisions are only
  // reachable via bare Float nodes; see the float-simple section below.
  "16777215",
  "16777216",
  "16777217",
  "16777218",
  "16777219",
  "-16777216",
  "-16777217",
  "-16777218",
  "-33554430",
  "-33554432",
  // Whole values in [2^32, 2^53): exact integers via dispatch. (Q2 - f32-exact
  // wholes staying 0xfa floats - needs the float-simple route below.)
  "4294967295",
  "4294967296",
  "4294967297",
  "4294967298",
  "6442450944",
  "8589934592",
  "-4294967295",
  "-4294967296",
  "-4294967297",
  // 2^53 / 2^63 / 2^64 as whole numbers: BigInt dispatch route → exact ints.
  "9007199254740991",
  "9007199254740992",
  "9007199254740994",
  "9223372036854774784",
  "9223372036854775808",
  "18446744073709549568",
  "18446744073709551616", // 2^64: outside int range → float branch → fa5f800000
  "36893488147419103232",
  "-9223372036854774784",
  "-9223372036854775808",
  "-18446744073709549568",
  "-18446744073709551616", // -2^64: within int range → 3bffffffffffffffff
  "-36893488147419103232",
  // f32/f64 extreme magnitudes
  "3.4028234663852886e38", // f32 max
  "3.4028235677937525e38", // just above f32 max → f64
  "1.1754943508222875e-38", // f32 min normal
  "1.1754942106924411e-38", // f32 MAX subnormal
  "1.401298464324817e-45", // f32 min subnormal
  "7.006492321624085e-46", // below f32 subnormal → f64
  "2.2250738585072014e-308", // f64 min normal
  "2.225073858507201e-308", // f64 MAX subnormal
  "1.7976931348623157e308", // f64 max
  "1e300",
  "5e-324", // f64 min subnormal
  "1e21", // whole number beyond 2^64 through the number route → float
  "-1e21",
  "1.5e20",
];

const floats: EncodeCorpusEntry[] = FLOAT_POOL_VALUES.map((v) => e(`float/${v}`, n(v)));

// ---------------------------------------------------------------------------
// 2b. Bare Cbor nodes - the attachMethods passthrough arm, the float
//     encoder's OWN reduction ladder (only reachable here: plain whole
//     numbers integer-reduce in dispatch before f64CborData ever runs), and
//     the frozen quirks Q1/Q2 that are invisible through normal dispatch.
// ---------------------------------------------------------------------------

const fsimple = (v: string): Recipe => ({ k: "floatsimple", v });

const bareNodes: EncodeCorpusEntry[] = [
  // Q1: fround(-1-n) negative reduction - byte COLLISIONS (Rust parity).
  e("floatsimple/-16777218-collides-to--16777217", fsimple("-16777218")), // 3a01000000
  e("floatsimple/-16777217", fsimple("-16777217")),
  e("floatsimple/-33554430-ties-to-even", fsimple("-33554430")),
  e("floatsimple/-33554432", fsimple("-33554432")),
  e("floatsimple/-4294967296-collides-to--4294967297", fsimple("-4294967296")),
  e("floatsimple/-9223372036854775808-semantic-minus-1", fsimple("-9223372036854775808")),
  e("floatsimple/-18446744073709551616-stays-f32", fsimple("-18446744073709551616")), // fadf800000
  e("floatsimple/-18446744073709549568-reduces", fsimple("-18446744073709549568")),
  // Q2: f32-exact wholes >= 2^32 stay 0xfa floats in the float ladder.
  e("floatsimple/4294967296-stays-f32", fsimple("4294967296")), // fa4f800000
  e("floatsimple/6442450944-stays-f32", fsimple("6442450944")), // fa4fc00000
  e("floatsimple/9007199254740992-stays-f32", fsimple("9007199254740992")), // fa5a000000
  e("floatsimple/9223372036854775808-stays-f32", fsimple("9223372036854775808")), // fa5f000000
  e("floatsimple/4294967295-reduces", fsimple("4294967295")), // non-f32-exact → 1affffffff
  e("floatsimple/18446744073709549568-reduces", fsimple("18446744073709549568")),
  // Ordinary ladder behavior through the bare-Float route.
  e("floatsimple/42-reduces-to-int", fsimple("42")),
  e("floatsimple/-42-reduces", fsimple("-42")),
  e("floatsimple/65504-f16-max-reduces", fsimple("65504")), // 19ffe0
  e("floatsimple/-0-reduces-to-00", fsimple("-0")),
  e("floatsimple/1.5-f16", fsimple("1.5")),
  e("floatsimple/NaN-canonical", fsimple("NaN")),
  e("floatsimple/Infinity", fsimple("Infinity")),
  e("floatsimple/16777216-reduces", fsimple("16777216")),
  // Bare methodless Unsigned/Negative nodes (magnitude semantics).
  e("rawuint/5", { k: "rawuint", v: "5" }),
  e("rawuint/u64-max", { k: "rawuint", v: "18446744073709551615" }),
  e("rawnegmag/0-is-minus-1", { k: "rawnegmag", v: "0" }), // 0x20
  e("rawnegmag/23-is-minus-24", { k: "rawnegmag", v: "23" }), // 0x37
  e("rawnegmag/u64-max-is-minus-2^64", { k: "rawnegmag", v: "18446744073709551615" }),
  e("rawbad/malformed-bytestring-node-throws", { k: "rawbad" }),
  // Unsupported input types - frozen Custom throws.
  e("unsupported/symbol-throws", { k: "symbol" }),
  e("unsupported/function-throws", { k: "fn" }),
];

// ---------------------------------------------------------------------------
// 3. Simple values.
// ---------------------------------------------------------------------------

const simples: EncodeCorpusEntry[] = [
  e("simple/true", b(true)),
  e("simple/false", b(false)),
  e("simple/null", NULL),
  e("simple/undefined-maps-to-null", UNDEF),
];

// ---------------------------------------------------------------------------
// 4. Strings - length-head cliffs, UTF-8 widths, NFC normalization on encode.
// ---------------------------------------------------------------------------

const strings: EncodeCorpusEntry[] = [
  e("str/empty", s("")),
  e("str/a", s("a")),
  e("str/hello", s("Hello")),
  e("str/len-23", sr("x", 23)),
  e("str/len-24-first-u8-head", sr("x", 24)),
  e("str/len-255", sr("x", 255)),
  e("str/len-256-first-u16-head", sr("x", 256)),
  e("str/len-4096", sr("ab", 2048)),
  e("str/len-65535-max-u16-head", sr("x", 65535)),
  e("str/len-65536-first-u32-head", sr("x", 65536)),
  e("str/2-byte-utf8", s("é")),
  e("str/nfc-normalize-on-encode", s("é")), // decomposed é → MUST encode as composed 62c3a9
  e("str/nfd-long-normalizes", s("Café du crépuscule")),
  e("str/hangul-composed", s("가")),
  e("str/hangul-decomposed-normalizes", s("가")),
  e("str/angstrom-singleton-normalizes", s("Å")), // U+212B → U+00C5
  e("str/3-byte-utf8", s("こんにちは")),
  e("str/4-byte-utf8-emoji", s("😀👍🏽")),
  e("str/mixed-widths", s("aé漢😀z")),
  e("str/nul-char", s("\u0000")),
  e("str/control-chars", s("\t\n\r")),
  e("str/lone-surrogate-becomes-replacement", s("\ud800")), // TextEncoder → U+FFFD
  e("str/448-byte-lorem-u16-head", sr("Lorem ipsum dolor sit amet, ", 16)), // 448 chars → 0x79 head
];

// ---------------------------------------------------------------------------
// 5. Byte strings - length-head cliffs.
// ---------------------------------------------------------------------------

const byteStrings: EncodeCorpusEntry[] = [
  e("bytes/empty", bytes("")),
  e("bytes/one", bytes("00")),
  e("bytes/deadbeef", bytes("deadbeef")),
  e("bytes/len-23", br(0, 23)),
  e("bytes/len-24-first-u8-head", br(0, 24)),
  e("bytes/len-255", br(1, 255)),
  e("bytes/len-256-first-u16-head", br(1, 256)),
  e("bytes/len-4096", br(7, 4096)),
  e("bytes/len-65535-max-u16-head", br(3, 65535)),
  e("bytes/len-65536-first-u32-head", br(3, 65536)),
];

// ---------------------------------------------------------------------------
// 6. Arrays - count-head cliffs, nesting, heterogeneity.
// ---------------------------------------------------------------------------

const nestChain = (depth: number, leaf: Recipe): Recipe => {
  let cur = leaf;
  for (let i = 0; i < depth; i++) cur = arr(cur);
  return cur;
};

const arrays: EncodeCorpusEntry[] = [
  e("arr/empty", arr()),
  e("arr/one", arr(n(0))),
  e("arr/1-2-3", arr(n(1), n(2), n(3))),
  e("arr/mixed-signs", arr(n(1), n(-2), n(3), n(-4))),
  e("arr/heterogeneous", arr(n(1), s("two"), b(true), NULL, arr(n(3), n(4)), bytes("ff"))),
  e("arr/count-23", { k: "intarr", count: 23 }),
  e("arr/count-24-first-u8-head", { k: "intarr", count: 24 }),
  e("arr/count-255", { k: "intarr", count: 255 }),
  e("arr/count-256-first-u16-head", { k: "intarr", count: 256 }),
  e("arr/count-65535-max-u16-head", { k: "intarr", count: 65535 }),
  e("arr/count-65536-first-u32-head", { k: "intarr", count: 65536 }),
  e("arr/nested-depth-4", nestChain(4, n(0))),
  e("arr/nested-depth-32", nestChain(32, s("leaf"))),
  e("arr/of-empty-arrays", arr(arr(), arr(), arr())),
];

// ---------------------------------------------------------------------------
// 7. Maps - CborMap, JS Map, plain objects; canonical key sorting; key types.
// ---------------------------------------------------------------------------

const maps: EncodeCorpusEntry[] = [
  e("map/empty", map()),
  e("map/one-entry", map([n(1), n(2)])),
  e(
    "map/mixed-keys-canonical-sort",
    map(
      [n(10), s("ten")],
      [n(-1), s("neg")],
      [s("a"), n(1)],
      [n(100), s("hundred")],
      [s("z"), n(2)],
    ),
  ),
  e(
    "map/insertion-order-irrelevant",
    map([s("z"), n(1)], [s("a"), n(2)], [n(500), n(3)], [n(3), n(4)]),
  ),
  e("map/bytes-key", map([bytes("0102"), s("bytes-key")])),
  e("map/bool-and-null-keys", map([b(true), n(1)], [b(false), n(2)], [NULL, n(3)])),
  e("map/float-key", map([n(1.5), s("float-key")])),
  e("map/array-key", map([arr(n(1), n(2)), s("arr-key")])),
  e("map/map-key", map([map([n(1), n(2)]), s("nested-key")])),
  e("map/tagged-key", map([tagged(1, n(0)), s("tagged-key")])),
  e("map/negative-vs-positive-keys", map([n(-1), s("neg")], [n(0), s("zero")], [n(1), s("pos")])),
  e("map/duplicate-canonical-key-last-write-wins", map([n(1), s("first")], [bi("1"), s("second")])),
  e("map/nfc-equivalent-string-keys-collide", map([s("é"), n(1)], [s("é"), n(2)])),
  e("map/count-23", { k: "intmap", count: 23 }),
  e("map/count-24-first-u8-head", { k: "intmap", count: 24 }),
  e("map/count-255-max-u8-head", { k: "intmap", count: 255 }),
  e("map/count-256-first-u16-head", { k: "intmap", count: 256 }),
  e("map/count-65535-max-u16-head", { k: "intmap", count: 65535 }),
  e("map/count-65536-first-u32-head", { k: "intmap", count: 65536 }),
  e(
    "map/nested-map-values",
    map([s("meta"), map([s("author"), s("Alice")], [s("tags"), arr(s("a"), s("b"))])]),
  ),
  e("jsmap/insertion-order-resorted", jsmap([n(3), s("c")], [n(1), s("a")], [n(2), s("b")])),
  e("jsmap/dup-canonical-keys-1-and-1n", jsmap([n(1), s("num")], [bi("1"), s("big")])),
  e("jsmap/heterogeneous", jsmap([s("k"), arr(n(1))], [n(-5), NULL])),
  e("obj/simple", obj(["name", s("Alice")], ["age", n(30)])),
  e("obj/keys-resorted", obj(["zz", n(1)], ["a", n(2)], ["mm", n(3)])),
  e("obj/nested", obj(["outer", obj(["inner", arr(n(1), n(2))])])),
  e("obj/tag-value-plus-extra-key-is-map", obj(["tag", n(1)], ["value", n(2)], ["other", n(3)])),
  e("obj/tag-only-key-is-map", obj(["tag", n(1)])),
  e("obj/value-only-key-is-map", obj(["value", n(2)])),
  e("obj/proto-key", obj(["__proto__", n(1)], ["x", n(2)])),
  e(
    "map/realistic-document",
    map(
      [s("id"), n(1000000)],
      [s("title"), s("Important Document")],
      [s("scores"), arr(n(98), n(87), n(100))],
      [s("active"), b(true)],
      [s("balance"), bi("18446744073709551615")],
      [s("meta"), map([s("author"), s("Alice")], [s("tags"), arr(s("a"), s("b"))])],
    ),
  ),
];

// ---------------------------------------------------------------------------
// 8. JS Sets - INSERTION ORDER is preserved on the wire (frozen behavior,
//    distinct from CborSet's canonical sort).
// ---------------------------------------------------------------------------

const jsSets: EncodeCorpusEntry[] = [
  e("jsset/empty", jsset()),
  e("jsset/1-2-3", jsset(n(1), n(2), n(3))),
  e("jsset/3-2-1-keeps-insertion-order", jsset(n(3), n(2), n(1))),
  e("jsset/mixed", jsset(s("b"), n(1), s("a"))),
  e("jsset/samevaluezero-dedup", jsset(n(1), n(1), n(2))),
];

// ---------------------------------------------------------------------------
// 9. CborSet - canonical byte-order sort + dedup, untagged array wire form.
// ---------------------------------------------------------------------------

const cborSets: EncodeCorpusEntry[] = [
  e("set/empty", set()),
  e("set/3-1-2-sorts", set(n(3), n(1), n(2))),
  e("set/dedup", set(n(1), n(2), n(2), n(1), s("a"))),
  e("set/dedup-across-number-and-bigint", set(n(1), bi("1"), n(2))),
  e(
    "set/mixed-types-sort-by-encoded-bytes",
    set(n(10), n(100), n(-1), s("z"), b(false), bytes("02"), arr(n(1))),
  ),
  e("set/nested-in-array", arr(set(n(3), n(1), n(2)))),
  e("set/as-map-value", map([s("s"), set(n(2), n(1))])),
  e("set/of-strings", set(s("banana"), s("apple"), s("cherry"))),
];

// ---------------------------------------------------------------------------
// 10. Tagged values - tag-number head widths incl. 4-byte/8-byte (da/db, a
//     known coverage gap), Tag-object inputs, nesting.
// ---------------------------------------------------------------------------

const taggedValues: EncodeCorpusEntry[] = [
  e("tag/0-min-immediate", tagged(0, s("2023-01-01T00:00:00Z"))),
  e("tag/1-int-content", tagged(1, n(1675854714))),
  e("tag/23-max-immediate", tagged(23, bytes("0102"))),
  e("tag/24-first-u8-head", tagged(24, bytes("00"))),
  e("tag/255-max-u8-head", tagged(255, n(0))),
  e("tag/256-first-u16-head", tagged(256, n(0))),
  e("tag/300", tagged(300, s("named"))),
  e("tag/55799-self-describe", tagged(55799, n(0))),
  e("tag/65535-max-u16-head", tagged(65535, n(0))),
  e("tag/65536-first-u32-head", tagged(65536, n(0))),
  e("tag/u32-max", tagged(4294967295, n(0))),
  e("tag/2^32-first-u64-head", tagged(4294967296, n(0))),
  e("tag/2^53", tagged("9007199254740992", n(0))),
  e("tag/u64-max-bigint-tag", tagged("18446744073709551615", n(0))),
  e("tag/nested-tag-of-tag", tagged(100, tagged(200, arr(n(1), n(2), n(3))))),
  e(
    "tag/envelope-style-nesting",
    tagged(200, arr(tagged(200, tagged(201, s("Hello"))), tagged(200, tagged(201, s("World"))))),
  ),
  e("tag/string-content", tagged(1, s("Hello"))),
  e("tag/map-content", tagged(40, map([n(1), n(2)]))),
  e("tag/inside-array", arr(tagged(1, n(0)), tagged(2, n(1)))),
  e("tag/float-content", tagged(1, n(1.5))),
];

// ---------------------------------------------------------------------------
// 11. Dates - tag 1, integer vs shortest-float seconds, normalization.
// ---------------------------------------------------------------------------

const dates: EncodeCorpusEntry[] = [
  e("date/epoch", date(0)),
  e("date/whole-seconds", date(1675854714)),
  e("date/fractional-half", date(1675854714.5)),
  e("date/small-fraction-f16", date(0.5)),
  e("date/negative-whole", date(-1)),
  e("date/negative-fraction-floors", date(-1.5)), // normalizes to -1 → c120
  e("date/pre-epoch", date(-100)),
  e("date/y2038-plus", date(2147483648)),
  e("date/far-future", date(10000000000)),
  e("date/sub-ns-precision-dropped", date(1.0000000001)),
  e("date/non-finite-throws", date("NaN")),
  e("datestr/bare-date", datestr("2023-02-08")),
  e("datestr/rfc3339-utc", datestr("2023-02-08T15:30:45Z")),
  e("datestr/rfc3339-offset", datestr("2023-02-08T15:30:45+05:30")),
  e("datestr/rfc3339-fractional", datestr("2023-02-08T15:30:45.25Z")),
  e("datestr/invalid-throws", datestr("not-a-date")),
  e("datestr/missing-offset-throws", datestr("2023-02-08T15:30:45")),
  e("date/in-array", arr(date(0), date(1))),
  e("date/as-map-value", map([s("created"), date(1675854714)])),
];

// ---------------------------------------------------------------------------
// 12. ByteString wrapper + protocol objects (ToCbor / TaggedCborEncodable).
// ---------------------------------------------------------------------------

const protocols: EncodeCorpusEntry[] = [
  e("bytestring/empty", bytestring("")),
  e("bytestring/01020304", bytestring("01020304")),
  e("bytestring/in-array", arr(bytestring("ff00"))),
  e("tocbor/int", tocbor(n(42))),
  e("tocbor/map", tocbor(map([n(1), n(2)]))),
  e("tocbor/in-array", arr(tocbor(s("x")), n(1))),
  // P3.7 tombstone shape: object with taggedCbor() and no toCbor().
  e("taggedproto/simple", taggedproto(99, s("payload")), "P3.7"),
  e("taggedproto/in-array", arr(taggedproto(99, n(1)), n(2)), "P3.7"),
  e("taggedproto/as-map-value", map([s("k"), taggedproto(7, arr(n(1)))]), "P3.7"),
  // Dispatch precedence: taggedCbor() wins over toCbor() today. The bytes
  // reveal the winner (the toCbor side deliberately encodes differently).
  // NOT tombstone-marked: post-P3.7 this shape doesn't throw - its bytes
  // CHANGE (toCbor becomes the winner), and that flip lands as a reviewed
  // fixture regeneration diff in the wave.
  e("bothproto/taggedcbor-wins", { k: "bothproto", tag: "77", inner: s("x") }),
  // Inherited tag/value (outer sniff trigger fires, own-keys check does not):
  // falls through to the plain-object→map branch, encoding only own entries.
  e("protoobj/inherited-tag-value-is-map", {
    k: "protoobj",
    protoEntries: [
      ["tag", n(1)],
      ["value", n(2)],
    ],
    ownEntries: [["x", n(3)]],
  }),
  e("protoobj/inherited-only-empty-map", {
    k: "protoobj",
    protoEntries: [
      ["tag", n(9)],
      ["value", n(8)],
    ],
    ownEntries: [],
  }),
  // P3.5 tombstone shape: plain {tag, value} object literal.
  e("tagobjlit/number-tag", tagobjlit(n(1), s("Hello")), "P3.5"),
  e("tagobjlit/nested-value", tagobjlit(n(100), arr(n(1), n(2))), "P3.5"),
  e("tagobjlit/string-tag-coerces", tagobjlit(s("24"), n(0)), "P3.5"),
  e("tagobjlit/in-array", arr(tagobjlit(n(1), n(2))), "P3.5"),
  e("tagobjlit/as-obj-value", obj(["inner", tagobjlit(n(5), n(6))]), "P3.5"),
];

// ---------------------------------------------------------------------------
// 13. Bignums - tags 2/3, minimal magnitudes, >23-byte magnitudes (0x58 head).
// ---------------------------------------------------------------------------

const bignums: EncodeCorpusEntry[] = [
  e("biguint/zero-empty-bstr", biguint("0")),
  e("biguint/one", biguint("1")),
  e("biguint/255", biguint("255")),
  e("biguint/256", biguint("256")),
  e("biguint/u64-max", biguint("18446744073709551615")),
  e("biguint/2^64", biguint("18446744073709551616")),
  e("biguint/2^64+1", biguint("18446744073709551617")),
  e("biguint/2^127", biguint("170141183460469231731687303715884105728")),
  e("biguint/2^200-needs-u8-length-head", biguint(String(2n ** 200n))),
  e("biguint/negative-throws", biguint("-5")),
  e("bignum/positive-delegates", bignum("5")),
  e("bignum/neg-1", bignum("-1")),
  e("bignum/neg-2", bignum("-2")),
  e("bignum/neg-256", bignum("-256")),
  e("bignum/neg-257", bignum("-257")),
  e("bignum/neg-2^64", bignum("-18446744073709551616")),
  e("bignum/neg-2^64-1", bignum("-18446744073709551617")),
  e("bignum/neg-2^200", bignum(String(-(2n ** 200n)))),
  e("bignum/in-map", map([s("huge"), biguint("18446744073709551616")])),
];

// ---------------------------------------------------------------------------
// 14. Deep/mixed realistic structures.
// ---------------------------------------------------------------------------

const mixed: EncodeCorpusEntry[] = [
  e(
    "mixed/kitchen-sink",
    map(
      [s("ints"), arr(n(0), n(-1), bi("9223372036854775808"))],
      [s("floats"), arr(n(1.5), n("NaN"), n("-Infinity"))],
      [s("nested"), map([bytes("00"), set(n(3), n(1))])],
      [s("when"), date(1675854714.5)],
      [s("big"), bignum("-18446744073709551617")],
      [s("tagged"), tagged(55799, arr(s("hi")))],
    ),
  ),
  e("mixed/tag-wrapping-map-of-arrays", tagged(24, map([s("a"), arr(n(1))], [s("b"), arr()]))),
  e("mixed/array-of-maps", arr(map([n(1), s("a")]), map([n(2), s("b")]), map())),
  e("mixed/deep-tag-chain", tagged(1, tagged(2, tagged(3, tagged(4, tagged(5, n(0))))))),
];

export const encodeCorpus: EncodeCorpusEntry[] = [
  ...integers,
  ...floats,
  ...bareNodes,
  ...simples,
  ...strings,
  ...byteStrings,
  ...arrays,
  ...maps,
  ...jsSets,
  ...cborSets,
  ...taggedValues,
  ...dates,
  ...protocols,
  ...bignums,
  ...mixed,
];

// Guard against copy-paste name collisions - fixture names must be unique.
{
  const seen = new Set<string>();
  for (const { name } of encodeCorpus) {
    if (seen.has(name)) throw new Error(`duplicate encode-corpus name: ${name}`);
    seen.add(name);
  }
}
