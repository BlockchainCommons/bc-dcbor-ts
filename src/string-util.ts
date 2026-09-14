/**
 * String helpers for the diagnostic and hex-dump formatters.
 *
 * @module string-util
 */

/**
 * Flank a string with left and right strings.
 *
 * @param s - String to flank
 * @param left - Left flanking string
 * @param right - Right flanking string
 * @returns Flanked string
 */
export const flanked = (s: string, left: string, right: string): string => left + s + right;

/**
 * Check if a code point is printable (the reference's `is_printable`: any
 * non-ASCII character, or ASCII 32-126). Internal helper for
 * {@link sanitized}, which iterates code points, so an astral character (two
 * UTF-16 code units) is one printable character here.
 *
 * @param c - One code point, as a string
 * @returns True if printable
 */
const isPrintable = (c: string): boolean => {
  const cp = c.codePointAt(0) ?? 0;
  return cp > 127 || (cp >= 32 && cp <= 126);
};

/**
 * Sanitize a string by replacing non-printable characters with dots.
 *
 * @param str - String to sanitize
 * @returns Sanitized string or undefined if no printable characters
 */
export const sanitized = (str: string): string | undefined => {
  let hasPrintable = false;
  const chars: string[] = [];

  for (const c of str) {
    if (isPrintable(c)) {
      hasPrintable = true;
      chars.push(c);
    } else {
      chars.push(".");
    }
  }

  if (!hasPrintable) {
    return undefined;
  }

  return chars.join("");
};
