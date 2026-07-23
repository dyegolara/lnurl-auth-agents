import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { start } from '../mock_server';
import { decodeLnurl, encodeLnurl } from '../lib/bech32';

const PORT = 8731;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function runCLI(args, env) {
  return new Promise((resolve) => {
    const r = spawn(process.execPath, [path.join(__dirname, '..', 'lnurl_auth.js'), ...args],
      { encoding: 'utf8', env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    r.stdout.on('data', (d) => (stdout += d));
    r.stderr.on('data', (d) => (stderr += d));
    r.on('close', (code) => resolve({ status: code, stdout, stderr }));
  });
}

function statusOf(out) { const m = out.match(/"status":\s*"(\w+)"/); return m ? m[1] : null; }
function reasonOf(out) { const m = out.match(/"reason":\s*"([^"]+)"/); return m ? m[1] : ''; }

describe('selftest (e2e)', () => {
  let server;
  let tmpKey;
  let env;

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((r) => setTimeout(r, 200));
    tmpKey = path.join(os.tmpdir(), 'lnurl-auth-selftest-' + Date.now() + '.key');
    env = { LNURL_AUTH_KEYFILE: tmpKey };
  });

  afterAll(() => {
    server.close();
    try { fs.unlinkSync(tmpKey); } catch (e) {}
  });

  async function getChallenge() {
    return getJSON(`http://127.0.0.1:${PORT}/challenge`);
  }

  it('happy-path LNURL-auth roundtrip', async () => {
    const ch = await getChallenge();
    expect(ch.lnurl).toBeTruthy();
    const r = await runCLI([ch.lnurl], env);
    expect(r.status).toBe(0);
    expect(statusOf(r.stdout)).toBe('OK');
  });

  it('replay protection (re-use same lnurl)', async () => {
    const ch = await getChallenge();
    await runCLI([ch.lnurl], env);
    const r = await runCLI([ch.lnurl], env);
    expect(statusOf(r.stdout)).toBe('ERROR');
    expect(reasonOf(r.stdout)).toMatch(/already-used|unknown/);
  });

  it('dry-run does not authenticate', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--dry-run'], env);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/callback|Callback URL/i);
    const r2 = await runCLI([ch.lnurl], env);
    expect(statusOf(r2.stdout)).toBe('OK');
  });

  it('tampered k1 must fail verification', async () => {
    const ch = await getChallenge();
    const svc = decodeLnurl(ch.lnurl);
    const tamperedSvc = svc.replace(/k1=[0-9a-f]+/i, (m) => {
      const kv = m.split('='); const k = kv[1];
      const flipped = (k[0] === '0' ? '1' : '0') + k.slice(1);
      return 'k1=' + flipped;
    });
    const r = await runCLI([encodeLnurl(tamperedSvc)], env);
    expect(statusOf(r.stdout)).toBe('ERROR');
  });

  it('per-domain key derivation (deterministic)', async () => {
    const ch = await getChallenge();
    const a = await runCLI([ch.lnurl, '--json'], env);
    const b = await runCLI([ch.lnurl, '--json'], env);
    const pubA = (a.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
    const pubB = (b.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
    expect(pubA).toBeTruthy();
    expect(pubA).toBe(pubB);
  });

  it('--generate overwrites existing keyfile', async () => {
    const ch = await getChallenge();
    const oldKeyHex = fs.readFileSync(tmpKey, 'utf8').trim();
    const r = await runCLI([ch.lnurl, '--json', '--generate'], env);
    const newKeyHex = fs.readFileSync(tmpKey, 'utf8').trim();
    expect(newKeyHex).not.toBe(oldKeyHex);
    expect(Buffer.from(newKeyHex, 'hex')).toHaveLength(32);
    const pubAfterGen = (r.stdout.match(/"linkingPubkey":\s*"([0-9a-f]+)"/) || [])[1];
    // Getting the old pubkey from a prior run isn't reliable here since key changed,
    // but we can verify the new one is valid.
    expect(pubAfterGen).toBeTruthy();
    expect(pubAfterGen).toHaveLength(66); // 33 bytes hex
  });

  it('odd-length hex k1 is rejected', async () => {
    const ch = await getChallenge();
    const svc = decodeLnurl(ch.lnurl);
    const badSvc = svc.replace(/k1=[0-9a-f]+/i, 'k1=abc');
    const r = await runCLI([encodeLnurl(badSvc)], env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not valid hex|invalid hex/i);
  });
});