/**
 * The codable surface for converting between TypeScript types and CBOR.
 *
 * - **encode**: the structural protocol `ToCbor { toCbor(): Cbor }` (lives in
 *   ./cbor-types; `cbor()` dispatches on it). Tagged types keep `cborTags()` /
 *   `untaggedCbor()` / `taggedCbor()` as ordinary members and implement
 *   `toCbor()` as `return this.taggedCbor();`.
 * - **decode**: {@link CborCodec} + {@link decodeWith} - the generic that binds
 *   `T`, witnessed by a runtime value.
 * - the tagged-value validators {@link validateTag} and
 *   {@link extractTaggedContent}.
 *
 * @module codable
 */

import { type Cbor } from "./cbor";
import { MajorType } from "./cbor-types";
import { tagValuesEqual, type Tag } from "./tag";
import { CborError } from "./error";
import { decodeCbor } from "./decode";

/**
 * Interface for types that have associated CBOR tags.
 *
 * `cborTags()` returns tags in order of preference: the first is used when
 * encoding; all are accepted when decoding (backward compatibility).
 */
export interface CborTagged {
  /**
   * Returns the CBOR tags associated with this type, most-preferred first.
   */
  cborTags(): Tag[];
}

/**
 * A two-way codec binding a TypeScript type `T` to its CBOR representation.
 * The codec value is the runtime witness that justifies the generic in
 * {@link decodeWith} - no unwitnessed casts.
 *
 * Ship-with exemplar: `CborDate.codec`.
 *
 * @beta
 */
export interface CborCodec<T> {
  /** The tags this codec's encoding carries, if any (informational). */
  readonly tags?: readonly Tag[] | undefined;
  /**
   * Convert a decoded CBOR value to `T`.
   * @throws {CborError} on shape/tag mismatch.
   */
  decode(cbor: Cbor): T;
  /** Convert a `T` back to CBOR. */
  encode(value: T): Cbor;
}

/**
 * Decode CBOR bytes straight to a typed value via a {@link CborCodec}
 * witness:
 *
 * ```typescript
 * const date = decodeWith(bytes, CborDate.codec); // CborDate
 * ```
 *
 * @throws {CborError} decoding errors from `decodeCbor`, plus whatever the
 *   codec's `decode` throws on mismatch.
 * @beta
 */
export function decodeWith<T>(data: Uint8Array, codec: CborCodec<T>): T {
  return codec.decode(decodeCbor(data));
}

/**
 * Helper function to validate that a CBOR value has one of the expected tags.
 *
 * @param cbor - CBOR value to validate
 * @param expectedTags - Array of valid tags
 * @returns The matching tag
 * @throws {CborError} `WrongType` if the value is not tagged; `WrongTag` if
 *   the tag matches none of `expectedTags`.
 */
export const validateTag = (cbor: Cbor, expectedTags: Tag[]): Tag => {
  if (cbor.type !== MajorType.Tagged) {
    throw CborError.wrongType();
  }

  const tagValue = cbor.tag;
  const matchingTag = expectedTags.find((t) => tagValuesEqual(t.value, tagValue));
  if (matchingTag === undefined) {
    // Produce the structured WrongTag variant rather than a stringly-typed
    // Custom error so callers can branch on `error.code === "WrongTag"`.
    throw CborError.wrongTag(expectedTags[0], { value: tagValue });
  }

  return matchingTag;
};

/**
 * Helper function to extract the content from a tagged CBOR value.
 *
 * @param cbor - Tagged CBOR value
 * @returns The untagged content
 * @throws {CborError} `WrongType` if the value is not tagged.
 */
export const extractTaggedContent = (cbor: Cbor): Cbor => {
  if (cbor.type !== MajorType.Tagged) {
    throw CborError.wrongType();
  }
  return cbor.value;
};
