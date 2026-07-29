import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { start } from '../mock_server';
import { encodeLnurl } from '../lib/bech32';

const PORT = 8733;

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
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'lnurl_auth.js'), ...args],
      { encoding: 'utf8', env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ status: code, stdout, stderr }));
  });
}

function parseFirstJson(stdout) {
  const lines = stdout.split('\n');
  let block = '';
  let depth = 0;
  for (const line of lines) {
    if (depth === 0 && line.trim().startsWith('{')) {
      block = line;
      depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (depth === 0) block = '';
      continue;
    }
    if (depth > 0) {
      block += '\n' + line;
      depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (depth === 0) {
        try { return JSON.parse(block); } catch (e) { block = ''; }
      }
    }
  }
  return null;
}

describe('CLI', () => {
  let server;
  let tmpKey;
  let env;

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((r) => setTimeout(r, 200));
    tmpKey = path.join(os.tmpdir(), 'lnurl-auth-cli-test-' + Date.now() + '.key');
    env = { LNURL_AUTH_KEYFILE: tmpKey };
  });

  afterAll(() => {
    server.close();
    try { fs.unlinkSync(tmpKey); } catch (e) {}
  });

  async function getChallenge() {
    return getJSON(`http://127.0.0.1:${PORT}/challenge`);
  }

  it('exit 2 when no lnurl provided', async () => {
    const r = await runCLI([], env);
    expect(r.status).toBe(2);
  });

  it('--help exits 0 and prints usage', async () => {
    const r = await runCLI(['--help'], env);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:|Options:/);
  });

  it('-h exits 0 and prints usage', async () => {
    const r = await runCLI(['-h'], env);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:|Options:/);
  });

  it('unknown option exits 2', async () => {
    const r = await runCLI(['--unknown-option', 'lnurl1xxx'], env);
    expect(r.status).toBe(2);
  });

  it('invalid lnurl exits 1', async () => {
    const r = await runCLI(['not-an-lnurl-string'], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Failed to decode|Not an lnurl1/);
  });

  it('valid lnurl exits 0 and returns status OK', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl], env);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/"status":\s*"OK"/);
  });

  it('--json option produces valid first JSON block', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed).toBeTruthy();
    expect(parsed.serviceUrl).toBeTruthy();
    expect(typeof parsed.domain).toBe('string');
    expect(parsed.k1).toBeTruthy();
    expect(parsed.linkingPubkey).toBeTruthy();
    expect(parsed.callbackUrl).toBeTruthy();
    expect(parsed.dryRun).toBe(false);
    expect(parsed.method).toBe('GET');
  });

  it('--json with --dry-run', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--dry-run'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.linkingPubkey).toBeTruthy();
  });

  it('replay protection: same lnurl twice returns ERROR', async () => {
    const ch = await getChallenge();
    await runCLI([ch.lnurl], env);
    const r = await runCLI([ch.lnurl], env);
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/"status":\s*"ERROR"/);
  });

  it('--quiet suppresses stderr logs', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--quiet'], env);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('positional lnurl works', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl], env);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/"status":\s*"OK"/);
  });

  it('--lnurl flag works', async () => {
    const ch = await getChallenge();
    const r = await runCLI(['--lnurl', ch.lnurl], env);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/"status":\s*"OK"/);
  });

  it('--generate creates and persists keyfile', async () => {
    const genEnv = { LNURL_AUTH_KEYFILE: tmpKey + '-gen' };
    if (fs.existsSync(genEnv.LNURL_AUTH_KEYFILE)) fs.unlinkSync(genEnv.LNURL_AUTH_KEYFILE);
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--generate'], genEnv);
    expect(r.status).toBe(0);
    expect(fs.existsSync(genEnv.LNURL_AUTH_KEYFILE)).toBe(true);
    const content = fs.readFileSync(genEnv.LNURL_AUTH_KEYFILE, 'utf8').trim();
    expect(content).toMatch(/^[0-9a-f]{64}$/i);
    try { fs.unlinkSync(genEnv.LNURL_AUTH_KEYFILE); } catch (e) {}
  });

  it('--single-key flag produces linking pubkey', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--single-key'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.linkingPubkey).toBeTruthy();
  });

  it('--no-per-domain is alias of --single-key', async () => {
    const ch = await getChallenge();
    const ra = await runCLI([ch.lnurl, '--json', '--single-key'], env);
    const rb = await runCLI([ch.lnurl, '--json', '--no-per-domain'], env);
    const pa = parseFirstJson(ra.stdout);
    const pb = parseFirstJson(rb.stdout);
    expect(pa.linkingPubkey).toBe(pb.linkingPubkey);
  });

  it('--key with valid 64-char hex works', async () => {
    const ch = await getChallenge();
    const testKey = 'a'.repeat(64);
    const r = await runCLI([ch.lnurl, '--json', '--key', testKey], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.linkingPubkey).toBeTruthy();
  });

  it('--key with invalid hex exits 1', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--key', 'zz' + 'a'.repeat(62)], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Invalid hex|error/i);
  });

  it('--key with short hex is accepted (HMAC-derived)', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--key', 'aabb'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.linkingPubkey).toBeTruthy();
  });

  it('tampered k1 returns ERROR', async () => {
    const ch = await getChallenge();
    const { decodeLnurl } = await import('../lib/bech32');
    const svc = decodeLnurl(ch.lnurl);
    const tamperedSvc = svc.replace(/k1=[0-9a-f]+/i, (m) => {
      const kv = m.split('=');
      const k = kv[1];
      const flipped = (k[0] === '0' ? '1' : '0') + k.slice(1);
      return 'k1=' + flipped;
    });
    const r = await runCLI([encodeLnurl(tamperedSvc)], env);
    expect([3, 4]).toContain(r.status);
  });

  it('odd-length hex k1 exits != 0', async () => {
    const ch = await getChallenge();
    const { decodeLnurl } = await import('../lib/bech32');
    const svc = decodeLnurl(ch.lnurl);
    const badSvc = svc.replace(/k1=[0-9a-f]+/i, 'k1=abc');
    const r = await runCLI([encodeLnurl(badSvc)], env);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/hex|64/i);
  });

  it('exit 3 when server returns ERROR', async () => {
    const ch = await getChallenge();
    await runCLI([ch.lnurl], env);
    const r = await runCLI([ch.lnurl], env);
    expect(r.status).toBe(3);
  });

  it('per-domain linking key stable across invocations', async () => {
    const ch = await getChallenge();
    const a = await runCLI([ch.lnurl, '--json'], env);
    const b = await runCLI([ch.lnurl, '--json'], env);
    const pubA = parseFirstJson(a.stdout);
    const pubB = parseFirstJson(b.stdout);
    expect(pubA.linkingPubkey).toBe(pubB.linkingPubkey);
  });

  it('--verbose flag works', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--verbose', '--json'], env);
    expect(r.status).toBe(0);
  });

  it('--callback override flag submits to custom URL and k1 is consumed', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--callback', `http://127.0.0.1:${PORT}/cb`], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.callbackUrl).toContain(`http://127.0.0.1:${PORT}/cb`);
    expect(parsed.method).toBe('GET');
    // Verify k1 was actually consumed by the mock server
    const replay = await runCLI([ch.lnurl, '--callback', `http://127.0.0.1:${PORT}/cb`], env);
    expect(replay.status).toBe(3);
  });

  it('--action with valid value', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--action', 'register'], env);
    expect(r.status).toBe(0);
  });

  it('--action with invalid value exits 1', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--action', 'invalid_action'], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Invalid action/);
  });

  it('--no-t flag omits t param', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--no-t'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.callbackUrl).not.toContain('&t=');
  });

  it('--keyfile with custom path', async () => {
    const customKeyfile = path.join(os.tmpdir(), 'lnurl-custom-key-' + Date.now() + '.key');
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--keyfile', customKeyfile, '--json'], {});
    expect(r.status).toBe(0);
    expect(fs.existsSync(customKeyfile)).toBe(true);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.linkingPubkey).toBeTruthy();
    try { fs.unlinkSync(customKeyfile); } catch (e) {}
  });

  it('LNURL_AUTH_KEYFILE env var', async () => {
    const envKeyfile = path.join(os.tmpdir(), 'lnurl-env-key-' + Date.now() + '.key');
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json'], { LNURL_AUTH_KEYFILE: envKeyfile });
    expect(r.status).toBe(0);
    expect(fs.existsSync(envKeyfile)).toBe(true);
    try { fs.unlinkSync(envKeyfile); } catch (e) {}
  });

  it('multiple positional args (only first used)', async () => {
    const ch1 = await getChallenge();
    const ch2 = await getChallenge();
    const r = await runCLI([ch1.lnurl, ch2.lnurl], env);
    expect(r.status).toBe(0);
  });

  it('--lnurl without value exits 2', async () => {
    const r = await runCLI(['--lnurl'], env);
    expect(r.status).toBe(2);
  });

  it('--key without value falls back to keyfile', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--key'], env);
    expect(r.status).toBe(0);
  });

  it('--timeout flag is accepted', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--json', '--timeout', '30000'], env);
    expect(r.status).toBe(0);
    const parsed = parseFirstJson(r.stdout);
    expect(parsed.linkingPubkey).toBeTruthy();
  });

  it('--timeout with invalid value exits 2', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--timeout', 'abc'], env);
    expect(r.status).toBe(2);
  });

  it('network error on unreachable callback exits 1', async () => {
    const ch = await getChallenge();
    const r = await runCLI([ch.lnurl, '--callback', `http://127.0.0.1:19999/cb`], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/error|ECONNREFUSED/i);
  });

  it('short k1 (not 64 hex chars) exits 1', async () => {
    const ch = await getChallenge();
    const { decodeLnurl } = await import('../lib/bech32');
    const svc = decodeLnurl(ch.lnurl);
    // Replace k1 with a valid hex but only 60 chars (30 bytes)
    const shortK1 = 'aa'.repeat(30);
    const badSvc = svc.replace(/k1=[0-9a-f]+/i, 'k1=' + shortK1);
    const r = await runCLI([encodeLnurl(badSvc)], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/64|bytes/i);
  });
});