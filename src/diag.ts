/**
 * Enhanced diagnostic formatting for CBOR values.
 *
 * Provides multiple formatting options including
 * - Annotated diagnostics with tag names
 * - Summarized values using custom summarizers
 * - Flat (single-line) vs. pretty (multi-line) formatting
 * - Configurable tag store usage
 *
 * @module diag
 */

import { type Cbor } from "./cbor";
import { MajorType, type Simple } from "./cbor-types";
import { bytesToHex } from "./dump";
import { floatDisplayString } from "./float";
import type { CborMap } from "./map";
import { getGlobalTagsStore, type TagsStore, type TagsStoreOpt } from "./tags-store";
import type { Tag } from "./tag";
import type { WalkElement } from "./walk";
import { flanked } from "./string-util";

/**
 * Options for diagnostic formatting.
 */
export interface DiagFormatOpts {
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
 * Fully-resolved formatting state (internal). Public options resolve
 * per-field with `??`, so an explicit `undefined` means "use the default".
 *
 * @internal
 */
interface DiagState {
  annotate: boolean;
  summarize: boolean;
  flat: boolean;
  tags: TagsStoreOpt;
}

const resolveOpts = (opts?: DiagFormatOpts): DiagState => {
  const summarize = opts?.summarize ?? false;
  return {
    annotate: opts?.annotate ?? false,
    summarize,
    // `summarize` implies `flat`.
    flat: summarize || (opts?.flat ?? false),
    tags: opts?.tags ?? "global",
  };
};

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
export function diagnostic(input: Cbor | WalkElement, opts?: DiagFormatOpts): string {
  const state = resolveOpts(opts);
  // WalkElement support is load-bearing for walk visitors.
  if (
    typeof input === "object" &&
    "type" in input &&
    (input.type === "single" || input.type === "keyvalue")
  ) {
    if (input.type === "single") {
      return diagFormat(diagItem(input.cbor, state), state);
    }
    return `${diagFormat(diagItem(input.key, state), state)}: ${diagFormat(
      diagItem(input.value, state),
      state,
    )}`;
  }
  return diagFormat(diagItem(input, state), state);
}

// =====================================================================
// DiagItem AST
//
// Building an AST first lets the formatter apply its multi-line heuristics
// (`containsGroup || totalStringsLen > 20 || greatestStringsLen > 20`) over
// the whole tree rather than ad-hoc thresholds applied at recursion time.
// =====================================================================

type DiagItem = DiagItemNode | DiagItemGroup;

interface DiagItemNode {
  kind: "item";
  value: string;
}

interface DiagItemGroup {
  kind: "group";
  begin: string;
  end: string;
  items: DiagItem[];
  /** True for maps (`{...}`) - items alternate key, value. */
  isPairs: boolean;
  /** Optional comment rendered as `   / comment /` after the line. */
  comment?: string | undefined;
}

const item = (value: string): DiagItemNode => ({ kind: "item", value });

const group = (
  begin: string,
  end: string,
  items: DiagItem[],
  isPairs: boolean,
  comment?: string,
): DiagItemGroup => {
  const g: DiagItemGroup = { kind: "group", begin, end, items, isPairs };
  if (comment !== undefined) g.comment = comment;
  return g;
};

const isGroup = (i: DiagItem): boolean => i.kind === "group";

const containsGroup = (i: DiagItem): boolean => i.kind === "group" && i.items.some(isGroup);

const totalStringsLen = (i: DiagItem): number =>
  i.kind === "item" ? i.value.length : i.items.reduce((acc, c) => acc + totalStringsLen(c), 0);

const greatestStringsLen = (i: DiagItem): number =>
  i.kind === "item"
    ? i.value.length
    : i.items.reduce((acc, c) => Math.max(acc, totalStringsLen(c)), 0);

/**
 * Alternates between `pairSeparator` (after even-indexed items - keys) and
 * `itemSeparator` (after odd-indexed items - values). Falls back to
 * `itemSeparator` for non-pair groups.
 */
function joined(elements: string[], itemSeparator: string, pairSeparator?: string): string {
  const sep = pairSeparator ?? itemSeparator;
  let result = "";
  const len = elements.length;
  for (let i = 0; i < len; i++) {
    result += elements[i];
    if (i !== len - 1) {
      result += (i & 1) !== 0 ? itemSeparator : sep;
    }
  }
  return result;
}

const diagFormat = (i: DiagItem, opts: DiagState): string => diagFormatOpt(i, 0, "", opts);

function diagFormatOpt(i: DiagItem, level: number, separator: string, opts: DiagState): string {
  if (i.kind === "item") {
    return formatLine(level, opts, i.value, separator, undefined);
  }
  if (
    opts.flat !== true &&
    (containsGroup(i) || totalStringsLen(i) > 20 || greatestStringsLen(i) > 20)
  ) {
    return multilineComposition(i, level, separator, opts);
  }
  return singleLineComposition(i, level, separator, opts);
}

function formatLine(
  level: number,
  opts: DiagState,
  string: string,
  separator: string,
  comment: string | undefined,
): string {
  const indent = opts.flat === true ? "" : " ".repeat(level * 4);
  const result = `${indent}${string}${separator}`;
  if (comment !== undefined) {
    return `${result}   / ${comment} /`;
  }
  return result;
}

function singleLineComposition(
  i: DiagItem,
  level: number,
  separator: string,
  opts: DiagState,
): string {
  let str: string;
  let comment: string | undefined;
  if (i.kind === "item") {
    str = i.value;
    comment = undefined;
  } else {
    const components = i.items.map((c) =>
      c.kind === "item" ? c.value : singleLineComposition(c, level + 1, separator, opts),
    );
    const pairSeparator = i.isPairs ? ": " : ", ";
    str = flanked(joined(components, ", ", pairSeparator), i.begin, i.end);
    comment = i.comment;
  }
  return formatLine(level, opts, str, separator, comment);
}

function multilineComposition(
  i: DiagItem,
  level: number,
  separator: string,
  opts: DiagState,
): string {
  if (i.kind === "item") return i.value;
  const lines: string[] = [];
  // Opening line: print `begin` (with comment) at this level, never flat.
  const openOpts: DiagState = { ...opts, flat: false };
  lines.push(formatLine(level, openOpts, i.begin, "", i.comment));
  for (let idx = 0; idx < i.items.length; idx++) {
    const sep = idx === i.items.length - 1 ? "" : i.isPairs && (idx & 1) === 0 ? ":" : ",";
    lines.push(diagFormatOpt(i.items[idx], level + 1, sep, opts));
  }
  // Closing line: print `end` at the parent level, with the outer separator.
  lines.push(formatLine(level, opts, i.end, separator, undefined));
  return lines.join("\n");
}

// =====================================================================
// AST construction
// =====================================================================

function diagItem(cbor: Cbor, opts: DiagFormatOpts): DiagItem {
  switch (cbor.type) {
    case MajorType.Unsigned:
      return item(formatUnsigned(cbor.value));
    case MajorType.Negative:
      return item(formatNegative(cbor.value));
    case MajorType.ByteString:
      return item(formatBytes(cbor.value));
    case MajorType.Text:
      return item(formatText(cbor.value));
    case MajorType.Array:
      return item_array(cbor.value, opts);
    case MajorType.Map:
      return item_map(cbor.value, opts);
    case MajorType.Tagged:
      return item_tagged(cbor.tag, cbor.value, opts);
    case MajorType.Simple:
      return item(formatSimple(cbor.value));
  }
}

function item_array(items: readonly Cbor[], opts: DiagFormatOpts): DiagItem {
  return group(
    "[",
    "]",
    items.map((it) => diagItem(it, opts)),
    false,
  );
}

function item_map(map: CborMap, opts: DiagFormatOpts): DiagItem {
  const entries = map?.entriesArray ?? [];
  const flatItems: DiagItem[] = [];
  for (const e of entries) {
    flatItems.push(diagItem(e.key, opts));
    flatItems.push(diagItem(e.value, opts));
  }
  return group("{", "}", flatItems, true);
}

function item_tagged(tag: number | bigint, content: Cbor, opts: DiagFormatOpts): DiagItem {
  // Summarizer path.
  if (opts.summarize === true) {
    const store = resolveTagsStore(opts.tags);
    const summarizer = store?.summarizer(tag);
    if (summarizer !== undefined) {
      const result = summarizer(content, opts.flat ?? false);
      if (result.ok) {
        return item(result.value);
      }
      // Use the shared error formatter so every variant gets its full message,
      // including name-aware tag rendering for WrongTag.
      return item(`<error: ${result.error.message}>`);
    }
  }

  let comment: string | undefined;
  if (opts.annotate === true) {
    const store = resolveTagsStore(opts.tags);
    const tagObj: Tag = { value: tag };
    const assignedName = store?.assignedNameForTag(tagObj);
    if (assignedName !== undefined) {
      comment = assignedName;
    }
  }

  return group(`${String(tag)}(`, ")", [diagItem(content, opts)], false, comment);
}

// Primitive formatters reused by both single- and multi-line paths.
function formatUnsigned(value: number | bigint): string {
  return String(value);
}

function formatNegative(value: number | bigint): string {
  if (typeof value === "bigint") return String(-value - 1n);
  return String(-value - 1);
}

function formatBytes(value: Uint8Array): string {
  return `h'${bytesToHex(value)}'`;
}

function formatText(value: string): string {
  // Only the double-quote is escaped; backslash, tab, newline, and carriage
  // return are emitted verbatim.
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function formatSimple(value: Simple): string {
  switch (value.type) {
    case "True":
      return "true";
    case "False":
      return "false";
    case "Null":
      return "null";
    case "Float":
      return formatFloat(value.value);
  }
}

/**
 * Format a CBOR float for diagnostic output. Shared with the hex-dump
 * annotation path; see {@link floatDisplayString}.
 */
function formatFloat(value: number): string {
  return floatDisplayString(value);
}

function resolveTagsStore(tags?: TagsStoreOpt): TagsStore | undefined {
  if (tags === "none") return undefined;
  if (tags === "global" || tags === undefined) return getGlobalTagsStore();
  return tags;
}
