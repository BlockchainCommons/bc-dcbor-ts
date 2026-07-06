/**
 * Hex encoding/decoding for byte arrays.
 *
 * The names deliberately match the platform's `Uint8Array.prototype.toHex` /
 * `Uint8Array.fromHex` proposal, and both functions delegate to the native
 * implementations when present.
 *
 * @module hex
 */

import { CborError } from "./error";

/** Feature-detected native `Uint8Array.fromHex` (ES proposal / Node >= 24). */
const nativeFromHex = (
  Uint8Array as unknown as { fromHex?: (hex: string) => Uint8Array<ArrayBuffer> }
).fromHex;

/**
 * Convert bytes to a lowercase hex string.
 *
 * Delegates to the native `Uint8Array.prototype.toHex` where available.
 */
export const bytesToHex = (bytes: Uint8Array): string => {
  const native = (bytes as unknown as { toHex?: () => string }).toHex;
  if (typeof native === "function") {
    return native.call(bytes);
  }
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
};

/**
 * Convert a hex string to bytes.
 *
 * **Whitespace tolerance.** ASCII whitespace is stripped before decoding so
 * users can paste annotated hex dumps directly.
 *
 * **Validation.** After whitespace stripping, the input must have even length
 * and contain only `[0-9a-fA-F]`; anything else throws `CborError` with code
 * `Custom`.
 *
 * @throws {CborError} `Custom` - invalid hex string.
 */
export const hexToBytes = (hexString: string): Uint8Array<ArrayBuffer> => {
  const hex = hexString.replace(/\s/g, "");
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw CborError.custom("invalid hex string");
  }
  if (nativeFromHex !== undefined) {
    // Native fromHex only accepts lowercase+uppercase hex, which the
    // validation above guarantees.
    return nativeFromHex(hex);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};
