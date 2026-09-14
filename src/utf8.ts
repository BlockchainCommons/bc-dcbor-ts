/**
 * UTF-8 validation failure description, mirroring `core::str::Utf8Error`.
 *
 * The decoder rejects malformed text with the WHATWG `TextDecoder` (fatal
 * mode), whose error text is host-defined. To report the same message as the
 * reference (`str::from_utf8` → `Utf8Error` → `Display`), the failing bytes
 * are re-scanned here with a port of `core::str::validations::
 * run_utf8_validation`, which yields the reference's `(valid_up_to,
 * error_len)` pair.
 *
 * @module utf8
 * @internal
 */

/**
 * `core::str::validations::utf8_char_width`: the sequence length a lead byte
 * announces, or 0 for a byte that can never start a sequence (a continuation
 * byte `80-bf`, the overlong leads `c0`/`c1`, or `f5-ff`).
 */
const utf8CharWidth = (lead: number): number => {
  if (lead < 0x80) return 1;
  if (lead < 0xc2) return 0;
  if (lead < 0xe0) return 2;
  if (lead < 0xf0) return 3;
  if (lead < 0xf5) return 4;
  return 0;
};

/** A byte that is not a UTF-8 continuation byte (`80-bf`). */
const isNotContinuation = (byte: number): boolean => byte < 0x80 || byte > 0xbf;

/** The reference's `(valid_up_to, error_len)`; `errorLength` is `undefined` for `None`. */
export interface Utf8ErrorInfo {
  readonly validUpTo: number;
  readonly errorLength: number | undefined;
}

/**
 * Locate the first UTF-8 error in `bytes` the way `run_utf8_validation`
 * does, or return `undefined` when the bytes are valid.
 *
 * `validUpTo` is the index of the offending lead byte. `errorLength` is the
 * number of bytes to skip (1, 2 or 3) when an invalid byte is present, or
 * `undefined` when the input ends inside a sequence. A present invalid byte
 * always beats "incomplete": the continuation bytes are checked one at a
 * time as they are read.
 */
export const findUtf8Error = (bytes: Uint8Array): Utf8ErrorInfo | undefined => {
  const len = bytes.length;
  let index = 0;
  while (index < len) {
    const first = bytes[index];
    if (first < 0x80) {
      index++;
      continue;
    }
    const start = index;
    // The k-th continuation byte, or `undefined` when the input ends first.
    const next = (): number | undefined => {
      index++;
      return index < len ? bytes[index] : undefined;
    };
    const err = (errorLength: number | undefined): Utf8ErrorInfo => ({
      validUpTo: start,
      errorLength,
    });
    const width = utf8CharWidth(first);
    if (width === 2) {
      const b1 = next();
      if (b1 === undefined) return err(undefined);
      if (isNotContinuation(b1)) return err(1);
    } else if (width === 3) {
      const b1 = next();
      if (b1 === undefined) return err(undefined);
      const secondOk =
        (first === 0xe0 && b1 >= 0xa0 && b1 <= 0xbf) ||
        (first >= 0xe1 && first <= 0xec && b1 >= 0x80 && b1 <= 0xbf) ||
        (first === 0xed && b1 >= 0x80 && b1 <= 0x9f) ||
        (first >= 0xee && first <= 0xef && b1 >= 0x80 && b1 <= 0xbf);
      if (!secondOk) return err(1);
      const b2 = next();
      if (b2 === undefined) return err(undefined);
      if (isNotContinuation(b2)) return err(2);
    } else if (width === 4) {
      const b1 = next();
      if (b1 === undefined) return err(undefined);
      const secondOk =
        (first === 0xf0 && b1 >= 0x90 && b1 <= 0xbf) ||
        (first >= 0xf1 && first <= 0xf3 && b1 >= 0x80 && b1 <= 0xbf) ||
        (first === 0xf4 && b1 >= 0x80 && b1 <= 0x8f);
      if (!secondOk) return err(1);
      const b2 = next();
      if (b2 === undefined) return err(undefined);
      if (isNotContinuation(b2)) return err(2);
      const b3 = next();
      if (b3 === undefined) return err(undefined);
      if (isNotContinuation(b3)) return err(3);
    } else {
      return err(1);
    }
    index++;
  }
  return undefined;
};

/**
 * `Utf8Error`'s `Display` text for `bytes`, which must be invalid UTF-8:
 * `invalid utf-8 sequence of N bytes from index I` or `incomplete utf-8 byte
 * sequence from index I`.
 */
export const utf8ErrorDescription = (bytes: Uint8Array): string => {
  const info = findUtf8Error(bytes);
  if (info === undefined) {
    // Unreachable when the decoder has already rejected the bytes; keep a
    // truthful message rather than inventing an index.
    return "invalid utf-8 sequence";
  }
  return info.errorLength === undefined
    ? `incomplete utf-8 byte sequence from index ${info.validUpTo}`
    : `invalid utf-8 sequence of ${info.errorLength} bytes from index ${info.validUpTo}`;
};
