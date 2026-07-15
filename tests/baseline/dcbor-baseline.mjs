//#region src/tag.ts
/**
* Create a new Tag.
*
* @param value - The numeric tag value
* @param name - Optional human-readable name
* @returns A new Tag object
*
* @example
* ```typescript
* const dateTag = createTag(1, 'date');
* const customTag = createTag(12345, 'myCustomTag');
* ```
*/
const createTag = (value, name) => {
	if (name !== void 0) return {
		value,
		name
	};
	return { value };
};
/**
* Create a Tag from just its numeric value, no name attached.
*
* Mirrors Rust's `Tag::with_value(v: TagValue)`.
*/
const tagWithValue = (value) => ({ value });
/**
* Create a Tag with a static (string) name.
*
* In Rust this distinguishes `Tag::Static(&'static str)` from
* `Tag::Dynamic(String)`. TypeScript has no compile-time equivalent — both
* variants collapse to the same `{ value, name }` object — but the
* function name is preserved for API parity.
*
* Mirrors Rust's `Tag::with_static_name(v, name)`.
*/
const tagWithStaticName = (value, name) => ({
	value,
	name
});
/**
* Compare two tag values for equality, normalizing `number` vs `bigint`.
* A raw `===` would treat `100n` and `100` as unequal, so a large tag that
* decoded to a `bigint` wouldn't match the same value written as a `number`.
*/
const tagValuesEqual = (a, b) => {
	if (typeof a === "bigint" || typeof b === "bigint") return BigInt(a) === BigInt(b);
	return a === b;
};
/**
* Compare two tags for equality. Mirrors Rust's `PartialEq for Tag`, which
* compares by `value` only and ignores the optional `name`.
*/
const tagsEqual = (a, b) => tagValuesEqual(a.value, b.value);
/**
* Get the string representation of a tag.
* Internal function used for error messages.
*
* @param tag - The tag to represent
* @returns String representation (name if available, otherwise value)
*
* @internal
*/
const tagToString = (tag) => tag.name ?? tag.value.toString();
//#endregion
//#region src/error.ts
const captureStackTrace = Error.captureStackTrace;
/**
* The single error type thrown by dCBOR encoding, decoding, and extraction.
*
* @example
* ```typescript
* try {
*   decodeCbor(bytes);
* } catch (e) {
*   if (CborError.isCborError(e) && e.code === "WrongTag") {
*     console.log(e.details.expectedTag, e.details.actualTag);
*   }
* }
* ```
*/
var CborError = class CborError extends Error {
	/** Machine-readable discriminant; switch on this to handle errors. */
	code;
	/** Structured, code-specific data (see {@link CborErrorDetails}). */
	details;
	constructor(code, message, details = {}) {
		super(message);
		this.name = "CborError";
		this.code = code;
		this.details = details;
		Object.setPrototypeOf(this, new.target.prototype);
		if (typeof captureStackTrace === "function") captureStackTrace(this, CborError);
	}
	/** Type guard: is `value` a {@link CborError}? */
	static isCborError(value) {
		return value instanceof CborError;
	}
	/** The CBOR data ended before a complete item could be decoded. */
	static underrun() {
		return new CborError("Underrun", "early end of CBOR data");
	}
	/** An unsupported/invalid value was found in a CBOR header byte. */
	static unsupportedHeaderValue(headerValue) {
		return new CborError("UnsupportedHeaderValue", "unsupported value in CBOR header", { headerValue });
	}
	/** A numeric value was not in its shortest/canonical dCBOR form. */
	static nonCanonicalNumeric() {
		return new CborError("NonCanonicalNumeric", "a CBOR numeric value was encoded in non-canonical form");
	}
	/** A major-type-7 simple value other than false/true/null/float. */
	static invalidSimpleValue() {
		return new CborError("InvalidSimpleValue", "an invalid CBOR simple value was encountered");
	}
	/** A text string was not valid UTF-8 (with the underlying reason). */
	static invalidString(cause) {
		return new CborError("InvalidString", `an invalidly-encoded UTF-8 string was encountered in the CBOR (${cause})`, { cause });
	}
	/** A text string was not in Unicode NFC. */
	static nonCanonicalString() {
		return new CborError("NonCanonicalString", "a CBOR string was not encoded in Unicode Canonical Normalization Form C");
	}
	/** The decoded item left `count` trailing bytes unconsumed. */
	static unusedData(count) {
		return new CborError("UnusedData", `the decoded CBOR had ${count} extra bytes at the end`, { count });
	}
	/** Map keys were not in canonical ascending byte order. */
	static misorderedMapKey() {
		return new CborError("MisorderedMapKey", "the decoded CBOR map has keys that are not in canonical order");
	}
	/** A map contained a duplicate key. */
	static duplicateMapKey() {
		return new CborError("DuplicateMapKey", "the decoded CBOR map has a duplicate key");
	}
	/** A requested map key was not present. */
	static missingMapKey() {
		return new CborError("MissingMapKey", "missing CBOR map key");
	}
	/** A numeric value could not be represented in the target type. */
	static outOfRange() {
		return new CborError("OutOfRange", "the CBOR numeric value could not be represented in the specified numeric type");
	}
	/** The CBOR value was not the type expected by a conversion. */
	static wrongType() {
		return new CborError("WrongType", "the decoded CBOR value was not the expected type");
	}
	/** A tagged value had a tag other than the one expected. */
	static wrongTag(expected, actual) {
		return new CborError("WrongTag", `expected CBOR tag ${tagToString(expected)}, but got ${tagToString(actual)}`, {
			expectedTag: expected,
			actualTag: actual
		});
	}
	/** Invalid UTF-8 in a text string (with the underlying reason). */
	static invalidUtf8(cause) {
		return new CborError("InvalidUtf8", `invalid UTF‑8 string: ${cause}`, { cause });
	}
	/** Invalid ISO 8601 / RFC 3339 date string (with the underlying reason). */
	static invalidDate(cause) {
		return new CborError("InvalidDate", `invalid ISO 8601 date string: ${cause}`, { cause });
	}
	/** An arbitrary error carrying a custom message. */
	static custom(message) {
		return new CborError("Custom", message);
	}
};
/** Construct a successful {@link Result}. */
const Ok = (value) => ({
	ok: true,
	value
});
/** Construct a failed {@link Result}. */
const Err = (error) => ({
	ok: false,
	error
});
//#endregion
//#region src/stdlib.ts
/**
* Standard library re-exports and compatibility layer.
*
* In Rust, this handles std/no_std feature flags.
* In TypeScript, this is primarily documentation.
*
* @module stdlib
*/
/**
* Check if two byte arrays are equal.
*/
const areBytesEqual = (a, b) => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
};
/**
* Lexicographically compare two byte arrays.
* Returns: -1 if a < b, 0 if a == b, 1 if a > b
*/
const lexicographicallyCompareBytes = (a, b) => {
	const minLen = Math.min(a.length, b.length);
	for (let i = 0; i < minLen; i++) {
		const aVal = a[i];
		const bVal = b[i];
		if (aVal === void 0 || bVal === void 0) throw CborError.custom("Unexpected undefined byte in array");
		if (aVal < bVal) return -1;
		if (aVal > bVal) return 1;
	}
	if (a.length < b.length) return -1;
	if (a.length > b.length) return 1;
	return 0;
};
//#endregion
//#region src/sorted-byte-map.ts
/**
* A map keyed by encoded CBOR key bytes, kept in canonical (lexicographic)
* byte order.
*
* dCBOR needs exactly one specialised container: keys are the encoded bytes of
* a CBOR value, and the map must iterate in ascending lexicographic byte order
* (that ordering is the deterministic wire contract). This is a thin,
* dependency-free structure over a sorted array with binary-search insertion —
* it gives the exact ordering the parity tests pin, and lets the decode hot
* path append in O(1) since canonical input already arrives sorted.
*
* @module sorted-byte-map
*/
var SortedByteMap = class {
	items = [];
	/** Number of entries. */
	get size() {
		return this.items.length;
	}
	/**
	* Binary search for `key`. Returns the index of an exact match, or the
	* negative value `-(insertionPoint) - 1` when absent, so a single search both
	* tests membership and locates where an insert would go (Java
	* `Arrays.binarySearch` convention).
	*/
	indexOf(key) {
		let lo = 0;
		let hi = this.items.length - 1;
		while (lo <= hi) {
			const mid = lo + hi >>> 1;
			const cmp = lexicographicallyCompareBytes(this.items[mid].key, key);
			if (cmp < 0) lo = mid + 1;
			else if (cmp > 0) hi = mid - 1;
			else return mid;
		}
		return -(lo + 1);
	}
	/** Insert or replace the entry for `key`. */
	set(key, value) {
		const i = this.indexOf(key);
		if (i >= 0) this.items[i] = {
			key,
			value
		};
		else this.items.splice(-i - 1, 0, {
			key,
			value
		});
	}
	/**
	* Append an entry whose key is strictly greater than every existing key.
	* Used by canonical decode, where keys arrive already sorted; the caller must
	* guarantee the ordering (this skips the search + shift that {@link set} does).
	*/
	appendGreatest(key, value) {
		this.items.push({
			key,
			value
		});
	}
	/** The value for `key`, or `undefined` if absent. */
	get(key) {
		const i = this.indexOf(key);
		return i >= 0 ? this.items[i].value : void 0;
	}
	/** Whether `key` is present. */
	has(key) {
		return this.indexOf(key) >= 0;
	}
	/** Remove `key`; returns whether it was present. */
	delete(key) {
		const i = this.indexOf(key);
		if (i < 0) return false;
		this.items.splice(i, 1);
		return true;
	}
	/** The greatest key currently stored (ascending order), or `undefined`. */
	maxKey() {
		const n = this.items.length;
		return n > 0 ? this.items[n - 1].key : void 0;
	}
	/** Map over each value (with its key) in ascending key order. */
	map(fn) {
		return this.items.map((e) => fn(e.value, e.key));
	}
};
//#endregion
//#region src/cbor-types.ts
const MajorType = {
	Unsigned: 0,
	Negative: 1,
	ByteString: 2,
	Text: 3,
	Array: 4,
	Map: 5,
	Tagged: 6,
	Simple: 7
};
const isCborNumber = (value) => {
	return typeof value === "number" || typeof value === "bigint";
};
const isCbor = (value) => {
	return value !== null && typeof value === "object" && "isCbor" in value && value.isCbor === true;
};
//#endregion
//#region src/numeric.ts
/**
* Numeric boundary contract and helpers (REFACTOR_PLAN Phase 2).
*
* ## The `number` / `bigint` contract
*
* dCBOR integers span `[-(2^64), 2^64)`, which exceeds JavaScript's safe
* integer range (`±(2^53 − 1)`). The single, repo-wide rule is:
*
* - An integer that fits in the IEEE-754 **safe** range is represented as a
*   `number`; anything larger (in magnitude) is a `bigint`.
* - Decoding returns the **narrowest exact** representation via
*   {@link narrowInteger}, so small values are ergonomic `number`s and large
*   ones remain lossless `bigint`s.
* - Encoding accepts either at the public edge and normalises once.
*
* Every module funnels its boundary logic through this file — nothing else
* should hard-code `Number.MAX_SAFE_INTEGER`, `2^64`, etc.
*
* @module numeric
*/
/** `BigInt(Number.MAX_SAFE_INTEGER)` — largest integer exact as a `number`. */
const SAFE_MAX_BIG = BigInt(Number.MAX_SAFE_INTEGER);
/** `BigInt(Number.MIN_SAFE_INTEGER)`. */
const SAFE_MIN_BIG = BigInt(Number.MIN_SAFE_INTEGER);
/** `u64::MAX` = 2^64 − 1. */
const U64_MAX = 18446744073709551615n;
/** `i64::MAX` = 2^63 − 1. */
const I64_MAX = 9223372036854775807n;
/** `i64::MIN` = −2^63. */
const I64_MIN = -9223372036854775808n;
/** `u128::MAX` = 2^128 − 1. */
const U128_MAX = (1n << 128n) - 1n;
/** Smallest dCBOR-encodable integer: −(2^64). */
const CBOR_INT_MIN = -(1n << 64n);
/**
* Return the narrowest exact representation of an integer: a `number` when it
* fits the safe-integer range, otherwise the `bigint` unchanged. This is the
* canonical way to hand an integer back to callers.
*/
const narrowInteger = (value) => value >= SAFE_MIN_BIG && value <= SAFE_MAX_BIG ? Number(value) : value;
/**
* Truncate a float to `u64` with Rust's saturating `as u64` semantics: NaN and
* negatives clamp to 0, values at/above 2^64 clamp to `u64::MAX`. Lets the
* exact-float checks mirror Rust's `(f as u64) == source` round-trip.
*/
const saturateFloatToU64 = (f) => {
	if (Number.isNaN(f)) return 0n;
	const t = Math.trunc(f);
	if (t <= 0) return 0n;
	const big = BigInt(t);
	return big > 18446744073709551615n ? U64_MAX : big;
};
/**
* Truncate a float to `i64` with Rust's saturating `as i64` semantics: NaN
* clamps to 0, values clamp to `i64::MAX`/`i64::MIN` at the bounds.
*/
const saturateFloatToI64 = (f) => {
	if (Number.isNaN(f)) return 0n;
	const big = BigInt(Math.trunc(f));
	if (big > 9223372036854775807n) return I64_MAX;
	if (big < -9223372036854775808n) return I64_MIN;
	return big;
};
/**
* Truncate a float to `u128` with Rust's saturating `as u128` semantics: NaN
* and negatives clamp to 0, values at/above 2^128 clamp to `u128::MAX`.
*/
const saturateFloatToU128 = (f) => {
	if (Number.isNaN(f)) return 0n;
	const t = Math.trunc(f);
	if (t <= 0) return 0n;
	const big = BigInt(t);
	return big > U128_MAX ? U128_MAX : big;
};
//#endregion
//#region src/exact.ts
const hasFract = (n) => {
	return n % 1 !== 0;
};
/**
* Shared float→integer exactness gate for every `Exact<Int>.exactFromF*`. A
* float is an exact integer of a width iff it is finite, whole, and inside that
* width's exclusive `(loEx, hiEx)` bounds (use ±Infinity to skip a side). The
* bounds encode the per-width / per-source-precision limits the Rust reference
* pins. The three typed wrappers below shape the truncated result.
*/
const isExactIntFloat = (source, loEx, hiEx) => Number.isFinite(source) && source > loEx && source < hiEx && !hasFract(source);
/** float → small integer (`number`). */
const intFromFloatNum = (source, loEx, hiEx) => isExactIntFloat(source, loEx, hiEx) ? Math.trunc(source) : void 0;
/** float → 64-bit integer (`number` if safe, else `bigint`). */
const intFromFloatNarrow = (source, loEx, hiEx) => isExactIntFloat(source, loEx, hiEx) ? narrowInteger(BigInt(Math.trunc(source))) : void 0;
/** float → 128-bit integer (`bigint`). */
const intFromFloatBig = (source, loEx, hiEx) => isExactIntFloat(source, loEx, hiEx) ? BigInt(Math.trunc(source)) : void 0;
/**
* Exact conversions for i128 (JavaScript bigint).
*/
var ExactI128 = class {
	static MIN = -(2n ** 127n);
	static MAX = 2n ** 127n - 1n;
	static exactFromF16(source) {
		return intFromFloatBig(source, -Infinity, Infinity);
	}
	static exactFromF32(source) {
		return intFromFloatBig(source, -Infinity, Infinity);
	}
	static exactFromF64(source) {
		return intFromFloatBig(source, -Infinity, Infinity);
	}
	static exactFromU64(source) {
		return BigInt(source);
	}
	static exactFromI64(source) {
		return BigInt(source);
	}
	static exactFromU128(source) {
		if (source > 2n ** 127n - 1n) return void 0;
		return source;
	}
	static exactFromI128(source) {
		return source;
	}
};
/**
* Exact conversions for u16 (0 to 65535).
*/
var ExactU16 = class {
	static MIN = 0;
	static MAX = 65535;
	static exactFromF16(source) {
		return intFromFloatNum(source, -1, Infinity);
	}
	static exactFromF32(source) {
		return intFromFloatNum(source, -1, 65536);
	}
	static exactFromF64(source) {
		return intFromFloatNum(source, -1, 65536);
	}
	static exactFromU64(source) {
		const n = typeof source === "bigint" ? Number(source) : source;
		if (n > 65535) return void 0;
		return n;
	}
	static exactFromI64(source) {
		const n = typeof source === "bigint" ? Number(source) : source;
		if (n < 0 || n > 65535) return void 0;
		return n;
	}
	static exactFromU128(source) {
		if (source > 65535n) return void 0;
		return Number(source);
	}
	static exactFromI128(source) {
		if (source < 0n || source > 65535n) return void 0;
		return Number(source);
	}
};
/**
* Exact conversions for u32 (0 to 4294967295).
*/
var ExactU32 = class {
	static MIN = 0;
	static MAX = 4294967295;
	static exactFromF16(source) {
		return intFromFloatNum(source, -1, Infinity);
	}
	static exactFromF32(source) {
		return intFromFloatNum(source, -1, 4294967296);
	}
	static exactFromF64(source) {
		return intFromFloatNum(source, -1, 4294967296);
	}
	static exactFromU64(source) {
		const n = typeof source === "bigint" ? Number(source) : source;
		if (n > 4294967295) return void 0;
		return n;
	}
	static exactFromI64(source) {
		const n = typeof source === "bigint" ? Number(source) : source;
		if (n < 0 || n > 4294967295) return void 0;
		return n;
	}
	static exactFromU128(source) {
		if (source > 4294967295n) return void 0;
		return Number(source);
	}
	static exactFromI128(source) {
		if (source < 0n || source > 4294967295n) return void 0;
		return Number(source);
	}
};
/**
* Exact conversions for u64 (0 to 18446744073709551615).
*/
var ExactU64 = class {
	static MIN = 0n;
	static MAX = 18446744073709551615n;
	static exactFromF16(source) {
		return intFromFloatNarrow(source, -1, Infinity);
	}
	static exactFromF32(source) {
		return intFromFloatNarrow(source, -1, 0x10000000000000000);
	}
	static exactFromF64(source) {
		return intFromFloatNarrow(source, -1, 0x10000000000000000);
	}
	static exactFromU64(source) {
		return source;
	}
	static exactFromI64(source) {
		if ((typeof source === "bigint" ? source : BigInt(source)) < 0n) return void 0;
		return source;
	}
	static exactFromU128(source) {
		if (source > 18446744073709551615n) return void 0;
		return narrowInteger(source);
	}
	static exactFromI128(source) {
		if (source < 0n || source > 18446744073709551615n) return void 0;
		return narrowInteger(source);
	}
};
/**
* Exact conversions for f64 (double precision float).
*/
var ExactF64 = class {
	static exactFromF16(source) {
		if (Number.isNaN(source)) return NaN;
		return source;
	}
	static exactFromF32(source) {
		if (Number.isNaN(source)) return NaN;
		return source;
	}
	static exactFromF64(source) {
		if (Number.isNaN(source)) return NaN;
		return source;
	}
	static exactFromU64(source) {
		const srcBig = typeof source === "bigint" ? source : BigInt(source);
		const n = Number(srcBig);
		if (!Number.isFinite(n)) return void 0;
		return saturateFloatToU64(n) === srcBig ? n : void 0;
	}
	static exactFromI64(source) {
		const srcBig = typeof source === "bigint" ? source : BigInt(source);
		const n = Number(srcBig);
		if (!Number.isFinite(n)) return void 0;
		return saturateFloatToI64(n) === srcBig ? n : void 0;
	}
	static exactFromU128(source) {
		const n = Number(source);
		if (!Number.isFinite(n)) return void 0;
		return saturateFloatToU128(n) === source ? n : void 0;
	}
	static exactFromI128(source) {
		if (source < -9223372036854775808n || source > 9223372036854775807n) return;
		const absSource = source < 0n ? -source : source;
		if (absSource <= 4503599627370495n) return Number(source);
		const trailingZeros = countTrailingZeros(absSource);
		if (trailingZeros >= 53 && trailingZeros <= 63) return Number(source);
	}
};
const countTrailingZeros = (n) => {
	if (n === 0n) return 0;
	let count = 0;
	while ((n & 1n) === 0n) {
		count++;
		n = n >> 1n;
	}
	return count;
};
//#endregion
//#region src/float.ts
/**
* Float encoding and conversion utilities for dCBOR.
*
* # Floating Point Number Support in dCBOR
*
* dCBOR provides canonical encoding for floating point values.
*
* Per the dCBOR specification, the canonical encoding rules ensure
* deterministic representation:
*
* - Numeric reduction: Floating point values with zero fractional part in
*   range [-2^63, 2^64-1] are automatically encoded as integers (e.g., 42.0
*   becomes 42)
* - Values are encoded in the smallest possible representation that preserves
*   their value
* - All NaN values are canonicalized to a single representation: 0xf97e00
* - Positive/negative infinity are canonicalized to half-precision
*   representations
*
* @module float
*/
/**
* Canonical NaN representation in CBOR: 0xf97e00
*/
const CBOR_NAN = new Uint8Array([
	249,
	126,
	0
]);
/**
* Check if a number has a fractional part.
*/
const hasFractionalPart = (n) => n !== Math.floor(n);
/**
* Read a big-endian IEEE-754 double from the first 8 bytes of `data`.
* @internal
*/
const binary64ToNumber = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat64(0, false);
/**
* Encode a number as 4 big-endian bytes of an IEEE-754 single (f32).
*/
const numberToBinary32 = (n) => {
	const data = /* @__PURE__ */ new Uint8Array(4);
	new DataView(data.buffer).setFloat32(0, n, false);
	return data;
};
/**
* Read a big-endian IEEE-754 single (f32) from the first 4 bytes of `data`.
*/
const binary32ToNumber = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat32(0, false);
const f32ScratchView = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(4));
/**
* Compute the 16-bit pattern of the IEEE-754 half-precision value nearest `n`,
* rounding ties to even — matching `f32::to_be_bytes`-style IEEE conversion.
*
* All call sites pass values already exactly representable in binary16 (the
* reduction gates in {@link f16CborData} ensure this), so no rounding occurs on
* a value that is actually stored; the rounding path exists only so the
* reduction round-trip probe (`binary16ToNumber(numberToBinary16(n)) === n`)
* answers correctly for non-representable inputs.
*/
const float16Bits = (n) => {
	f32ScratchView.setFloat32(0, n, false);
	const f = f32ScratchView.getUint32(0, false);
	const sign = f >>> 16 & 32768;
	const exp = f >>> 23 & 255;
	const mant = f & 8388607;
	if (exp === 255) return sign | (mant !== 0 ? 32256 : 31744);
	const e = exp - 127 + 15;
	if (e >= 31) return sign | 31744;
	if (e <= 0) {
		if (e < -10) return sign;
		const significand = mant | 8388608;
		const shift = 14 - e;
		let result = significand >>> shift;
		const remainder = significand & (1 << shift) - 1;
		const halfway = 1 << shift - 1;
		if (remainder > halfway || remainder === halfway && (result & 1) === 1) result += 1;
		return sign | result;
	}
	let fraction = mant >>> 13;
	const remainder = mant & 8191;
	let exponent = e;
	if (remainder > 4096 || remainder === 4096 && (fraction & 1) === 1) {
		fraction += 1;
		if (fraction === 1024) {
			fraction = 0;
			exponent += 1;
			if (exponent >= 31) return sign | 31744;
		}
	}
	return sign | exponent << 10 | fraction;
};
/**
* Encode a number as 2 big-endian bytes of an IEEE-754 half (f16).
*/
const numberToBinary16 = (n) => {
	const bits = float16Bits(n);
	return new Uint8Array([bits >> 8 & 255, bits & 255]);
};
/**
* Read a big-endian IEEE-754 half (f16) from the first 2 bytes of `data`.
*/
const binary16ToNumber = (data) => {
	const bits = data[0] << 8 | data[1];
	const sign = (bits & 32768) !== 0 ? -1 : 1;
	const exponent = bits >> 10 & 31;
	const fraction = bits & 1023;
	if (exponent === 0) return sign * fraction * 2 ** -24;
	if (exponent === 31) return fraction !== 0 ? NaN : sign * Infinity;
	return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
};
/**
* Encode f64 value to CBOR data bytes.
* Implements numeric reduction and canonical encoding rules.
* Matches Rust's f64_cbor_data function.
* @internal
*/
const f64CborData = (value) => {
	const n = value;
	const f = binary32ToNumber(numberToBinary32(n));
	if (f === n) return f32CborData(f);
	if (n < 0) {
		const i128 = ExactI128.exactFromF64(n);
		if (i128 !== void 0) {
			const i = ExactU64.exactFromI128(-1n - i128);
			if (i !== void 0) return encodeVarInt(i, MajorType.Negative);
		}
	}
	const u = ExactU64.exactFromF64(n);
	if (u !== void 0) return encodeVarInt(u, MajorType.Unsigned);
	if (Number.isNaN(value)) return CBOR_NAN;
	const buffer = /* @__PURE__ */ new ArrayBuffer(8);
	new DataView(buffer).setFloat64(0, n, false);
	const bytes = new Uint8Array(buffer);
	return new Uint8Array([251, ...bytes]);
};
/**
* Encode f32 value to CBOR data bytes.
* Implements numeric reduction and canonical encoding rules.
* Matches Rust's f32_cbor_data function.
* @internal
*/
const f32CborData = (value) => {
	const n = value;
	const f = binary16ToNumber(numberToBinary16(n));
	if (f === n) return f16CborData(f);
	if (n < 0) {
		const u = ExactU64.exactFromF32(Math.fround(-1 - n));
		if (u !== void 0) return encodeVarInt(u, MajorType.Negative);
	}
	const u = ExactU32.exactFromF32(n);
	if (u !== void 0) return encodeVarInt(u, MajorType.Unsigned);
	if (Number.isNaN(value)) return CBOR_NAN;
	const bytes = numberToBinary32(n);
	return new Uint8Array([250, ...bytes]);
};
/**
* Encode f16 value to CBOR data bytes.
* Implements numeric reduction and canonical encoding rules.
* Matches Rust's f16_cbor_data function.
* @internal
*/
const f16CborData = (value) => {
	const n = value;
	if (n < 0) {
		const u = ExactU64.exactFromF64(-1 - n);
		if (u !== void 0) return encodeVarInt(u, MajorType.Negative);
	}
	const u = ExactU16.exactFromF64(n);
	if (u !== void 0) return encodeVarInt(u, MajorType.Unsigned);
	if (Number.isNaN(value)) return CBOR_NAN;
	const bytes = numberToBinary16(value);
	return new Uint8Array([249, ...bytes]);
};
/**
* Render a float to its diagnostic string, matching Rust's `Simple` Display.
*
* Finite non-zero values with magnitude in [1e-4, 1e16) print in decimal with
* at least one fractional digit (whole values get a trailing `.0`); everything
* else prints in exponential form. Zero prints as `0.0`/`-0.0`.
*
* JS already produces the same shortest round-tripping digits; we only fix up
* the notation threshold, the `e+` → `e` exponent, and the `.0` suffix.
*
* @param value - The float value
* @returns Rust-`Display`-compatible string
*/
const floatDisplayString = (value) => {
	if (Number.isNaN(value)) return "NaN";
	if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
	if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
	const abs = Math.abs(value);
	if (abs >= 1e-4 && abs < 0x2386f26fc10000) {
		let str = String(value);
		if (!str.includes(".")) str = `${str}.0`;
		return str;
	}
	return value.toExponential().replace("e+", "e");
};
//#endregion
//#region src/varint.ts
const typeBits = (t) => {
	return t << 5;
};
/**
* Write a CBOR head (major type + argument) straight into `writer`, avoiding
* the intermediate `Uint8Array` that {@link encodeVarInt} allocates. This is
* the encoder hot path (every node emits a head). It MUST stay byte-identical
* to {@link encodeVarInt}; the golden vectors cover both.
*/
const writeVarInt = (writer, value, majorType) => {
	if (value < 0) throw CborError.outOfRange();
	if (typeof value === "number" && hasFractionalPart(value)) throw CborError.outOfRange();
	const type = typeBits(majorType);
	if (isCborNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
		const n = Number(value);
		if (n <= 23) writer.writeByte(n | type);
		else if (n <= 255) {
			writer.writeByte(24 | type);
			writer.writeByte(n);
		} else if (n <= 65535) {
			writer.writeByte(25 | type);
			writer.writeUint16(n);
		} else if (n <= 4294967295) {
			writer.writeByte(26 | type);
			writer.writeUint32(n);
		} else {
			writer.writeByte(27 | type);
			writer.writeBigUint64(BigInt(n));
		}
	} else {
		const big = BigInt(value);
		if (big > 18446744073709551615n) throw CborError.outOfRange();
		writer.writeByte(27 | type);
		writer.writeBigUint64(big);
	}
};
const encodeVarInt = (value, majorType) => {
	if (value < 0) throw CborError.outOfRange();
	if (typeof value === "number" && hasFractionalPart(value)) throw CborError.outOfRange();
	const type = typeBits(majorType);
	if (isCborNumber(value) && value <= Number.MAX_SAFE_INTEGER) {
		value = Number(value);
		if (value <= 23) return new Uint8Array([value | type]);
		else if (value <= 255) return new Uint8Array([24 | type, value]);
		else if (value <= 65535) {
			const buffer = /* @__PURE__ */ new ArrayBuffer(3);
			const view = new DataView(buffer);
			view.setUint8(0, 25 | type);
			view.setUint16(1, value);
			return new Uint8Array(buffer);
		} else if (value <= 4294967295) {
			const buffer = /* @__PURE__ */ new ArrayBuffer(5);
			const view = new DataView(buffer);
			view.setUint8(0, 26 | type);
			view.setUint32(1, value);
			return new Uint8Array(buffer);
		} else {
			const buffer = /* @__PURE__ */ new ArrayBuffer(9);
			const view = new DataView(buffer);
			view.setUint8(0, 27 | type);
			view.setBigUint64(1, BigInt(value));
			return new Uint8Array(buffer);
		}
	} else {
		const big = BigInt(value);
		if (big > 18446744073709551615n) throw CborError.outOfRange();
		const buffer = /* @__PURE__ */ new ArrayBuffer(9);
		const view = new DataView(buffer);
		view.setUint8(0, 27 | type);
		view.setBigUint64(1, big);
		return new Uint8Array(buffer);
	}
};
const decodeVarIntData = (dataView, offset) => {
	const initialByte = dataView.getUint8(offset);
	const majorType = initialByte >> 5;
	const additionalInfo = initialByte & 31;
	let value;
	offset += 1;
	switch (additionalInfo) {
		case 24:
			value = dataView.getUint8(offset);
			offset += 1;
			break;
		case 25:
			value = (dataView.getUint8(offset) << 8 | dataView.getUint8(offset + 1)) >>> 0;
			offset += 2;
			break;
		case 26:
			value = (dataView.getUint8(offset) << 24 | dataView.getUint8(offset + 1) << 16 | dataView.getUint8(offset + 2) << 8 | dataView.getUint8(offset + 3)) >>> 0;
			offset += 4;
			break;
		case 27:
			value = getUint64(dataView, offset, false);
			if (value <= Number.MAX_SAFE_INTEGER) value = Number(value);
			offset += 8;
			break;
		default:
			value = additionalInfo;
			break;
	}
	return {
		majorType,
		value,
		offset
	};
};
const decodeVarInt = (data) => {
	return decodeVarIntData(new DataView(data.buffer, data.byteOffset, data.byteLength), 0);
};
function getUint64(view, byteOffset, littleEndian) {
	const lowWord = littleEndian ? view.getUint32(byteOffset, true) : view.getUint32(byteOffset + 4, false);
	const highWord = littleEndian ? view.getUint32(byteOffset + 4, true) : view.getUint32(byteOffset, false);
	return (BigInt(highWord) << BigInt(32)) + BigInt(lowWord);
}
//#endregion
//#region src/string-util.ts
/**
* String utilities for dCBOR, including Unicode normalization.
*
* @module string-util
*/
/**
* Flank a string with left and right strings.
*
* @param s - String to flank
* @param left - Left flanking string
* @param right - Right flanking string
* @returns Flanked string
*/
const flanked = (s, left, right) => left + s + right;
/**
* Check if a character is printable. Internal helper for {@link sanitized}.
*
* @param c - Character to check
* @returns True if printable
*/
const isPrintable = (c) => {
	if (c.length !== 1) return false;
	const code = c.charCodeAt(0);
	return code > 127 || code >= 32 && code <= 126;
};
/**
* Sanitize a string by replacing non-printable characters with dots.
* Returns None if the string has no printable characters.
*
* @param str - String to sanitize
* @returns Sanitized string or undefined if no printable characters
*/
const sanitized = (str) => {
	let hasPrintable = false;
	const chars = [];
	for (const c of str) if (isPrintable(c)) {
		hasPrintable = true;
		chars.push(c);
	} else chars.push(".");
	if (!hasPrintable) return;
	return chars.join("");
};
//#endregion
//#region src/tags-store.ts
/**
* Tag registry implementation.
*
* Stores tags with their names and optional summarizer functions.
*/
var TagsStore = class {
	_tagsByValue = /* @__PURE__ */ new Map();
	_tagsByName = /* @__PURE__ */ new Map();
	_summarizers = /* @__PURE__ */ new Map();
	constructor() {}
	/**
	* Insert a tag into the registry.
	*
	* Matches Rust's TagsStore::insert() behavior:
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
	* store.insert(createTag(12345, 'myCustomTag'));
	* ```
	*/
	insert(tag) {
		const name = tag.name;
		if (name === void 0 || name === "") throw new Error(`Tag ${tag.value} must have a non-empty name`);
		const key = this._valueKey(tag.value);
		const existing = this._tagsByValue.get(key);
		if (existing?.name !== void 0 && existing.name !== name) throw new Error(`Attempt to register tag: ${tag.value} '${existing.name}' with different name: '${name}'`);
		this._tagsByValue.set(key, tag);
		this._tagsByName.set(name, tag);
	}
	/**
	* Insert multiple tags into the registry.
	* Matches Rust's insert_all() method.
	*
	* @param tags - Array of tags to register
	*
	* @example
	* ```typescript
	* const store = new TagsStore();
	* store.insertAll([
	*   createTag(1, 'date'),
	*   createTag(100, 'custom')
	* ]);
	* ```
	*/
	insertAll(tags) {
		for (const tag of tags) this.insert(tag);
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
	setSummarizer(tagValue, summarizer) {
		const key = this._valueKey(tagValue);
		this._summarizers.set(key, summarizer);
	}
	assignedNameForTag(tag) {
		const key = this._valueKey(tag.value);
		return this._tagsByValue.get(key)?.name;
	}
	nameForTag(tag) {
		return this.assignedNameForTag(tag) ?? tag.value.toString();
	}
	tagForValue(value) {
		const key = this._valueKey(value);
		return this._tagsByValue.get(key);
	}
	tagForName(name) {
		return this._tagsByName.get(name);
	}
	nameForValue(value) {
		const tag = this.tagForValue(value);
		return tag !== void 0 ? this.nameForTag(tag) : value.toString();
	}
	summarizer(tag) {
		const key = this._valueKey(tag);
		return this._summarizers.get(key);
	}
	/**
	* Create a string key for a numeric tag value.
	* Handles both number and bigint types.
	*
	* @private
	*/
	_valueKey(value) {
		return value.toString();
	}
};
/**
* Global singleton instance of the tags store.
*/
let globalTagsStore;
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
* store.insert(createTag(999, 'myTag'));
* ```
*/
const getGlobalTagsStore = () => {
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
const withTags = (action) => {
	return action(getGlobalTagsStore());
};
/**
* Execute a function with mutable access to the global tags store.
*
* This is an alias for withTags() for consistency with Rust API.
*
* @template T - Return type of the action function
* @param action - Function to execute with the tags store
* @returns Result of the action function
*/
const withTagsMut = (action) => {
	return action(getGlobalTagsStore());
};
//#endregion
//#region src/dump.ts
/**
* Hex dump utilities for CBOR data.
*
* Affordances for viewing the encoded binary representation of CBOR as hexadecimal.
* Optionally annotates the output, breaking it up into semantically meaningful lines,
* formatting dates, and adding names of known tags.
*
* @module dump
*/
/**
* Convert bytes to hex string.
*/
const bytesToHex = (bytes) => {
	return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};
/**
* Convert hex string to bytes.
*
* **Whitespace tolerance.** This implementation strips ASCII whitespace
* before decoding so users can paste annotated hex dumps directly. Rust's
* `hex::decode` is strict and panics on any whitespace. This is a
* deliberate TS-side ergonomic divergence — callers who need strict
* Rust-compatible parsing should validate the input first (e.g.
* `if (/\s/.test(s)) throw …`).
*/
const hexToBytes = (hexString) => {
	const hex = hexString.replace(/\s/g, "");
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	return bytes;
};
/**
* Returns the encoded hexadecimal representation of CBOR.
*
* @param cbor - CBOR value to convert
* @returns Hex string
*/
const hex = (cbor) => bytesToHex(cborData(cbor));
/**
* Returns the encoded hexadecimal representation of CBOR with options.
*
* Optionally annotates the output, e.g., breaking the output up into
* semantically meaningful lines, formatting dates, and adding names of
* known tags.
*
* @param cbor - CBOR value to convert
* @param opts - Formatting options
* @returns Hex string (possibly annotated)
*/
const hexOpt = (cbor, opts = {}) => {
	if (opts.annotate !== true) return hex(cbor);
	const items = dumpItems(cbor, 0, opts);
	const roundedNoteColumn = (items.reduce((largest, item) => {
		return Math.max(largest, item.formatFirstColumn().length);
	}, 0) + 4 & -4) - 1;
	return items.map((item) => item.format(roundedNoteColumn)).join("\n");
};
/**
* Returns the encoded hexadecimal representation of CBOR, with annotations.
*
* @param cbor - CBOR value to convert
* @param tagsStore - Optional tags store for tag name resolution
* @returns Annotated hex string
*/
const hexAnnotated = (cbor, tagsStore) => {
	tagsStore ??= getGlobalTagsStore();
	return hexOpt(cbor, {
		annotate: true,
		tagsStore
	});
};
/**
* Internal structure for dump items.
*/
var DumpItem = class {
	level;
	data;
	note;
	constructor(level, data, note) {
		this.level = level;
		this.data = data;
		this.note = note;
	}
	format(noteColumn) {
		const column1 = this.formatFirstColumn();
		let column2 = "";
		let padding = "";
		if (this.note !== void 0) {
			const paddingCount = Math.max(1, Math.min(39, noteColumn) - column1.length + 1);
			padding = " ".repeat(paddingCount);
			column2 = `# ${this.note}`;
		}
		return column1 + padding + column2;
	}
	formatFirstColumn() {
		return " ".repeat(this.level * 4) + this.data.map(bytesToHex).filter((x) => x.length > 0).join(" ");
	}
};
/**
* Generate dump items for a CBOR value (recursive).
*/
function dumpItems(cbor, level, opts) {
	const items = [];
	switch (cbor.type) {
		case MajorType.Unsigned: {
			const data = cborData(cbor);
			items.push(new DumpItem(level, [data], `unsigned(${cbor.value})`));
			break;
		}
		case MajorType.Negative: {
			const data = cborData(cbor);
			const actualValue = typeof cbor.value === "bigint" ? -1n - cbor.value : -1 - cbor.value;
			items.push(new DumpItem(level, [data], `negative(${actualValue})`));
			break;
		}
		case MajorType.ByteString: {
			const header = encodeVarInt(cbor.value.length, MajorType.ByteString);
			items.push(new DumpItem(level, [header], `bytes(${cbor.value.length})`));
			if (cbor.value.length > 0) {
				let note = void 0;
				try {
					const sanitizedText = sanitized(new TextDecoder("utf-8", { fatal: true }).decode(cbor.value));
					if (sanitizedText !== void 0 && sanitizedText !== "") note = flanked(sanitizedText, "\"", "\"");
				} catch {}
				items.push(new DumpItem(level + 1, [cbor.value], note));
			}
			break;
		}
		case MajorType.Text: {
			const utf8Data = new TextEncoder().encode(cbor.value);
			const header = encodeVarInt(utf8Data.length, MajorType.Text);
			const firstByte = header[0];
			if (firstByte === void 0) throw CborError.custom("Invalid varint encoding");
			const headerData = [new Uint8Array([firstByte]), header.slice(1)];
			items.push(new DumpItem(level, headerData, `text(${utf8Data.length})`));
			items.push(new DumpItem(level + 1, [utf8Data], flanked(cbor.value, "\"", "\"")));
			break;
		}
		case MajorType.Array: {
			const header = encodeVarInt(cbor.value.length, MajorType.Array);
			const firstByte = header[0];
			if (firstByte === void 0) throw CborError.custom("Invalid varint encoding");
			const headerData = [new Uint8Array([firstByte]), header.slice(1)];
			items.push(new DumpItem(level, headerData, `array(${cbor.value.length})`));
			for (const item of cbor.value) items.push(...dumpItems(item, level + 1, opts));
			break;
		}
		case MajorType.Map: {
			const header = encodeVarInt(cbor.value.size, MajorType.Map);
			const firstByte = header[0];
			if (firstByte === void 0) throw CborError.custom("Invalid varint encoding");
			const headerData = [new Uint8Array([firstByte]), header.slice(1)];
			items.push(new DumpItem(level, headerData, `map(${cbor.value.size})`));
			for (const entry of cbor.value.entriesArray) {
				items.push(...dumpItems(entry.key, level + 1, opts));
				items.push(...dumpItems(entry.value, level + 1, opts));
			}
			break;
		}
		case MajorType.Tagged: {
			const tagValue = cbor.tag;
			if (tagValue === void 0) throw CborError.custom("Tagged CBOR value must have a tag");
			const header = encodeVarInt(tagValue, MajorType.Tagged);
			const firstByte = header[0];
			if (firstByte === void 0) throw CborError.custom("Invalid varint encoding");
			const headerData = [new Uint8Array([firstByte]), header.slice(1)];
			const noteComponents = [`tag(${tagValue})`];
			const tag = createTag(tagValue);
			const tagName = opts.tagsStore?.assignedNameForTag(tag);
			if (tagName !== void 0) noteComponents.push(tagName);
			const tagNote = noteComponents.join(" ");
			items.push(new DumpItem(level, headerData, tagNote));
			items.push(...dumpItems(cbor.value, level + 1, opts));
			break;
		}
		case MajorType.Simple: {
			const data = cborData(cbor);
			const simple = cbor.value;
			let note;
			if (simple.type === "True") note = "true";
			else if (simple.type === "False") note = "false";
			else if (simple.type === "Null") note = "null";
			else if (simple.type === "Float") note = floatDisplayString(simple.value);
			else note = "simple";
			items.push(new DumpItem(level, [data], note));
			break;
		}
	}
	return items;
}
//#endregion
//#region src/diag.ts
/**
* Default formatting options.
*/
const DEFAULT_OPTS = {
	annotate: false,
	summarize: false,
	flat: false,
	tags: "global",
	indent: 0,
	indentString: "    "
};
/**
* Format CBOR value as diagnostic notation with options.
*
* @param cbor - CBOR value to format
* @param opts - Formatting options
* @returns Diagnostic string
*
* @example
* ```typescript
* const value = cbor({ name: 'Alice', age: 30 });
* console.log(diagnosticOpt(value, { flat: true }));
* // {\"name\": \"Alice\", \"age\": 30}
*
* const tagged = createTaggedCbor({ ... });
* console.log(diagnosticOpt(tagged, { annotate: true }));
* // date(1234567890)
* ```
*/
function diagnosticOpt(cbor, opts) {
	const options = {
		...DEFAULT_OPTS,
		...opts
	};
	if (options.summarize === true) options.flat = true;
	return diagFormat(diagItem(cbor, options), options);
}
/**
* Format CBOR value as standard diagnostic notation.
*
* @param cbor - CBOR value to format
* @returns Diagnostic string (pretty-printed with multiple lines for complex structures)
*
* @example
* ```typescript
* const value = cbor([1, 2, 3]);
* console.log(diagnostic(value));
* // For simple arrays: "[1, 2, 3]"
* // For nested structures: multi-line formatted output
* ```
*/
function diagnostic(cbor) {
	return diagnosticOpt(cbor);
}
/**
* Format CBOR value with tag name annotations.
*
* Tagged values are displayed with their registered names instead of numeric tags.
*
* @param cbor - CBOR value to format
* @returns Annotated diagnostic string (pretty-printed format)
*
* @example
* ```typescript
* const date = CborDate.now().taggedCbor();
* console.log(diagnosticAnnotated(date));
* // date(1234567890) instead of 1(1234567890)
* ```
*/
function diagnosticAnnotated(cbor) {
	return diagnosticOpt(cbor, { annotate: true });
}
function diagnosticFlat(input) {
	if (typeof input === "object" && input !== null && "type" in input && (input.type === "single" || input.type === "keyvalue")) if (input.type === "single") return diagnosticOpt(input.cbor, { flat: true });
	else return `${diagnosticOpt(input.key, { flat: true })}: ${diagnosticOpt(input.value, { flat: true })}`;
	return diagnosticOpt(input, { flat: true });
}
/**
* Format CBOR value using custom summarizers for tagged values.
*
* If a summarizer is registered for a tagged value, uses that instead of
* showing the full content.
*
* @param cbor - CBOR value to format
* @returns Summarized diagnostic string
*
* @example
* ```typescript
* // If a summarizer is registered for tag 123:
* const tagged = cbor({ type: MajorType.Tagged, tag: 123, value: ... });
* console.log(summary(tagged));
* // "custom-summary" (instead of full content)
* ```
*/
function summary(cbor) {
	return diagnosticOpt(cbor, {
		summarize: true,
		flat: true
	});
}
const item = (value) => ({
	kind: "item",
	value
});
const group = (begin, end, items, isPairs, comment) => {
	const g = {
		kind: "group",
		begin,
		end,
		items,
		isPairs
	};
	if (comment !== void 0) g.comment = comment;
	return g;
};
const isGroup = (i) => i.kind === "group";
const containsGroup = (i) => i.kind === "group" && i.items.some(isGroup);
const totalStringsLen = (i) => i.kind === "item" ? i.value.length : i.items.reduce((acc, c) => acc + totalStringsLen(c), 0);
const greatestStringsLen = (i) => i.kind === "item" ? i.value.length : i.items.reduce((acc, c) => Math.max(acc, totalStringsLen(c)), 0);
/**
* Mirrors Rust `DiagItem::joined`: alternates between `pairSeparator`
* (after even-indexed items — keys) and `itemSeparator` (after odd-indexed
* items — values). Falls back to `itemSeparator` for non-pair groups.
*/
function joined(elements, itemSeparator, pairSeparator) {
	const sep = pairSeparator ?? itemSeparator;
	let result = "";
	const len = elements.length;
	for (let i = 0; i < len; i++) {
		result += elements[i];
		if (i !== len - 1) result += (i & 1) !== 0 ? itemSeparator : sep;
	}
	return result;
}
const diagFormat = (i, opts) => diagFormatOpt(i, 0, "", opts);
function diagFormatOpt(i, level, separator, opts) {
	if (i.kind === "item") return formatLine(level, opts, i.value, separator, void 0);
	if (opts.flat !== true && (containsGroup(i) || totalStringsLen(i) > 20 || greatestStringsLen(i) > 20)) return multilineComposition(i, level, separator, opts);
	return singleLineComposition(i, level, separator, opts);
}
function formatLine(level, opts, string, separator, comment) {
	const result = `${opts.flat === true ? "" : " ".repeat(level * 4)}${string}${separator}`;
	if (comment !== void 0) return `${result}   / ${comment} /`;
	return result;
}
function singleLineComposition(i, level, separator, opts) {
	let str;
	let comment;
	if (i.kind === "item") {
		str = i.value;
		comment = void 0;
	} else {
		str = flanked(joined(i.items.map((c) => c.kind === "item" ? c.value : singleLineComposition(c, level + 1, separator, opts)), ", ", i.isPairs ? ": " : ", "), i.begin, i.end);
		comment = i.comment;
	}
	return formatLine(level, opts, str, separator, comment);
}
function multilineComposition(i, level, separator, opts) {
	if (i.kind === "item") return i.value;
	const lines = [];
	const openOpts = {
		...opts,
		flat: false
	};
	lines.push(formatLine(level, openOpts, i.begin, "", i.comment));
	for (let idx = 0; idx < i.items.length; idx++) {
		const sep = idx === i.items.length - 1 ? "" : i.isPairs && (idx & 1) === 0 ? ":" : ",";
		lines.push(diagFormatOpt(i.items[idx], level + 1, sep, opts));
	}
	lines.push(formatLine(level, opts, i.end, separator, void 0));
	return lines.join("\n");
}
function diagItem(cbor, opts) {
	switch (cbor.type) {
		case MajorType.Unsigned: return item(formatUnsigned(cbor.value));
		case MajorType.Negative: return item(formatNegative(cbor.value));
		case MajorType.ByteString: return item(formatBytes(cbor.value));
		case MajorType.Text: return item(formatText(cbor.value));
		case MajorType.Array: return item_array(cbor.value, opts);
		case MajorType.Map: return item_map(cbor.value, opts);
		case MajorType.Tagged: return item_tagged(cbor.tag, cbor.value, opts);
		case MajorType.Simple: return item(formatSimple(cbor.value));
	}
}
function item_array(items, opts) {
	return group("[", "]", items.map((it) => diagItem(it, opts)), false);
}
function item_map(map, opts) {
	const entries = map?.entriesArray ?? [];
	const flatItems = [];
	for (const e of entries) {
		flatItems.push(diagItem(e.key, opts));
		flatItems.push(diagItem(e.value, opts));
	}
	return group("{", "}", flatItems, true);
}
function item_tagged(tag, content, opts) {
	if (opts.summarize === true) {
		const summarizer = resolveTagsStore(opts.tags)?.summarizer(tag);
		if (summarizer !== void 0) {
			const result = summarizer(content, opts.flat ?? false);
			if (result.ok) return item(result.value);
			return item(`<error: ${result.error.message}>`);
		}
	}
	let comment;
	if (opts.annotate === true) {
		const store = resolveTagsStore(opts.tags);
		const tagObj = { value: tag };
		const assignedName = store?.assignedNameForTag(tagObj);
		if (assignedName !== void 0) comment = assignedName;
	}
	return group(`${String(tag)}(`, ")", [diagItem(content, opts)], false, comment);
}
function formatUnsigned(value) {
	return String(value);
}
function formatNegative(value) {
	if (typeof value === "bigint") return String(-value - 1n);
	return String(-value - 1);
}
function formatBytes(value) {
	return `h'${bytesToHex(value)}'`;
}
function formatText(value) {
	return `"${value.replace(/"/g, "\\\"")}"`;
}
function formatSimple(value) {
	switch (value.type) {
		case "True": return "true";
		case "False": return "false";
		case "Null": return "null";
		case "Float": return formatFloat(value.value);
	}
}
/**
* Format a CBOR float for diagnostic output. Shared with the hex-dump
* annotation path; see {@link floatDisplayString}.
*/
function formatFloat(value) {
	return floatDisplayString(value);
}
function resolveTagsStore(tags) {
	if (tags === "none") return void 0;
	if (tags === "global" || tags === void 0) return getGlobalTagsStore();
	return tags;
}
//#endregion
//#region src/decode.ts
/**
* A forward-only cursor over the input bytes.
*
* Decoding advances a single `pos` through one shared `DataView` rather than
* slicing a fresh sub-view per nested item and threading a consumed-length back
* up the recursion. Every read is bounds-checked against the remaining bytes,
* which matches the old `&data[index..]`-style views (those always extended to
* the end of the whole input), so underrun/overrun behavior is unchanged.
*/
var ByteReader = class {
	view;
	pos = 0;
	constructor(data) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}
	get byteLength() {
		return this.view.byteLength;
	}
	get remaining() {
		return this.view.byteLength - this.pos;
	}
	/** Read the byte at `offset` relative to the current position (no advance). */
	peek(offset) {
		return this.view.getUint8(this.pos + offset);
	}
	/** Advance the cursor by `count` bytes. */
	advance(count) {
		this.pos += count;
	}
	/** A zero-copy view of `len` bytes at the given absolute offset. */
	bytesAt(offset, len) {
		return new Uint8Array(this.view.buffer, this.view.byteOffset + offset, len);
	}
};
function decodeCbor(data) {
	const reader = new ByteReader(data);
	const cbor = readCbor(reader);
	const remaining = reader.byteLength - reader.pos;
	if (remaining !== 0) throw CborError.unusedData(remaining);
	return cbor;
}
/**
* Decode without throwing: returns a {@link Result} carrying the decoded value,
* or the {@link CborError} that {@link decodeCbor} would have thrown. Non-CBOR
* errors still propagate.
*/
function tryDecode(data) {
	try {
		return Ok(decodeCbor(data));
	} catch (e) {
		if (CborError.isCborError(e)) return Err(e);
		throw e;
	}
}
function parseHeader(header) {
	return {
		majorType: header >> 5,
		headerValue: header & 31
	};
}
/**
* Read a CBOR head (major type + argument) at the cursor, advancing past it.
* `varIntLen` is the head length (1/2/3/5/9); the argument value is validated
* for canonical minimal-length encoding exactly as before.
*/
function readHeaderVarint(reader) {
	if (reader.remaining < 1) throw CborError.underrun();
	const header = reader.peek(0);
	const { majorType, headerValue } = parseHeader(header);
	const dataRemaining = reader.remaining - 1;
	let value;
	let varIntLen;
	if (headerValue <= 23) {
		value = headerValue;
		varIntLen = 1;
	} else if (headerValue === 24) {
		if (dataRemaining < 1) throw CborError.underrun();
		value = reader.peek(1);
		if (value < 24) throw CborError.nonCanonicalNumeric();
		varIntLen = 2;
	} else if (headerValue === 25) {
		if (dataRemaining < 2) throw CborError.underrun();
		value = (reader.peek(1) << 8 | reader.peek(2)) >>> 0;
		if (value <= 255 && header !== 249) throw CborError.nonCanonicalNumeric();
		varIntLen = 3;
	} else if (headerValue === 26) {
		if (dataRemaining < 4) throw CborError.underrun();
		value = (reader.peek(1) << 24 | reader.peek(2) << 16 | reader.peek(3) << 8 | reader.peek(4)) >>> 0;
		if (value <= 65535 && header !== 250) throw CborError.nonCanonicalNumeric();
		varIntLen = 5;
	} else if (headerValue === 27) {
		if (dataRemaining < 8) throw CborError.underrun();
		const a = BigInt(reader.peek(1)) << 56n;
		const b = BigInt(reader.peek(2)) << 48n;
		const c = BigInt(reader.peek(3)) << 40n;
		const d = BigInt(reader.peek(4)) << 32n;
		const e = BigInt(reader.peek(5)) << 24n;
		const f = BigInt(reader.peek(6)) << 16n;
		const g = BigInt(reader.peek(7)) << 8n;
		const h = BigInt(reader.peek(8));
		value = narrowInteger(a | b | c | d | e | f | g | h);
		if (value <= 4294967295 && header !== 251) throw CborError.nonCanonicalNumeric();
		varIntLen = 9;
	} else throw CborError.unsupportedHeaderValue(headerValue);
	reader.advance(varIntLen);
	return {
		majorType,
		value,
		varIntLen
	};
}
function readCbor(reader) {
	if (reader.remaining < 1) throw CborError.underrun();
	const headStart = reader.pos;
	const { majorType, value, varIntLen } = readHeaderVarint(reader);
	switch (majorType) {
		case MajorType.Unsigned: {
			const cbor = attachMethods({
				isCbor: true,
				type: MajorType.Unsigned,
				value
			});
			checkCanonicalEncoding(cbor, reader.bytesAt(headStart, varIntLen));
			return cbor;
		}
		case MajorType.Negative: {
			const cbor = attachMethods({
				isCbor: true,
				type: MajorType.Negative,
				value
			});
			checkCanonicalEncoding(cbor, reader.bytesAt(headStart, varIntLen));
			return cbor;
		}
		case MajorType.ByteString: {
			if (typeof value === "bigint") throw CborError.outOfRange();
			if (reader.remaining < value) throw CborError.underrun();
			const bytes = reader.bytesAt(reader.pos, value);
			reader.advance(value);
			return attachMethods({
				isCbor: true,
				type: MajorType.ByteString,
				value: bytes
			});
		}
		case MajorType.Text: {
			if (typeof value === "bigint") throw CborError.outOfRange();
			if (reader.remaining < value) throw CborError.underrun();
			const textBytes = reader.bytesAt(reader.pos, value);
			reader.advance(value);
			let text;
			try {
				text = new TextDecoder("utf-8", { fatal: true }).decode(textBytes);
			} catch (e) {
				throw CborError.invalidUtf8(e instanceof Error ? e.message : String(e));
			}
			if (text.normalize("NFC") !== text) throw CborError.nonCanonicalString();
			return attachMethods({
				isCbor: true,
				type: MajorType.Text,
				value: text
			});
		}
		case MajorType.Array: {
			const items = [];
			for (let i = 0; i < value; i++) items.push(readCbor(reader));
			return attachMethods({
				isCbor: true,
				type: MajorType.Array,
				value: items
			});
		}
		case MajorType.Map: {
			const map = new CborMap();
			for (let i = 0; i < value; i++) {
				const key = readCbor(reader);
				const val = readCbor(reader);
				map.setNext(key, val);
			}
			return attachMethods({
				isCbor: true,
				type: MajorType.Map,
				value: map
			});
		}
		case MajorType.Tagged: {
			const item = readCbor(reader);
			return attachMethods({
				isCbor: true,
				type: MajorType.Tagged,
				tag: value,
				value: item
			});
		}
		case MajorType.Simple: switch (varIntLen) {
			case 3: {
				const f = binary16ToNumber(reader.bytesAt(headStart + 1, 2));
				checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
				return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: {
						type: "Float",
						value: f
					}
				});
			}
			case 5: {
				const f = binary32ToNumber(reader.bytesAt(headStart + 1, 4));
				checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
				return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: {
						type: "Float",
						value: f
					}
				});
			}
			case 9: {
				const f = binary64ToNumber(reader.bytesAt(headStart + 1, 8));
				checkCanonicalEncoding(f, reader.bytesAt(headStart, varIntLen));
				return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: {
						type: "Float",
						value: f
					}
				});
			}
			default: switch (value) {
				case 20: return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: { type: "False" }
				});
				case 21: return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: { type: "True" }
				});
				case 22: return attachMethods({
					isCbor: true,
					type: MajorType.Simple,
					value: { type: "Null" }
				});
				default: throw CborError.invalidSimpleValue();
			}
		}
	}
}
function checkCanonicalEncoding(cbor, buf) {
	if (!areBytesEqual(buf, isCbor(cbor) ? cborData(cbor) : encodeCbor(cbor))) throw CborError.nonCanonicalNumeric();
}
//#endregion
//#region src/extract.ts
/**
* Extract native JavaScript value from CBOR.
* Converts CBOR types to their JavaScript equivalents.
*/
const extractCbor = (cbor) => {
	let c;
	if (cbor instanceof Uint8Array) c = decodeCbor(cbor);
	else c = cbor;
	switch (c.type) {
		case MajorType.Unsigned: return c.value;
		case MajorType.Negative: if (typeof c.value === "bigint") return -c.value - 1n;
		else return -c.value - 1;
		case MajorType.ByteString: return c.value;
		case MajorType.Text: return c.value;
		case MajorType.Array: return c.value.map(extractCbor);
		case MajorType.Map: return c.value;
		case MajorType.Tagged: return c;
		case MajorType.Simple:
			if (c.value.type === "True") return true;
			if (c.value.type === "False") return false;
			if (c.value.type === "Null") return null;
			if (c.value.type === "Float") return c.value.value;
			return c;
	}
};
//#endregion
//#region src/map.ts
/**
* Map Support in dCBOR
*
* A deterministic CBOR map implementation that ensures maps with the same
* content always produce identical binary encodings, regardless of insertion
* order.
*
* ## Deterministic Map Representation
*
* The `CborMap` type follows strict deterministic encoding rules as specified by
* dCBOR:
*
* - Map keys are always sorted in lexicographic order of their encoded CBOR bytes
* - Duplicate keys are not allowed (enforced by the implementation)
* - Keys and values can be any type that can be converted to CBOR
* - Numeric reduction is applied (e.g., 3.0 is stored as integer 3)
*
* This deterministic encoding ensures that equivalent maps always produce
* identical byte representations, which is crucial for applications that rely
* on consistent hashing, digital signatures, or other cryptographic operations.
*
* @module map
*/
/**
* A deterministic CBOR map implementation.
*
* Maps are always encoded with keys sorted lexicographically by their
* encoded CBOR representation, ensuring deterministic encoding.
*/
var CborMap = class CborMap {
	_dict;
	/**
	* Creates a new, empty CBOR Map.
	* Optionally initializes from a JavaScript Map.
	*/
	constructor(map) {
		this._dict = new SortedByteMap();
		if (map !== void 0) for (const [key, value] of map.entries()) this.set(key, value);
	}
	/**
	* Creates a new, empty CBOR Map.
	* Matches Rust's Map::new().
	*/
	static new() {
		return new CborMap();
	}
	/**
	* Inserts a key-value pair into the map.
	* Matches Rust's Map::insert().
	*/
	set(key, value) {
		const keyCbor = cbor(key);
		const valueCbor = cbor(value);
		const keyData = cborData(keyCbor);
		this._dict.set(keyData, {
			key: keyCbor,
			value: valueCbor
		});
	}
	/**
	* Alias for set() to match Rust's insert() method.
	*/
	insert(key, value) {
		this.set(key, value);
	}
	_makeKey(key) {
		return cborData(cbor(key));
	}
	/**
	* Get a value from the map, given a key.
	* Returns undefined if the key is not present in the map.
	* Matches Rust's Map::get().
	*/
	get(key) {
		const keyData = this._makeKey(key);
		const value = this._dict.get(keyData);
		if (value === void 0) return;
		return extractCbor(value.value);
	}
	/**
	* Get a value from the map, given a key.
	* Throws an error if the key is not present.
	* Matches Rust's Map::extract().
	*/
	extract(key) {
		const value = this.get(key);
		if (value === void 0) throw CborError.missingMapKey();
		return value;
	}
	/**
	* Tests if the map contains a key.
	* Matches Rust's Map::contains_key().
	*/
	containsKey(key) {
		const keyData = this._makeKey(key);
		return this._dict.has(keyData);
	}
	delete(key) {
		const keyData = this._makeKey(key);
		const existed = this._dict.has(keyData);
		this._dict.delete(keyData);
		return existed;
	}
	has(key) {
		const keyData = this._makeKey(key);
		return this._dict.has(keyData);
	}
	clear() {
		this._dict = new SortedByteMap();
	}
	/**
	* Returns the number of entries in the map.
	* Matches Rust's Map::len().
	*/
	get length() {
		return this._dict.size;
	}
	/**
	* Alias for length to match JavaScript Map API.
	* Also matches Rust's Map::len().
	*/
	get size() {
		return this._dict.size;
	}
	/**
	* Returns the number of entries in the map.
	* Matches Rust's Map::len().
	*/
	len() {
		return this._dict.size;
	}
	/**
	* Checks if the map is empty.
	* Matches Rust's Map::is_empty().
	*/
	isEmpty() {
		return this._dict.size === 0;
	}
	/**
	* Get the entries of the map as an array.
	* Keys are sorted in lexicographic order of their encoded CBOR bytes.
	*/
	get entriesArray() {
		return this._dict.map((value, _key) => ({
			key: value.key,
			value: value.value
		}));
	}
	/**
	* Gets an iterator over the entries of the CBOR map, sorted by key.
	* Key sorting order is lexicographic by the key's binary-encoded CBOR.
	* Matches Rust's Map::iter().
	*/
	iter() {
		return this.entriesArray;
	}
	/**
	* Returns an iterator of [key, value] tuples for JavaScript Map API compatibility.
	* This matches the standard JavaScript Map.entries() method behavior.
	*/
	*entries() {
		for (const entry of this.entriesArray) yield [entry.key, entry.value];
	}
	/**
	* Inserts the next key-value pair into the map during decoding.
	* This is used for efficient map building during CBOR decoding.
	* Throws if the key is not in ascending order or is a duplicate.
	* Matches Rust's Map::insert_next().
	*/
	setNext(key, value) {
		const keyCbor = cbor(key);
		const newKey = cborData(keyCbor);
		if (this._dict.has(newKey)) throw CborError.duplicateMapKey();
		const greatest = this._dict.maxKey();
		if (greatest !== void 0) {
			if (lexicographicallyCompareBytes(newKey, greatest) <= 0) throw CborError.misorderedMapKey();
		}
		this._dict.appendGreatest(newKey, {
			key: keyCbor,
			value: cbor(value)
		});
	}
	get debug() {
		return `map({${this.entriesArray.map(CborMap.entryDebug).join(", ")}})`;
	}
	get diagnostic() {
		return `{${this.entriesArray.map(CborMap.entryDiagnostic).join(", ")}}`;
	}
	static entryDebug(entry) {
		const keyDebug = CborMap.formatDebug(entry.key);
		const valueDebug = CborMap.formatDebug(entry.value);
		return `0x${bytesToHex(encodeCbor(entry.key))}: (${keyDebug}, ${valueDebug})`;
	}
	static formatDebug(cbor) {
		switch (cbor.type) {
			case MajorType.Unsigned: return `unsigned(${cbor.value})`;
			case MajorType.Negative: return `negative(${typeof cbor.value === "bigint" ? -cbor.value - 1n : -cbor.value - 1})`;
			case MajorType.ByteString: return `bytes(${bytesToHex(cbor.value)})`;
			case MajorType.Text: return `text("${cbor.value}")`;
			case MajorType.Array: return `array([${cbor.value.map(CborMap.formatDebug).join(", ")}])`;
			case MajorType.Map: return cbor.value.debug;
			case MajorType.Tagged: return `tagged(${cbor.tag}, ${CborMap.formatDebug(cbor.value)})`;
			case MajorType.Simple: {
				const simple = cbor.value;
				if (typeof simple === "object" && simple !== null && "type" in simple) switch (simple.type) {
					case "True": return "simple(true)";
					case "False": return "simple(false)";
					case "Null": return "simple(null)";
					case "Float": return `simple(${simple.value})`;
				}
				return "simple";
			}
			default: return diagnostic(cbor);
		}
	}
	static entryDiagnostic(entry) {
		return `${diagnostic(entry.key)}: ${diagnostic(entry.value)}`;
	}
	*[Symbol.iterator]() {
		for (const entry of this.entriesArray) yield [entry.key, entry.value];
	}
	toMap() {
		const map = /* @__PURE__ */ new Map();
		for (const entry of this.entriesArray) map.set(extractCbor(entry.key), extractCbor(entry.value));
		return map;
	}
};
//#endregion
//#region src/simple.ts
/**
* CBOR Simple Values (Major Type 7).
*
* @module simple
*/
/**
* Returns the standard name of the simple value as a string.
*
* For `False`, `True`, and `Null`, this returns their lowercase string
* representation. For `Float` values, it returns their numeric representation.
*/
const simpleName = (simple) => {
	switch (simple.type) {
		case "False": return "false";
		case "True": return "true";
		case "Null": return "null";
		case "Float": {
			const v = simple.value;
			if (Number.isNaN(v)) return "NaN";
			else if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
			else return String(v);
		}
	}
};
/**
* Checks if the simple value is a floating point number.
*/
const isFloat$1 = (simple) => simple.type === "Float";
/**
* Checks if the simple value is the NaN (Not a Number) representation.
*/
const isNaN$1 = (simple) => simple.type === "Float" && Number.isNaN(simple.value);
/**
* Encodes the simple value to its raw CBOR byte representation.
*
* Returns the CBOR bytes that represent this simple value according to the
* dCBOR deterministic encoding rules:
* - `False` encodes as `0xf4`
* - `True` encodes as `0xf5`
* - `Null` encodes as `0xf6`
* - `Float` values encode according to the IEEE 754 floating point rules,
*   using the shortest representation that preserves precision.
*/
const simpleCborData = (simple) => {
	switch (simple.type) {
		case "False": return encodeVarInt(20, MajorType.Simple);
		case "True": return encodeVarInt(21, MajorType.Simple);
		case "Null": return encodeVarInt(22, MajorType.Simple);
		case "Float": return f64CborData(simple.value);
	}
};
//#endregion
//#region src/buf-writer.ts
/**
* A growable output buffer for encoding.
*
* The encoder writes a whole CBOR tree into a single `BufWriter` rather than
* allocating a fresh `Uint8Array` per node and concatenating them (which
* re-copies every subtree at every level). This mirrors the Rust encoder's
* reused `Vec<u8>`: one buffer, geometric growth, one final right-sized copy.
*
* @module buf-writer
*/
var BufWriter = class {
	buf;
	view;
	pos = 0;
	constructor(initialCapacity = 64) {
		this.buf = new Uint8Array(initialCapacity);
		this.view = new DataView(this.buf.buffer);
	}
	/** Number of bytes written so far. */
	get length() {
		return this.pos;
	}
	/** Grow the backing store so at least `extra` more bytes fit. */
	ensure(extra) {
		const needed = this.pos + extra;
		if (needed <= this.buf.length) return;
		let capacity = this.buf.length * 2;
		while (capacity < needed) capacity *= 2;
		const next = new Uint8Array(capacity);
		next.set(this.buf.subarray(0, this.pos));
		this.buf = next;
		this.view = new DataView(next.buffer);
	}
	writeByte(byte) {
		this.ensure(1);
		this.buf[this.pos] = byte;
		this.pos += 1;
	}
	writeUint16(value) {
		this.ensure(2);
		this.view.setUint16(this.pos, value, false);
		this.pos += 2;
	}
	writeUint32(value) {
		this.ensure(4);
		this.view.setUint32(this.pos, value, false);
		this.pos += 4;
	}
	writeBigUint64(value) {
		this.ensure(8);
		this.view.setBigUint64(this.pos, value, false);
		this.pos += 8;
	}
	writeBytes(bytes) {
		this.ensure(bytes.length);
		this.buf.set(bytes, this.pos);
		this.pos += bytes.length;
	}
	/** Return the written region as a right-sized copy. */
	toBytes() {
		return this.buf.slice(0, this.pos);
	}
};
//#endregion
//#region src/walk.ts
/**
* Returns a short text label for the edge type, or undefined if no label is needed.
*
* This is primarily used for tree formatting to identify relationships between elements.
*
* @param edge - The edge type variant to get a label for
* @returns Short label string, or undefined for None edge type
*
* @example
* ```typescript
* edgeLabel({ type: EdgeType.ArrayElement, index: 0 }); // Returns "arr[0]"
* edgeLabel({ type: EdgeType.MapKeyValue }); // Returns "kv"
* edgeLabel({ type: EdgeType.MapKey }); // Returns "key"
* edgeLabel({ type: EdgeType.MapValue }); // Returns "val"
* edgeLabel({ type: EdgeType.TaggedContent }); // Returns "content"
* edgeLabel({ type: EdgeType.None }); // Returns undefined
* ```
*/
const edgeLabel = (edge) => {
	switch (edge.type) {
		case "array_element": return `arr[${edge.index}]`;
		case "map_key_value": return "kv";
		case "map_key": return "key";
		case "map_value": return "val";
		case "tagged_content": return "content";
		case "none": return;
	}
};
/**
* Helper functions for WalkElement
*/
/**
* Returns the single CBOR element if this is a 'single' variant.
*
* @param element - The walk element to extract from
* @returns The CBOR value if single, undefined otherwise
*
* @example
* ```typescript
* const element: WalkElement = { type: 'single', cbor: someCbor };
* const cbor = asSingle(element); // Returns someCbor
* ```
*/
const asSingle = (element) => {
	return element.type === "single" ? element.cbor : void 0;
};
/**
* Returns the key-value pair if this is a 'keyvalue' variant.
*
* @param element - The walk element to extract from
* @returns Tuple of [key, value] if keyvalue, undefined otherwise
*
* @example
* ```typescript
* const element: WalkElement = { type: 'keyvalue', key: keyValue, value: valValue };
* const pair = asKeyValue(element); // Returns [keyValue, valValue]
* ```
*/
const asKeyValue = (element) => {
	return element.type === "keyvalue" ? [element.key, element.value] : void 0;
};
/**
* Clone helper used to give each descendant subtree an independent copy of
* the post-visit state — mirrors Rust `State: Clone` + `state.clone()` per
* child in `walk.rs`. Falls back to the value as-is for primitives (which
* don't need cloning) and uses `structuredClone` for objects.
*/
const cloneState = (s) => {
	if (s === null) return s;
	const t = typeof s;
	if (t !== "object" && t !== "function") return s;
	return globalThis.structuredClone(s);
};
/**
* Walk a CBOR tree, visiting each element with a visitor function.
*
* The visitor function is called for each element in the tree, in depth-first order.
* State semantics mirror Rust's `walk_internal`:
*
* - The visitor's returned `newState` propagates **down** to descendants of
*   the just-visited node only.
* - Sibling subtrees each receive an independent clone of the parent's
*   post-visit state, so accumulating mutations in one subtree never leak
*   into a sibling.
* - State changes do not propagate **up**: the public `walk` returns `void`.
*
* For maps, the visitor is called with:
* 1. A 'keyvalue' element containing both key and value
* 2. The key individually (if descent wasn't stopped)
* 3. The value individually (if descent wasn't stopped)
*
* @template State - The type of state to pass into each visit
* @param cbor - The CBOR value to traverse
* @param initialState - Initial state value
* @param visitor - Function to call for each element
*/
const walk = (cbor, initialState, visitor) => {
	walkInternal(cbor, 0, { type: "none" }, initialState, visitor);
};
/**
* Internal recursive walk implementation.
*
* @internal
*/
function walkInternal(cbor, level, edge, state, visitor) {
	const [postVisitState, stop] = visitor({
		type: "single",
		cbor
	}, level, edge, state);
	if (stop) return;
	switch (cbor.type) {
		case MajorType.Array:
			walkArray(cbor, level, postVisitState, visitor);
			break;
		case MajorType.Map:
			walkMap(cbor, level, postVisitState, visitor);
			break;
		case MajorType.Tagged:
			walkTagged(cbor, level, postVisitState, visitor);
			break;
		default: break;
	}
}
/**
* Walk an array's elements. Each element is visited with an independent
* clone of `parentState`.
*
* @internal
*/
function walkArray(cbor, level, parentState, visitor) {
	for (let index = 0; index < cbor.value.length; index++) {
		const item = cbor.value[index];
		if (item === void 0) throw CborError.custom(`Array element at index ${index} is undefined`);
		walkInternal(item, level + 1, {
			type: "array_element",
			index
		}, cloneState(parentState), visitor);
	}
}
/**
* Walk a map's key-value pairs.
*
* Each kv pair receives a clone of `parentState`. If descent isn't stopped,
* the key and value subtrees receive independent clones of the kv-visit's
* post-visit state.
*
* @internal
*/
function walkMap(cbor, level, parentState, visitor) {
	for (const entry of cbor.value.entriesArray) {
		const { key, value } = entry;
		const [kvPostState, kvStop] = visitor({
			type: "keyvalue",
			key,
			value
		}, level + 1, { type: "map_key_value" }, cloneState(parentState));
		if (kvStop) continue;
		walkInternal(key, level + 1, { type: "map_key" }, cloneState(kvPostState), visitor);
		walkInternal(value, level + 1, { type: "map_value" }, cloneState(kvPostState), visitor);
	}
}
/**
* Walk a tagged value's content. The content visit receives a clone of
* `parentState`.
*
* @internal
*/
function walkTagged(cbor, level, parentState, visitor) {
	walkInternal(cbor.value, level + 1, { type: "tagged_content" }, cloneState(parentState), visitor);
}
//#endregion
//#region src/cbor.ts
const MajorTypeNames = {
	[MajorType.Unsigned]: "Unsigned",
	[MajorType.Negative]: "Negative",
	[MajorType.ByteString]: "ByteString",
	[MajorType.Text]: "Text",
	[MajorType.Array]: "Array",
	[MajorType.Map]: "Map",
	[MajorType.Tagged]: "Tagged",
	[MajorType.Simple]: "Simple"
};
const getMajorTypeName = (type) => MajorTypeNames[type];
/**
* Resolve a numeric/bigint tag value to a `Tag` object, looking up the
* canonical name from the global tags store (matches Rust's
* `try_into_tagged_value` returning the stored `Tag`). Falls back to a
* name-less `{ value }` if no name is registered — never synthesizes a
* placeholder `tag-${value}` string.
*/
const resolveTag = (value) => {
	const stored = getGlobalTagsStore().tagForValue(value);
	if (stored !== void 0) return stored;
	return { value };
};
/**
* Structural CBOR value equality.
*
* Mirrors Rust's `derive(PartialEq) for CBOR`. dCBOR encoding is
* deterministic, so two CBOR values are equal iff they encode to the
* same byte sequence — this is the simplest correct comparator.
*
* Use this rather than `===` (which compares JS object references) when
* you need value equality across two `Cbor` instances built independently.
*/
const cborEquals = (a, b) => {
	if (a === b) return true;
	const aBytes = a.toData();
	const bBytes = b.toData();
	if (aBytes.length !== bBytes.length) return false;
	for (let i = 0; i < aBytes.length; i++) if (aBytes[i] !== bBytes[i]) return false;
	return true;
};
const hasTaggedCbor = (value) => {
	return typeof value === "object" && value !== null && "taggedCbor" in value && typeof value.taggedCbor === "function";
};
/**
* Type guard to check if value has toCbor method.
*/
const hasToCbor = (value) => {
	return typeof value === "object" && value !== null && "toCbor" in value && typeof value.toCbor === "function";
};
/**
* Convert any value to a CBOR representation.
* Matches Rust's `From` trait implementations for CBOR.
*/
const cbor = (value) => {
	if (isCbor(value) && "toData" in value) return value;
	if (isCbor(value)) return attachMethods(value);
	let result;
	if (isCborNumber(value)) if (typeof value === "number" && Number.isNaN(value)) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value: NaN
		}
	};
	else if (typeof value === "number" && hasFractionalPart(value)) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value
		}
	};
	else if (value == Infinity) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value: Infinity
		}
	};
	else if (value == -Infinity) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value: -Infinity
		}
	};
	else if (typeof value === "number" && !Number.isSafeInteger(value)) {
		const big = BigInt(value);
		if (big >= 0n && big <= 18446744073709551615n) result = {
			isCbor: true,
			type: MajorType.Unsigned,
			value: big
		};
		else if (big < 0n && big >= CBOR_INT_MIN) result = {
			isCbor: true,
			type: MajorType.Negative,
			value: -big - 1n
		};
		else result = {
			isCbor: true,
			type: MajorType.Simple,
			value: {
				type: "Float",
				value
			}
		};
	} else if (typeof value === "bigint" && (value > 18446744073709551615n || value < CBOR_INT_MIN)) throw CborError.outOfRange();
	else if (value < 0) if (typeof value === "bigint") result = {
		isCbor: true,
		type: MajorType.Negative,
		value: -value - 1n
	};
	else result = {
		isCbor: true,
		type: MajorType.Negative,
		value: -value - 1
	};
	else result = {
		isCbor: true,
		type: MajorType.Unsigned,
		value
	};
	else if (typeof value === "string") {
		const normalized = value.normalize("NFC");
		result = {
			isCbor: true,
			type: MajorType.Text,
			value: normalized
		};
	} else if (value === null || value === void 0) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "Null" }
	};
	else if (value === true) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "True" }
	};
	else if (value === false) result = {
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "False" }
	};
	else if (Array.isArray(value)) result = {
		isCbor: true,
		type: MajorType.Array,
		value: value.map(cbor)
	};
	else if (value instanceof Uint8Array) result = {
		isCbor: true,
		type: MajorType.ByteString,
		value
	};
	else if (value instanceof CborMap) result = {
		isCbor: true,
		type: MajorType.Map,
		value
	};
	else if (value instanceof Map) result = {
		isCbor: true,
		type: MajorType.Map,
		value: new CborMap(value)
	};
	else if (value instanceof Set) result = {
		isCbor: true,
		type: MajorType.Array,
		value: Array.from(value).map((v) => cbor(v))
	};
	else if (hasTaggedCbor(value)) return value.taggedCbor();
	else if (hasToCbor(value)) return value.toCbor();
	else if (typeof value === "object" && value !== null && "tag" in value && "value" in value) {
		const keys = Object.keys(value);
		const objValue = value;
		if (keys.length === 2 && keys.includes("tag") && keys.includes("value")) return taggedCbor(objValue.tag, objValue.value);
		const map = new CborMap();
		for (const [key, val] of Object.entries(value)) map.set(cbor(key), cbor(val));
		result = {
			isCbor: true,
			type: MajorType.Map,
			value: map
		};
	} else if (typeof value === "object" && value !== null) {
		const map = new CborMap();
		for (const [key, val] of Object.entries(value)) map.set(cbor(key), cbor(val));
		result = {
			isCbor: true,
			type: MajorType.Map,
			value: map
		};
	} else throw CborError.custom("Unsupported type for CBOR encoding");
	return attachMethods(result);
};
const textEncoder = new TextEncoder();
/**
* Write a CBOR value into `writer`. The whole tree encodes into one growable
* buffer, so nested containers no longer allocate-and-concatenate a fresh array
* per level. Byte output is identical to the previous per-node encoder.
*/
const writeCborInto = (writer, value) => {
	const c = cbor(value);
	switch (c.type) {
		case MajorType.Unsigned:
			writeVarInt(writer, c.value, MajorType.Unsigned);
			return;
		case MajorType.Negative:
			writeVarInt(writer, c.value, MajorType.Negative);
			return;
		case MajorType.ByteString:
			if (c.value instanceof Uint8Array) {
				writeVarInt(writer, c.value.length, MajorType.ByteString);
				writer.writeBytes(c.value);
				return;
			}
			break;
		case MajorType.Text:
			if (typeof c.value === "string") {
				const utf8Bytes = textEncoder.encode(c.value);
				writeVarInt(writer, utf8Bytes.length, MajorType.Text);
				writer.writeBytes(utf8Bytes);
				return;
			}
			break;
		case MajorType.Tagged:
			if (typeof c.tag === "bigint" || typeof c.tag === "number") {
				writeVarInt(writer, c.tag, MajorType.Tagged);
				writeCborInto(writer, c.value);
				return;
			}
			break;
		case MajorType.Simple:
			writer.writeBytes(simpleCborData(c.value));
			return;
		case MajorType.Array:
			writeVarInt(writer, c.value.length, MajorType.Array);
			for (const item of c.value) writeCborInto(writer, item);
			return;
		case MajorType.Map: {
			const entries = c.value.entriesArray;
			writeVarInt(writer, entries.length, MajorType.Map);
			for (const { key, value: entryValue } of entries) {
				writeCborInto(writer, key);
				writeCborInto(writer, entryValue);
			}
			return;
		}
	}
	throw CborError.wrongType();
};
/**
* Encode a CBOR value to binary data.
* Matches Rust's `CBOR::to_cbor_data()` method.
*/
const cborData = (value) => {
	const c = cbor(value);
	switch (c.type) {
		case MajorType.Unsigned: return encodeVarInt(c.value, MajorType.Unsigned);
		case MajorType.Negative: return encodeVarInt(c.value, MajorType.Negative);
		case MajorType.Simple: return simpleCborData(c.value);
		default: {
			const writer = new BufWriter();
			writeCborInto(writer, c);
			return writer.toBytes();
		}
	}
};
const encodeCbor = (value) => {
	return cborData(cbor(value));
};
const taggedCbor = (tag, value) => {
	const tagNumber = typeof tag === "number" || typeof tag === "bigint" ? tag : Number(tag);
	return attachMethods({
		isCbor: true,
		type: MajorType.Tagged,
		tag: tagNumber,
		value: cbor(value)
	});
};
const toByteString = (data) => {
	return cbor(data);
};
const toByteStringFromHex = (hex) => {
	return toByteString(hexToBytes(hex));
};
const toTaggedValue = (tag, item) => {
	const tagValue = typeof tag === "object" && "value" in tag ? tag.value : tag;
	return attachMethods({
		isCbor: true,
		type: MajorType.Tagged,
		tag: tagValue,
		value: cbor(item)
	});
};
const cborFalse = () => {
	return attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "False" }
	});
};
const cborTrue = () => {
	return attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "True" }
	});
};
const cborNull = () => {
	return attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "Null" }
	});
};
const cborNaN = () => {
	return attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value: NaN
		}
	});
};
/**
* Attaches instance methods to a CBOR value.
* This enables method chaining like cbor.toHex() instead of Cbor.toHex(cbor).
* @internal
*/
const CBOR_METHODS = {
	toData() {
		return cborData(this);
	},
	toHex() {
		return bytesToHex(cborData(this));
	},
	toHexAnnotated(tagsStore) {
		tagsStore = tagsStore ?? getGlobalTagsStore();
		return hexOpt(this, {
			annotate: true,
			tagsStore
		});
	},
	toString() {
		return diagnosticOpt(this, { flat: true });
	},
	toDebugString() {
		return diagnosticOpt(this, { flat: false });
	},
	toDiagnostic() {
		return diagnosticOpt(this, { flat: false });
	},
	toDiagnosticAnnotated() {
		return diagnosticOpt(this, { annotate: true });
	},
	isByteString() {
		return this.type === MajorType.ByteString;
	},
	isText() {
		return this.type === MajorType.Text;
	},
	isArray() {
		return this.type === MajorType.Array;
	},
	isMap() {
		return this.type === MajorType.Map;
	},
	isTagged() {
		return this.type === MajorType.Tagged;
	},
	isSimple() {
		return this.type === MajorType.Simple;
	},
	isBool() {
		return this.type === MajorType.Simple && (this.value.type === "True" || this.value.type === "False");
	},
	isTrue() {
		return this.type === MajorType.Simple && this.value.type === "True";
	},
	isFalse() {
		return this.type === MajorType.Simple && this.value.type === "False";
	},
	isNull() {
		return this.type === MajorType.Simple && this.value.type === "Null";
	},
	isNumber() {
		if (this.type === MajorType.Unsigned || this.type === MajorType.Negative) return true;
		if (this.type === MajorType.Simple) return isFloat$1(this.value);
		return false;
	},
	isInteger() {
		return this.type === MajorType.Unsigned || this.type === MajorType.Negative;
	},
	isUnsigned() {
		return this.type === MajorType.Unsigned;
	},
	isNegative() {
		return this.type === MajorType.Negative;
	},
	isNaN() {
		return this.type === MajorType.Simple && this.value.type === "Float" && Number.isNaN(this.value.value);
	},
	isFloat() {
		return this.type === MajorType.Simple && isFloat$1(this.value);
	},
	asByteString() {
		return this.type === MajorType.ByteString ? this.value : void 0;
	},
	asText() {
		return this.type === MajorType.Text ? this.value : void 0;
	},
	asArray() {
		return this.type === MajorType.Array ? this.value : void 0;
	},
	asMap() {
		return this.type === MajorType.Map ? this.value : void 0;
	},
	asTagged() {
		if (this.type !== MajorType.Tagged) return;
		return [resolveTag(this.tag), this.value];
	},
	asBool() {
		if (this.type !== MajorType.Simple) return void 0;
		if (this.value.type === "True") return true;
		if (this.value.type === "False") return false;
	},
	asInteger() {
		if (this.type === MajorType.Unsigned) return this.value;
		else if (this.type === MajorType.Negative) if (typeof this.value === "bigint") return -this.value - 1n;
		else return -this.value - 1;
	},
	asNumber() {
		if (this.type === MajorType.Unsigned) return this.value;
		else if (this.type === MajorType.Negative) if (typeof this.value === "bigint") return -this.value - 1n;
		else return -this.value - 1;
		else if (this.type === MajorType.Simple && isFloat$1(this.value)) return this.value.value;
	},
	asSimpleValue() {
		return this.type === MajorType.Simple ? this.value : void 0;
	},
	toByteString() {
		if (this.type !== MajorType.ByteString) throw new TypeError(`Cannot convert CBOR to ByteString: expected ByteString type, got ${getMajorTypeName(this.type)}`);
		return this.value;
	},
	toText() {
		if (this.type !== MajorType.Text) throw new TypeError(`Cannot convert CBOR to Text: expected Text type, got ${getMajorTypeName(this.type)}`);
		return this.value;
	},
	toArray() {
		if (this.type !== MajorType.Array) throw new TypeError(`Cannot convert CBOR to Array: expected Array type, got ${getMajorTypeName(this.type)}`);
		return this.value;
	},
	toMap() {
		if (this.type !== MajorType.Map) throw new TypeError(`Cannot convert CBOR to Map: expected Map type, got ${getMajorTypeName(this.type)}`);
		return this.value;
	},
	toTagged() {
		if (this.type !== MajorType.Tagged) throw new TypeError(`Cannot convert CBOR to Tagged: expected Tagged type, got ${getMajorTypeName(this.type)}`);
		return [resolveTag(this.tag), this.value];
	},
	toBool() {
		const result = this.asBool();
		if (result === void 0) throw new TypeError(`Cannot convert CBOR to boolean: expected Simple(True/False) type, got ${getMajorTypeName(this.type)}`);
		return result;
	},
	toInteger() {
		const result = this.asInteger();
		if (result === void 0) throw new TypeError(`Cannot convert CBOR to integer: expected Unsigned or Negative type, got ${getMajorTypeName(this.type)}`);
		return result;
	},
	toNumber() {
		const result = this.asNumber();
		if (result === void 0) throw new TypeError(`Cannot convert CBOR to number: expected Unsigned, Negative, or Float type, got ${getMajorTypeName(this.type)}`);
		return result;
	},
	toSimpleValue() {
		if (this.type !== MajorType.Simple) throw new TypeError(`Cannot convert CBOR to Simple: expected Simple type, got ${getMajorTypeName(this.type)}`);
		return this.value;
	},
	expectTag(expectedTag) {
		if (this.type !== MajorType.Tagged) throw CborError.wrongType();
		const expected = typeof expectedTag === "object" && "value" in expectedTag ? expectedTag : { value: expectedTag };
		if (!tagValuesEqual(this.tag, expected.value)) throw CborError.wrongTag(expected, { value: this.tag });
		return this.value;
	},
	walk(initialState, visitor) {
		walk(this, initialState, visitor);
	},
	validateTag(expectedTags) {
		if (this.type !== MajorType.Tagged) throw CborError.wrongType();
		const tagValue = this.tag;
		const matchingTag = expectedTags.find((t) => tagValuesEqual(t.value, tagValue));
		if (matchingTag === void 0) throw CborError.wrongTag(expectedTags[0], { value: tagValue });
		return matchingTag;
	},
	untagged() {
		if (this.type !== MajorType.Tagged) throw CborError.wrongType();
		return this.value;
	}
};
/**
* Decorate a bare CBOR value (`{ isCbor, type, value[, tag] }`) with the shared
* instance methods. The methods live on {@link CBOR_METHODS} and are installed
* via the prototype — constructed with `Object.create` (not `setPrototypeOf`,
* which would drop the object off V8's fast path). Only the handful of data
* properties are own-properties; the ~45 methods are shared, not per-object.
*/
const attachMethods = (obj) => {
	const decorated = Object.create(CBOR_METHODS);
	return Object.assign(decorated, obj);
};
/**
* CBOR constants and helper methods.
*
* Provides constants for common simple values (False, True, Null) and static methods
* matching the Rust CBOR API for encoding/decoding.
*/
const Cbor = {
	False: attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "False" }
	}),
	True: attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "True" }
	}),
	Null: attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: { type: "Null" }
	}),
	NaN: attachMethods({
		isCbor: true,
		type: MajorType.Simple,
		value: {
			type: "Float",
			value: NaN
		}
	}),
	/**
	* Creates a CBOR value from any JavaScript value.
	*
	* Matches Rust's `CBOR::from()` behavior for various types.
	*
	* @param value - Any JavaScript value (number, string, boolean, null, array, object, etc.)
	* @returns A CBOR symbolic representation with instance methods
	*/
	from(value) {
		return cbor(value);
	},
	/**
	* Decodes binary data into CBOR symbolic representation.
	*
	* Matches Rust's `CBOR::try_from_data()` method.
	*
	* @param data - The binary data to decode
	* @returns A CBOR value with instance methods
	* @throws Error if the data is not valid CBOR or violates dCBOR encoding rules
	*/
	tryFromData(data) {
		return decodeCbor(data);
	},
	/**
	* Decodes a hexadecimal string into CBOR symbolic representation.
	*
	* Matches Rust's `CBOR::try_from_hex()` method.
	*
	* @param hex - A string containing hexadecimal characters
	* @returns A CBOR value with instance methods
	* @throws Error if the hex string is invalid or the resulting data is not valid dCBOR
	*/
	tryFromHex(hex) {
		const data = hexToBytes(hex);
		return this.tryFromData(data);
	}
};
//#endregion
//#region src/set.ts
/**
* CBOR Set type, encoded as a plain (untagged) array.
*
* Internally uses a CborMap to ensure unique elements with deterministic ordering.
* Elements are ordered by their CBOR encoding (lexicographic byte order).
*
* @example
* ```typescript
* // Create set
* const set = CborSet.fromArray([1, 2, 3]);
* const set2 = CborSet.fromSet(new Set([1, 2, 3]));
*
* // Add elements
* set.insert(4);
* set.insert(2); // Duplicate, no effect
*
* // Check membership
* console.log(set.contains(2)); // true
* console.log(set.contains(99)); // false
*
* // Encode to CBOR (untagged array)
* const c = set.toCbor();
* ```
*/
var CborSet = class CborSet {
	_map;
	constructor() {
		this._map = new CborMap();
	}
	/**
	* Create CborSet from array.
	*
	* Duplicates are automatically removed.
	*
	* @param items - Array of items to add to the set
	* @returns New CborSet instance
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([1, 2, 3, 2, 1]);
	* console.log(set.size); // 3
	* ```
	*/
	static fromArray(items) {
		const set = new CborSet();
		for (const item of items) set.insert(item);
		return set;
	}
	/**
	* Create CborSet from JavaScript Set.
	*
	* @param items - JavaScript Set of items
	* @returns New CborSet instance
	*
	* @example
	* ```typescript
	* const jsSet = new Set([1, 2, 3]);
	* const cborSet = CborSet.fromSet(jsSet);
	* ```
	*/
	static fromSet(items) {
		return CborSet.fromArray(Array.from(items));
	}
	/**
	* Create CborSet from iterable.
	*
	* @param items - Iterable of items
	* @returns New CborSet instance
	*/
	static fromIterable(items) {
		return CborSet.fromArray(Array.from(items));
	}
	/**
	* Insert an element into the set.
	*
	* If the element already exists, has no effect.
	*
	* @param value - Value to insert
	*
	* @example
	* ```typescript
	* const set = new CborSet();
	* set.insert(1);
	* set.insert(2);
	* set.insert(1); // No effect, already exists
	* ```
	*/
	insert(value) {
		const cborValue = encodeCborValue(value);
		this._map.set(cborValue, cborValue);
	}
	/**
	* Insert an element that must sort strictly after every element inserted so
	* far (canonical CBOR-byte order). The decoder uses this to reject
	* misordered or duplicate elements.
	*
	* Mirrors Rust `Set::insert_next` (`pub(crate)`); exposed here because
	* TypeScript has no crate-private visibility.
	*
	* @throws CborError of type `MisorderedMap` if `value` would not preserve
	*   strict ascending CBOR-byte order, or `DuplicateMapKey` for an exact
	*   repeat.
	*/
	insertNext(value) {
		const cborValue = encodeCborValue(value);
		this._map.setNext(cborValue, cborValue);
	}
	/**
	* Check if set contains an element.
	*
	* @param value - Value to check
	* @returns true if element is in the set
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([1, 2, 3]);
	* console.log(set.contains(2)); // true
	* console.log(set.contains(99)); // false
	* ```
	*/
	contains(value) {
		const cborValue = encodeCborValue(value);
		return this._map.has(cborValue);
	}
	/**
	* Remove an element from the set.
	*
	* @param value - Value to remove
	* @returns true if element was removed, false if not found
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([1, 2, 3]);
	* set.delete(2); // Returns true
	* set.delete(99); // Returns false
	* ```
	*/
	delete(value) {
		const cborValue = encodeCborValue(value);
		return this._map.delete(cborValue);
	}
	/**
	* Remove all elements from the set.
	*/
	clear() {
		this._map.clear();
	}
	/**
	* Get the number of elements in the set.
	*
	* @returns Number of elements
	*/
	get size() {
		return this._map.size;
	}
	/**
	* Check if the set is empty.
	*
	* @returns true if set has no elements
	*/
	isEmpty() {
		return this._map.size === 0;
	}
	/**
	* Create a new set containing elements in this set or the other set.
	*
	* @param other - Other set
	* @returns New set with union of elements
	*
	* @example
	* ```typescript
	* const set1 = CborSet.fromArray([1, 2, 3]);
	* const set2 = CborSet.fromArray([3, 4, 5]);
	* const union = set1.union(set2);
	* // union contains [1, 2, 3, 4, 5]
	* ```
	*/
	union(other) {
		const result = new CborSet();
		for (const value of this) result.insert(extractCbor(value));
		for (const value of other) result.insert(extractCbor(value));
		return result;
	}
	/**
	* Create a new set containing elements in both this set and the other set.
	*
	* @param other - Other set
	* @returns New set with intersection of elements
	*
	* @example
	* ```typescript
	* const set1 = CborSet.fromArray([1, 2, 3]);
	* const set2 = CborSet.fromArray([2, 3, 4]);
	* const intersection = set1.intersection(set2);
	* // intersection contains [2, 3]
	* ```
	*/
	intersection(other) {
		const result = new CborSet();
		for (const value of this) {
			const extracted = extractCbor(value);
			if (other.contains(extracted)) result.insert(extracted);
		}
		return result;
	}
	/**
	* Create a new set containing elements in this set but not in the other set.
	*
	* @param other - Other set
	* @returns New set with difference of elements
	*
	* @example
	* ```typescript
	* const set1 = CborSet.fromArray([1, 2, 3]);
	* const set2 = CborSet.fromArray([2, 3, 4]);
	* const diff = set1.difference(set2);
	* // diff contains [1]
	* ```
	*/
	difference(other) {
		const result = new CborSet();
		for (const value of this) {
			const extracted = extractCbor(value);
			if (!other.contains(extracted)) result.insert(extracted);
		}
		return result;
	}
	/**
	* Check if this set is a subset of another set.
	*
	* @param other - Other set
	* @returns true if all elements of this set are in the other set
	*/
	isSubsetOf(other) {
		for (const value of this) if (!other.contains(extractCbor(value))) return false;
		return true;
	}
	/**
	* Check if this set is a superset of another set.
	*
	* @param other - Other set
	* @returns true if all elements of the other set are in this set
	*/
	isSupersetOf(other) {
		return other.isSubsetOf(this);
	}
	/**
	* Iterate over elements in the set.
	*
	* Elements are returned in deterministic order (by CBOR encoding).
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([3, 1, 2]);
	* for (const value of set) {
	*   console.log(extractCbor(value));
	* }
	* ```
	*/
	*[Symbol.iterator]() {
		for (const [_, value] of this._map) yield value;
	}
	/**
	* Get all values as an array.
	*
	* @returns Array of CBOR values in deterministic order
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([3, 1, 2]);
	* const values = set.values();
	* // Values in deterministic order
	* ```
	*/
	values() {
		return Array.from(this);
	}
	/**
	* Execute a function for each element.
	*
	* @param callback - Function to call for each element
	*
	* @example
	* ```typescript
	* set.forEach(value => {
	*   console.log(extractCbor(value));
	* });
	* ```
	*/
	forEach(callback) {
		for (const value of this) callback(value);
	}
	/**
	* Encode the set as an (untagged) CBOR array of its elements, in canonical
	* ascending CBOR-byte order. Matches Rust `From<Set> for CBOR`.
	*
	* @returns CBOR array
	*/
	untaggedCbor() {
		return cbor(this.values());
	}
	/**
	* Decode a CborSet from a CBOR array into this instance.
	*
	* Mirrors Rust `Set::try_from_vec`, calling `insert_next` per item, so the
	* array must already be in strict ascending CBOR-byte order with no
	* duplicates (else `MisorderedMapKey`/`DuplicateMapKey`).
	*
	* @param c - CBOR array value
	* @returns this
	* @throws CborError of type `WrongType` if `c` is not an array.
	*/
	fromUntaggedCbor(c) {
		if (c.type !== MajorType.Array) throw CborError.wrongType();
		this.clear();
		for (const value of c.value) this.insertNext(extractCbor(value));
		return this;
	}
	/**
	* Decode a CborSet from a CBOR array.
	*
	* @param c - CBOR array value
	* @returns Decoded CborSet instance
	*/
	static fromCbor(c) {
		return new CborSet().fromUntaggedCbor(c);
	}
	/**
	* Convert to CBOR array (untagged).
	*
	* @returns CBOR array
	*/
	toCbor() {
		return this.untaggedCbor();
	}
	/**
	* Convert to encoded CBOR bytes.
	*
	* @returns Encoded CBOR bytes
	*/
	toBytes() {
		return cborData(this.untaggedCbor());
	}
	/**
	* Convert to JavaScript Set.
	*
	* @returns JavaScript Set with extracted values
	*
	* @example
	* ```typescript
	* const cborSet = CborSet.fromArray([1, 2, 3]);
	* const jsSet = cborSet.toSet();
	* console.log(jsSet.has(1)); // true
	* ```
	*/
	toSet() {
		const result = /* @__PURE__ */ new Set();
		for (const value of this) result.add(extractCbor(value));
		return result;
	}
	/**
	* Convert to JavaScript Array.
	*
	* @returns Array with extracted values
	*/
	toArray() {
		return Array.from(this.toSet());
	}
	/**
	* Get diagnostic notation for the set.
	*
	* @returns String representation
	*
	* @example
	* ```typescript
	* const set = CborSet.fromArray([1, 2, 3]);
	* console.log(set.diagnostic); // "[1, 2, 3]"
	* ```
	*/
	get diagnostic() {
		return `[${this.values().map((v) => {
			const extracted = extractCbor(v);
			if (typeof extracted === "string") return `"${extracted}"`;
			return String(extracted);
		}).join(", ")}]`;
	}
	/**
	* Convert to string (same as diagnostic).
	*
	* @returns String representation
	*/
	toString() {
		return this.diagnostic;
	}
	/**
	* Convert to JSON (returns array of values).
	*
	* @returns Array for JSON serialization
	*/
	toJSON() {
		return this.toArray();
	}
};
/**
* Convert a value to CBOR for use in set operations.
*
* @internal
*/
function encodeCborValue(value) {
	if (typeof value === "object" && value !== null && "isCbor" in value && value.isCbor === true) return value;
	return cbor(value);
}
//#endregion
//#region src/codable.ts
/**
* CBOR "codable" interfaces and tagged-value helpers (REFACTOR_PLAN Phase 4).
*
* Consolidates the former cbor-codable / cbor-tagged-encodable /
* cbor-tagged-decodable / cbor-tagged-codable modules. `CborEncodable` /
* `CborDecodable` / `CborCodable` describe plain codable types; the `Tagged`
* variants add a required tag, with helpers to build/validate tagged values.
*
* @module codable
*/
/**
* Helper function to create tagged CBOR from an encodable object.
*
* Uses the first tag from cborTags().
*
* @param encodable - Object implementing CborTaggedEncodable
* @returns Tagged CBOR value
*/
const createTaggedCbor = (encodable) => {
	const tags = encodable.cborTags();
	if (tags.length === 0) throw CborError.custom("No tags defined for this type");
	const tag = tags[0];
	if (tag === void 0) throw CborError.custom("Tag is undefined");
	const untagged = encodable.untaggedCbor();
	return attachMethods({
		isCbor: true,
		type: MajorType.Tagged,
		tag: tag.value,
		value: untagged
	});
};
/**
* Default `taggedCborData()` implementation — `taggedCbor().toData()`.
*
* Mirrors Rust's default `tagged_cbor_data()` impl on
* `CBORTaggedEncodable`. TypeScript interfaces don't carry method bodies,
* so this helper plays the role of the Rust trait default; concrete types
* call it from their own `taggedCborData()` if they don't need to override.
*/
const taggedCborData = (encodable) => encodable.taggedCbor().toData();
/**
* Helper function to validate that a CBOR value has one of the expected tags.
*
* @param cbor - CBOR value to validate
* @param expectedTags - Array of valid tags
* @returns The matching tag
* @throws Error if the value is not tagged or has an unexpected tag
*/
const validateTag = (cbor, expectedTags) => {
	if (cbor.type !== MajorType.Tagged) throw CborError.wrongType();
	const tagValue = cbor.tag;
	const matchingTag = expectedTags.find((t) => tagValuesEqual(t.value, tagValue));
	if (matchingTag === void 0) throw CborError.wrongTag(expectedTags[0], { value: tagValue });
	return matchingTag;
};
/**
* Helper function to extract the content from a tagged CBOR value.
*
* @param cbor - Tagged CBOR value
* @returns The untagged content
* @throws Error if the value is not tagged
*/
const extractTaggedContent = (cbor) => {
	if (cbor.type !== MajorType.Tagged) throw CborError.wrongType();
	return cbor.value;
};
/**
* Default `fromTaggedCborData()` implementation — `decodeCbor(data)` then
* delegate to the decodable's `fromTaggedCbor()`.
*
* Mirrors Rust's default `from_tagged_cbor_data` impl on
* `CBORTaggedDecodable`.
*/
function fromTaggedCborData(decodable, data) {
	return decodable.fromTaggedCbor(decodeCbor(data));
}
/**
* Default `fromUntaggedCborData()` implementation — `decodeCbor(data)`
* then delegate to the decodable's `fromUntaggedCbor()`.
*
* Mirrors Rust's default `from_untagged_cbor_data` impl on
* `CBORTaggedDecodable`.
*/
function fromUntaggedCborData(decodable, data) {
	return decodable.fromUntaggedCbor(decodeCbor(data));
}
//#endregion
//#region src/date.ts
/**
* Normalize a timestamp (seconds since the Unix epoch) to whole seconds plus a
* non-negative, sub-second nanosecond part, matching Rust's
* `Date::from_timestamp` so dates round-trip byte-identically with the reference.
*
* The nanosecond part is computed like Rust's `as u32` cast: truncated toward
* zero and clamped to [0, u32::MAX]. So a negative fraction floors the value
* (`-1.5` becomes `-1.0`) and sub-nanosecond precision is dropped
* (`1.0000000005` becomes `1.0`).
*
* @internal
*/
function normalizeTimestampSeconds(seconds) {
	if (!Number.isFinite(seconds)) throw CborError.invalidDate("non-finite timestamp");
	const whole = Math.trunc(seconds);
	let nsecs = Math.trunc((seconds - whole) * 1e9);
	if (nsecs < 0) nsecs = 0;
	else if (nsecs > 4294967295) nsecs = 4294967295;
	return whole + nsecs / 1e9;
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
* - Implements the `CborTagged`, `CborTaggedEncodable`, and
*   `CborTaggedDecodable` interfaces
* - Supports arithmetic operations with durations and between dates
*
* @example
* ```typescript
* import { CborDate } from './date';
*
* // Create a date from a timestamp (seconds since Unix epoch)
* const date = CborDate.fromTimestamp(1675854714.0);
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
var CborDate = class CborDate {
	/**
	* Canonical timestamp in seconds since the Unix epoch as a JS `number`
	* (`f64`). dCBOR encodes Date (tag 1) as a numeric value in seconds, so
	* keeping `_seconds` as the source of truth avoids the millisecond-only
	* round-trip precision loss that going through a JS `Date` instance
	* introduced in earlier versions of this port.
	*
	* f64 still bounds the achievable precision (~16 decimal digits, so
	* roughly microseconds for current epoch values); Rust's
	* `chrono::DateTime<Utc>` retains nanoseconds in memory but encodes
	* to the same f64 over the wire, so the *encode/decode round-trip* is
	* byte-identical.
	*/
	_seconds;
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
	* const date = CborDate.fromDatetime(datetime);
	* ```
	*/
	static fromDatetime(dateTime) {
		const instance = new CborDate();
		instance._seconds = dateTime.getTime() / 1e3;
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
	static fromYmd(year, month, day) {
		const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
		return CborDate.fromDatetime(dt);
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
	static fromYmdHms(year, month, day, hour, minute, second) {
		const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
		return CborDate.fromDatetime(dt);
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
	* const date = CborDate.fromTimestamp(1675854714.0);
	*
	* // Create a date one second before the Unix epoch
	* const beforeEpoch = CborDate.fromTimestamp(-1.0);
	*
	* // Create a date with fractional seconds
	* const withFraction = CborDate.fromTimestamp(1675854714.5);
	* ```
	*/
	static fromTimestamp(secondsSinceUnixEpoch) {
		const instance = new CborDate();
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
	static fromString(value) {
		const invalidDate = CborError.invalidDate("Invalid date string");
		const rfc3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
		const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
		let parsed;
		if (rfc3339.test(value)) parsed = new Date(value);
		else if (dateOnly.test(value)) parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
		else throw invalidDate;
		const [y, m, d] = value.slice(0, 10).split("-").map(Number);
		const probe = new Date(Date.UTC(y, m - 1, d));
		if (!(probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d) || isNaN(parsed.getTime())) throw invalidDate;
		return CborDate.fromDatetime(parsed);
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
	static now() {
		return CborDate.fromDatetime(/* @__PURE__ */ new Date());
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
	static withDurationFromNow(durationMs) {
		const future = new Date((/* @__PURE__ */ new Date()).getTime() + durationMs);
		return CborDate.fromDatetime(future);
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
	* const datetime = date.datetime();
	* const year = datetime.getFullYear();
	* ```
	*/
	datetime() {
		return /* @__PURE__ */ new Date(this._seconds * 1e3);
	}
	/**
	* Returns the `CborDate` as the number of seconds since the Unix epoch.
	*
	* This method converts the date to a floating-point number representing
	* the number of seconds since the Unix epoch (1970-01-01T00:00:00Z).
	* Negative values represent times before the epoch. The fractional
	* part represents sub-second precision.
	*
	* @returns Seconds since the Unix epoch as a `number`
	*
	* @example
	* ```typescript
	* const date = CborDate.fromYmd(2023, 2, 8);
	* const timestamp = date.timestamp();
	* ```
	*/
	timestamp() {
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
	add(seconds) {
		return CborDate.fromTimestamp(this.timestamp() + seconds);
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
	subtract(seconds) {
		return CborDate.fromTimestamp(this.timestamp() - seconds);
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
	difference(other) {
		return this.timestamp() - other.timestamp();
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
	cborTags() {
		return [createTag(1, "date")];
	}
	/**
	* Implementation of the `CborTaggedEncodable` interface for `CborDate`.
	*
	* Converts this `CborDate` to an untagged CBOR value.
	*
	* The date is converted to a numeric value representing the number of
	* seconds since the Unix epoch. This value may be an integer or a
	* floating-point number, depending on whether the date has fractional
	* seconds.
	*
	* @returns A CBOR value representing the timestamp
	*/
	untaggedCbor() {
		return cbor(this.timestamp());
	}
	/**
	* Converts this `CborDate` to a tagged CBOR value with tag 1.
	*
	* @returns Tagged CBOR value
	*/
	taggedCbor() {
		return createTaggedCbor(this);
	}
	/**
	* Implementation of the `CborTaggedDecodable` interface for `CborDate`.
	*
	* Creates a `CborDate` from an untagged CBOR value.
	*
	* The CBOR value must be a numeric value (integer or floating-point)
	* representing the number of seconds since the Unix epoch.
	*
	* @param cbor - The untagged CBOR value
	*
	* @returns This CborDate instance (mutated)
	*
	* @throws Error if the CBOR value is not a valid timestamp
	*/
	fromUntaggedCbor(cbor) {
		let timestamp;
		switch (cbor.type) {
			case MajorType.Unsigned:
				timestamp = typeof cbor.value === "number" ? cbor.value : Number(cbor.value);
				break;
			case MajorType.Negative:
				if (typeof cbor.value === "bigint") timestamp = Number(-cbor.value - 1n);
				else timestamp = -cbor.value - 1;
				break;
			case MajorType.Simple:
				if (cbor.value.type === "Float") timestamp = cbor.value.value;
				else throw CborError.wrongType();
				break;
			default: throw CborError.wrongType();
		}
		this._seconds = normalizeTimestampSeconds(timestamp);
		return this;
	}
	/**
	* Creates a `CborDate` from a tagged CBOR value with tag 1.
	*
	* @param cbor - Tagged CBOR value
	*
	* @returns This CborDate instance (mutated)
	*
	* @throws Error if the CBOR value has the wrong tag or cannot be decoded
	*/
	fromTaggedCbor(cbor) {
		validateTag(cbor, this.cborTags());
		const content = extractTaggedContent(cbor);
		return this.fromUntaggedCbor(content);
	}
	/**
	* Static method to create a CborDate from tagged CBOR.
	*
	* @param cbor - Tagged CBOR value
	* @returns New CborDate instance
	*/
	static fromTaggedCbor(cbor) {
		return new CborDate().fromTaggedCbor(cbor);
	}
	/**
	* Static method to create a CborDate from untagged CBOR.
	*
	* @param cbor - Untagged CBOR value
	* @returns New CborDate instance
	*/
	static fromUntaggedCbor(cbor) {
		return new CborDate().fromUntaggedCbor(cbor);
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
	toString() {
		const dt = /* @__PURE__ */ new Date(this._seconds * 1e3);
		if (!(dt.getUTCHours() !== 0 || dt.getUTCMinutes() !== 0 || dt.getUTCSeconds() !== 0)) {
			const datePart = dt.toISOString().split("T")[0];
			if (datePart === void 0) throw CborError.custom("Invalid ISO string format");
			return datePart;
		} else return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
	}
	/**
	* Compare two dates for equality.
	*
	* @param other - Other CborDate to compare
	* @returns true if dates represent the same moment in time
	*/
	equals(other) {
		return this._seconds === other._seconds;
	}
	/**
	* Compare two dates.
	*
	* @param other - Other CborDate to compare
	* @returns -1 if this < other, 0 if equal, 1 if this > other
	*/
	compare(other) {
		if (this._seconds < other._seconds) return -1;
		if (this._seconds > other._seconds) return 1;
		return 0;
	}
	/**
	* Convert to JSON (returns ISO 8601 string).
	*
	* @returns ISO 8601 string
	*/
	toJSON() {
		return this.toString();
	}
	constructor() {
		this._seconds = Date.now() / 1e3;
	}
};
//#endregion
//#region src/bignum.ts
/**
* CBOR bignum (tags 2 and 3) support.
*
* This module provides conversion between CBOR and JavaScript BigInt types,
* implementing RFC 8949 §3.4.3 (Bignums) with dCBOR/CDE canonical encoding rules.
*
* Encoding:
* - `biguintToCbor` always encodes as tag 2 (positive bignum) with a byte
*   string content.
* - `bigintToCbor` encodes as tag 2 for non-negative values or tag 3
*   (negative bignum) for negative values.
* - No numeric reduction is performed: values are always encoded as bignums,
*   even if they would fit in normal CBOR integers.
*
* Decoding:
* - Accepts CBOR integers (major types 0 and 1) and converts them to bigints.
* - Accepts tag 2 (positive bignum) and tag 3 (negative bignum) with byte
*   string content.
* - Enforces shortest-form canonical representation for bignum magnitudes.
* - Rejects floating-point values.
*
* @module bignum
*/
const TAG_2_POSITIVE_BIGNUM = 2;
const TAG_3_NEGATIVE_BIGNUM = 3;
/**
* Validates that a bignum magnitude byte string is in shortest canonical form.
*
* Matches Rust's `validate_bignum_magnitude()`.
*
* Rules:
* - For positive bignums (tag 2): empty byte string represents zero;
*   non-empty must not have leading zero bytes.
* - For negative bignums (tag 3): byte string must not be empty
*   (magnitude zero is encoded as `0x00`); must not have leading zero bytes
*   except when the magnitude is zero (single `0x00`).
*
* @param bytes - The magnitude byte string to validate
* @param isNegative - Whether this is for a negative bignum (tag 3)
* @throws CborError with type NonCanonicalNumeric on validation failure
*/
function validateBignumMagnitude(bytes, isNegative) {
	if (isNegative) {
		if (bytes.length === 0) throw CborError.nonCanonicalNumeric();
		if (bytes.length > 1 && bytes[0] === 0) throw CborError.nonCanonicalNumeric();
	} else if (bytes.length > 0 && bytes[0] === 0) throw CborError.nonCanonicalNumeric();
}
/**
* Strips leading zero bytes from a byte array, returning the minimal
* representation.
*
* Matches Rust's `strip_leading_zeros()`.
*
* @param bytes - The byte array to strip
* @returns A subarray with leading zeros removed
*/
function stripLeadingZeros(bytes) {
	let start = 0;
	while (start < bytes.length && bytes[start] === 0) start++;
	return bytes.subarray(start);
}
/**
* Convert a non-negative bigint to a big-endian byte array.
*
* Zero returns an empty Uint8Array.
*
* @param value - A non-negative bigint value
* @returns Big-endian byte representation
*/
function bigintToBytes(value) {
	if (value === 0n) return /* @__PURE__ */ new Uint8Array(0);
	const hex = value.toString(16);
	const padded = hex.length % 2 !== 0 ? `0${hex}` : hex;
	const bytes = new Uint8Array(padded.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
	return bytes;
}
/**
* Convert a big-endian byte array to a bigint.
*
* Empty array returns 0n.
*
* @param bytes - Big-endian byte representation
* @returns The bigint value
*/
function bytesToBigint(bytes) {
	if (bytes.length === 0) return 0n;
	let result = 0n;
	for (const byte of bytes) result = result << 8n | BigInt(byte);
	return result;
}
/**
* Encode a non-negative bigint as a CBOR tag 2 (positive bignum).
*
* Matches Rust's `From<BigUint> for CBOR`.
*
* The value is always encoded as a bignum regardless of size.
* Zero is encoded as tag 2 with an empty byte string.
*
* @param value - A non-negative bigint (must be >= 0n)
* @returns CBOR tagged value
* @throws CborError with type OutOfRange if value is negative
*/
function biguintToCbor(value) {
	if (value < 0n) throw CborError.outOfRange();
	return toTaggedValue(TAG_2_POSITIVE_BIGNUM, stripLeadingZeros(bigintToBytes(value)));
}
/**
* Encode a bigint as a CBOR tag 2 or tag 3 bignum.
*
* Matches Rust's `From<BigInt> for CBOR`.
*
* - Non-negative values use tag 2 (positive bignum).
* - Negative values use tag 3 (negative bignum), where the encoded
*   magnitude is `|value| - 1` per RFC 8949.
*
* @param value - Any bigint value
* @returns CBOR tagged value
*/
function bigintToCbor(value) {
	if (value >= 0n) return biguintToCbor(value);
	const stripped = stripLeadingZeros(bigintToBytes(-value - 1n));
	return toTaggedValue(TAG_3_NEGATIVE_BIGNUM, stripped.length === 0 ? new Uint8Array([0]) : stripped);
}
/**
* Decode a BigUint from an untagged CBOR byte string.
*
* Matches Rust's `biguint_from_untagged_cbor()`.
*
* This function is intended for use in tag summarizers where the tag has
* already been stripped. It expects a CBOR byte string representing the
* big-endian magnitude of a positive bignum (tag 2 content).
*
* Enforces canonical encoding: no leading zero bytes (except empty for zero).
*
* @param cbor - A CBOR value that should be a byte string
* @returns Non-negative bigint
* @throws CborError with type WrongType if not a byte string
* @throws CborError with type NonCanonicalNumeric if encoding is non-canonical
*/
function biguintFromUntaggedCbor(cbor) {
	if (cbor.type !== MajorType.ByteString) throw CborError.wrongType();
	const bytes = cbor.value;
	validateBignumMagnitude(bytes, false);
	return bytesToBigint(bytes);
}
/**
* Decode a BigInt from an untagged CBOR byte string for a negative bignum.
*
* Matches Rust's `bigint_from_negative_untagged_cbor()`.
*
* This function is intended for use in tag summarizers where the tag has
* already been stripped. It expects a CBOR byte string representing `n` where
* the actual value is `-1 - n` (tag 3 content per RFC 8949).
*
* Enforces canonical encoding: no leading zero bytes (except single `0x00`
* for -1).
*
* @param cbor - A CBOR value that should be a byte string
* @returns Negative bigint
* @throws CborError with type WrongType if not a byte string
* @throws CborError with type NonCanonicalNumeric if encoding is non-canonical
*/
function bigintFromNegativeUntaggedCbor(cbor) {
	if (cbor.type !== MajorType.ByteString) throw CborError.wrongType();
	const bytes = cbor.value;
	validateBignumMagnitude(bytes, true);
	return -(bytesToBigint(bytes) + 1n);
}
/**
* Convert CBOR to a non-negative bigint.
*
* Matches Rust's `TryFrom<CBOR> for BigUint`.
*
* Accepts:
* - Major type 0 (unsigned integer)
* - Tag 2 (positive bignum) with canonical byte string
*
* Rejects:
* - Major type 1 (negative integer) -> OutOfRange
* - Tag 3 (negative bignum) -> OutOfRange
* - Floating-point values -> WrongType
* - Non-canonical bignum encodings -> NonCanonicalNumeric
*
* @param cbor - The CBOR value to convert
* @returns Non-negative bigint
* @throws CborError
*/
function cborToBiguint(cbor) {
	switch (cbor.type) {
		case MajorType.Unsigned: return BigInt(cbor.value);
		case MajorType.Negative: throw CborError.outOfRange();
		case MajorType.Tagged:
			if (tagEquals(cbor.tag, TAG_2_POSITIVE_BIGNUM)) {
				const inner = cbor.value;
				if (inner.type !== MajorType.ByteString) throw CborError.wrongType();
				const bytes = inner.value;
				validateBignumMagnitude(bytes, false);
				return bytesToBigint(bytes);
			} else if (tagEquals(cbor.tag, TAG_3_NEGATIVE_BIGNUM)) throw CborError.outOfRange();
			throw CborError.wrongType();
		case MajorType.ByteString:
		case MajorType.Text:
		case MajorType.Array:
		case MajorType.Map:
		case MajorType.Simple: throw CborError.wrongType();
	}
}
/**
* Compare a CBOR tag value (which may be `number` or `bigint`) against a
* small numeric literal. Avoids the `Number(tag) === literal` precision
* loss for huge bigint tags.
*/
function tagEquals(tag, literal) {
	return typeof tag === "bigint" ? tag === BigInt(literal) : tag === literal;
}
/**
* Convert CBOR to a bigint (any sign).
*
* Matches Rust's `TryFrom<CBOR> for BigInt`.
*
* Accepts:
* - Major type 0 (unsigned integer)
* - Major type 1 (negative integer)
* - Tag 2 (positive bignum) with canonical byte string
* - Tag 3 (negative bignum) with canonical byte string
*
* Rejects:
* - Floating-point values -> WrongType
* - Non-canonical bignum encodings -> NonCanonicalNumeric
*
* @param cbor - The CBOR value to convert
* @returns A bigint value
* @throws CborError
*/
function cborToBigint(cbor) {
	switch (cbor.type) {
		case MajorType.Unsigned: return BigInt(cbor.value);
		case MajorType.Negative: return -(BigInt(cbor.value) + 1n);
		case MajorType.Tagged:
			if (tagEquals(cbor.tag, TAG_2_POSITIVE_BIGNUM)) {
				const inner = cbor.value;
				if (inner.type !== MajorType.ByteString) throw CborError.wrongType();
				const bytes = inner.value;
				validateBignumMagnitude(bytes, false);
				const mag = bytesToBigint(bytes);
				if (mag === 0n) return 0n;
				return mag;
			} else if (tagEquals(cbor.tag, TAG_3_NEGATIVE_BIGNUM)) {
				const inner = cbor.value;
				if (inner.type !== MajorType.ByteString) throw CborError.wrongType();
				const bytes = inner.value;
				validateBignumMagnitude(bytes, true);
				return -(bytesToBigint(bytes) + 1n);
			}
			throw CborError.wrongType();
		case MajorType.ByteString:
		case MajorType.Text:
		case MajorType.Array:
		case MajorType.Map:
		case MajorType.Simple: throw CborError.wrongType();
	}
}
//#endregion
//#region src/tags.ts
/**
* Standard CBOR tag definitions from the IANA registry.
*
* **Cross-package note (parity with Rust).** `bc-dcbor-rust/src/tags.rs`
* intentionally only defines the three tags dcbor itself needs:
* `TAG_DATE` (1), `TAG_POSITIVE_BIGNUM` (2), `TAG_NEGATIVE_BIGNUM` (3).
* Every other Blockchain Commons tag — UR types, IANA semantic tags, the
* Envelope/XID family — lives in the dedicated `bc-tags-rust` crate
* (mirrored as `@bcts/tags` in TypeScript). This file additionally
* re-exports many of those constants for ergonomic in-package use; they
* are duplicate convenience definitions, not authoritative. Prefer
* importing from `@bcts/tags` in new code; treat the extras here as
* deprecated aliases that may be relocated in a future release.
*
* @module tags
* @see https://www.iana.org/assignments/cbor-tags/cbor-tags.xhtml
*/
/**
* Tag 0: Standard date/time string (RFC 3339)
*/
const TAG_DATE_TIME_STRING = 0;
/**
* Tag 1: Epoch-based date/time (seconds since 1970-01-01T00:00:00Z)
*/
const TAG_EPOCH_DATE_TIME = 1;
/**
* Tag 100: Epoch-based date (days since 1970-01-01)
*/
const TAG_EPOCH_DATE = 100;
/**
* Tag 2: Positive bignum (unsigned arbitrary-precision integer)
*/
const TAG_POSITIVE_BIGNUM = 2;
/**
* Tag 3: Negative bignum (signed arbitrary-precision integer)
*/
const TAG_NEGATIVE_BIGNUM = 3;
/**
* Name for tag 2 (positive bignum).
* Matches Rust's `TAG_NAME_POSITIVE_BIGNUM`.
*/
const TAG_NAME_POSITIVE_BIGNUM = "positive-bignum";
/**
* Name for tag 3 (negative bignum).
* Matches Rust's `TAG_NAME_NEGATIVE_BIGNUM`.
*/
const TAG_NAME_NEGATIVE_BIGNUM = "negative-bignum";
/**
* Tag 4: Decimal fraction [exponent, mantissa]
*/
const TAG_DECIMAL_FRACTION = 4;
/**
* Tag 5: Bigfloat [exponent, mantissa]
*/
const TAG_BIGFLOAT = 5;
/**
* Tag 21: Expected conversion to base64url encoding
*/
const TAG_BASE64URL = 21;
/**
* Tag 22: Expected conversion to base64 encoding
*/
const TAG_BASE64 = 22;
/**
* Tag 23: Expected conversion to base16 encoding
*/
const TAG_BASE16 = 23;
/**
* Tag 24: Encoded CBOR data item
*/
const TAG_ENCODED_CBOR = 24;
/**
* Tag 32: URI (text string)
*/
const TAG_URI = 32;
/**
* Tag 33: base64url-encoded text
*/
const TAG_BASE64URL_TEXT = 33;
/**
* Tag 34: base64-encoded text
*/
const TAG_BASE64_TEXT = 34;
/**
* Tag 35: Regular expression (PCRE/ECMA262)
*/
const TAG_REGEXP = 35;
/**
* Tag 36: MIME message
*/
const TAG_MIME_MESSAGE = 36;
/**
* Tag 37: Binary UUID
*/
const TAG_UUID = 37;
/**
* Tag 256: string reference (namespace)
*/
const TAG_STRING_REF_NAMESPACE = 256;
/**
* Tag 257: binary UUID reference
*/
const TAG_BINARY_UUID = 257;
/**
* Tag 258: Set of values (array with no duplicates)
*/
const TAG_SET = 258;
/**
* Tag 55799: Self-describe CBOR (magic number 0xd9d9f7)
*/
const TAG_SELF_DESCRIBE_CBOR = 55799;
const TAG_DATE = 1;
const TAG_NAME_DATE = "date";
/**
* Register standard tags in a specific tags store.
* Matches Rust's register_tags_in() function.
*
* @param tagsStore - The tags store to register tags into
*/
const registerTagsIn = (tagsStore) => {
	const tags = [createTag(1, TAG_NAME_DATE)];
	tagsStore.insertAll(tags);
	tagsStore.setSummarizer(1, (untaggedCbor, _flat) => {
		try {
			return {
				ok: true,
				value: CborDate.fromUntaggedCbor(untaggedCbor).toString()
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				error: CborError.custom(message)
			};
		}
	});
	const biguintTag = createTag(2, TAG_NAME_POSITIVE_BIGNUM);
	const bigintTag = createTag(3, TAG_NAME_NEGATIVE_BIGNUM);
	tagsStore.insertAll([biguintTag, bigintTag]);
	tagsStore.setSummarizer(2, (untaggedCbor, _flat) => {
		try {
			return {
				ok: true,
				value: `bignum(${biguintFromUntaggedCbor(untaggedCbor)})`
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				error: CborError.custom(message)
			};
		}
	});
	tagsStore.setSummarizer(3, (untaggedCbor, _flat) => {
		try {
			return {
				ok: true,
				value: `bignum(${bigintFromNegativeUntaggedCbor(untaggedCbor)})`
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				error: CborError.custom(message)
			};
		}
	});
};
/**
* Register standard tags in the global tags store.
* Matches Rust's register_tags() function.
*
* This function is idempotent - calling it multiple times is safe.
*/
const registerTags = () => {
	registerTagsIn(getGlobalTagsStore());
};
/**
* Converts an array of tag values to their corresponding Tag objects.
* Matches Rust's tags_for_values() function.
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
* registerTags();
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
const tagsForValues = (values) => {
	const globalStore = getGlobalTagsStore();
	return values.map((value) => {
		const tag = globalStore.tagForValue(value);
		if (tag !== void 0) return tag;
		return createTag(value);
	});
};
//#endregion
//#region src/sortable.ts
/**
* CBOR-encoding-based array sorting helpers.
*
* Ported from `bc-dcbor-rust/src/array.rs` (`sort_array_by_cbor_encoding` +
* `CBORSortable<T>` trait). dCBOR / CDE deterministic ordering is bytewise
* lexicographic over the CBOR encoding of each element — this is the same
* comparator that `Map`/`Set` use internally for key ordering.
*
* @module sortable
*/
/**
* Return a new array sorted by the bytewise lexicographic order of each
* element's CBOR encoding.
*
* Mirrors Rust `pub fn sort_array_by_cbor_encoding<T>(array)`.
*
* @example
* ```typescript
* const sorted = sortArrayByCborEncoding([3, 1, 2]); // [1, 2, 3]
* ```
*/
function sortArrayByCborEncoding(array) {
	const annotated = array.map((item) => ({
		encoding: cbor(item).toData(),
		item
	}));
	annotated.sort((a, b) => lexicographicallyCompareBytes(a.encoding, b.encoding));
	return annotated.map((entry) => entry.item);
}
/**
* Wrap a readonly array as a {@link CBORSortable}. Equivalent to Rust's
* blanket `impl CBORSortable<T> for Vec<T>` / `for &[T]`.
*/
function arraySortable(array) {
	return { sortByCborEncoding: () => sortArrayByCborEncoding(array) };
}
/**
* Wrap a `Set<T>` as a {@link CBORSortable}. Equivalent to Rust's
* `impl CBORSortable<T> for HashSet<T>`.
*/
function setSortable(set) {
	return { sortByCborEncoding: () => sortArrayByCborEncoding(Array.from(set)) };
}
//#endregion
//#region src/byte-string.ts
/**
* Byte string utilities for dCBOR.
*
* Represents a CBOR byte string (major type 2).
*
* `ByteString` is a wrapper around a byte array, optimized for use in CBOR
* encoding and decoding operations. It provides a richer API for working with
* byte data in the context of CBOR compared to using raw `Uint8Array` values.
*
* In dCBOR, byte strings follow the general deterministic encoding rules:
* - They must use definite-length encoding
* - Their length must be encoded in the shortest possible form
*
* @module byte-string
*/
/**
* Represents a CBOR byte string (major type 2).
*
* Use Cases:
* - Binary data such as images, audio, or other non-text content
* - Cryptographic values like hashes, signatures, and public keys
* - Embedded CBOR (wrapped with tag 24)
* - Other serialized data formats embedded in CBOR
*
* @example
* ```typescript
* // Creating a byte string from various sources
* const bytes1 = new ByteString(new Uint8Array([1, 2, 3, 4]));
* const bytes2 = ByteString.from([5, 6, 7, 8]);
* const bytes3 = ByteString.from(new Uint8Array([9, 10, 11, 12]));
*
* // Converting to and from CBOR
* const cborValue = bytes1.toCbor();
*
* // ByteString provides Uint8Array-like operations
* const bytes = new ByteString(new Uint8Array([1, 2]));
* bytes.extend(new Uint8Array([3, 4]));
* assert(bytes.len() === 4);
* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4]));
* ```
*/
var ByteString = class ByteString {
	_data;
	/**
	* Creates a new `ByteString` from a Uint8Array or array of bytes.
	*
	* @param data - The byte data
	*
	* @example
	* ```typescript
	* // From a Uint8Array
	* const bytes1 = new ByteString(new Uint8Array([1, 2, 3, 4]));
	*
	* // From a number array
	* const bytes2 = new ByteString(new Uint8Array([5, 6, 7, 8]));
	* ```
	*/
	constructor(data) {
		if (Array.isArray(data)) this._data = new Uint8Array(data);
		else this._data = new Uint8Array(data);
	}
	/**
	* Creates a new `ByteString` from various input types.
	*
	* @param data - Uint8Array, number array, or string
	* @returns New ByteString instance
	*
	* @example
	* ```typescript
	* const bytes1 = ByteString.from([1, 2, 3, 4]);
	* const bytes2 = ByteString.from(new Uint8Array([5, 6, 7, 8]));
	* const bytes3 = ByteString.from("hello");
	* ```
	*/
	static from(data) {
		if (typeof data === "string") return new ByteString(new TextEncoder().encode(data));
		return new ByteString(data);
	}
	/**
	* Returns a reference to the underlying byte data.
	*
	* @returns The raw bytes
	*
	* @example
	* ```typescript
	* const bytes = new ByteString(new Uint8Array([1, 2, 3, 4]));
	* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4]));
	*
	* // You can use standard slice operations on the result
	* assert.deepEqual(bytes.data().slice(1, 3), new Uint8Array([2, 3]));
	* ```
	*/
	data() {
		return this._data;
	}
	/**
	* Returns the length of the byte string in bytes.
	*
	* @returns Number of bytes
	*
	* @example
	* ```typescript
	* const empty = new ByteString(new Uint8Array([]));
	* assert(empty.len() === 0);
	*
	* const bytes = new ByteString(new Uint8Array([1, 2, 3, 4]));
	* assert(bytes.len() === 4);
	* ```
	*/
	len() {
		return this._data.length;
	}
	/**
	* Returns `true` if the byte string contains no bytes.
	*
	* @returns true if empty
	*
	* @example
	* ```typescript
	* const empty = new ByteString(new Uint8Array([]));
	* assert(empty.isEmpty());
	*
	* const bytes = new ByteString(new Uint8Array([1, 2, 3, 4]));
	* assert(!bytes.isEmpty());
	* ```
	*/
	isEmpty() {
		return this._data.length === 0;
	}
	/**
	* Extends the byte string with additional bytes.
	*
	* @param other - Bytes to append
	*
	* @example
	* ```typescript
	* const bytes = new ByteString(new Uint8Array([1, 2]));
	* bytes.extend(new Uint8Array([3, 4]));
	* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4]));
	*
	* // You can extend with different types
	* bytes.extend([5, 6]);
	* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4, 5, 6]));
	* ```
	*/
	extend(other) {
		const otherArray = Array.isArray(other) ? new Uint8Array(other) : other;
		const newData = new Uint8Array(this._data.length + otherArray.length);
		newData.set(this._data, 0);
		newData.set(otherArray, this._data.length);
		this._data = newData;
	}
	/**
	* Creates a new Uint8Array containing a copy of the byte string's data.
	*
	* @returns Copy of the data
	*
	* @example
	* ```typescript
	* const bytes = new ByteString(new Uint8Array([1, 2, 3, 4]));
	* const arr = bytes.toUint8Array();
	* assert.deepEqual(arr, new Uint8Array([1, 2, 3, 4]));
	*
	* // The returned array is a clone, so you can modify it independently
	* const arr2 = bytes.toUint8Array();
	* arr2[0] = 99;
	* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4])); // original unchanged
	* ```
	*/
	toUint8Array() {
		return new Uint8Array(this._data);
	}
	/**
	* Returns an iterator over the bytes in the byte string.
	*
	* @returns Iterator yielding each byte
	*
	* @example
	* ```typescript
	* const bytes = new ByteString(new Uint8Array([1, 2, 3]));
	* const iter = bytes.iter();
	*
	* assert(iter.next().value === 1);
	* assert(iter.next().value === 2);
	* assert(iter.next().value === 3);
	* assert(iter.next().done);
	*
	* // You can also use for loops
	* let sum = 0;
	* for (const byte of bytes) {
	*   sum += byte;
	* }
	* assert(sum === 6);
	* ```
	*/
	iter() {
		return this._data.values();
	}
	/**
	* Makes ByteString iterable.
	*/
	[Symbol.iterator]() {
		return this.iter();
	}
	/**
	* Converts the ByteString to a CBOR value.
	*
	* @returns CBOR byte string
	*
	* @example
	* ```typescript
	* const bytes = new ByteString(new Uint8Array([1, 2, 3, 4]));
	* const cborValue = bytes.toCbor();
	* ```
	*/
	toCbor() {
		return cbor(this._data);
	}
	/**
	* Attempts to convert a CBOR value into a ByteString.
	*
	* @param cbor - CBOR value
	* @returns ByteString if successful
	* @throws Error if the CBOR value is not a byte string
	*
	* @example
	* ```typescript
	* const cborValue = toCbor(new Uint8Array([1, 2, 3, 4]));
	* const bytes = ByteString.fromCbor(cborValue);
	* assert.deepEqual(bytes.data(), new Uint8Array([1, 2, 3, 4]));
	*
	* // Converting from a different CBOR type throws
	* const cborInt = toCbor(42);
	* try {
	*   ByteString.fromCbor(cborInt); // throws
	* } catch(e) {
	*   // Error: Wrong type
	* }
	* ```
	*/
	static fromCbor(cbor) {
		if (cbor.type !== MajorType.ByteString) throw CborError.wrongType();
		return new ByteString(cbor.value);
	}
	/**
	* Get element at index.
	*
	* @param index - Index to access
	* @returns Byte at index or undefined
	*/
	at(index) {
		return this._data[index];
	}
	/**
	* Equality comparison.
	*
	* @param other - ByteString to compare with
	* @returns true if equal
	*/
	equals(other) {
		if (this._data.length !== other._data.length) return false;
		for (let i = 0; i < this._data.length; i++) if (this._data[i] !== other._data[i]) return false;
		return true;
	}
	/**
	* Clone this ByteString.
	*
	* @returns New ByteString with copied data
	*/
	clone() {
		return new ByteString(this.toUint8Array());
	}
};
//#endregion
//#region src/conveniences-guards.ts
/**
* Check if CBOR value is an unsigned integer.
*
* @param cbor - CBOR value to check
* @returns True if value is unsigned integer
*
* @example
* ```typescript
* if (isUnsigned(value)) {
*   console.log('Unsigned:', value.value);
* }
* ```
*/
const isUnsigned = (cbor) => {
	return cbor.type === MajorType.Unsigned;
};
/**
* Check if CBOR value is a negative integer.
*
* @param cbor - CBOR value to check
* @returns True if value is negative integer
*/
const isNegative = (cbor) => {
	return cbor.type === MajorType.Negative;
};
/**
* Check if CBOR value is any integer (unsigned or negative).
*
* @param cbor - CBOR value to check
* @returns True if value is an integer
*/
const isInteger = (cbor) => {
	return cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative;
};
/**
* Check if CBOR value is a byte string.
*
* @param cbor - CBOR value to check
* @returns True if value is byte string
*/
const isBytes = (cbor) => {
	return cbor.type === MajorType.ByteString;
};
/**
* Check if CBOR value is a text string.
*
* @param cbor - CBOR value to check
* @returns True if value is text string
*/
const isText = (cbor) => {
	return cbor.type === MajorType.Text;
};
/**
* Check if CBOR value is an array.
*
* @param cbor - CBOR value to check
* @returns True if value is array
*/
const isArray = (cbor) => {
	return cbor.type === MajorType.Array;
};
/**
* Check if CBOR value is a map.
*
* @param cbor - CBOR value to check
* @returns True if value is map
*/
const isMap = (cbor) => {
	return cbor.type === MajorType.Map;
};
/**
* Check if CBOR value is tagged.
*
* @param cbor - CBOR value to check
* @returns True if value is tagged
*/
const isTagged = (cbor) => {
	return cbor.type === MajorType.Tagged;
};
/**
* Check if CBOR value is a simple value.
*
* @param cbor - CBOR value to check
* @returns True if value is simple
*/
const isSimple = (cbor) => {
	return cbor.type === MajorType.Simple;
};
/**
* Check if CBOR value is a boolean (true or false).
*
* @param cbor - CBOR value to check
* @returns True if value is boolean
*/
const isBoolean = (cbor) => {
	if (cbor.type !== MajorType.Simple) return false;
	return cbor.value.type === "False" || cbor.value.type === "True";
};
/**
* Check if CBOR value is null.
*
* @param cbor - CBOR value to check
* @returns True if value is null
*/
const isNull = (cbor) => {
	if (cbor.type !== MajorType.Simple) return false;
	return cbor.value.type === "Null";
};
/**
* Check if CBOR value is a float (f16, f32, or f64).
*
* @param cbor - CBOR value to check
* @returns True if value is float
*/
const isFloat = (cbor) => {
	if (cbor.type !== MajorType.Simple) return false;
	return isFloat$1(cbor.value);
};
/**
* Check if CBOR value is any numeric type (unsigned, negative, or float).
*
* @param cbor - CBOR value
* @returns True if value is numeric
*/
const isNumber = (cbor) => {
	if (cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative) return true;
	if (cbor.type === MajorType.Simple) return isFloat$1(cbor.value);
	return false;
};
//#endregion
//#region src/conveniences-accessors.ts
/**
* Extract unsigned integer value if type matches.
*
* @param cbor - CBOR value
* @returns Unsigned integer or undefined
*/
const asUnsigned = (cbor) => {
	if (cbor.type === MajorType.Unsigned) return cbor.value;
};
/**
* Extract negative integer value if type matches.
*
* @param cbor - CBOR value
* @returns Negative integer or undefined
*/
const asNegative = (cbor) => {
	if (cbor.type === MajorType.Negative) if (typeof cbor.value === "bigint") return -cbor.value - 1n;
	else return -cbor.value - 1;
};
/**
* Extract any integer value (unsigned or negative) if type matches.
*
* @param cbor - CBOR value
* @returns Integer or undefined
*/
const asInteger = (cbor) => {
	if (cbor.type === MajorType.Unsigned) return cbor.value;
	else if (cbor.type === MajorType.Negative) if (typeof cbor.value === "bigint") return -cbor.value - 1n;
	else return -cbor.value - 1;
};
/**
* Extract byte string value if type matches.
*
* @param cbor - CBOR value
* @returns Byte string or undefined
*/
const asBytes = (cbor) => {
	if (cbor.type === MajorType.ByteString) return cbor.value;
};
/**
* Extract text string value if type matches.
*
* @param cbor - CBOR value
* @returns Text string or undefined
*/
const asText = (cbor) => {
	if (cbor.type === MajorType.Text) return cbor.value;
};
/**
* Extract array value if type matches.
*
* @param cbor - CBOR value
* @returns Array or undefined
*/
const asArray = (cbor) => {
	if (cbor.type === MajorType.Array) return cbor.value;
};
/**
* Extract map value if type matches.
*
* @param cbor - CBOR value
* @returns Map or undefined
*/
const asMap = (cbor) => {
	if (cbor.type === MajorType.Map) return cbor.value;
};
/**
* Extract boolean value if type matches.
*
* @param cbor - CBOR value
* @returns Boolean or undefined
*/
const asBoolean = (cbor) => {
	if (cbor.type !== MajorType.Simple) return;
	if (cbor.value.type === "True") return true;
	if (cbor.value.type === "False") return false;
};
/**
* Extract float value if type matches.
*
* @param cbor - CBOR value
* @returns Float or undefined
*/
const asFloat = (cbor) => {
	if (cbor.type === MajorType.Unsigned) return ExactF64.exactFromU64(cbor.value);
	if (cbor.type === MajorType.Negative) {
		const f = ExactF64.exactFromU64(cbor.value);
		return f === void 0 ? void 0 : -1 - f;
	}
	if (cbor.type === MajorType.Simple) return isFloat$1(cbor.value) ? cbor.value.value : void 0;
};
/**
* Extract any numeric value (integer or float).
*
* @param cbor - CBOR value
* @returns Number or undefined
*/
const asNumber = (cbor) => {
	if (cbor.type === MajorType.Unsigned) return cbor.value;
	if (cbor.type === MajorType.Negative) if (typeof cbor.value === "bigint") return -cbor.value - 1n;
	else return -cbor.value - 1;
	if (cbor.type === MajorType.Simple) {
		const simple = cbor.value;
		if (isFloat$1(simple)) return simple.value;
	}
};
/**
* Get array item at index.
*
* @param cbor - CBOR value (must be array)
* @param index - Array index
* @returns Item at index or undefined
*/
const arrayItem = (cbor, index) => {
	if (cbor.type !== MajorType.Array) return;
	const array = cbor.value;
	if (index < 0 || index >= array.length) return;
	return array[index];
};
/**
* Get array length.
*
* @param cbor - CBOR value (must be array)
* @returns Array length or undefined
*/
const arrayLength = (cbor) => {
	if (cbor.type !== MajorType.Array) return;
	return cbor.value.length;
};
/**
* Check if array is empty.
*
* @param cbor - CBOR value (must be array)
* @returns True if empty, false if not empty, undefined if not array
*/
const arrayIsEmpty = (cbor) => {
	if (cbor.type !== MajorType.Array) return;
	return cbor.value.length === 0;
};
/**
* Get map value by key.
*
* @param cbor - CBOR value (must be map)
* @param key - Map key
* @returns Value for key or undefined
*/
function mapValue(cbor, key) {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.get(key);
}
/**
* Check if map has key.
*
* @param cbor - CBOR value (must be map)
* @param key - Map key
* @returns True if key exists, false otherwise, undefined if not map
*/
function mapHas(cbor, key) {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.has(key);
}
/**
* Get all map keys.
*
* @param cbor - CBOR value (must be map)
* @returns Array of keys or undefined
*/
const mapKeys = (cbor) => {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.entriesArray.map((e) => e.key);
};
/**
* Get all map values.
*
* @param cbor - CBOR value (must be map)
* @returns Array of values or undefined
*/
const mapValues = (cbor) => {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.entriesArray.map((e) => e.value);
};
/**
* Get map size.
*
* @param cbor - CBOR value (must be map)
* @returns Map size or undefined
*/
const mapSize = (cbor) => {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.size;
};
/**
* Check if map is empty.
*
* @param cbor - CBOR value (must be map)
* @returns True if empty, false if not empty, undefined if not map
*/
const mapIsEmpty = (cbor) => {
	if (cbor.type !== MajorType.Map) return;
	return cbor.value.size === 0;
};
/**
* Get tag value from tagged CBOR.
*
* @param cbor - CBOR value (must be tagged)
* @returns Tag value or undefined
*/
const tagValue = (cbor) => {
	if (cbor.type !== MajorType.Tagged) return;
	return cbor.tag;
};
/**
* Get content from tagged CBOR.
*
* @param cbor - CBOR value (must be tagged)
* @returns Tagged content or undefined
*/
const tagContent = (cbor) => {
	if (cbor.type !== MajorType.Tagged) return;
	return cbor.value;
};
/**
* Check if CBOR has a specific tag.
*
* @param cbor - CBOR value
* @param tag - Tag value to check
* @returns True if has tag, false otherwise
*/
const hasTag = (cbor, tag) => {
	if (cbor.type !== MajorType.Tagged) return false;
	return tagValuesEqual(cbor.tag, tag);
};
/**
* Extract content if has specific tag.
*
* @param cbor - CBOR value
* @param tag - Expected tag value
* @returns Tagged content or undefined
*/
const getTaggedContent = (cbor, tag) => {
	if (cbor.type === MajorType.Tagged && tagValuesEqual(cbor.tag, tag)) return cbor.value;
};
/**
* Extract tagged value as tuple [Tag, Cbor] if CBOR is tagged.
* This is used by envelope for decoding.
*
* @param cbor - CBOR value
* @returns [Tag, Cbor] tuple or undefined
*/
const asTaggedValue = (cbor) => {
	if (cbor.type !== MajorType.Tagged) return;
	return [getGlobalTagsStore().tagForValue(cbor.tag) ?? { value: cbor.tag }, cbor.value];
};
/**
* Alias for asBytes - extract byte string value if type matches.
* Named asByteString for envelope compatibility.
*
* @param cbor - CBOR value
* @returns Byte string or undefined
*/
const asByteString = asBytes;
/**
* Extract array value with get() method for envelope compatibility.
*
* @param cbor - CBOR value
* @returns Array wrapper with get() method or undefined
*/
const asCborArray = (cbor) => {
	if (cbor.type !== MajorType.Array) return;
	const arr = cbor.value;
	return {
		length: arr.length,
		get(index) {
			return arr[index];
		},
		[Symbol.iterator]() {
			return arr[Symbol.iterator]();
		}
	};
};
/**
* Alias for asMap - extract map value if type matches.
* Named asCborMap for envelope compatibility.
*
* @param cbor - CBOR value
* @returns Map or undefined
*/
const asCborMap = asMap;
//#endregion
//#region src/conveniences-expect.ts
/**
* Extract unsigned integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Unsigned integer
* @throws {CborError} With type 'WrongType' if cbor is not an unsigned integer
*/
const expectUnsigned = (cbor) => {
	const value = asUnsigned(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract negative integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Negative integer
* @throws {CborError} With type 'WrongType' if cbor is not a negative integer
*/
const expectNegative = (cbor) => {
	const value = asNegative(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract any integer value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Integer
* @throws {CborError} With type 'WrongType' if cbor is not an integer
*/
const expectInteger = (cbor) => {
	const value = asInteger(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract byte string value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Byte string
* @throws {CborError} With type 'WrongType' if cbor is not a byte string
*/
const expectBytes = (cbor) => {
	const value = asBytes(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract text string value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Text string
* @throws {CborError} With type 'WrongType' if cbor is not a text string
*/
const expectText = (cbor) => {
	const value = asText(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract array value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Array
* @throws {CborError} With type 'WrongType' if cbor is not an array
*/
const expectArray = (cbor) => {
	const value = asArray(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract map value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Map
* @throws {CborError} With type 'WrongType' if cbor is not a map
*/
const expectMap = (cbor) => {
	const value = asMap(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract boolean value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Boolean
* @throws {CborError} With type 'WrongType' if cbor is not a boolean
*/
const expectBoolean = (cbor) => {
	const value = asBoolean(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract float value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Float
* @throws {CborError} With type 'WrongType' if cbor is not a float
*/
const expectFloat = (cbor) => {
	if (cbor.type === MajorType.Unsigned || cbor.type === MajorType.Negative) {
		const value = asFloat(cbor);
		if (value === void 0) throw CborError.outOfRange();
		return value;
	}
	if (cbor.type === MajorType.Simple && isFloat$1(cbor.value)) return cbor.value.value;
	throw CborError.wrongType();
};
/**
* Extract any numeric value, throwing if type doesn't match.
*
* @param cbor - CBOR value
* @returns Number
* @throws {CborError} With type 'WrongType' if cbor is not a number
*/
const expectNumber = (cbor) => {
	const value = asNumber(cbor);
	if (value === void 0) throw CborError.wrongType();
	return value;
};
/**
* Extract content if has specific tag, throwing if not.
*
* Mirrors Rust `try_into_expected_tagged_value`. Throws `{ type: "WrongType" }`
* if `cbor` is not tagged at all, otherwise `{ type: "WrongTag", expected,
* actual }` if the tag doesn't match.
*
* @param cbor - CBOR value
* @param tag - Expected tag value
* @returns Tagged content
*/
const expectTaggedContent = (cbor, tag) => {
	if (cbor.type !== MajorType.Tagged) throw CborError.wrongType();
	if (!tagValuesEqual(cbor.tag, tag)) throw CborError.wrongTag({ value: tag }, { value: cbor.tag });
	return cbor.value;
};
//#endregion
export { ByteString, Cbor, CborDate, CborError, CborMap, CborSet, Err, MajorType, Ok, TAG_BASE16, TAG_BASE64, TAG_BASE64URL, TAG_BASE64URL_TEXT, TAG_BASE64_TEXT, TAG_BIGFLOAT, TAG_BINARY_UUID, TAG_DATE, TAG_DATE_TIME_STRING, TAG_DECIMAL_FRACTION, TAG_ENCODED_CBOR, TAG_EPOCH_DATE, TAG_EPOCH_DATE_TIME, TAG_MIME_MESSAGE, TAG_NAME_DATE, TAG_NAME_NEGATIVE_BIGNUM, TAG_NAME_POSITIVE_BIGNUM, TAG_NEGATIVE_BIGNUM, TAG_POSITIVE_BIGNUM, TAG_REGEXP, TAG_SELF_DESCRIBE_CBOR, TAG_SET, TAG_STRING_REF_NAMESPACE, TAG_URI, TAG_UUID, TagsStore, arrayIsEmpty, arrayItem, arrayLength, arraySortable, asArray, asBoolean, asByteString, asBytes, asCborArray, asCborMap, asFloat, asInteger, asKeyValue, asMap, asNegative, asNumber, asSingle, asTaggedValue, asText, asUnsigned, bigintFromNegativeUntaggedCbor, bigintToCbor, biguintFromUntaggedCbor, biguintToCbor, bytesToHex, cbor, cborData, cborEquals, cborFalse, cborNaN, cborNull, cborToBigint, cborToBiguint, cborTrue, createTag, createTaggedCbor, decodeCbor, decodeVarInt, decodeVarIntData, diagnostic, diagnosticAnnotated, diagnosticFlat, diagnosticOpt, edgeLabel, encodeVarInt, expectArray, expectBoolean, expectBoolean as tryIntoBool, expectBytes, expectBytes as tryIntoByteString, expectFloat, expectInteger, expectMap, expectNegative, expectNumber, expectTaggedContent, expectTaggedContent as tryExpectedTaggedValue, expectText, expectText as tryIntoText, expectUnsigned, extractCbor, extractTaggedContent, fromTaggedCborData, fromUntaggedCborData, getGlobalTagsStore, getTaggedContent, hasFractionalPart, hasTag, hex, hexAnnotated, hexOpt, hexToBytes, isArray, isBoolean, isBytes, isFloat, isInteger, isMap, isNaN$1 as isNaN, isNegative, isNull, isNumber, isSimple, isTagged, isText, isUnsigned, mapHas, mapIsEmpty, mapKeys, mapSize, mapValue, mapValues, registerTags, registerTagsIn, setSortable, simpleName, sortArrayByCborEncoding, summary, tagContent, tagValue, tagValuesEqual, tagWithStaticName, tagWithValue, taggedCborData, tagsEqual, tagsForValues, toByteString, toByteStringFromHex, toTaggedValue, tryDecode, validateTag, walk, withTags, withTagsMut };

// sourceMappingURL removed (baseline is vendored without its .map)