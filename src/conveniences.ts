/**
 * Convenience utilities for working with CBOR values - a barrel re-exporting
 * the type guards, safe accessors, and throwing expectations from their focused
 * modules, plus `extractCbor`.
 *
 * @module conveniences
 */

export * from "./conveniences-guards";
export * from "./conveniences-accessors";
export * from "./conveniences-expect";
export { extractCbor, type CborNative } from "./extract";
