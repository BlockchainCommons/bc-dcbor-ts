/**
 * Guard: the engine's Unicode tables must not be older than the
 * reference's.
 *
 * Decoding rejects non-NFC text with `String.prototype.normalize`; the
 * reference uses the `unicode-normalization` crate (0.1.25, Unicode 17).
 * The two agree exhaustively when the engine implements the same Unicode
 * version or a newer one; an older engine would accept or reject different
 * strings. `process.versions.unicode` is reported by Node and Bun.
 */

describe("engine Unicode version matches the reference's normalization tables", () => {
  it("is Unicode 17 or newer (unicode-normalization 0.1.25)", () => {
    const reported = (globalThis as { process?: { versions?: { unicode?: string } } }).process
      ?.versions?.unicode;
    if (reported === undefined) return; // an engine that does not report it
    const major = Number(reported.split(".")[0]);
    expect(
      major,
      `NFC tables must match unicode-normalization 0.1.25 (Unicode 17); engine reports ${reported}`,
    ).toBeGreaterThanOrEqual(17);
  });
});
