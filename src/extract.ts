/**
 * Native-value extraction from CBOR.
 *
 * Provides {@link extractCbor}, which converts a CBOR value into its native
 * JavaScript equivalent. A separate module so `CborMap` and `CborSet` can
 * use it without importing the convenience surface.
 *
 * @module extract
 */

import { type Cbor } from "./cbor";
import { MajorType } from "./cbor-types";
import { decodeCbor } from "./decode";
import type { CborMap } from "./map";

/**
 * The closed set of values {@link extractCbor} can return.
 *
 * Two deliberate asymmetries are part of this contract:
 *
 * - **Maps stay `CborMap`** - map values are NOT recursively extracted into a
 *   plain object/Map; the stored container is returned as-is.
 * - **Tagged values stay `Cbor`** - a tagged value has no native equivalent,
 *   so the tagged node itself is returned.
 */
export type CborNative =
  number | bigint | string | boolean | null | Uint8Array | CborNative[] | CborMap | Cbor;

/**
 * Extract the native JavaScript value from a CBOR value, decoding it first
 * when given bytes. Maps come back as `CborMap` and tagged values as `Cbor`
 * (see {@link CborNative}).
 */
export const extractCbor = (cbor: Cbor | Uint8Array): CborNative => {
  let c: Cbor;
  if (cbor instanceof Uint8Array) {
    c = decodeCbor(cbor);
  } else {
    c = cbor;
  }
  switch (c.type) {
    case MajorType.Unsigned:
      return c.value;
    case MajorType.Negative:
      if (typeof c.value === "bigint") {
        return -c.value - 1n;
      } else {
        return -c.value - 1;
      }
    case MajorType.ByteString:
      return c.value;
    case MajorType.Text:
      return c.value;
    case MajorType.Array:
      return c.value.map(extractCbor);
    case MajorType.Map:
      return c.value;
    case MajorType.Tagged:
      return c;
    case MajorType.Simple: {
      const simple = c.value;
      switch (simple.type) {
        case "True":
          return true;
        case "False":
          return false;
        case "Null":
          return null;
        case "Float":
          return simple.value;
        default:
          return simple satisfies never;
      }
    }
    default:
      return c satisfies never;
  }
};
