'use strict';
// Mock LNURL-auth (LUD-04) service — for local, cost-free self-testing only.
// Emulates a "Sign in with Lightning" server:
//   GET /challenge        -> returns { lnurl, k1, serviceUrl }
//   GET /cb?k1=...&sig=...&key=...  -> verifies the DER signature over k1 and replies
//                                       {"status":"OK"} or {"status":"ERROR","reason":...}
//
// No network egress, no Lightning node, no payment.

const http = require('http');
const crypto = require('crypto');
const { encodeLnurl } = require('./lib/bech32');
const { verifyCompact } = require('./lib/secp');
const { decode: derDecode } = require('./lib/der');

function start(port = 8731) {
  const validK1 = new Set(); // k1 hex values awaiting authentication

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    try {

    if (u.pathname === '/challenge' && req.method === 'GET') {
      const k1 = crypto.randomBytes(32).toString('hex');
      validK1.add(k1);
      const serviceUrl = `http://127.0.0.1:${port}/cb?tag=login&k1=${k1}&action=login`;
      const lnurl = encodeLnurl(serviceUrl);
      return send(200, { lnurl, k1, serviceUrl });
    }

    if (u.pathname === '/cb' && req.method === 'GET') {
      const k1 = u.searchParams.get('k1');
      const sigHex = u.searchParams.get('sig');
      const keyHex = u.searchParams.get('key');
      if (!k1 || !sigHex || !keyHex) return send(400, { status: 'ERROR', reason: 'missing k1/sig/key' });
      if (!validK1.has(k1)) return send(400, { status: 'ERROR', reason: 'unknown or already-used k1' });

      try {
        const k1Bytes = Buffer.from(k1, 'hex');
        const pubBytes = Buffer.from(keyHex, 'hex');
        const derBytes = Buffer.from(sigHex, 'hex');
        const compact = derDecode(derBytes);
        const ok = verifyCompact(k1Bytes, compact, pubBytes);
        if (!ok) return send(400, { status: 'ERROR', reason: 'signature verification failed' });
        validK1.delete(k1);
        return send(200, { status: 'OK' });
      } catch (e) {
        return send(400, { status: 'ERROR', reason: 'bad signature/key: ' + e.message });
      }
    }

    send(404, { status: 'ERROR', reason: 'not found' });
    } catch (err) {
      console.error('[mock] handler error:', err);
      if (!res.headersSent) send(500, { status: 'ERROR', reason: 'server error' });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`[mock] LNURL-auth mock listening on http://127.0.0.1:${port}`);
  });
  return server;
}

// Allow running directly: node mock_server.js [port]
if (require.main === module) {
  const port = parseInt(process.argv[2] || process.env.PORT || '8731', 10);
  start(port);
  // keep process alive; tests will kill it.
  process.on('SIGTERM', () => process.exit(0));
}

module.exports = { start };