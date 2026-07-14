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
the client signs `sha256`? **No** — it signs the raw 32-byte `k1` with a
secp256k1 private key and returns `sig` + `key` via a GET to the callback.
There is no invoice, no payment, and no Lightning node.

## When to use
- A site shows "Sign in with Lightning" / LNURL-auth (confirmed on bitsimp.com).
- You are handed an `lnurl1...` string (from a QR code, a link, or pasted text).
- You must NOT spend money or run a Lightning node.

## Command
Run with Node (already installed). The script lives at:
`<skill_dir>/lnurl_auth.js`.

```bash
node <skill_dir>/lnurl_auth.js --lnurl <lnurl1...> [options]
# or pass the lnurl positionally:
node <skill_dir>/lnurl_auth.js <lnurl1...>
```

### Options
| Option | Meaning |
|---|---|
| `--lnurl <str>` | The `lnurl1...` string (or pass it positionally). |
| `--key <hex>` | Use this hex private key as the master secret. |
| `--keyfile <path>` | Read the master secret (hex) from a file. |
| `--keyout <path>` | Where to persist a generated master secret (default `~/.config/lnurl-auth/master.key`). |
| `--generate` | Force-generate a new master secret and persist it. |
| `--single-key` | Use ONE global linking key for every service (no per-domain derivation). |
| `--no-t` | Do not append `&t=<action>` to the callback. |
| `--action <a>` | Assert/override action: `register\|login\|link\|auth`. |
| `--callback <url>` | Override the URL the signature is submitted to. |
| `--dry-run` | Decode, fetch `k1`, sign — but **do not** submit the callback. |
| `--json` | Emit machine-readable JSON. |
| `-v/--verbose`, `-q/--quiet`, `-h/--help` | logging / help. |

## Key management (default, privacy-preserving)
- On first use a 32-byte **master secret** is generated once and persisted at
  `~/.config/lnurl-auth/master.key` (mode `0600`).
- For each service a **linking key** is derived deterministically as
  `linkingPriv = HMAC-SHA256(master, serviceDomain)`, so the *same* service
  always sees the *same* key (the server can recognise the returning user) while
  *different* services see different keys (privacy — matches the intent of
  LUD-05 / LUD-13). Use `--single-key` for one global linking key.

## Output
- Progress goes to **stderr**; the final result (server JSON) goes to **stdout**.
- On success the server replies `{"status":"OK"}` and the process exits `0`.
- On auth error it replies `{"status":"ERROR","reason":...}` and exits `3`.

## How it works (LUD-04)
1. `lnurl1...` is bech32(`"lnurl"`, utf8(serviceURL)). Decode → URL, which
   contains `k1` (32-byte hex challenge) and optionally `action`.
2. Sign the **raw 32-byte `k1`** with the linking private key using ECDSA
   (secp256k1), then **DER-encode** the signature (as the spec requires).
3. GET the service URL with `&sig=<hex DER sig>&key=<hex compressed pubkey>`
   (and `&t=<action>` when known) appended.
4. Server verifies the signature and replies `OK`/`ERROR`.

Reference: https://github.com/lnurl/luds/blob/luds/04.md

## Dependencies
- `node` (v18+; v24 present) and two tiny **pure-JS** npm packages used
  **locally** inside the skill dir:
  - `@noble/secp256k1` (sign / verify, audited, zero-dep)
  - `bech32` (lnurl decode / encode)
- No native build, no network needed at runtime, no cost, no Lightning node.

### Install / offline
The two dependencies are **vendored** under `node_modules/` inside this skill
(committed to the repo) so the skill works fully **offline at runtime** with
no `npm install` required. If you want to refresh them, run:
```bash
cd <skill_dir>
npm install        # refreshes @noble/secp256k1 + bech32
```
The only network call the skill makes is the final `GET` to the service's
callback URL when you actually submit a login (still no payment / no node).

## Self-test (no external services, no cost)
A local mock "Sign in with Lightning" server proves the whole roundtrip:
```bash
cd <skill_dir>
node selftest.js      # spins up mock, runs the CLI, asserts OK/ERROR cases
```
Expects: happy-path `{"status":"OK"}`, replay rejection, dry-run safety,
tampered-`k1` rejection, and stable per-domain linking key.

## Limitations
- This performs the cryptographic login handshake; whether the *account* is
  created/logged-in depends on the remote service (e.g. bitsimp) recognising
  the key. We demonstrate the flow against a local mock because we cannot
  log into the real bitsimp account from here.
- Default linking key is per-domain derived from a local master secret; it is
  **not** the same identity a user's phone wallet would use (those follow
  LUD-05 BIP32 / LUD-13 from the user's seed). That is fine for agent auth.
- Requires network egress to the service's callback URL at submit time
  (the only external call; still no payment / no node).
