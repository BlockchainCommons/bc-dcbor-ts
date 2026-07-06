/**
 * Hex dump utilities for CBOR data.
 *
 * Affordances for viewing the encoded binary representation of CBOR as hexadecimal.
 * Optionally annotates the output, breaking it up into semantically meaningful lines,
 * formatting dates, and adding names of known tags.
 *
 * @module dump
 */

import { type Cbor, encodeCbor } from "./cbor";
import { MajorType } from "./cbor-types";
import { encodeVarInt } from "./varint";
import { floatDisplayString } from "./float";
import { flanked, sanitized } from "./string-util";
import type { TagsStore } from "./tags-store";
import { getGlobalTagsStore } from "./tags-store";
import { Tag } from "./tag";
import { CborError } from "./error";
import { bytesToHex } from "./hex";

/**
 * Options for annotated hex formatting.
 */
export interface HexFormatOpts {
  /**
   * Tags store for resolving tag names in annotations.
   * Defaults to the global tags store.
   */
  tagsStore?: TagsStore | undefined;
}

// bytesToHex/hexToBytes live in ./hex; re-exported here for convenience.
export { bytesToHex, hexToBytes } from "./hex";

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
export const hexAnnotated = (cbor: Cbor, opts?: HexFormatOpts): string => {
  const tagsStore = opts?.tagsStore ?? getGlobalTagsStore();
  const items = dumpItems(cbor, 0, tagsStore);
  const noteColumn = items.reduce((largest, item) => {
    return Math.max(largest, item.formatFirstColumn().length);
  }, 0);

  // Round up to nearest multiple of 4
  const roundedNoteColumn = ((noteColumn + 4) & ~3) - 1;

  const lines = items.map((item) => item.format(roundedNoteColumn));
  return lines.join("\n");
};

/**
 * Internal structure for dump items.
 */
class DumpItem {
  constructor(
    public level: number,
    public data: Uint8Array[],
    public note?: string | undefined,
  ) {}

  format(noteColumn: number): string {
    const column1 = this.formatFirstColumn();
    let column2 = "";
    let padding = "";

    if (this.note !== undefined) {
      const paddingCount = Math.max(1, Math.min(39, noteColumn) - column1.length + 1);
      padding = " ".repeat(paddingCount);
      column2 = `# ${this.note}`;
    }

    return column1 + padding + column2;
  }

  formatFirstColumn(): string {
    const indent = " ".repeat(this.level * 4);
    const hexParts = this.data.map(bytesToHex).filter((x) => x.length > 0);
    const hexStr = hexParts.join(" ");
    return indent + hexStr;
  }
}

/**
 * Generate dump items for a CBOR value (recursive).
 */
function dumpItems(cbor: Cbor, level: number, tagsStore: TagsStore): DumpItem[] {
  const items: DumpItem[] = [];

  switch (cbor.type) {
    case MajorType.Unsigned: {
      const data = encodeCbor(cbor);
      items.push(new DumpItem(level, [data], `unsigned(${cbor.value})`));
      break;
    }

    case MajorType.Negative: {
      const data = encodeCbor(cbor);
      const actualValue = typeof cbor.value === "bigint" ? -1n - cbor.value : -1 - cbor.value;
      items.push(new DumpItem(level, [data], `negative(${actualValue})`));
      break;
    }

    case MajorType.ByteString: {
      const header = encodeVarInt(cbor.value.length, MajorType.ByteString);
      items.push(new DumpItem(level, [header], `bytes(${cbor.value.length})`));

      if (cbor.value.length > 0) {
        let note: string | undefined = undefined;
        // Try to decode as UTF-8 string for annotation
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(cbor.value);
          const sanitizedText = sanitized(text);
          if (sanitizedText !== undefined && sanitizedText !== "") {
            note = flanked(sanitizedText, '"', '"');
          }
        } catch {
          // Not valid UTF-8, no annotation
        }

        items.push(new DumpItem(level + 1, [cbor.value], note));
      }
      break;
    }

    case MajorType.Text: {
      const utf8Data = new TextEncoder().encode(cbor.value);
      const header = encodeVarInt(utf8Data.length, MajorType.Text);
      const firstByte = header[0];
      if (firstByte === undefined) {
        throw CborError.custom("Invalid varint encoding");
      }
      const headerData = [new Uint8Array([firstByte]), header.slice(1)];

      items.push(new DumpItem(level, headerData, `text(${utf8Data.length})`));

      items.push(new DumpItem(level + 1, [utf8Data], flanked(cbor.value, '"', '"')));
      break;
    }

    case MajorType.Array: {
      const header = encodeVarInt(cbor.value.length, MajorType.Array);
      const firstByte = header[0];
      if (firstByte === undefined) {
        throw CborError.custom("Invalid varint encoding");
      }
      const headerData = [new Uint8Array([firstByte]), header.slice(1)];

      items.push(new DumpItem(level, headerData, `array(${cbor.value.length})`));

      for (const item of cbor.value) {
        items.push(...dumpItems(item, level + 1, tagsStore));
      }
      break;
    }

    case MajorType.Map: {
      const header = encodeVarInt(cbor.value.size, MajorType.Map);
      const firstByte = header[0];
      if (firstByte === undefined) {
        throw CborError.custom("Invalid varint encoding");
      }
      const headerData = [new Uint8Array([firstByte]), header.slice(1)];

      items.push(new DumpItem(level, headerData, `map(${cbor.value.size})`));

      for (const entry of cbor.value.entriesArray) {
        items.push(...dumpItems(entry.key, level + 1, tagsStore));
        items.push(...dumpItems(entry.value, level + 1, tagsStore));
      }
      break;
    }

    case MajorType.Tagged: {
      const tagValue = cbor.tag;
      if (tagValue === undefined) {
        throw CborError.custom("Tagged CBOR value must have a tag");
      }
      // Pass the tag value through directly: `encodeVarInt` accepts both
      // `number` and `bigint`, avoiding a lossy cast for tags
      // > MAX_SAFE_INTEGER.
      const header = encodeVarInt(tagValue, MajorType.Tagged);
      const firstByte = header[0];
      if (firstByte === undefined) {
        throw CborError.custom("Invalid varint encoding");
      }
      const headerData = [new Uint8Array([firstByte]), header.slice(1)];

      const noteComponents: string[] = [`tag(${tagValue})`];

      // Add tag name if the tags store knows it.
      const tag = Tag.from(tagValue);
      const tagName = tagsStore.assignedNameForTag(tag);
      if (tagName !== undefined) {
        noteComponents.push(tagName);
      }

      const tagNote = noteComponents.join(" ");

      items.push(new DumpItem(level, headerData, tagNote));

      items.push(...dumpItems(cbor.value, level + 1, tagsStore));
      break;
    }

    case MajorType.Simple: {
      const data = encodeCbor(cbor);
      const simple = cbor.value;
      let note: string;

      if (simple.type === "True") {
        note = "true";
      } else if (simple.type === "False") {
        note = "false";
      } else if (simple.type === "Null") {
        note = "null";
      } else if (simple.type === "Float") {
        // Use the same float formatting as diagnostic output, not raw JS coercion.
        note = floatDisplayString(simple.value);
      } else {
        note = "simple";
      }

      items.push(new DumpItem(level, [data], note));
      break;
    }
  }

  return items;
}
