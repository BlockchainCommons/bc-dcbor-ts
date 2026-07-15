/**
 * The `@blockchaincommons/dcbor/diagnostic` subpath entry.
 *
 * Human-readable rendering of CBOR values: diagnostic notation and annotated
 * hex dumps. Kept out of the root entry so decode-only bundles never carry
 * the formatter, tag store retainers, or the walker.
 *
 * ```typescript
 * import { diagnostic, hexAnnotated } from "@blockchaincommons/dcbor/diagnostic";
 * ```
 *
 * @module diagnostic
 */

export { diagnostic, type DiagFormatOpts } from "./diag";
export { hexAnnotated, type HexFormatOpts } from "./dump";
