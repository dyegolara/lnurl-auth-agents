import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { encode, decode } from '../lib/der';
import { genPrivateKey, signCompact } from '../lib/secp';

function randomCompact() {
  const priv = genPrivateKey();
  const k1 = crypto.randomBytes(32);
  return signCompact(k1, priv);
}

describe('DER', () => {
  it('encode: valid 64-byte compact -> DER', () => {
    const compact = randomCompact();
    const der = encode(compact);
    expect(der[0]).toBe(0x30);
    expect(der.length).toBeGreaterThanOrEqual(8);
    expect(der.length).toBeLessThanOrEqual(72);
  });

  it('encode: rejects 63-byte input', () => {
    expect(() => encode(new Uint8Array(63))).toThrow(/must be 64 bytes/);
  });

  it('encode: rejects 65-byte input', () => {
    expect(() => encode(new Uint8Array(65))).toThrow(/must be 64 bytes/);
  });

  it('encode: rejects 0-byte input', () => {
    expect(() => encode(new Uint8Array(0))).toThrow(/must be 64 bytes/);
  });

  it('encode: rejects empty array', () => {
    expect(() => encode(new Uint8Array())).toThrow(/must be 64 bytes/);
  });

  it('encode: all-zero signature produces valid DER', () => {
    const der = encode(new Uint8Array(64));
    expect(der[0]).toBe(0x30);
    const back = decode(der);
    expect(back).toHaveLength(64);
    expect(Buffer.compare(Buffer.from(back), Buffer.alloc(64, 0))).toBe(0);
  });

  it('encode: all-0xFF signature with high bits set', () => {
    const compact = new Uint8Array(64);
    compact.fill(0xFF);
    const der = encode(compact);
    expect(der[0]).toBe(0x30);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('encode: r with high bit set prepends 0x00', () => {
    const compact = new Uint8Array(64);
    compact[0] = 0x80;
    const der = encode(compact);
    const back = decode(der);
    expect(back[0]).toBe(0x80);
    expect(back[1]).toBe(0x00);
  });

  it('encode: r with leading zeros strips them', () => {
    const compact = new Uint8Array(64);
    compact[0] = 0x00;
    compact[1] = 0x00;
    compact[2] = 0x7F;
    const der = encode(compact);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('encode: r = 0x01 (smallest positive) single-byte INTEGER', () => {
    const compact = new Uint8Array(64);
    compact[31] = 0x01;
    const der = encode(compact);
    expect(der.length).toBeLessThanOrEqual(72);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('decode: valid DER roundtrip (5 iterations)', () => {
    for (let i = 0; i < 5; i++) {
      const compact = randomCompact();
      const der = encode(compact);
      const back = decode(der);
      expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
    }
  });

  it('decode: rejects empty buffer', () => {
    expect(() => decode(new Uint8Array(0))).toThrow(/expected SEQUENCE/);
  });

  it('decode: rejects wrong tag (not 0x30 SEQUENCE)', () => {
    expect(() => decode(new Uint8Array([0x31, 0x01, 0x00]))).toThrow(/expected SEQUENCE/);
  });

  it('decode: rejects missing r INTEGER tag', () => {
    expect(() => decode(new Uint8Array([0x30, 0x06, 0x03, 0x01, 0x00, 0x02, 0x01, 0x00]))).toThrow(/expected INTEGER \(r\)/);
  });

  it('decode: rejects missing s INTEGER tag', () => {
    expect(() => decode(new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x00, 0x03, 0x01, 0x00]))).toThrow(/expected INTEGER \(s\)/);
  });

  it('decode: truncated DER (SEQUENCE tag only)', () => {
    expect(() => decode(new Uint8Array([0x30]))).toThrow(/DER/);
  });

  it('decode: truncated DER (SEQUENCE + empty body)', () => {
    expect(() => decode(new Uint8Array([0x30, 0x00]))).toThrow(/DER/);
  });

  it('decode: truncated DER (missing s)', () => {
    const compact = new Uint8Array(64);
    compact[0] = 0x80;
    const der = encode(compact);
    const truncated = der.slice(0, der.length - 20);
    expect(() => decode(truncated)).toThrow(/DER/);
  });

  it('decode: rejects long-form length', () => {
    expect(() => decode(new Uint8Array([0x30, 0x81, 0x44, 0x02, 0x20]))).toThrow(/long-form length not supported/);
  });

  it('decode: strips single leading 0x00 sign byte', () => {
    const compact = new Uint8Array(64);
    compact[0] = 0x80;
    const der = encode(compact);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('decode: extra trailing bytes after SEQUENCE still decodes', () => {
    const compact = new Uint8Array(64);
    const der = encode(compact);
    const derWithExtra = new Uint8Array(der.length + 2);
    derWithExtra.set(der);
    derWithExtra[der.length] = 0xFF;
    derWithExtra[der.length + 1] = 0xFF;
    const back = decode(derWithExtra);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('decode: rejects r > 32 bytes after stripping sign', () => {
    const buf = new Uint8Array([
      0x30, 0x46,
      0x02, 0x22,
      0x00,
      0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00,
      0x02, 0x20,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x01,
    ]);
    expect(() => decode(buf)).toThrow(/too large/);
  });

  it('decode: output always 64 bytes', () => {
    for (let i = 0; i < 10; i++) {
      const compact = randomCompact();
      const der = encode(compact);
      const back = decode(der);
      expect(back).toHaveLength(64);
    }
  });

  it('encode: works with Buffer input', () => {
    const compact = randomCompact();
    const buf = Buffer.from(compact);
    const der = encode(buf);
    expect(der[0]).toBe(0x30);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });
});