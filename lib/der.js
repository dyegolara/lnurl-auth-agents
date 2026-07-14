'use strict';
// Minimal DER (RFC 3279) encode/decode for ECDSA secp256k1 signatures.
// Noble v3 dropped DER support, but LUD-04 (LNURL-auth) requires the
// signature to be DER-hex encoded. So we wrap the 64-byte compact (r||s)
// signature in DER ourselves.

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// Encode a non-negative big-endian integer as a DER INTEGER (0x02 ...).
function derInteger(bytes) {
  // Drop leading zero bytes but keep at least one byte.
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  let v = bytes.slice(i);
  // If the high bit is set, prepend 0x00 so it stays a positive integer.
  if (v[0] & 0x80) v = concat(new Uint8Array([0x00]), v);
  return concat(new Uint8Array([0x02, v.length]), v);
}

// compact: Uint8Array(64) = r(32) || s(32)  ->  DER Uint8Array
function encode(compact) {
  if (compact.length !== 64) throw new Error('compact signature must be 64 bytes');
  const r = derInteger(compact.slice(0, 32));
  const s = derInteger(compact.slice(32, 64));
  const body = concat(r, s);
  return concat(new Uint8Array([0x30, body.length]), body);
}

function readLen(der, idx) {
  // Supports short form (<=127) which is always enough for 64-byte sigs.
  const len = der[idx];
  if (len & 0x80) throw new Error('DER long-form length not supported');
  return len;
}

// DER Uint8Array -> compact Uint8Array(64)
function decode(der) {
  if (!(der instanceof Uint8Array)) der = new Uint8Array(der);
  let idx = 0;
  if (der[idx++] !== 0x30) throw new Error('DER: expected SEQUENCE');
  const _seqLen = readLen(der, idx); idx++; // we do not strictly validate total length
  if (der[idx++] !== 0x02) throw new Error('DER: expected INTEGER (r)');
  let rlen = readLen(der, idx); idx++;
  let r = der.slice(idx, idx + rlen); idx += rlen;
  if (der[idx++] !== 0x02) throw new Error('DER: expected INTEGER (s)');
  let slen = readLen(der, idx); idx++;
  let s = der.slice(idx, idx + slen); idx += slen;

  // Strip a single sign byte (0x00) if present.
  if (r.length > 1 && r[0] === 0x00) r = r.slice(1);
  if (s.length > 1 && s[0] === 0x00) s = s.slice(1);

  const pad = (x) => {
    if (x.length > 32) throw new Error('DER integer too large');
    if (x.length === 32) return x;
    const out = new Uint8Array(32);
    out.set(x, 32 - x.length);
    return out;
  };
  return concat(pad(r), pad(s));
}

module.exports = { encode, decode };
