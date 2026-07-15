import { t as Cbor } from "./cbor-C6QATcT9.mjs";
import { o as TagsStore, s as TagsStoreOpt } from "./hex-1riAQGoa.mjs";
import { i as WalkElement } from "./walk-0SuM63_9.mjs";

//#region src/diag.d.ts
/**
* Options for diagnostic formatting.
*/
interface DiagFormatOpts {
  /**
  * Add tag names as annotations.
  * When true, tagged values are displayed as "tagName(content)" instead of "tagValue(content)".
  *
  * @default false
  */
  annotate?: boolean | undefined;
  /**
  * Use custom summarizers for tagged values.
  * When true, calls registered summarizers for tagged values.
  *
  * @default false
  */
  summarize?: boolean | undefined;
  /**
  * Single-line (flat) output.
  * When true, arrays and maps are formatted without line breaks.
  *
  * @default false
  */
  flat?: boolean | undefined;
  /**
  * Tag store to use for tag name resolution.
  *
  * - `TagsStore` instance: use this specific store
  * - `'global'`: use global singleton store
  * - `'none'`: don't resolve names; print bare tag numbers
  *
  * @default 'global'
  */
  tags?: TagsStoreOpt | undefined;
}
/**
* Format a CBOR value - or a walk visitor's `WalkElement` - as CBOR
* diagnostic notation.
*
* ```typescript
* diagnostic(value);                       // pretty-printed
* diagnostic(value, { flat: true });       // single line
* diagnostic(value, { annotate: true });   // tag names as annotations
* diagnostic(value, { summarize: true });  // registered summarizers (implies flat)
* ```
*
* @param input - CBOR value, or a `WalkElement` from a walk visitor
* @param opts - Formatting options (explicit `undefined` fields mean
*   "use the default")
* @public
*/
declare function diagnostic(input: Cbor | WalkElement, opts?: DiagFormatOpts): string;
//#endregion
//#region src/dump.d.ts
/**
* Options for annotated hex formatting.
*/
interface HexFormatOpts {
  /**
  * Tags store for resolving tag names in annotations.
  * Defaults to the global tags store.
  */
  tagsStore?: TagsStore | undefined;
}
/**
* Render CBOR as an annotated hex dump: the encoding broken into
* semantically meaningful lines with offsets, values, and tag names
* resolved through the tags store.
*
* For plain hex use `c.toHex()` or `bytesToHex(encodeCbor(v))`.
*
* @param cbor - CBOR value to render
* @param opts - Formatting options (explicit `undefined` fields mean
*   "use the default")
*/
declare const hexAnnotated: (cbor: Cbor, opts?: HexFormatOpts) => string;
//#endregion
export { type DiagFormatOpts, type HexFormatOpts, diagnostic, hexAnnotated };
//# sourceMappingURL=diagnostic.d.mts.map