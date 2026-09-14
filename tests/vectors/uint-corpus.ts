/**
 * Curated UNSIGNED-EXTRACTION corpus.
 *
 * Each row decodes `hex` and extracts it into a fixed-width unsigned
 * integer: `expectUnsigned(cbor, { width, wrapNegative: true })` here,
 * `u8`/`u16`/`u32`/`u64::try_from(CBOR)` in the Rust harness. The
 * reference wraps a negative integer whose magnitude fits the width
 * (RUST_DIVERGENCES.md §1.6) and rejects everything else with
 * `OutOfRange`; non-integers are `WrongType`.
 */

export interface UintCorpusEntry {
  name: string;
  hex: string;
  width: 8 | 16 | 32 | 64;
  note?: string;
}

const row = (name: string, hex: string, width: 8 | 16 | 32 | 64, note?: string): UintCorpusEntry =>
  note === undefined ? { name, hex, width } : { name, hex, width, note };

export const uintCorpus: UintCorpusEntry[] = [
  row("u8/-1-wraps-255", "20", 8),
  row("u8/-256-wraps-0", "38ff", 8),
  row("u8/-257-out-of-range", "390100", 8),
  row("u8/256-out-of-range", "190100", 8),
  row("u8/255", "18ff", 8),
  row("u8/0", "00", 8),
  row("u16/-1-wraps-65535", "20", 16),
  row("u16/65536-out-of-range", "1a00010000", 16),
  row("u32/-1-wraps-4294967295", "20", 32),
  row("u32/-2^32-wraps-0", "3affffffff", 32),
  row("u32/-2^32-1-out-of-range", "3b0000000100000000", 32),
  row("u32/2^32-out-of-range", "1b0000000100000000", 32),
  row("u64/-2^64-wraps-0", "3bffffffffffffffff", 64, "the 65-bit negative"),
  row("u64/-1-wraps-max", "20", 64),
  row("u64/max", "1bffffffffffffffff", 64),
  row("u64/2^53", "1b0020000000000000", 64),
  row("u8/float-wrong-type", "f93e00", 8),
  row("u8/text-wrong-type", "6161", 8),
  row("u64/tagged-wrong-type", "c100", 64),
];

{
  const seen = new Set<string>();
  for (const { name } of uintCorpus) {
    if (seen.has(name)) throw new Error(`duplicate uint-corpus name: ${name}`);
    seen.add(name);
  }
}
