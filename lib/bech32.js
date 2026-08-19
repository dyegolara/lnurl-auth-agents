'use strict';
// LNURL (lnurl1...) bech32 encode/decode.
// An lnurl1 string is: bech32(prefix="lnurl", words = toWords(utf8(url))).
// Decoding reverses this to recover the service URL.
const { bech32 } = require('./vendor/bech32.cjs');

const LIMIT = 5000; // lnurls can be longer than bech32's default 90-char limit

function decodeLnurl(str) {
  let s = String(str || '').trim();
  if (!/^lnurl1/i.test(s)) {
    throw new Error('Not an lnurl1 string (must start with "lnurl1")');
  }
  // bech32 is case-insensitive; normalise to lowercase before decoding.
  const decoded = bech32.decode(s.toLowerCase(), LIMIT);
  if (decoded.prefix !== 'lnurl') {
    throw new Error(`Invalid lnurl prefix: "${decoded.prefix}"`);
  }
  const bytes = bech32.fromWords(decoded.words);
  return Buffer.from(bytes).toString('utf8');
}

function encodeLnurl(url) {
  const bytes = Buffer.from(String(url), 'utf8');
  const words = bech32.toWords(bytes);
  return bech32.encode('lnurl', words, LIMIT);
}

module.exports = { decodeLnurl, encodeLnurl };
