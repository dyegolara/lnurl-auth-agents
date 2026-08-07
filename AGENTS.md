# AGENTS.md — lnurl-auth for LLM coding agents

## What this tool does

`lnurl_auth.js` performs an LNURL-auth (LUD-04) cryptographic handshake. It
takes an `lnurl1...` string from a "Sign in with Lightning" button/QR, signs
the challenge, and submits the signature to the service — entirely without a
Lightning node, wallet, or payment.

## When to run it

Run this tool whenever:

- A website presents a "Sign in with Lightning" / "LNURL-auth" button or QR code
- You have an `lnurl1...` string (from a link, QR decode, or HTML attribute)
- The task requires authentication to a Lightning-enabled service

**Do NOT run** if the task requires actual Lightning payments, invoices, or
a wallet. This is authentication only.

## Quick invocation

```bash
node <path_to_skill>/lnurl_auth.js --lnurl "<lnurl1...>"
```

Or pass the lnurl positionally:

```bash
node <path_to_skill>/lnurl_auth.js "<lnurl1...>"
```

## Recommended workflow

### 1. Extract the lnurl from the page

When interacting with a web page, look for:

- An `<a>` tag with `href="lightning:lnurl1..."`  — the `lnurl1...` part
- A QR code image whose decoded content starts with `lnurl1`
- A JavaScript variable or API response containing the lnurl string

### 2. Dry-run first (optional but recommended)

```bash
node <path_to_skill>/lnurl_auth.js "<lnurl1...>" --dry-run --json
```

This decodes the URL, derives the key, and builds the callback — but does
**not** submit the signature. Use this to inspect the service URL before
committing.

### 3. Submit the login

```bash
node <path_to_skill>/lnurl_auth.js "<lnurl1...>" --json
```

The `--json` flag gives machine-readable output you can parse. The signature
is submitted via **GET** with `k1`, `sig`, and `key` query parameters to the
service callback, as required by LUD-04.

### Scripting with jq

```bash
# Extract the linking pubkey
node <path_to_skill>/lnurl_auth.js "<lnurl1...>" --json --dry-run | jq -r .linkingPubkey

# Check login status in CI
node <path_to_skill>/lnurl_auth.js "<lnurl1...>" --json | jq -r '.response.status'
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Server responded `{"status":"OK"}` — login accepted |
| `1` | Client-side error (bad lnurl, invalid k1, network failure, etc.) |
| `2` | Usage error (no lnurl provided, unknown option) |
| `3` | Server responded `{"status":"ERROR","reason":"..."}` — login rejected |
| `4` | Server responded with non-200 HTTP status or non-JSON body |

## Output format

Progress/log messages go to **stderr**. The server response goes to **stdout**.

### With `--json`

```json
{
  "serviceUrl": "https://example.com/cb?tag=login&k1=...&action=login",
  "domain": "example.com",
  "k1": "abcdef0123456789...",
  "action": "login",
  "linkingPubkey": "02abcdef...",
  "callbackUrl": "https://example.com/cb",
  "method": "GET",
  "dryRun": false
}
```

After submission, an additional JSON block:

```json
{
  "httpStatus": 200,
  "response": { "status": "OK" }
}
```

### Without `--json`

```
HTTP 200
{"status":"OK"}
```

## Key management

- On first run, a 32-byte master secret is generated and stored at
  `~/.config/lnurl-auth/master.key` (mode `0600`).
- For each service domain, a **linking key** is derived via
  `HMAC-SHA256(master, domain)`. Same domain → same key; different domains →
  different keys.
- The key survives across sessions — the agent identity is persistent.
- Use `--generate` to **overwrite** the master secret and start fresh.
- Use `--single-key` to share one key across all services (less private).

## Common error patterns

| Symptom | Likely cause | Fix |
|---|---|---|
| `Failed to decode lnurl` | Not a valid bech32 lnurl1 string | Re-extract the lnurl from the page |
| `k1 is not valid hex` | Corrupted or truncated lnurl | Re-decode the QR or re-fetch the link |
| `k1 must be 32 bytes` | Wrong-length challenge in the URL | Re-fetch from the service |
| `challenge GET failed: HTTP 40x` | Service URL expired or service changed | Re-extract the lnurl |
| `status: ERROR, reason: already-used` | k1 was already submitted (replay) | Re-fetch a fresh lnurl |
| `status: ERROR, reason: signature verification` | Key mismatch or tampered data | The service doesn't recognise this key |
| `Request timed out` | Service unreachable | Check network connectivity |
| `status: ERROR` (exit 3) | Service rejected the auth | The key may need to be registered first |

## Programmatic usage (from agent context)

If you need to call the library directly from JS:

```js
const { decodeLnurl } = require('<skill_dir>/lib/bech32');
const { genPrivateKey, getPublicKey, signCompact, deriveLinkingKey } = require('<skill_dir>/lib/secp');
const { encode } = require('<skill_dir>/lib/der');

const url = decodeLnurl(lnurlStr);
const domain = new URL(url).hostname;
const masterHex = fs.readFileSync(keyfile, 'utf8').trim();
const master = Buffer.from(masterHex, 'hex');
const priv = deriveLinkingKey(master, domain);
const pub = getPublicKey(priv, true);
const k1 = new URL(url).searchParams.get('k1');
const k1Bytes = Buffer.from(k1, 'hex');
const sig = signCompact(k1Bytes, priv);
const derHex = Buffer.from(encode(sig)).toString('hex');
// GET <callback>?k1=...&sig=...&key=...
```

## Self-test

Run the smoke test to confirm everything works:

```bash
cd <skill_dir>
npm test
# or individually:
npx vitest run test/unit.test.js test/selftest.test.js
```

All tests are offline and cost-free.

## Important notes

- This is **auth-only** — no payments, no invoices, no Lightning node.
- The derived key is local to this machine; it is **not** the same as a user's
  phone wallet identity (those use BIP32/LUD-05 derivation from a seed phrase).
- Network calls are limited to the optional challenge GET and final callback GET.
- The `k1` challenge is a one-time nonce — once submitted, it cannot be reused
  (replay protection enforced by the server).
