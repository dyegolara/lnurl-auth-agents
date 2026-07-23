---
name: lnurl-auth
description: "LNURL-auth (LUD-04) signer for LLM coding agents (OpenClaw, Codex, Cursor, Claude Code, OpenCode, ...). Auth-only login via Lightning — no node, no cost. Given an lnurl1... string from a 'Sign in with Lightning' QR/link, decode it, sign the k1 challenge with a secp256k1 linking key, and submit the signature to the service callback. Use whenever a site asks to authenticate via LNURL-auth / Lightning login."
license: MIT
homepage: https://github.com/dyegolara/lnurl-auth-agents
metadata:
  author: Diego "Amadeo" Lara
  version: 1.1.0
  tags: [lnurl, lightning, auth, login, lud-04, secp256k1]
---

# lnurl-auth (LUD-04)

Authenticate to a service using **LNURL-auth** (Lightning "Sign in with Lightning")
entirely client-side. This is **auth-only**: the server sends a `k1` challenge,
you sign the raw 32-byte `k1` with a secp256k1 private key and return `sig` + `key`
via a GET to the callback. No invoice, no payment, no Lightning node.

## When to use

- A site shows "Sign in with Lightning" / LNURL-auth (e.g. bitsimp.com,
  lightninglogin.live).
- You are handed an `lnurl1...` string (from a QR code, a link, or pasted text).
- You must NOT spend money or run a Lightning node.

## Command

Run with Node (already installed). The script lives at:

```
<skill_dir>/lnurl_auth.js
```

```bash
node <skill_dir>/lnurl_auth.js --lnurl <lnurl1...> [options]
# or pass the lnurl positionally:
node <skill_dir>/lnurl_auth.js <lnurl1...>
```

## Options

| Option | Description |
|---|---|
| `--lnurl <str>` | The `lnurl1...` string (or pass it positionally) |
| `--key <hex>` | Use this hex private key as the master secret |
| `--keyfile <path>` | Read the master secret (hex) from a file |
| `--keyout <path>` | Where to persist a generated master secret (default `~/.config/lnurl-auth/master.key`) |
| `--generate` | Force-generate a new master secret, **overwriting** any existing keyfile |
| `--single-key` | Use one global linking key for all services (no per-domain derivation) |
| `--no-t` | Omit `&t=<action>` from the callback |
| `--action <a>` | Assert/override action: `register`, `login`, `link`, or `auth` |
| `--callback <url>` | Override the URL the signature is submitted to |
| `--dry-run` | Decode, fetch `k1`, sign — but **do not** submit the callback |
| `--json` | Emit machine-readable JSON |
| `-v`, `--verbose` | Verbose logging |
| `-q`, `--quiet` | Suppress progress logs |
| `-h`, `--help` | Show help |

## Key management (default, privacy-preserving)

- On first use a 32-byte **master secret** is generated and saved to
  `~/.config/lnurl-auth/master.key` (mode `0600`).
- For each service a **linking key** is derived deterministically:
  `linkingPriv = HMAC-SHA256(master, serviceDomain)`.
- Same service → same key (returning user). Different services → different keys
  (privacy — in the spirit of LUD-05/LUD-13).
- Use `--single-key` for one global linking key across all services.

## Protocol flow (LUD-04)

1. `lnurl1...` is `bech32("lnurl", utf8(serviceURL))`. Decode → URL containing
   `k1` (32-byte hex challenge) and optionally `action`.
2. Sign the **raw 32-byte `k1`** with the linking private key using ECDSA
   (secp256k1, `prehash: false`), then **DER-encode** the signature.
3. GET the service URL with `&sig=<hex DER sig>&key=<hex compressed pubkey>`
   (and `&t=<action>` when known) appended.
4. Server verifies the signature and responds `{"status":"OK"}` or
   `{"status":"ERROR","reason":"..."}`.

Reference: https://github.com/lnurl/luds/blob/luds/04.md

## Output

- Progress messages go to **stderr**.
- Server response (JSON) goes to **stdout**.
- `{"status":"OK"}` → exit code `0`.
- `{"status":"ERROR",...}` → exit code `3`.
- Non-JSON or non-200 response → exit code `4`.

## Examples

### Basic login

```bash
node <skill_dir>/lnurl_auth.js --lnurl "lnurl1dp68gurn8ghj7..."
```

### Dry-run first (inspect without submitting)

```bash
node <skill_dir>/lnurl_auth.js "lnurl1..." --dry-run --json
```

### Use a specific key

```bash
node <skill_dir>/lnurl_auth.js "lnurl1..." --key <64-char-hex-private-key>
```

### Force new identity

```bash
node <skill_dir>/lnurl_auth.js "lnurl1..." --generate
```

## Dependencies

- **Node.js** v18+ (v22 recommended).
- Two tiny pure-JS npm packages, **vendored** inside `node_modules/`:
  - `@noble/secp256k1` (sign/verify, audited, zero-dependency)
  - `bech32` (lnurl decode/encode)
- No native build, no network at runtime (except the callback GET).
- No cost, no Lightning node.

### Installing / refreshing vendored deps

```bash
cd <skill_dir>
npm install
```

## Self-test (no external services, no cost)

A local mock LUD-04 server validates the full sign → submit → verify roundtrip:

```bash
cd <skill_dir>
node selftest.js
```

Covers: happy path, replay rejecton, dry-run safety, tampered `k1` rejection,
per-domain key stability, `--generate` overwrite, and odd-hex validation.

## Real-world verification

Verified against two public services:

| Service | Response |
|---|---|
| bitsimp.com | `{"status":"OK"}` |
| lightninglogin.live | `{"status":"OK"}` |

## Limitations

- This performs the cryptographic handshake; account creation/login depends on
  the remote service recognising the key.
- The default linking key is per-domain derived from a local master secret —
  it is **not** the same identity a user's phone wallet would produce. Sufficient
  for agent auth.
- Requires network egress to the service's callback URL at submit time only
  (no payment, no Lightning node).