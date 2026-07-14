# lnurl-auth — LNURL-auth (LUD-04) signer for LLM coding agents

Authenticate to a service using **LNURL-auth** ("Sign in with Lightning")
**entirely client-side**, with no Lightning node, no payment, and no cost.

Given an `lnurl1...` string (from a QR code, a link, or pasted text), the tool:

1. decodes the `lnurl1...` (bech32) into the service URL, which carries a
   32-byte `k1` hex challenge and an optional `action`;
2. derives (or loads) a per-service **linking key** from a local master secret;
3. signs the **raw 32-byte `k1`** with that key using ECDSA (secp256k1) and
   **DER-encodes** the signature (as LUD-04 requires);
4. issues a `GET` to the service callback with
   `&sig=<hex DER sig>&key=<hex compressed pubkey>` (and `&t=<action>`).

The server verifies the signature and replies `{"status":"OK"}` or
`{"status":"ERROR","reason":...}`. There is no invoice and no Lightning node.

> Reference: [LUD-04 (auth base spec)](https://github.com/lnurl/luds/blob/luds/04.md)

---

## Why

Many Lightning-enabled sites (e.g. bitsimp.com) offer a "Sign in with
Lightning" button. Normally you scan a QR with a phone wallet. This tool lets
an **LLM coding agent** perform the exact same cryptographic handshake from the command
line — useful for automations, bots, or identity/login flows that must not
spend money or run a node.

## Requirements

- `node` v18+ (v24 works).
- Two pure-JS npm packages, already **vendored** under `node_modules/`
  (so it works offline):
  - `@noble/secp256k1`
  - `bech32`

  To refresh them: `npm install`.

## Usage

```bash
# Decode + sign + submit in one step (service URL comes from the lnurl1):
node lnurl_auth.js --lnurl <lnurl1...>

# Or pass the lnurl positionally:
node lnurl_auth.js <lnurl1...>

# Dry-run: decode, derive key, sign — but do NOT submit the callback.
node lnurl_auth.js <lnurl1...> --dry-run

# Machine-readable output:
node lnurl_auth.js <lnurl1...> --json
```

### Key management (privacy-preserving, default)

- On first use a 32-byte **master secret** is generated once and persisted at
  `~/.config/lnurl-auth/master.key` (mode `0600`).
- For each service a **linking key** is derived deterministically as
  `linkingPriv = HMAC-SHA256(master, serviceDomain)`, so the *same* service
  always sees the *same* key (the server can recognise the returning user)
  while *different* services see different keys (privacy — matches the intent
  of LUD-05 / LUD-13). Use `--single-key` for one global linking key.

### Useful options

| Option | Meaning |
|---|---|
| `--lnurl <str>` | The `lnurl1...` string (or pass it positionally). |
| `--key <hex>` | Use this hex private key as the master secret. |
| `--keyfile <path>` | Read the master secret (hex) from a file. |
| `--keyout <path>` | Where to persist a generated master secret. |
| `--generate` | Force-generate a new master secret and persist it. |
| `--single-key` | Use ONE global linking key for every service. |
| `--no-t` | Do not append `&t=<action>` to the callback. |
| `--action <a>` | Assert/override action: `register\|login\|link\|auth`. |
| `--callback <url>` | Override the URL the signature is submitted to. |
| `--dry-run` | Decode, fetch `k1`, sign — but **do not** submit. |
| `--json` | Emit machine-readable JSON. |
| `-v/-q/-h` | verbose / quiet / help. |

## Examples

See [`examples/`](./examples):

- [`examples/login.sh`](./examples/login.sh) — full dry-run → real login flow.
- [`examples/programmatic.js`](./examples/programmatic.js) — call the lib
  functions from your own Node script.

## Tests

```bash
npm test
```

Runs:

- `selftest.js` — spins up a local mock "Sign in with Lightning" server and
  proves the whole sign → submit → verify roundtrip (happy path, replay
  rejection, dry-run safety, tampered-`k1` rejection, stable per-domain key).
- `test/unit.js` — unit tests: bech32 roundtrip (incl. the canonical LUD-01
  vector), DER encode/decode, deterministic per-domain HMAC key derivation,
  and the **official LUD-04 signature vector** (sign/verify).

All tests are offline, cost-free, and need no Lightning node.

## Limitations

- This performs the cryptographic login handshake; whether the *account* is
  created/logged-in depends on the remote service recognising the key.
- The default linking key is per-domain derived from a **local** master secret;
  it is **not** the same identity a user's phone wallet would use (those follow
  LUD-05 BIP32 / LUD-13 from the user's seed). That is fine for agent auth.
- Submitting a login requires network egress to the service's callback URL
  (the only external call; still no payment / no node).

## License

MIT — see [LICENSE](./LICENSE).
