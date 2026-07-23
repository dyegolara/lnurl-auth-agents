import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey, randomBytes, secp } from '../lib/secp';

describe('secp', () => {
  it('genPrivateKey: returns Uint8Array of 32 bytes', () => {
    const key = genPrivateKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key).toHaveLength(32);
  });

  it('genPrivateKey: consecutive calls differ', () => {
    const a = genPrivateKey();
    const b = genPrivateKey();
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  it('genPrivateKey: result is valid (produces valid pubkey)', () => {
    for (let i = 0; i < 5; i++) {
      const key = genPrivateKey();
      const pub = getPublicKey(key, true);
      expect(pub).toHaveLength(33);
    }
  });

  it('getPublicKey: compressed = 33 bytes', () => {
    const pub = getPublicKey(genPrivateKey(), true);
    expect(pub).toHaveLength(33);
    expect([0x02, 0x03]).toContain(pub[0]);
  });

  it('getPublicKey: uncompressed = 65 bytes', () => {
    const pub = getPublicKey(genPrivateKey(), false);
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(0x04);
  });

  it('signCompact: returns 64 bytes', () => {
    const priv = genPrivateKey();
    const k1 = crypto.randomBytes(32);
    expect(signCompact(k1, priv)).toHaveLength(64);
  });

  it('signCompact: non-32-byte k1 is accepted by noble', () => {
    const priv = genPrivateKey();
    expect(signCompact(new Uint8Array(16), priv)).toHaveLength(64);
    expect(signCompact(new Uint8Array(64), priv)).toHaveLength(64);
  });

  it('sign -> verify roundtrip (5 iterations)', () => {
    for (let i = 0; i < 5; i++) {
      const priv = genPrivateKey();
      const pub = getPublicKey(priv, true);
      const k1 = crypto.randomBytes(32);
      const sig = signCompact(k1, priv);
      expect(verifyCompact(k1, sig, pub)).toBe(true);
    }
  });

  it('verifyCompact: tampered k1 fails', () => {
    const priv = genPrivateKey();
    const pub = getPublicKey(priv, true);
    const k1 = crypto.randomBytes(32);
    const sig = signCompact(k1, priv);
    const tampered = Buffer.from(k1);
    tampered[0] ^= 1;
    expect(verifyCompact(tampered, sig, pub)).toBe(false);
  });

  it('verifyCompact: tampered signature fails', () => {
    const priv = genPrivateKey();
    const pub = getPublicKey(priv, true);
    const k1 = crypto.randomBytes(32);
    const sig = signCompact(k1, priv);
    const tampered = new Uint8Array(sig);
    tampered[10] ^= 1;
    expect(verifyCompact(k1, tampered, pub)).toBe(false);
  });

  it('verifyCompact: wrong pubkey fails', () => {
    const priv = genPrivateKey();
    const wrongPub = getPublicKey(genPrivateKey(), true);
    const k1 = crypto.randomBytes(32);
    const sig = signCompact(k1, priv);
    expect(verifyCompact(k1, sig, wrongPub)).toBe(false);
  });

  it('verifyCompact: cross-key verification fails', () => {
    const privA = genPrivateKey();
    const privB = genPrivateKey();
    const pubB = getPublicKey(privB, true);
    const k1 = crypto.randomBytes(32);
    const sig = signCompact(k1, privA);
    expect(verifyCompact(k1, sig, pubB)).toBe(false);
  });

  it('verifyCompact: rejects wrong-size pubkey', () => {
    const priv = genPrivateKey();
    const k1 = crypto.randomBytes(32);
    const sig = signCompact(k1, priv);
    expect(verifyCompact(k1, sig, new Uint8Array(32))).toBe(false);
    expect(verifyCompact(k1, sig, new Uint8Array(65))).toBe(false);
  });

  it('verifyCompact: handles invalid inputs gracefully', () => {
    const pub = getPublicKey(genPrivateKey(), true);
    const k1 = crypto.randomBytes(32);
    let r;
    try { r = verifyCompact(k1, new Uint8Array(64), pub); } catch (e) { r = false; }
    expect(r).toBe(false);
    try { r = verifyCompact(k1, new Uint8Array(32), pub); } catch (e) { r = false; }
    expect(r).toBe(false);
  });

  it('deriveLinkingKey: deterministic for same domain', () => {
    const master = genPrivateKey();
    const a1 = deriveLinkingKey(master, 'example.com');
    const a2 = deriveLinkingKey(master, 'example.com');
    expect(Buffer.compare(Buffer.from(a1), Buffer.from(a2))).toBe(0);
  });

  it('deriveLinkingKey: different domains produce different keys', () => {
    const master = genPrivateKey();
    const a = deriveLinkingKey(master, 'site-a.com');
    const b = deriveLinkingKey(master, 'site-b.com');
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  it('deriveLinkingKey: different masters produce different keys', () => {
    const masterA = genPrivateKey();
    const masterB = genPrivateKey();
    const a = deriveLinkingKey(masterA, 'example.com');
    const b = deriveLinkingKey(masterB, 'example.com');
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
  });

  it('deriveLinkingKey: returns 32 bytes', () => {
    const master = genPrivateKey();
    expect(deriveLinkingKey(master, 'domain.com')).toHaveLength(32);
  });

  it('deriveLinkingKey: result is valid secp256k1 key', () => {
    for (let i = 0; i < 5; i++) {
      const master = genPrivateKey();
      const derived = deriveLinkingKey(master, 'test-' + i + '.com');
      expect(getPublicKey(derived, true)).toHaveLength(33);
    }
  });

  it('deriveLinkingKey: empty domain string', () => {
    const master = genPrivateKey();
    const derived = deriveLinkingKey(master, '');
    expect(derived).toHaveLength(32);
    expect(getPublicKey(derived, true)).toHaveLength(33);
  });

  it('deriveLinkingKey: very long domain', () => {
    const master = genPrivateKey();
    const longDomain = 'a'.repeat(1000) + '.example.com';
    const derived = deriveLinkingKey(master, longDomain);
    expect(derived).toHaveLength(32);
    expect(getPublicKey(derived, true)).toHaveLength(33);
  });

  it('deriveLinkingKey: domain with subdomain', () => {
    const master = genPrivateKey();
    expect(deriveLinkingKey(master, 'sub.domain.example.com')).toHaveLength(32);
  });

  it('deriveLinkingKey: case-sensitive (different case = different key)', () => {
    const master = genPrivateKey();
    const lower = deriveLinkingKey(master, 'example.com');
    const upper = deriveLinkingKey(master, 'EXAMPLE.COM');
    expect(Buffer.compare(Buffer.from(lower), Buffer.from(upper))).not.toBe(0);
  });

  it('deriveLinkingKey: all-zeros master produces valid key', () => {
    const master = new Uint8Array(32);
    const derived = deriveLinkingKey(master, 'example.com');
    expect(derived).toHaveLength(32);
    expect(getPublicKey(derived, true)).toHaveLength(33);
  });

  it('deriveLinkingKey: same IP domain produces same key', () => {
    const master = genPrivateKey();
    const ip4 = deriveLinkingKey(master, '127.0.0.1');
    const ip4again = deriveLinkingKey(master, '127.0.0.1');
    expect(Buffer.compare(Buffer.from(ip4), Buffer.from(ip4again))).toBe(0);
  });

  it('deriveLinkingKey: always produces valid key (< n)', () => {
    for (let i = 0; i < 20; i++) {
      const master = genPrivateKey();
      const derived = deriveLinkingKey(master, 'is-high-check-' + i + '.com');
      expect(getPublicKey(derived, true)).toHaveLength(33);
    }
  });

  it('randomBytes: returns Uint8Array of correct length', () => {
    expect(randomBytes(32)).toHaveLength(32);
  });

  it('randomBytes: returns different values', () => {
    const r1 = randomBytes(32);
    const r2 = randomBytes(32);
    expect(Buffer.compare(Buffer.from(r1), Buffer.from(r2))).not.toBe(0);
  });

  it('randomBytes: zero-length returns empty', () => {
    expect(randomBytes(0)).toHaveLength(0);
  });

  it('randomBytes: large allocation', () => {
    expect(randomBytes(1024)).toHaveLength(1024);
  });

  it('sha256 hasher: known test vector', () => {
    const msg = new Uint8Array(Buffer.from('abc', 'utf8'));
    const hash = secp.hashes.sha256(msg);
    expect(Buffer.from(hash).toString('hex')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hmacSha256 hasher: known test vector', () => {
    const key = new Uint8Array(Buffer.from('key', 'utf8'));
    const msg = new Uint8Array(Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8'));
    const hash = secp.hashes.hmacSha256(key, msg);
    expect(Buffer.from(hash).toString('hex')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('hmacSha256 hasher: supports multiple messages', () => {
    const key = new Uint8Array(32);
    const msg1 = new Uint8Array(Buffer.from('hello', 'utf8'));
    const msg2 = new Uint8Array(Buffer.from('world', 'utf8'));
    const h1 = secp.hashes.hmacSha256(key, msg1, msg2);
    const combined = new Uint8Array(msg1.length + msg2.length);
    combined.set(msg1);
    combined.set(msg2, msg1.length);
    const h2 = secp.hashes.hmacSha256(key, combined);
    expect(Buffer.compare(Buffer.from(h1), Buffer.from(h2))).toBe(0);
  });
});