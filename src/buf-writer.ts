/**
 * A growable output buffer for encoding.
 *
 * The encoder writes a whole CBOR tree into a single `BufWriter` rather than
 * allocating a fresh `Uint8Array` per node and concatenating them (which
 * re-copies every subtree at every level): one buffer, geometric growth, one
 * final right-sized copy.
 *
 * @module buf-writer
 */

export class BufWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initialCapacity = 64) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  /** Number of bytes written so far. */
  get length(): number {
    return this.pos;
  }

  /** Grow the backing store so at least `extra` more bytes fit. */
  private ensure(extra: number): void {
    const needed = this.pos + extra;
    if (needed <= this.buf.length) return;
    let capacity = this.buf.length * 2;
    while (capacity < needed) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  writeByte(byte: number): void {
    this.ensure(1);
    this.buf[this.pos] = byte;
    this.pos += 1;
  }

  writeUint16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, value, false);
    this.pos += 2;
  }

  writeUint32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, value, false);
    this.pos += 4;
  }

  writeBigUint64(value: bigint): void {
    this.ensure(8);
    this.view.setBigUint64(this.pos, value, false);
    this.pos += 8;
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  /** Return the written region as a right-sized copy. */
  toBytes(): Uint8Array<ArrayBuffer> {
    return this.buf.slice(0, this.pos);
  }
}
