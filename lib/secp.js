'use strict';
// secp256k1 helpers for LNURL-auth (LUD-04).
// Important: LUD-04 signs the raw 32-byte `k1` challenge directly as the
// ECDSA digest. Noble v3 defaults to `prehash: true` (sha256 of the message),
// so we MUST pass `prehash: false` in both sign and verify.
const secp = require('@noble/secp256k1');
const { createHash, createHmac } = require('crypto');

// Wire Node's crypto into noble (required by noble v3).
secp.hashes.sha256 = (...msgs) => {
  const h = createHash('sha256');
  for (const m of msgs) h.update(m);
  return new Uint8Array(h.digest());
};
secp.hashes.hmacSha256 = (key, ...msgs) => {
  const h = createHmac('sha256', Buffer.from(key));
  for (const m of msgs) h.update(m);
  return new Uint8Array(h.digest());
};

const N = secp.CURVE ? secp.CURVE.n : undefined; // not used directly; helper below

function randomBytes(n) {
  const { webcrypto } = require('crypto');
  const a = new Uint8Array(n);
  webcrypto.getRandomValues(a);
  return a;
}

function genPrivateKey() {
  // noble guarantees a valid key (it re-rolls if >= n).
  return secp.utils.randomSecretKey();
}

function getPublicKey(priv, compressed = true) {
  return secp.getPublicKey(priv, compressed); // 33 bytes compressed, 65 uncompressed
}

// Sign the raw 32-byte k1 with priv. Returns 64-byte compact (r||s), low-s.
function signCompact(k1Bytes, priv) {
  const sig = secp.sign(k1Bytes, priv, { prehash: false });
  // noble v3 returns a 64-byte Uint8Array (compact r||s) for the default format.
  return sig instanceof Uint8Array ? sig : sig.toBytes();
}

// Verify a 64-byte compact signature over the raw k1 with the given pubkey.
function verifyCompact(k1Bytes, compactSig, pub) {
  return secp.verify(compactSig, k1Bytes, pub, { prehash: false });
}

// --- LUD-04/05/13-flavoured linking-key derivation -------------------------
// Per-service deterministic key derived from a persisted master secret.
// linkingPriv = HMAC-SHA256(master, domain); reused for the same domain so the
// service recognises the returning user, but different domains get different
// keys (privacy). This mirrors the intent of LUD-05 (BIP32) / LUD-13
// (signMessage) without needing a BIP39 mnemonic or HD derivation.
function deriveLinkingKey(masterSecret, domain) {
  let candidate = secp.hashes.hmacSha256(masterSecret, new TextEncoder().encode(domain));
  // Extremely unlikely, but ensure validity (< curve order).
  // secp256k1 order n starts with 0xFFFFFFFF... so a 32-byte value is valid
  // unless it sits in the tiny window [n, 2^256). Re-hash to fix if needed.
  while (isHigh(candidate)) {
    candidate = secp.hashes.hmacSha256(candidate, new TextEncoder().encode(domain));
  }
  return candidate;
}

function isHigh(bytes) {
  // bytes: 32-byte big-endian. Return true if >= secp256k1 order n.
  const n = [
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xfe, 0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
    0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
  ];
  for (let i = 0; i < 32; i++) {
    if (bytes[i] < n[i]) return false;
    if (bytes[i] > n[i]) return true;
  }
  return true; // equal to n -> invalid
}

module.exports = {
  secp,
  genPrivateKey,
  getPublicKey,
  signCompact,
  verifyCompact,
  deriveLinkingKey,
  randomBytes,
};
