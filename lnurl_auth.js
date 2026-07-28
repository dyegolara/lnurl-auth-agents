#!/usr/bin/env node
'use strict';
// lnurl-auth — perform an LNURL-auth (LUD-04) login for an LLM agent.
//
// Flow (LUD-04):
//   1. decode `lnurl1...` (bech32) -> service URL, which contains `k1` (a
//      32-byte hex challenge) and optionally `action`.
//   2. sign sha256? NO: sign the raw 32-byte `k1` with a secp256k1 linking key
//      (DER-encoded ECDSA signature).
//   3. POST the service URL with JSON body { k1, sig, key } (and optionally t).
//   4. Server responds {"status":"OK"} or {"status":"ERROR","reason":...}.
//
// No Lightning node, no payment, no cost.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { decodeLnurl } = require('./lib/bech32');
const { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey, randomBytes } = require('./lib/secp');
const { encode, decode } = require('./lib/der');

const SKILL_DIR = __dirname;
const DEFAULT_KEYFILE = process.env.LNURL_AUTH_KEYFILE ||
  path.join(os.homedir(), '.config', 'lnurl-auth', 'master.key');

const ACTIONS = new Set(['register', 'login', 'link', 'auth']);
const VERSION = '1.2.0';
const USER_AGENT = `lnurl-auth/${VERSION} (+https://github.com/dyegolara/lnurl-auth-agents)`;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;

function log(...a) { if (!QUIET) console.error('[lnurl-auth]', ...a); }
let QUIET = false;

// ---------------------------------------------------------------------------
// Argument parsing (no external deps)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--lnurl': opts.lnurl = next(); break;
      case '--key': opts.key = next(); break;
      case '--keyfile': opts.keyfile = next(); break;
      case '--keyout': opts.keyout = next(); break;
      case '--generate': opts.generate = true; break;
      case '--single-key': opts.singleKey = true; break;
      case '--no-per-domain': opts.singleKey = true; break;
      case '--no-t': opts.noT = true; break;
      case '--action': opts.action = next(); break;
      case '--callback': opts.callback = next(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--json': opts.json = true; break;
      case '--timeout': opts.timeout = parseInt(next(), 10); break;
      case '-v': case '--verbose': opts.verbose = true; break;
      case '-q': case '--quiet': QUIET = true; opts.quiet = true; break;
      default:
        if (a.startsWith('--')) throw new Error('Unknown option: ' + a);
        opts.positional.push(a);
    }
  }
  return opts;
}

function usage() {
  return `lnurl-auth — LNURL-auth (LUD-04) signer for LLM agents

Usage:
  lnurl-auth [options] <lnurl1...>
  lnurl-auth --lnurl <lnurl1...> [options]

Options:
  --lnurl <str>          lnurl1... string (or pass it positionally)
  --key <hex>            private key (hex) to use directly as master secret
  --keyfile <path>       file containing hex private key (master secret)
  --keyout <path>        where to persist a generated key (default:
                         ~/.config/lnurl-auth/master.key)
  --generate             force-generate a new master key and persist it
  --single-key           use one key for all services (no per-domain derivation)
  --no-per-domain        alias of --single-key
  --no-t                 do not include "t" in the callback POST body
  --action <a>           assert/override action: register|login|link|auth
  --callback <url>       override the URL the signature is POSTed to
  --dry-run              decode, fetch k1, sign — but do NOT submit the callback
  --timeout <ms>         HTTP request timeout in ms (default: 15000)
  --json                 emit machine-readable JSON
  -v, --verbose          verbose logging
  -q, --quiet            suppress progress logs
  -h, --help             this help

Notes:
  - By default a 32-byte master secret is generated (once) and persisted;
    a per-service linking key is derived deterministically from it, so the
    same service always sees the same key but different services see
    different keys (privacy, per LUD-05/13 spirit). Use --single-key for one
    global linking key.
  - No Lightning node and no payment are involved. This is auth-only.
`;
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------
function hexToBytes(hex) {
  let h = String(hex).trim().replace(/^0x/, '');
  if (h.length % 2) throw new Error('Invalid hex: odd length (' + h.length + ' chars)');
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new Error('Invalid hex');
  return Buffer.from(h, 'hex');
}
function bytesToHex(b) { return Buffer.from(b).toString('hex'); }

function readKeyFile(p) {
  try { return hexToBytes(fs.readFileSync(p, 'utf8').trim()); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

// Resolve the master secret (32 bytes) used to derive the linking key.
function resolveMasterSecret(opts) {
  if (opts.key) return hexToBytes(opts.key);
  const keyfile = opts.keyfile || DEFAULT_KEYFILE;
  const existing = readKeyFile(keyfile);

  if (existing && !opts.generate) {
    if (existing.length !== 32) throw new Error('Key file must hold a 32-byte hex secret');
    return existing;
  }

  const master = genPrivateKey();
  const dir = path.dirname(keyfile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyfile, bytesToHex(master) + '\n', { mode: 0o600 });
  log(existing ? 'Overwrote existing key (--generate) ->' : 'Generated & persisted new master secret ->', keyfile);
  return master;
}

// Resolve the actual linking private key for a given service domain.
function resolveLinkingKey(opts, domain) {
  const master = resolveMasterSecret(opts);
  if (opts.singleKey) {
    if (master.length !== 32) throw new Error('--single-key requires a 32-byte key');
    return master;
  }
  return deriveLinkingKey(master, domain);
}

// ---------------------------------------------------------------------------
// HTTP Proxy support
// ---------------------------------------------------------------------------
function getProxyAgent(protocol) {
  const envVar = protocol === 'https:' ? 'HTTPS_PROXY' : 'HTTP_PROXY';
  const proxyUrl = process.env[envVar] || process.env[envVar.toLowerCase()];
  if (!proxyUrl) return undefined;

  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    try {
      const { HttpProxyAgent } = require('http-proxy-agent');
      return new HttpProxyAgent(proxyUrl);
    } catch (e2) {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP GET (http/https), returns {status, body}
// ---------------------------------------------------------------------------
function httpGet(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('Invalid URL: ' + urlStr)); }

    const lib = u.protocol === 'https:' ? https : http;
    const timeout = opts.timeout || DEFAULT_TIMEOUT;
    const redirectCount = opts._redirectCount || 0;
    const agent = opts.agent || getProxyAgent(u.protocol);

    if (redirectCount > MAX_REDIRECTS)
      return reject(new Error('Too many redirects (' + redirectCount + ')'));

    const reqOptions = { timeout, headers: { 'User-Agent': USER_AGENT } };
    if (agent) reqOptions.agent = agent;

    const req = lib.get(urlStr, reqOptions, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(httpGet(
          new URL(res.headers.location, urlStr).toString(),
          { ...opts, _redirectCount: redirectCount + 1, timeout, agent }
        ));
      }

      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out after ' + timeout + 'ms')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// HTTP POST with JSON body, returns {status, body}
// ---------------------------------------------------------------------------
function httpPost(urlStr, body, opts = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('Invalid URL: ' + urlStr)); }

    const lib = u.protocol === 'https:' ? https : http;
    const timeout = opts.timeout || DEFAULT_TIMEOUT;
    const redirectCount = opts._redirectCount || 0;
    const agent = opts.agent || getProxyAgent(u.protocol);

    if (redirectCount > MAX_REDIRECTS)
      return reject(new Error('Too many redirects (' + redirectCount + ')'));

    const jsonBody = JSON.stringify(body);

    const reqOptions = {
      method: 'POST',
      timeout,
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody),
      },
    };
    if (agent) reqOptions.agent = agent;

    const req = lib.request(urlStr, reqOptions, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(httpPost(
          new URL(res.headers.location, urlStr).toString(),
          body,
          { ...opts, _redirectCount: redirectCount + 1, timeout, agent }
        ));
      }

      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out after ' + timeout + 'ms')));
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exit(2); }

  if (opts.help) { console.log(usage()); process.exit(0); }

  const lnurl = opts.lnurl || opts.positional[0];
  if (!lnurl) { console.error('Error: no lnurl provided.\n'); console.error(usage()); process.exit(2); }

  if (opts.timeout !== undefined && (isNaN(opts.timeout) || opts.timeout <= 0)) {
    console.error('Error: --timeout must be a positive number (ms)'); process.exit(2);
  }
  const timeout = opts.timeout || DEFAULT_TIMEOUT;

  // 1) Decode lnurl -> service URL
  let serviceUrl;
  try { serviceUrl = decodeLnurl(lnurl); }
  catch (e) { console.error('Failed to decode lnurl:', e.message); process.exit(1); }
  log('Decoded service URL:', serviceUrl);

  const parsed = new URL(serviceUrl);
  const domain = parsed.hostname;

  // 2) Obtain k1 (challenge). Prefer k1 in the URL; else GET to fetch it.
  let k1 = parsed.searchParams.get('k1');
  let action = parsed.searchParams.get('action') || undefined;
  let fetchedJson = null;
  if (!k1) {
    log('No k1 in URL; performing GET to fetch challenge...');
    const r = await httpGet(serviceUrl, { timeout });
    if (r.status !== 200) throw new Error('Challenge GET failed: HTTP ' + r.status);
    try { fetchedJson = JSON.parse(r.body); } catch (e) { throw new Error('Challenge response not JSON'); }
    k1 = fetchedJson && fetchedJson.k1;
    if (!k1) throw new Error('No k1 in URL or challenge response');
    if (fetchedJson.action) action = fetchedJson.action;
    // Some services return a separate submission callback.
    if (fetchedJson.callback || fetchedJson.url) {
      opts.callback = opts.callback || (fetchedJson.callback || fetchedJson.url);
    }
  }

  // Validate k1: must be exactly 64 hex chars (32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(k1))
    throw new Error('k1 must be 64 hex chars (32 bytes), got ' + (k1 ? k1.length + ' chars' : 'none'));

  let k1Bytes;
  try { k1Bytes = hexToBytes(k1); } catch (e) { throw new Error('k1 is not valid hex: ' + e.message); }
  if (k1Bytes.length !== 32) throw new Error('k1 must be 32 bytes (64 hex chars), got ' + k1Bytes.length);

  if (opts.action) {
    if (!ACTIONS.has(opts.action)) throw new Error('Invalid action: ' + opts.action);
    action = opts.action;
  }

  // 3) Resolve linking key for this domain and sign.
  const linkingPriv = resolveLinkingKey(opts, domain);
  const pubBytes = getPublicKey(linkingPriv, true); // compressed 33 bytes
  const compactSig = signCompact(k1Bytes, linkingPriv);

  // Self-verify the signature before exposing it to the server.
  const verified = verifyCompact(k1Bytes, compactSig, pubBytes);
  if (!verified) throw new Error('Self-verification failed: signature does not verify against own pubkey');

  const derSig = encode(compactSig);
  const sigHex = bytesToHex(derSig);
  const keyHex = bytesToHex(pubBytes);
  log('Linking pubkey:', keyHex);
  log('Action:', action || '(none)');

  // 4) Build submission URL (base URL without query params for POST) and body.
  const rawCallbackUrl = opts.callback || serviceUrl;
  // Strip query params from the callback URL — POST sends data in the body.
  const callbackBase = rawCallbackUrl.split('?')[0];
  const postBody = { k1, sig: sigHex, key: keyHex };
  if (action && !opts.noT) postBody.t = action;

  if (opts.json) {
    console.log(JSON.stringify({
      serviceUrl, domain, k1, action: action || null,
      linkingPubkey: keyHex, callbackUrl: callbackBase, method: 'POST',
      dryRun: !!opts.dryRun,
    }, null, 2));
  } else {
    log('Callback URL:', callbackBase);
  }

  if (opts.dryRun) {
    log('Dry-run: not submitting the callback.');
    if (!opts.json) console.log('OK (dry-run)');
    process.exit(0);
  }

  // 5) Submit the callback via POST and report the server response.
  log('Submitting signature to service...');
  const resp = await httpPost(callbackBase, postBody, { timeout });
  let json = null;
  try { json = JSON.parse(resp.body); } catch (e) { /* non-JSON */ }

  if (opts.json) {
    console.log(JSON.stringify({ httpStatus: resp.status, response: json || resp.body }, null, 2));
  } else {
    console.log('HTTP', resp.status);
    console.log(json ? JSON.stringify(json, null, 2) : resp.body);
  }

  if (json && json.status === 'OK') { process.exit(0); }
  if (json && json.status === 'ERROR') { process.exit(3); }
  process.exit(resp.status === 200 ? 0 : 4);
}

main().catch((e) => {
  console.error('lnurl-auth error:', e.message);
  process.exit(1);
});