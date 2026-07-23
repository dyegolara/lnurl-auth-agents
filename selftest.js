'use strict';
// Self-test: runs the lnurl_auth CLI end-to-end against the local mock server.
// Proves the sign -> submit -> verify roundtrip works with zero external
// services, zero cost, and no Lightning node. Exit 0 = all pass.

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 8731;
const { start } = require('./mock_server');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Async spawn (do NOT use spawnSync: it blocks the parent event loop, which
// would deadlock the in-process mock server that the child talks to).
function runCLI(args, env) {
  return new Promise((resolve) => {
    const r = spawn(process.execPath, [path.join(__dirname, 'lnurl_auth.js'), ...args],
      { encoding: 'utf8', env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    r.stdout.on('data', (d) => (stdout += d));
    r.stderr.on('data', (d) => (stderr += d));
    r.on('close', (code) => resolve({ status: code, stdout, stderr }));
  });
}

function statusOf(out) { const m = out.match(/"status":\s*"(\w+)"/); return m ? m[1] : null; }
function reasonOf(out) { const m = out.match(/"reason":\s*"([^"]+)"/); return m ? m[1] : ''; }

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS:', name); }
  else { failed++; console.log('  FAIL:', name, detail ? '-> ' + detail : ''); }
}

async function main() {
  const server = start(PORT);
  await new Promise((r) => setTimeout(r, 200));

  const tmpKey = path.join(os.tmpdir(), 'lnurl-auth-selftest-' + Date.now() + '.key');
  const env = { LNURL_AUTH_KEYFILE: tmpKey };
  console.log('\n[1] Happy-path LNURL-auth roundtrip');
  const ch = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
  check('challenge returns lnurl', !!ch.lnurl, JSON.stringify(ch));
  const r1 = await runCLI([ch.lnurl], env);
  check('CLI exits 0', r1.status === 0, 'exit=' + r1.status + ' stderr=' + r1.stderr);
  check('server responded status OK', statusOf(r1.stdout) === 'OK', r1.stdout.trim());

  console.log('\n[2] Replay protection (re-use same lnurl)');
  const r2 = await runCLI([ch.lnurl], env);
  check('second use rejected (ERROR, k1 consumed)', statusOf(r2.stdout) === 'ERROR' && /already-used|unknown/.test(reasonOf(r2.stdout)), r2.stdout.trim());

  console.log('\n[3] Dry-run does not authenticate');
  const ch3 = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
  const r3 = await runCLI([ch3.lnurl, '--dry-run'], env);
  check('dry-run exits 0', r3.status === 0, 'exit=' + r3.status);
  check('dry-run prints callback URL', /callback|Callback URL/.test(r3.stdout + r3.stderr), '');
  // Now actually authenticate the dry-run challenge to confirm it was not consumed.
  const r3b = await runCLI([ch3.lnurl], env);
  check('challenge still valid after dry-run (status OK)', statusOf(r3b.stdout) === 'OK', r3b.stdout.trim());

  console.log('\n[4] Tamper: unknown/tampered k1 must fail verification');
  const ch4 = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
  // Decode, flip a hex digit in the embedded k1, re-encode to a (now invalid) lnurl.
  const { decodeLnurl, encodeLnurl } = require('./lib/bech32');
  const svc = decodeLnurl(ch4.lnurl);
  const tamperedSvc = svc.replace(/k1=[0-9a-f]+/i, (m) => {
    const kv = m.split('='); const k = kv[1];
    const flipped = (k[0] === '0' ? '1' : '0') + k.slice(1);
    return 'k1=' + flipped;
  });
  const badLnurl = encodeLnurl(tamperedSvc);
  const r4 = await runCLI([badLnurl], env);
  check('tampered k1 rejected (ERROR)', statusOf(r4.stdout) === 'ERROR', r4.stdout.trim());

  console.log('\n[5] Per-domain key derivation (deterministic)');
  // Same domain -> same linking key across invocations (persisted master).
  const ch5 = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
  const a = await runCLI([ch5.lnurl, '--json'], env);
  const b = await runCLI([ch5.lnurl, '--json'], env);
  const pubA = (a.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
  const pubB = (b.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
  check('linking pubkey stable for same domain', !!pubA && pubA === pubB, (pubA || '') + ' vs ' + (pubB || ''));

  console.log('\n[6] --generate overwrites existing keyfile');
  const oldKeyHex = fs.readFileSync(tmpKey, 'utf8').trim();
  const r6 = await runCLI([ch5.lnurl, '--json', '--generate'], env);
  const newKeyHex = fs.readFileSync(tmpKey, 'utf8').trim();
  check('--generate overwrote the keyfile', newKeyHex !== oldKeyHex, oldKeyHex + ' -> ' + newKeyHex);
  check('--generate still produces a 32-byte key', Buffer.from(newKeyHex, 'hex').length === 32);

  // After overwrite, linking pubkey should differ (new master -> new derived key).
  const pubAfterGen = (r6.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
  check('linking pubkey changed after --generate', pubA !== pubAfterGen, pubA + ' -> ' + (pubAfterGen || ''));

  console.log('\n[7] Odd-length hex k1 is rejected (no silent padding)');
  const { decodeLnurl: dl, encodeLnurl: el } = require('./lib/bech32');
  const ch7 = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
  const svc7 = dl(ch7.lnurl);
  // Replace k1 with 63 hex chars (odd length)
  const badSvc7 = svc7.replace(/k1=[0-9a-f]+/i, 'k1=abc'); // 3 chars, odd
  const badLnurl7 = el(badSvc7);
  const r7 = await runCLI([badLnurl7], env);
  check('odd-length k1 rejected (exit != 0)', r7.status !== 0, 'exit=' + r7.status + ' stderr=' + r7.stderr);
  check('error message mentions invalid hex', /not valid hex|invalid hex/i.test(r7.stderr), r7.stderr.trim());

  // Cleanup
  try { fs.unlinkSync(tmpKey); } catch (e) {}
  server.close();

  console.log(`\n==== self-test: ${passed} passed, ${failed} failed ====`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('self-test crashed:', e); process.exit(2); });
