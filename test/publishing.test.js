import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { start } from '../mock_server';

const ROOT = path.join(__dirname, '..');
const PORT = 8736;
const PORTABLE_HELPER = path.join(ROOT, 'skills', 'lnurl-auth', 'scripts', 'lnurl_auth.js');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function runPortable(args, keyfile) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PORTABLE_HELPER, ...args], {
      cwd: ROOT,
      env: { ...process.env, LNURL_AUTH_KEYFILE: keyfile },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function jsonBlocks(output) {
  const lines = output.split('\n');
  let block = '';
  let depth = 0;
  const result = [];
  for (const line of lines) {
    if (depth === 0 && line.trim().startsWith('{')) {
      block = line;
      depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    } else if (depth > 0) {
      block += `\n${line}`;
      depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    }
    if (depth === 0 && block) {
      result.push(JSON.parse(block));
      block = '';
    }
  }
  if (!result.length) throw new Error('No JSON object found');
  return result;
}

function firstJSON(output) {
  return jsonBlocks(output)[0];
}

describe('publishing artifacts', () => {
  let server;

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => server.close());

  it('limits the npm artifact to runtime and distribution files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.version).toBe('1.2.0');
    expect(pkg.engines.node).toBe('>=20.19.0');
    expect(pkg.files).toEqual([
      'lnurl_auth.js',
      'lib/',
      'mcp/server.js',
      'mcp/package.json',
      'SKILL.md',
      'README.md',
      'LICENSE',
    ]);
    for (const file of pkg.files.filter((entry) => !entry.endsWith('/'))) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });

  it('ships valid skills.sh grouping metadata', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills.sh.json'), 'utf8'));
    expect(config.$schema).toBe('https://skills.sh/schemas/skills.sh.schema.json');
    expect(config.groupings).toEqual([
      expect.objectContaining({ skills: ['lnurl-auth'] }),
    ]);
  });

  it('ships an OpenClaw/ClawHub skill bundle with matching metadata', () => {
    const skillPath = path.join(ROOT, 'skills', 'lnurl-auth', 'SKILL.md');
    const helperPath = path.join(ROOT, 'skills', 'lnurl-auth', 'scripts', 'lnurl_auth.js');
    const content = fs.readFileSync(skillPath, 'utf8');
    expect(content).toMatch(/^---\nname: lnurl-auth\n/);
    expect(content).toContain('description:');
    expect(fs.statSync(helperPath).mode & 0o111).toBeTruthy();
  });

  it('runs the portable bundle through a local LUD-04 roundtrip', async () => {
    const challenge = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
    const keyfile = path.join(os.tmpdir(), `lnurl-auth-publishing-${Date.now()}.key`);
    try {
      const result = await runPortable([challenge.lnurl, '--json'], keyfile);
      expect(result.status).toBe(0);
      expect(jsonBlocks(result.stdout)[1].response.status).toBe('OK');
      expect(firstJSON(result.stdout).method).toBe('GET');
      expect(fs.statSync(keyfile).mode & 0o777).toBe(0o600);
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });

  it('dry-run leaves a challenge available for the real submission', async () => {
    const challenge = await getJSON(`http://127.0.0.1:${PORT}/challenge`);
    const keyfile = path.join(os.tmpdir(), `lnurl-auth-publishing-dry-${Date.now()}.key`);
    try {
      const dryRun = await runPortable([challenge.lnurl, '--dry-run', '--json'], keyfile);
      expect(dryRun.status).toBe(0);
      expect(firstJSON(dryRun.stdout).dryRun).toBe(true);
      const realRun = await runPortable([challenge.lnurl, '--json'], keyfile);
      expect(realRun.status).toBe(0);
      expect(jsonBlocks(realRun.stdout)[1].response.status).toBe('OK');
    } finally {
      try { fs.unlinkSync(keyfile); } catch {}
    }
  });
});
