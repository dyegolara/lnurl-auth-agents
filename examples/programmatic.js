'use strict';
// Example: use the lnurl-auth library functions directly from your own code.
//
// This shows the building blocks (no CLI, no spawn). All crypto is local;
// the only network call is the final POST to the service callback.

const { decodeLnurl } = require('../lib/bech32');
const { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey } = require('../lib/secp');
const { encode, decode } = require('../lib/der');
const crypto = require('crypto');

// 1) Decode an lnurl1... into the service URL.
const lnurl = process.argv[2];
if (!lnurl) { console.error('Usage: node programmatic.js "<lnurl1...>"'); process.exit(2); }
const serviceUrl = decodeLnurl(lnurl);
console.log('service URL:', serviceUrl);

const domain = new URL(serviceUrl).hostname;

// 2) Derive a per-domain linking key from a (here random) master secret.
const master = genPrivateKey();                 // in real use: load from keyfile
const linkingPriv = deriveLinkingKey(master, domain);
const pub = getPublicKey(linkingPriv, true);     // 33-byte compressed pubkey

// 3) Extract k1 (challenge) from the URL and sign it (raw 32 bytes, prehash=false).
const k1 = new URL(serviceUrl).searchParams.get('k1');
const k1Bytes = Buffer.from(k1, 'hex');
const compactSig = signCompact(k1Bytes, linkingPriv);

// Self-verify before sending.
const ok = verifyCompact(k1Bytes, compactSig, pub);
console.log('self-verify  :', ok);

const derSigHex = Buffer.from(encode(compactSig)).toString('hex');

console.log('linking pubkey:', Buffer.from(pub).toString('hex'));
console.log('DER sig hex   :', derSigHex);

// 4) Decode the DER sig back to verify our roundtrip is lossless.
const roundtrip = decode(Buffer.from(derSigHex, 'hex'));
console.log('roundtrip ok  :', Buffer.compare(roundtrip, compactSig) === 0);

// 5) Submit: POST to the service callback with JSON body { k1, sig, key }.
//    const submitUrl = serviceUrl.split('?')[0];
//    fetch(submitUrl, { method: 'POST', body: JSON.stringify({ k1, sig: derSigHex, key: pubHex }) });
//    (see handshake.js for the full httpPost implementation)