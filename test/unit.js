'use strict';
// Unit tests for lnurl-auth. Offline, cost-free, no Lightning node.
// Covers: bech32 roundtrip (+ canonical LUD-01 vector), DER encode/decode,
// deterministic per-domain HMAC linking-key derivation, and the official
// LUD-04 signature vector (sign/verify).
const assert = require('assert');
const crypto = require('crypto');
const { decodeLnurl, encodeLnurl } = require('../lib/bech32');
const { encode, decode } = require('../lib/der');
const { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey } = require('../lib/secp');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  PASS:', name); }
  catch (e) { failed++; console.log('  FAIL:', name, '->', e.message); }
}

// 1. bech32 roundtrip (random URL)
check('bech32 roundtrip (url)', () => {
  const url = 'https://auth.example.com/lnurl?tag=login&k1=deadbeef&action=login';
  const enc = encodeLnurl(url);
  assert.ok(/^lnurl1/i.test(enc), 'encoded should start with lnurl1');
  assert.strictEqual(decodeLnurl(enc), url, 'decode must equal original');
});

// 2. canonical LUD-01 bech32 vector (official; spec shows it UPPERCASE)
check('bech32 official LUD-01 vector', () => {
  const lnurl = 'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
  const expected = 'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';
  assert.strictEqual(decodeLnurl(lnurl), expected);
});

// 3. DER encode/decode roundtrip (random compact sig)
check('DER encode/decode roundtrip', () => {
  const priv = genPrivateKey();
  const k1 = crypto.randomBytes(32);
  const compact = signCompact(k1, priv);
  assert.strictEqual(compact.length, 64);
  const der = encode(compact);
  assert.strictEqual(der[0], 0x30, 'DER must start with SEQUENCE');
  const back = decode(der);
  assert.strictEqual(back.length, 64);
  assert.ok(Buffer.compare(Buffer.from(back), Buffer.from(compact)) === 0, 'roundtrip lossless');
});

// 4. official LUD-04 signature vector (verify only)
check('LUD-04 official signature vector (verify)', () => {
  const k1 = Buffer.from('e2af6254a8df433264fa23f67eb8188635d15ce883e8fc020989d5f82ae6f11e', 'hex');
  const pub = Buffer.from('02c3b844b8104f0c1b15c507774c9ba7fc609f58f343b9b149122e944dd20c9362', 'hex');
  const derHex = '304402203767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc5102205821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d';
  const compact = decode(Buffer.from(derHex, 'hex'));
  assert.strictEqual(compact.length, 64, 'compact must be 64 bytes');
  assert.strictEqual(verifyCompact(k1, compact, pub), true, 'official vector must verify');
});

// 4b. tampered k1 must NOT verify against the official vector
check('LUD-04 official vector fails on tampered k1', () => {
  const k1 = Buffer.from('e2af6254a8df433264fa23f67eb8188635d15ce883e8fc020989d5f82ae6f11f', 'hex'); // last nibble flipped
  const pub = Buffer.from('02c3b844b8104f0c1b15c507774c9ba7fc609f58f343b9b149122e944dd20c9362', 'hex');
  const derHex = '304402203767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc5102205821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d';
  const compact = decode(Buffer.from(derHex, 'hex'));
  assert.strictEqual(verifyCompact(k1, compact, pub), false);
});

// 5. sign -> DER -> verify roundtrip with a fresh key
check('sign -> DER -> verify roundtrip', () => {
  const priv = genPrivateKey();
  const pub = getPublicKey(priv, true);
  const k1 = crypto.randomBytes(32);
  const compact = signCompact(k1, priv);
  const der = encode(compact);
  const back = decode(der);
  assert.strictEqual(verifyCompact(k1, back, pub), true);
  const other = getPublicKey(genPrivateKey(), true);
  assert.strictEqual(verifyCompact(k1, back, other), false, 'wrong pub must fail');
});

// 6. per-domain deterministic HMAC linking-key derivation
check('per-domain key derivation deterministic + isolated', () => {
  const master = genPrivateKey();
  const a1 = deriveLinkingKey(master, 'site-a.com');
  const a2 = deriveLinkingKey(master, 'site-a.com');
  const b1 = deriveLinkingKey(master, 'site-b.com');
  assert.strictEqual(Buffer.compare(Buffer.from(a1), Buffer.from(a2)), 0, 'same domain -> same key');
  assert.notStrictEqual(Buffer.compare(Buffer.from(a1), Buffer.from(b1)), 0, 'diff domain -> diff key');
  assert.strictEqual(a1.length, 32, 'linking key is 32 bytes');
});

// 7. compressed pubkey is 33 bytes
check('compressed pubkey is 33 bytes', () => {
  const priv = genPrivateKey();
  assert.strictEqual(getPublicKey(priv, true).length, 33);
});

console.log(`\n==== unit tests: ${passed} passed, ${failed} failed ====`);
process.exit(failed === 0 ? 0 : 1);
