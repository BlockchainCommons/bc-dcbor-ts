/**
 * The `@blockchaincommons/dcbor/debug` subpath entry - opt-in diagnostic-flavored
 * console output for `Cbor` values.
 *
 * The core keeps `String(c)` cheap (`Cbor(0x…)`); importing this module and
 * calling {@link installDebugHooks} switches Node's `util.inspect` (and
 * `JSON.stringify` via `toJSON`) to flat diagnostic notation on the shared
 * prototype. Deliberately a side-effectful opt-in: pulling the diagnostic
 * formatter into a bundle is exactly what the root entry avoids.
 *
 * @module debug
 */

import { __installDebugHooks, type Cbor } from "./cbor";
import { diagnostic } from "./diag";

/**
 * Install diag-flavored `util.inspect.custom` and `toJSON` hooks onto the
 * shared `Cbor` prototype. Idempotent; affects every `Cbor` value in the
 * realm (they share one prototype).
 */
export const installDebugHooks = (): void => {
  __installDebugHooks((c: Cbor) => diagnostic(c, { flat: true }));
};
