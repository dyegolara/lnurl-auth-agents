# Privacy Policy — lnurl-auth

Last updated: 2026-08-19

## Summary

LNURL Auth does not collect, store, or transmit any personal data to its
publisher. It operates entirely on your machine and communicates only with the
LNURL-auth service you choose to authenticate to.

## Local data

- On first run, the tool generates a local 32-byte encryption secret stored at
  `~/.config/lnurl-auth/master.key` with permissions `0600` (readable only by
  your user).
- Derivation keys for each service domain are computed locally from that secret
  and never leave your machine.

## Network requests

The only network requests are those required by the LNURL-auth (LUD-04)
handshake:

- One GET request to fetch the `k1` challenge from the service you are
  authenticating to.
- One GET request to the service's callback URL containing the `k1`, `key`, and
  `sig` parameters.

No requests are sent to the publisher or to any third-party service.

## No analytics or telemetry

This tool includes no analytics, telemetry, tracking, or advertising SDKs and
does not phone home.

## Contact

For questions about this policy, open an issue at
https://github.com/dyegolara/lnurl-auth-agents