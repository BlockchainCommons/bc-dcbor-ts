# Migrating from `@bcts/dcbor` to `@blockchaincommons/dcbor`

`@blockchaincommons/dcbor` is the wire-compatible successor to `@bcts/dcbor`: the same
deterministic CBOR codec, rebuilt into natural, modern, dependency-free
TypeScript. **The encoded bytes are identical** - proven by a 93k-input
differential corpus and cross-validated against the Rust reference
implementation - so any data you produced or persisted with `@bcts/dcbor`
continues to decode unchanged. There is no data migration; every change
below is API spelling.

**Floors:** TypeScript >= 5.7, Node >= 22.12. ESM-first with CJS; there is
no IIFE/browser bundle (use a bundler). Formatting and traversal live in
subpath entries so decode-only bundles stay ~5 kB (brotli).

It is also a substantially faster and smaller build of the same codec -
see the [Benchmarks](README.md#benchmarks) section (3-21× throughput,
5-10× less retained memory, 2 → 0 runtime dependencies).

---

## TL;DR checklist

- [ ] Replace the dependency `@bcts/dcbor` with `@blockchaincommons/dcbor`; update imports.
- [ ] Import `diagnostic`/`hexAnnotated` from `@blockchaincommons/dcbor/diagnostic` and
      `walk` & friends from `@blockchaincommons/dcbor/walk` (they left the root).
- [ ] `cborData(v)` → `encodeCbor(v)`; `toTaggedValue(t, v)` → `taggedValue(t, v)`.
- [ ] Replace `Cbor` *value* usages (`Cbor.from`, `Cbor.tryFromData`,
      `Cbor.True`…) - the type survives, the namespace value is gone.
- [ ] Move instance-method calls to free functions (`c.isMap()` → `isMap(c)`,
      `c.toText()` → `expectText(c)`, …) - the value keeps only
      `toData()`/`toHex()`/`toString()`.
- [ ] Errors: `errorToString(e)`/`errorMsg(e)` → `e.message`;
      `e.errorType.type` → `e.code`; `e.errorType.<field>` → `e.details.<field>`;
      `new CborError({ type })` → `CborError.<factory>()`.
- [ ] Containers: `CborMap.new()/insert/containsKey/len` →
      `new CborMap()/set/has/size`; `CborSet.insert/contains/fromArray` →
      `add/has/from`; note `CborMap.get` now returns the stored `Cbor` node.
- [ ] Fix the two shapes that now THROW: plain `{tag, value}` object
      literals and `taggedCbor()`-only objects (see below).
- [ ] *(optional)* adopt `tryDecode()` (non-throwing) and
      `decodeWith(bytes, codec)` (typed decode, `@beta`).

---

## 1. Package name & imports

```diff
- import { cbor, cborData, decodeCbor, diagnostic } from "@bcts/dcbor";
+ import { cbor, encodeCbor, decodeCbor } from "@blockchaincommons/dcbor";
+ import { diagnostic, hexAnnotated } from "@blockchaincommons/dcbor/diagnostic";
+ import { walk } from "@blockchaincommons/dcbor/walk";
```

Subpath entries (new): `@blockchaincommons/dcbor/diagnostic` (`diagnostic`, `hexAnnotated`
and their options types), `@blockchaincommons/dcbor/walk` (`walk`, `Visitor`, `WalkElement`,
`EdgeType`, `EdgeTypeVariant`, `asSingle`, `asKeyValue`, `edgeLabel`), and
`@blockchaincommons/dcbor/debug` (`installDebugHooks()` - opt-in diagnostic-flavored console
output). `bytesToHex`/`hexToBytes` stay at the root.

## 2. Two input shapes now throw (transitional, one rc cycle)

These previously mapped to tagged values SILENTLY; changing that quietly
would corrupt bytes, so they throw a directive `CborError` (code `Custom`):

| input | before | now | migration |
|---|---|---|---|
| plain object shaped exactly `{tag, value}` | silently became a tagged value (corrupting legitimate records like `{tag: "release", value: 3}`) | throws | `taggedValue(tag, content)` for a tagged value; add/rename a key for a map |
| object with `taggedCbor()` but no `toCbor()` | auto-wrapped via `taggedCbor()` | throws | add `toCbor() { return this.taggedCbor(); }` |

Also stricter: `hexToBytes` validates its input - odd length or non-hex
characters throw `CborError` `Custom` (previously `hexToBytes("zz")`
silently produced `[0]`). Whitespace is still tolerated.

## 3. Error handling

### 3.1 Message and discriminant

```diff
- console.log(errorToString(e));          // or errorMsg(e)
+ console.log(e.message);                  // CborError extends Error

- if (e.errorType.type === "WrongType") …
+ if (e.code === "WrongType") …            // CborErrorCode union
```

### 3.2 Structured fields: `.errorType.<field>` → `.details.<field>`

| Old (`e.errorType.…`) | New (`e.details.…`) | Present on code |
| --- | --- | --- |
| `.expected` | `.expectedTag` | `WrongTag` |
| `.actual` | `.actualTag` | `WrongTag` |
| header byte | `.headerValue` | `UnsupportedHeaderValue` |
| trailing byte count | `.count` | `UnusedData` |
| underlying reason | `.cause` | `InvalidString` / `InvalidUtf8` / `InvalidDate` |

Narrowing is typed: after `CborError.isCborError(e) && e.code === "WrongTag"`,
`e.details.expectedTag` is non-optional (`CborErrorTyped` /
`CborErrorDetailsByCode`).

### 3.3 Constructing errors (library authors only)

```diff
- throw new CborError({ type: "WrongType" });
+ throw CborError.wrongType();
- throw new CborError({ type: "WrongTag", expected, actual });
+ throw CborError.wrongTag(expected, actual);
- throw new CborError({ type: "Custom", message: "bad input" });
+ throw CborError.custom("bad input");
```

### 3.4 `Result` / `Ok` / `Err` and `tryDecode`

`Result<T>`, `Ok`, `Err` are unchanged. `tryDecode(bytes)` is the one
non-throwing decode twin - the `try` prefix means "returns `Result`, never
throws", everywhere.

## 4. Construction & encoding

| `@bcts/dcbor` | `@blockchaincommons/dcbor` |
|---|---|
| `Cbor.from(x)` | `cbor(x)` |
| `Cbor.tryFromData(d)` | `decodeCbor(d)` |
| `Cbor.tryFromHex(h)` | `decodeCbor(hexToBytes(h))` |
| `Cbor.True` / `Cbor.False` / `Cbor.Null` / `Cbor.NaN` | `cbor(true)` / `cbor(false)` / `cbor(null)` / `cbor(NaN)` |
| `cborData(v)` | `encodeCbor(v)` |
| `cborHex(v)` | `bytesToHex(encodeCbor(v))` |
| `cborTrue()` / `cborFalse()` / `cborNull()` / `cborNaN()` | `cbor(true/false/null/NaN)` |
| `toByteString(b)` | `cbor(b)` |
| `toByteStringFromHex(h)` | `cbor(hexToBytes(h))` |
| `toTaggedValue(t, v)` / free `taggedCbor(t, v)` | `taggedValue(t, v)` |

`Cbor` remains available **as a type**; identity comparisons against the
former constants (`x === Cbor.True`) were never reliable for decoded values.

## 5. Instance methods → free functions

`Cbor` values now carry only `toData()`, `toHex()`, and a cheap
`toString()`. **Flagged runtime change:** `String(c)` / template literals /
`console.log` print `Cbor(0x…)` instead of the flat diagnostic - use
`diagnostic(c, { flat: true })`, or `installDebugHooks()` from
`@blockchaincommons/dcbor/debug` for console output.

| before | after |
|---|---|
| `c.isX()` | `isX(c)` (now type-narrowing); `c.isBool()` → `isBoolean(c)`; `c.isByteString()` → `isBytes(c)` |
| `c.asX()` | `asX(c)`; `c.asTagged()` → `asTaggedValue(c)`; `c.asBool()` → `asBoolean(c)` |
| `c.toText()` / `toMap()` / `toArray()` / `toByteString()` / `toBool()` / `toInteger()` / `toNumber()` | `expectText(c)` / `expectMap(c)` / `expectArray(c)` / `expectBytes(c)` / `expectBoolean(c)` / `expectInteger(c)` / `expectNumber(c)` |
| `c.toSimpleValue()` / `c.asSimpleValue()` | narrow with `isSimple(c)`, then `c.value` |
| `c.expectTag(t)` | `expectTaggedContent(c, t)` |
| `c.untagged()` | `extractTaggedContent(c)` |
| `c.validateTag(tags)` | `validateTag(c, tags)` |
| `c.walk(s, v)` | `walk(c, s, v)` from `@blockchaincommons/dcbor/walk` |
| `c.toDiagnostic()` / `toDebugString()` / `toDiagnosticAnnotated()` | `diagnostic(c, …)` from `@blockchaincommons/dcbor/diagnostic` (the debug-string format was removed) |
| `c.toHexAnnotated(store)` | `hexAnnotated(c, { tagsStore: store })` |

## 6. Formatters & traversal

| before (root import) | after |
|---|---|
| `diagnostic(c)` | `diagnostic(c)` from `@blockchaincommons/dcbor/diagnostic` |
| `diagnosticFlat(c)` | `diagnostic(c, { flat: true })` |
| `diagnosticAnnotated(c)` | `diagnostic(c, { annotate: true })` |
| `diagnosticOpt(c, o)` | `diagnostic(c, o)` |
| `summary(c)` | `diagnostic(c, { summarize: true })` |
| `hex(c)` | `c.toHex()` or `bytesToHex(encodeCbor(v))` |
| `hexOpt(c, { annotate: true, tagsStore })` | `hexAnnotated(c, { tagsStore })` |
| `hexAnnotated(c, store)` | `hexAnnotated(c, { tagsStore: store })` |
| `EdgeType.ArrayElement` (enum member) | `"array_element"` (string-literal union; runtime strings identical) |

## 7. Containers

**CborMap** (JS `Map` mirror):

| before | after |
|---|---|
| `CborMap.new()` | `new CborMap()` |
| `m.insert(k, v)` | `m.set(k, v)` |
| `m.containsKey(k)` | `m.has(k)` |
| `m.len()` / `m.length` | `m.size` |
| `m.isEmpty()` | `m.size === 0` |
| `m.iter()` | `m.entries()` |
| `m.get<K, V>(k)` (extracted native by unchecked cast) | **`m.get(k)` returns the stored `Cbor` node** - compose explicitly: `asNumber(m.get(k))`, `extractCbor(m.getOrThrow(k))` |
| `m.extract<K, V>(k)` | `extractCbor(m.getOrThrow(k))` |
| `m.debug` / `m.diagnostic` getters | removed - `diagnostic(cbor(m))` |
| new | sorted `keys()` / `values()` / `forEach(cb, thisArg?)`, `getOrThrow(k)` |

**CborSet** (JS `Set` vocabulary):

| before | after |
|---|---|
| `s.insert(v)` | `s.add(v)` (returns `this`) |
| `s.contains(v)` | `s.has(v)` |
| `s.isEmpty()` | `s.size === 0` |
| `CborSet.fromArray(a)` / `fromSet(x)` / `fromIterable(i)` | `CborSet.from(items)` (careful: strings are iterable - `CborSet.from("abc")` is 3 elements) |
| `s.values()` (eager `Cbor[]`) | **lazy `Generator<Cbor>`** - `[...s]` for an array; `toArray()` is the eager, native-extracting path |
| `s.diagnostic` / `s.debug` getters | removed - `s.toString()` keeps the same string |

**ByteString**:

| before | after |
|---|---|
| `b.data()` | `b.bytes` (live reference; `toUint8Array()` remains the copy) |
| `b.len()` | `b.byteLength` |
| `b.isEmpty()` | `b.byteLength === 0` |
| `b.iter()` | iterate `b` directly / `b.bytes.values()` |
| new | `ByteString.fromHex(hex)`, `b.toHex()` |

**CborDate** (Temporal-style):

| before | after |
|---|---|
| `CborDate.fromDatetime(d)` | `CborDate.fromDate(d)` |
| `d.datetime()` | `d.toDate()` |
| `d.timestamp()` (SECONDS under a milliseconds-sounding name) | `d.epochSeconds` (property) |
| `CborDate.fromTimestamp(s)` | `CborDate.fromEpochSeconds(s)` |
| new (`@beta`) | `CborDate.codec` for `decodeWith(bytes, CborDate.codec)` |

## 8. Tags & the registry

| before | after |
|---|---|
| `createTag(v, n)` / `tagWithValue(v)` / `tagWithStaticName(v, n)` | `Tag.from(v, n?)` |
| `tagsEqual(a, b)` / `tagValuesEqual(x, y)` | `Tag.equals(a, b)` (value-only, number/bigint-normalizing) |
| `store.insert(t)` / `store.insertAll(ts)` | `store.register(t)` / `store.registerAll(ts)` |
| `TagsStoreTrait` | `ReadonlyTagsStore` |
| `withTagsMut(f)` | `withTags(f)` |
| `registerTags()` / `registerTagsIn(s)` | `registerStandardTags(store?)` (idempotent) |

## 9. Protocol collapse: one way to be encodable

Deleted: `TaggedCborEncodable`, `CborEncodable`, `CborCodable`,
`CborTaggedEncodable`, `CborTaggedDecodable`, `CborTaggedCodable`,
`CborDecodable`, `createTaggedCbor`, `taggedCborData`, `fromTaggedCborData`,
`fromUntaggedCborData`.

The ONE encode protocol is `ToCbor { toCbor(): Cbor }` (the `toJSON`
precedent). Tagged types keep `cborTags()` / `untaggedCbor()` /
`taggedCbor()` as ordinary members and implement `toCbor()` as
`return this.taggedCbor();`.

| before | after |
|---|---|
| `createTaggedCbor(obj)` | `taggedValue(obj.cborTags()[0], obj.untaggedCbor())` |
| `taggedCborData(obj)` | `encodeCbor(obj.taggedCbor())` |
| `fromTaggedCborData(dec, data)` | `dec.fromTaggedCbor(decodeCbor(data))` |
| `fromUntaggedCborData(dec, data)` | `dec.fromUntaggedCbor(decodeCbor(data))` |
| new (`@beta`) | `CborCodec<T>` + `decodeWith(data, codec)` - the only generic bound by a runtime witness |

## 10. Accessor cleanup & the prefix grammar

| before | after |
|---|---|
| `tryIntoText` / `tryIntoBool` / `tryIntoByteString` (threw despite `try`) | `expectText` / `expectBoolean` / `expectBytes` |
| `tryExpectedTaggedValue` | `expectTaggedContent` |
| `asByteString` | `asBytes` |
| `asCborArray(c)` (+ `CborArrayWrapper`) | `asArray(c)` (plain array; `w.get(i)` → `arr[i]`) |
| `asCborMap` | `asMap` |
| `isNaN(simple)` (shadowed the global) | `isCborNaN(simple)` |
| `mapHas` / `mapIsEmpty` / `arrayIsEmpty` returning `undefined` for wrong type | **plain `false`** (matches `hasTag`) |
| `mapValue<K, V>(c, k)` (extracted native) | `mapValue(c, k): Cbor \| undefined` (stored node) |

The prefix grammar is policy (CONTRIBUTING.md): `is*` = narrowing guard,
`as*` = `T | undefined`, `expect*` = `T` or throw `CborError`,
`try*` = returns `Result`, never throws.

## 11. What did NOT change

The wire format (byte-for-byte, including every decoder rejection and its
error code); the accessor names that already followed the grammar
(`isMap`, `asText`, `expectArray`, `hasTag`, `getTaggedContent`,
`expectTaggedContent`, `tagValue`, `tagContent`, `arrayItem`, `arrayLength`,
`mapKeys`, `mapValues`, `mapSize`, …); `extractCbor` (now typed
`CborNative`); the bignum functions (tags 2/3); `encodeVarInt`/`decodeVarInt`;
`sortArrayByCborEncoding`; `cborEquals`; `bytesToHex`/`hexToBytes` names;
`getGlobalTagsStore` and all lookup names; the standard `TAG_*` constants;
`CborDate`'s `fromYmd`/`fromYmdHms`/`fromString`/`now`/`add`/`subtract`/
`difference`/`equals`/`compare`/`toString`/`toJSON`; `CborSet`'s algebra
(`union`/`intersection`/`difference`/`isSubsetOf`/`isSupersetOf`); and
`walk`'s state-cloning visitor semantics (`@beta`).
