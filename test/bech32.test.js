import { describe, it, expect } from 'vitest';
import { decodeLnurl, encodeLnurl } from '../lib/bech32';
import { bech32 } from 'bech32';

describe('bech32', () => {
  it('decodeLnurl: normal lnurl', () => {
    const url = 'https://auth.example.com/lnurl?tag=login&k1=deadbeef&action=login';
    const enc = encodeLnurl(url);
    expect(enc).toMatch(/^lnurl1/i);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('decodeLnurl: uppercase LNURL1', () => {
    const url = 'https://auth.example.com/lnurl?tag=login&k1=aaaa';
    const enc = encodeLnurl(url).toUpperCase();
    expect(enc).toMatch(/^LNURL1/);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('decodeLnurl: mixed-case lnUrl1...', () => {
    const url = 'https://auth.example.com/lnurl?tag=login&k1=bbbb';
    const enc = encodeLnurl(url);
    const mixed = 'lNuRl' + enc.slice(5);
    expect(decodeLnurl(mixed)).toBe(url);
  });

  it('decodeLnurl: rejects empty string', () => {
    expect(() => decodeLnurl('')).toThrow(/Not an lnurl1 string/);
  });

  it('decodeLnurl: rejects null/undefined', () => {
    expect(() => decodeLnurl(null)).toThrow(/Not an lnurl1 string/);
    expect(() => decodeLnurl(undefined)).toThrow(/Not an lnurl1 string/);
  });

  it('decodeLnurl: rejects non-lnurl string', () => {
    expect(() => decodeLnurl('https://example.com')).toThrow(/Not an lnurl1 string/);
    expect(() => decodeLnurl('bc1q...')).toThrow(/Not an lnurl1 string/);
  });

  it('decodeLnurl: rejects malformed bech32', () => {
    expect(() => decodeLnurl('lnurl1!!!!')).toThrow(/No character map|Data too short/);
    expect(() => decodeLnurl('lnurl1abc')).toThrow(/No character map|Data too short/);
  });

  it('decodeLnurl: trims whitespace', () => {
    const url = 'https://auth.example.com/lnurl?tag=login&k1=cccc';
    const enc = encodeLnurl(url);
    expect(decodeLnurl('  ' + enc + '\n  ')).toBe(url);
  });

  it('decodeLnurl: handles special characters in URL', () => {
    const url = 'https://auth.example.com/path%20with%20spaces?tag=login&k1=dddd&redirect=/foo%2Fbar';
    const enc = encodeLnurl(url);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('decodeLnurl: handles unicode in URL', () => {
    const url = 'https://auth.example.com/cb?tag=login&k1=eeee&name=caf%C3%A9';
    const enc = encodeLnurl(url);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('encodeLnurl: empty string produces valid lnurl', () => {
    const enc = encodeLnurl('');
    expect(enc).toMatch(/^lnurl1/i);
    expect(decodeLnurl(enc)).toBe('');
  });

  it('encodeLnurl: very long URL', () => {
    let longParam = '';
    for (let i = 0; i < 2800; i++) longParam += 'x';
    const url = 'https://auth.example.com/cb?tag=login&k1=ffff&data=' + longParam;
    const enc = encodeLnurl(url);
    expect(enc.length).toBeGreaterThan(1000);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('encode → decode roundtrip with random URL', () => {
    const url = 'https://login.bitsimp.com/api/auth?tag=login&k1=' + 'a'.repeat(64) + '&action=login';
    const enc = encodeLnurl(url);
    expect(decodeLnurl(enc)).toBe(url);
  });

  it('decodeLnurl: rejects valid bech32 with wrong hrp (bc1...)', () => {
    const bytes = Buffer.from('test', 'utf8');
    const words = bech32.toWords(bytes);
    const bc1 = bech32.encode('bc', words, 5000);
    expect(() => decodeLnurl(bc1)).toThrow(/Not an lnurl1 string/);
  });

  it('decodeLnurl: official LUD-01 vector', () => {
    const lnurl = 'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
    const expected = 'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';
    expect(decodeLnurl(lnurl)).toBe(expected);
  });
});