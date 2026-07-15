/**
 * Build-agnostic construction recipes for the wire-format vector suites
 * (API_REDESIGN_PLAN P1.1).
 *
 * A `Recipe` is a JSON-serializable description of a construction input -
 * everything `cbor()`/`cborData()` accepts today: JS primitives, bigints,
 * floats (including NaN/±Infinity/-0), strings, byte arrays, arrays, plain
 * objects, JS Map/Set, CborMap, CborSet, CborDate, ByteString, tagged values,
 * tag-2/3 bignums, and the two protocol shapes (`toCbor()` / `taggedCbor()`).
 *
 * Recipes are materialized against a `VectorApi` adapter rather than a
 * concrete module, so the SAME recipe can be constructed with two different
 * builds of the library:
 *
 *   - the frozen baseline bundle (`tests/baseline/dcbor-baseline.mjs`,
 *     built from the pre-redesign commit recorded in tests/baseline/README.md)
 *   - the working tree (`../src`)
 *
 * That is what makes the differential harness (`tests/differential.test.ts`)
 * and the committed golden fixtures (`tests/vectors/*.json`) survive the API
 * redesign: when Phase 3 renames the public surface, ONLY the working-tree
 * adapter in `adapterFor` needs a sibling (write e.g. `redesignedAdapterFor`
 * against the new names and point the harnesses' `current` at it). The frozen
 * baseline keeps using `adapterFor` - its API never changes - and the recipes,
 * corpus, and fixtures stay byte-for-byte identical.
 *
 * IMPORTANT: recipe semantics are FROZEN. Never change how an existing recipe
 * kind materializes; add a new kind instead. The committed fixtures pair
 * recipes with expected bytes - changing materialization silently invalidates
 * the pairing.
 */

/** Integer/float/bigint carried as a decimal string so recipes are JSON-safe. */
export type Recipe =
  /** JS number via `Number(v)` - handles "NaN", "Infinity", "-Infinity", "-0". */
  | { k: "n"; v: string }
  /** JS bigint via `BigInt(v)`. */
  | { k: "bi"; v: string }
  /** JS string (exact code points, including non-NFC and lone surrogates). */
  | { k: "s"; v: string }
  /** JS string built as `unit.repeat(count)` (keeps large fixtures small). */
  | { k: "sr"; unit: string; count: number }
  | { k: "b"; v: boolean }
  | { k: "null" }
  | { k: "undef" }
  /** Uint8Array from lowercase hex. */
  | { k: "bytes"; hex: string }
  /** Uint8Array of `count` bytes cycling 0..255 starting at `start`. */
  | { k: "br"; start: number; count: number }
  | { k: "arr"; items: Recipe[] }
  /** Array of `count` numbers `i % 24` (compact form for count-head cliffs). */
  | { k: "intarr"; count: number }
  /** CborMap of `count` entries `i -> "v" + i` (compact count-cliff form). */
  | { k: "intmap"; count: number }
  /**
   * Plain JS object. Keys must NOT be array-index-like ("0", "17", …): JS
   * enumerates those first in numeric order, silently reordering entries;
   * the materializer rejects them. Other keys keep insertion order.
   */
  | { k: "obj"; entries: [string, Recipe][] }
  /** JS Map (insertion order preserved; library sorts canonically). */
  | { k: "jsmap"; entries: [Recipe, Recipe][] }
  /** JS Set (insertion order preserved; library does NOT sort JS sets). */
  | { k: "jsset"; items: Recipe[] }
  /** CborMap populated via set() in entry order. */
  | { k: "map"; entries: [Recipe, Recipe][] }
  /** CborSet.fromArray (canonical sort + dedup). */
  | { k: "set"; items: Recipe[] }
  /** toTaggedValue(tag, content); tag is a decimal string (may exceed 2^53). */
  | { k: "tagged"; tag: string; content: Recipe }
  /**
   * Plain object literal shaped exactly `{tag, value}` - the key-sniffing
   * input that P3.5 tombstones. Baseline encodes it as a tagged value.
   */
  | { k: "tagobjlit"; tag: Recipe; content: Recipe }
  /** CborDate.fromTimestamp(Number(seconds)). */
  | { k: "date"; seconds: string }
  /** CborDate.fromString(v). */
  | { k: "datestr"; v: string }
  /** ByteString wrapper (encodes via its toCbor()). */
  | { k: "bytestring"; hex: string }
  /** biguintToCbor(BigInt(v)) - tag 2. */
  | { k: "biguint"; v: string }
  /** bigintToCbor(BigInt(v)) - tag 2/3 by sign. */
  | { k: "bignum"; v: string }
  /** Anonymous object implementing only `toCbor()` (ToCbor protocol). */
  | { k: "tocbor"; inner: Recipe }
  /**
   * Anonymous object implementing only `taggedCbor()` - the protocol shape
   * that P3.7 tombstones (auto-wrap of TaggedCborEncodable).
   */
  | { k: "taggedproto"; tag: string; inner: Recipe }
  /**
   * Object implementing BOTH `taggedCbor()` and `toCbor()`, each producing
   * observably different bytes - freezes the dispatch precedence
   * (`taggedCbor` wins today; P3.7 makes `toCbor` the only protocol).
   */
  | { k: "bothproto"; tag: string; inner: Recipe }
  /**
   * Bare Simple/Float Cbor node `{isCbor, type: 7, value: {type: "Float"}}`
   * (no methods - exercises the attachMethods passthrough arm). This is the
   * ONLY route into the float encoder's own reduction ladder: whole-valued
   * plain numbers integer-reduce in cbor() dispatch long before f64CborData
   * runs, so the frozen float quirks (fround negative-reduction collisions,
   * f32-exact wholes >= 2^32 staying 0xfa floats) are observable only here.
   */
  | { k: "floatsimple"; v: string }
  /** Bare methodless Unsigned Cbor node (attachMethods passthrough arm). */
  | { k: "rawuint"; v: string }
  /**
   * Bare methodless Negative Cbor node storing the MAGNITUDE-to-encode
   * (semantic value is -1-v, mirroring the decoder's representation).
   */
  | { k: "rawnegmag"; v: string }
  /** Malformed bare Cbor node (ByteString type, non-Uint8Array value). */
  | { k: "rawbad" }
  /** A Symbol input (unsupported by cbor() - frozen Custom throw). */
  | { k: "symbol" }
  /** A function input (unsupported by cbor() - frozen Custom throw). */
  | { k: "fn" }
  /**
   * Object with `tag`/`value` INHERITED from its prototype plus own entries.
   * The sniffing arm's outer trigger (`"tag" in value`) sees prototype
   * properties but Object.keys does not, so this falls through to the
   * plain-object→map branch - frozen boundary behavior for P3.5.
   */
  | { k: "protoobj"; protoEntries: [string, Recipe][]; ownEntries: [string, Recipe][] };

/**
 * The semantic operations the materializer needs from a build of the library.
 * Deliberately minimal and name-independent: adapters translate these to
 * whatever the build's public API calls them.
 */
export interface VectorApi {
  /** Full construction + encode: today `cborData(input)`. Throws CborError. */
  encode(input: unknown): Uint8Array;
  /** Strict decode: today `decodeCbor(bytes)`. Throws CborError. */
  decode(bytes: Uint8Array): unknown;
  /** The polymorphic constructor: today `cbor(input)`. */
  makeCbor(input: unknown): unknown;
  makeMap(entries: [unknown, unknown][]): unknown;
  makeSet(items: unknown[]): unknown;
  makeDate(seconds: number): unknown;
  makeDateFromString(s: string): unknown;
  makeByteString(bytes: Uint8Array): unknown;
  makeTagged(tag: number | bigint, content: unknown): unknown;
  makeBiguint(v: bigint): unknown;
  makeBignum(v: bigint): unknown;
  /** Machine-readable code if `e` is this build's CborError, else undefined. */
  errorCode(e: unknown): string | undefined;
}

/**
 * Adapter for the CURRENT (pre-redesign) public API. Works for both the
 * frozen baseline bundle and today's `../src`. When the Phase 3 renames land,
 * add a sibling adapter for the new surface and keep this one for the
 * baseline - do not edit this function's semantics.
 */
export function adapterFor(mod: Record<string, unknown>): VectorApi {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const m = mod as any;
  return {
    encode: (input) => m.cborData(input),
    decode: (bytes) => m.decodeCbor(bytes),
    makeCbor: (input) => m.cbor(input),
    makeMap: (entries) => {
      const map = new m.CborMap();
      for (const [k, v] of entries) map.set(k, v);
      return map;
    },
    makeSet: (items) => m.CborSet.fromArray(items),
    makeDate: (seconds) => m.CborDate.fromTimestamp(seconds),
    makeDateFromString: (s) => m.CborDate.fromString(s),
    makeByteString: (bytes) => new m.ByteString(bytes),
    makeTagged: (tag, content) => m.toTaggedValue(tag, content),
    makeBiguint: (v) => m.biguintToCbor(v),
    makeBignum: (v) => m.bigintToCbor(v),
    errorCode: (e) =>
      typeof e === "object" &&
      e !== null &&
      (e as any).name === "CborError" &&
      typeof (e as any).code === "string"
        ? ((e as any).code as string)
        : undefined,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Adapter for the REDESIGNED public API (post-P3 wave). The differential
 * harness's `current` side and the golden suite use this; the frozen
 * baseline keeps using {@link adapterFor}. Recipes, corpus, and fixtures
 * are IDENTICAL for both - only the spellings differ.
 */
export function redesignedAdapterFor(mod: Record<string, unknown>): VectorApi {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const m = mod as any;
  return {
    encode: (input) => m.encodeCbor(input),
    decode: (bytes) => m.decodeCbor(bytes),
    makeCbor: (input) => m.cbor(input),
    makeMap: (entries) => {
      const map = new m.CborMap();
      for (const [k, v] of entries) map.set(k, v);
      return map;
    },
    makeSet: (items) => m.CborSet.from(items),
    makeDate: (seconds) => m.CborDate.fromEpochSeconds(seconds),
    makeDateFromString: (s) => m.CborDate.fromString(s),
    makeByteString: (bytes) => new m.ByteString(bytes),
    makeTagged: (tag, content) => m.taggedValue(tag, content),
    makeBiguint: (v) => m.biguintToCbor(v),
    makeBignum: (v) => m.bigintToCbor(v),
    errorCode: (e) =>
      typeof e === "object" &&
      e !== null &&
      (e as any).name === "CborError" &&
      typeof (e as any).code === "string"
        ? ((e as any).code as string)
        : undefined,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const MAX_SAFE = 9007199254740991n;

/** Decimal-string → number|bigint for tag values (tags may exceed 2^53). */
const tagFromString = (tag: string): number | bigint => {
  const big = BigInt(tag);
  return big >= 0n && big <= MAX_SAFE ? Number(big) : big;
};

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new Error(`invalid vector hex: ${hex}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Serialize a JS number so `Number(numToString(x))` round-trips exactly. */
export function numToString(x: number): string {
  if (Object.is(x, -0)) return "-0";
  return String(x); // shortest round-trip repr; also "NaN"/"Infinity"/"-Infinity"
}

const cycleBytes = (start: number, count: number): Uint8Array => {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = (start + i) & 0xff;
  return out;
};

/**
 * Construct the input a recipe describes, using `api`'s build of the library.
 * May throw that build's CborError (e.g. `date` with a non-finite timestamp,
 * `biguint` with a negative value) - callers wanting an outcome use
 * {@link encodeOutcome}, which captures those uniformly.
 */
export function materialize(recipe: Recipe, api: VectorApi): unknown {
  switch (recipe.k) {
    case "n":
      return Number(recipe.v);
    case "bi":
      return BigInt(recipe.v);
    case "s":
      return recipe.v;
    case "sr":
      return recipe.unit.repeat(recipe.count);
    case "b":
      return recipe.v;
    case "null":
      return null;
    case "undef":
      return undefined;
    case "bytes":
      return hexToBytes(recipe.hex);
    case "br":
      return cycleBytes(recipe.start, recipe.count);
    case "arr":
      return recipe.items.map((r) => materialize(r, api));
    case "intarr":
      return Array.from({ length: recipe.count }, (_, i) => i % 24);
    case "intmap":
      return api.makeMap(Array.from({ length: recipe.count }, (_, i) => [i, `v${i}`]));
    case "obj":
      // Object.fromEntries uses own-property semantics, so a "__proto__" key
      // becomes a real enumerable key (what Object.entries in cbor() reads)
      // instead of a prototype assignment. Array-index-like keys are banned:
      // JS enumerates them first in ascending numeric order, which would
      // silently reorder entries relative to the recipe (identically in both
      // builds - zero differential signal) and mislead fixture review.
      for (const [key] of recipe.entries) {
        if (/^(0|[1-9][0-9]*)$/.test(key)) {
          throw new Error(`obj recipe key "${key}" is array-index-like; use a map recipe instead`);
        }
      }
      return Object.fromEntries(recipe.entries.map(([key, r]) => [key, materialize(r, api)]));
    case "jsmap":
      return new Map(recipe.entries.map(([k, v]) => [materialize(k, api), materialize(v, api)]));
    case "jsset":
      return new Set(recipe.items.map((r) => materialize(r, api)));
    case "map":
      return api.makeMap(
        recipe.entries.map(([k, v]) => [materialize(k, api), materialize(v, api)]),
      );
    case "set":
      return api.makeSet(recipe.items.map((r) => materialize(r, api)));
    case "tagged":
      return api.makeTagged(tagFromString(recipe.tag), materialize(recipe.content, api));
    case "tagobjlit":
      // Exactly the two own keys {tag, value} - the P3.5 sniffing shape.
      return { tag: materialize(recipe.tag, api), value: materialize(recipe.content, api) };
    case "date":
      return api.makeDate(Number(recipe.seconds));
    case "datestr":
      return api.makeDateFromString(recipe.v);
    case "bytestring":
      return api.makeByteString(hexToBytes(recipe.hex));
    case "biguint":
      return api.makeBiguint(BigInt(recipe.v));
    case "bignum":
      return api.makeBignum(BigInt(recipe.v));
    case "tocbor": {
      const inner = materialize(recipe.inner, api);
      return { toCbor: () => api.makeCbor(inner) };
    }
    case "taggedproto": {
      const tag = tagFromString(recipe.tag);
      const inner = materialize(recipe.inner, api);
      return { taggedCbor: () => api.makeTagged(tag, inner) };
    }
    case "bothproto": {
      const tag = tagFromString(recipe.tag);
      const inner = materialize(recipe.inner, api);
      return {
        taggedCbor: () => api.makeTagged(tag, inner),
        // Deliberately different bytes than taggedCbor(), so the encoding
        // reveals which protocol method dispatch picked.
        toCbor: () => api.makeCbor(["toCbor-won", inner]),
      };
    }
    case "floatsimple":
      return { isCbor: true, type: 7, value: { type: "Float", value: Number(recipe.v) } };
    case "rawuint": {
      const big = BigInt(recipe.v);
      return { isCbor: true, type: 0, value: big <= MAX_SAFE ? Number(big) : big };
    }
    case "rawnegmag": {
      const big = BigInt(recipe.v);
      return { isCbor: true, type: 1, value: big <= MAX_SAFE ? Number(big) : big };
    }
    case "rawbad":
      return { isCbor: true, type: 2, value: 42 };
    case "symbol":
      return Symbol("vector");
    case "fn":
      return () => 0;
    case "protoobj": {
      const proto = Object.fromEntries(
        recipe.protoEntries.map(([key, r]) => [key, materialize(r, api)]),
      );
      const target = Object.create(proto) as Record<string, unknown>;
      for (const [key, r] of recipe.ownEntries) target[key] = materialize(r, api);
      return target;
    }
  }
}

/** What happened when a build tried to construct+encode a recipe. */
export type EncodeOutcome = { ok: true; hex: string } | { ok: false; code: string };

/**
 * What happened when a build tried to decode bytes (ok carries re-encoding).
 * `stage` distinguishes "decode rejected" from "decode accepted but the
 * re-encode threw" - without it, an acceptance divergence between builds
 * could hide behind a matching error code.
 */
export type DecodeOutcome =
  { ok: true; hex: string } | { ok: false; stage: "decode" | "reencode"; code: string };

/**
 * Materialize + encode, capturing the build's CborError as a code. Any
 * non-CborError propagates - that is a harness bug, not library behavior.
 */
export function encodeOutcome(api: VectorApi, recipe: Recipe): EncodeOutcome {
  try {
    return { ok: true, hex: bytesToHex(api.encode(materialize(recipe, api))) };
  } catch (e) {
    const code = api.errorCode(e);
    if (code === undefined) throw e;
    return { ok: false, code };
  }
}

/** Decode + re-encode, capturing the build's CborError as a staged code. */
export function decodeOutcome(api: VectorApi, bytes: Uint8Array): DecodeOutcome {
  let decoded: unknown;
  try {
    decoded = api.decode(bytes);
  } catch (e) {
    const code = api.errorCode(e);
    if (code === undefined) throw e;
    return { ok: false, stage: "decode", code };
  }
  try {
    return { ok: true, hex: bytesToHex(api.encode(decoded)) };
  } catch (e) {
    const code = api.errorCode(e);
    if (code === undefined) throw e;
    return { ok: false, stage: "reencode", code };
  }
}
