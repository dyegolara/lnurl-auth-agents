'use strict';
// Programmatic LNURL-auth handshake — reusable library entry point.
// Mirrors the logic in lnurl_auth.js but exports functions for use in other
// modules (e.g. MCP server, tests).

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { decodeLnurl } = require('./bech32');
const { genPrivateKey, getPublicKey, signCompact, verifyCompact, deriveLinkingKey, randomBytes } = require('./secp');
const { encode, decode } = require('./der');

const DEFAULT_KEYFILE = process.env.LNURL_AUTH_KEYFILE ||
  path.join(os.homedir(), '.config', 'lnurl-auth', 'master.key');

const ACTIONS = new Set(['register', 'login', 'link', 'auth']);
const VERSION = '1.3.0';
const USER_AGENT = `lnurl-auth/${VERSION} (+https://github.com/dyegolara/lnurl-auth-agents)`;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 15000;

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
  return master;
}

function resolveLinkingKey(opts, domain) {
  const master = resolveMasterSecret(opts);
  if (opts.singleKey) {
    if (master.length !== 32) throw new Error('--single-key requires a 32-byte key');
    return master;
  }
  return deriveLinkingKey(master, domain);
}

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
          { ...opts, _redirectCount: redirectCount + 1, timeout }
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

async function performHandshake(lnurl, opts = {}) {
  const result = {};
  const timeout = opts.timeout || DEFAULT_TIMEOUT;

  // 1) Decode lnurl -> service URL
  const serviceUrl = decodeLnurl(lnurl);
  result.serviceUrl = serviceUrl;

  const parsed = new URL(serviceUrl);
  const domain = parsed.hostname;
  result.domain = domain;

  // 2) Obtain k1 (challenge)
  let k1 = parsed.searchParams.get('k1');
  let action = parsed.searchParams.get('action') || undefined;
  let fetchedJson = null;
  if (!k1) {
    const r = await httpGet(serviceUrl, { timeout });
    if (r.status !== 200) throw new Error('Challenge GET failed: HTTP ' + r.status);
    try { fetchedJson = JSON.parse(r.body); } catch (e) { throw new Error('Challenge response not JSON'); }
    k1 = fetchedJson && fetchedJson.k1;
    if (!k1) throw new Error('No k1 in URL or challenge response');
    if (fetchedJson.action) action = fetchedJson.action;
    if (fetchedJson.callback || fetchedJson.url) {
      opts.callback = opts.callback || (fetchedJson.callback || fetchedJson.url);
    }
  }

  if (!/^[0-9a-fA-F]{64}$/.test(k1))
    throw new Error('k1 must be 64 hex chars (32 bytes), got ' + (k1 ? k1.length + ' chars' : 'none'));

  let k1Bytes;
  try { k1Bytes = hexToBytes(k1); } catch (e) { throw new Error('k1 is not valid hex: ' + e.message); }
  if (k1Bytes.length !== 32) throw new Error('k1 must be 32 bytes (64 hex chars), got ' + k1Bytes.length);
  result.k1 = k1;

  if (opts.action) {
    if (!ACTIONS.has(opts.action)) throw new Error('Invalid action: ' + opts.action);
    action = opts.action;
  }
  result.action = action || null;

  // 3) Resolve linking key and sign
  const linkingPriv = resolveLinkingKey(opts, domain);
  const pubBytes = getPublicKey(linkingPriv, true);
  const compactSig = signCompact(k1Bytes, linkingPriv);

  const verified = verifyCompact(k1Bytes, compactSig, pubBytes);
  if (!verified) throw new Error('Self-verification failed: signature does not verify against own pubkey');

  const derSig = encode(compactSig);
  const sigHex = bytesToHex(derSig);
  const keyHex = bytesToHex(pubBytes);
  result.linkingPubkey = keyHex;

  // 4) Build GET callback URL per LUD-04: preserve existing query params, append sig and key.
  const rawCallbackUrl = opts.callback || serviceUrl;
  const callbackUrlObj = new URL(rawCallbackUrl);
  if (!callbackUrlObj.searchParams.has('k1')) callbackUrlObj.searchParams.set('k1', k1);
  callbackUrlObj.searchParams.delete('sig');
  callbackUrlObj.searchParams.delete('key');
  callbackUrlObj.searchParams.set('sig', sigHex);
  callbackUrlObj.searchParams.set('key', keyHex);
  const callbackBase = callbackUrlObj.toString();
  result.callbackUrl = callbackBase;

  if (opts.dryRun) {
    result.dryRun = true;
    return result;
  }

  // 5) Submit via GET per LUD-04
  const resp = await httpGet(callbackBase, { timeout });
  let json = null;
  try { json = JSON.parse(resp.body); } catch (e) { /* non-JSON */ }
  result.httpStatus = resp.status;
  result.response = json || resp.body;

  if (json && json.status === 'OK') result.ok = true;
  else if (json && json.status === 'ERROR') result.ok = false;
  else result.ok = resp.status === 200;

  return result;
}

module.exports = { performHandshake };
