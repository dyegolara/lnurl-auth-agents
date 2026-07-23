import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { decodeLnurl, encodeLnurl } from '../lib/bech32';
import { encode, decode } from '../lib/der';
import { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey } from '../lib/secp';

describe('unit', () => {
  it('bech32 roundtrip (url)', () => {
    const url = 'https://auth.example.com/lnurl?tag=login&k1=deadbeef&action=login';
    const enc = encodeLnurl(url);
    expect(enc).toMatch(/^lnurl1/i);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('bech32 official LUD-01 vector', () => {
    const lnurl = 'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
    const expected = 'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';
    expect(decodeLnurl(lnurl)).toBe(expected);
  });

  it('DER encode/decode roundtrip', () => {
    const priv = genPrivateKey();
    const k1 = crypto.randomBytes(32);
    const compact = signCompact(k1, priv);
    expect(compact).toHaveLength(64);
    const der = encode(compact);
    expect(der[0]).toBe(0x30);
    const back = decode(der);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(compact))).toBe(0);
  });

  it('LUD-04 official signature vector (verify)', () => {
    const k1 = Buffer.from('e2af6254a8df433264fa23f67eb8188635d15ce883e8fc020989d5f82ae6f11e', 'hex');
    const pub = Buffer.from('02c3b844b8104f0c1b15c507774c9ba7fc609f58f343b9b149122e944dd20c9362', 'hex');
    const derHex = '304402203767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc5102205821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d';
    const compact = decode(Buffer.from(derHex, 'hex'));
    expect(compact).toHaveLength(64);
    expect(verifyCompact(k1, compact, pub)).toBe(true);
  });

  it('LUD-04 official vector fails on tampered k1', () => {
    const k1 = Buffer.from('e2af6254a8df433264fa23f67eb8188635d15ce883e8fc020989d5f82ae6f11f', 'hex');
    const pub = Buffer.from('02c3b844b8104f0c1b15c507774c9ba7fc609f58f343b9b149122e944dd20c9362', 'hex');
    const derHex = '304402203767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc5102205821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d';
    const compact = decode(Buffer.from(derHex, 'hex'));
    expect(verifyCompact(k1, compact, pub)).toBe(false);
  });

  it('sign -> DER -> verify roundtrip', () => {
    const priv = genPrivateKey();
    const pub = getPublicKey(priv, true);
    const k1 = crypto.randomBytes(32);
    const compact = signCompact(k1, priv);
    const der = encode(compact);
    const back = decode(der);
    expect(verifyCompact(k1, back, pub)).toBe(true);
    const other = getPublicKey(genPrivateKey(), true);
    expect(verifyCompact(k1, back, other)).toBe(false);
  });

  it('per-domain key derivation deterministic + isolated', () => {
    const master = genPrivateKey();
    const a1 = deriveLinkingKey(master, 'site-a.com');
    const a2 = deriveLinkingKey(master, 'site-a.com');
    const b1 = deriveLinkingKey(master, 'site-b.com');
    expect(Buffer.compare(Buffer.from(a1), Buffer.from(a2))).toBe(0);
    expect(Buffer.compare(Buffer.from(a1), Buffer.from(b1))).not.toBe(0);
    expect(a1).toHaveLength(32);
  });

  it('compressed pubkey is 33 bytes', () => {
    const priv = genPrivateKey();
    expect(getPublicKey(priv, true)).toHaveLength(33);
  });
});