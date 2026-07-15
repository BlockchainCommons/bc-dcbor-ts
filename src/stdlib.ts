/**
 * Byte-array utilities shared across the library.
 *
 * @module stdlib
 */

import { CborError } from "./error";

/**
 * Check if two byte arrays are equal.
 */
export const areBytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * Lexicographically compare two byte arrays.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export const lexicographicallyCompareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal === undefined || bVal === undefined) {
      throw CborError.custom("Unexpected undefined byte in array");
    }
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
};
