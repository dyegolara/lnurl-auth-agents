import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import { start } from '../mock_server';

const MOCK_PORT = 8735;

function sendRequest(child, request) {
  return new Promise((resolve, reject) => {
    const check = () => {
      child.stdin.write(JSON.stringify(request) + '\n');
    };

    let out = '';
    const handler = (d) => {
      out += d.toString();
      const lines = out.split('\n');
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === request.id) {
            child.stdout.removeListener('data', handler);
            resolve(msg);
            return;
          }
        } catch (e) { /* incomplete line */ }
      }
    };
    child.stdout.on('data', handler);
    check();
  });
}

function spawnMCP() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'server.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  return { child, stderr: () => stderr };
}

async function getChallenge() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${MOCK_PORT}/challenge`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

describe('MCP server', () => {
  let mockServer;

  beforeAll(async () => {
    mockServer = start(MOCK_PORT);
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    mockServer.close();
  });

  it('initialize returns server info and capabilities', async () => {
    const { child } = spawnMCP();
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });
      expect(resp.result.serverInfo.name).toBe('lnurl-auth');
      expect(resp.result.serverInfo.version).toBe('1.3.0');
      expect(resp.result.capabilities.tools.listChanged).toBe(true);
    } finally {
      child.kill();
    }
  });

  it('tools/list returns lnurl_auth tool', async () => {
    const { child } = spawnMCP();
    try {
      await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });

      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      expect(resp.result.tools).toHaveLength(1);
      const tool = resp.result.tools[0];
      expect(tool.name).toBe('lnurl_auth');
      expect(tool.description).toContain('LUD-04');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toContain('lnurl');
    } finally {
      child.kill();
    }
  });

  it('tools/call with valid lnurl returns OK', async () => {
    const { child } = spawnMCP();
    const challenge = await getChallenge();
    try {
      await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });

      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'lnurl_auth', arguments: { lnurl: challenge.lnurl } },
      });

      const result = JSON.parse(resp.result.content[0].text);
      expect(result.httpStatus).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.domain).toBe('127.0.0.1');
      expect(result.response.status).toBe('OK');
      expect(result.linkingPubkey).toBeTruthy();
    } finally {
      child.kill();
    }
  });

  it('tools/call with dry_run does not submit', async () => {
    const { child } = spawnMCP();
    const challenge = await getChallenge();
    try {
      await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });

      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'lnurl_auth', arguments: { lnurl: challenge.lnurl, dry_run: true } },
      });

      const result = JSON.parse(resp.result.content[0].text);
      expect(result.dryRun).toBe(true);
      expect(result.callbackUrl).toBeTruthy();
      expect(result.linkingPubkey).toBeTruthy();
      expect(result.serviceUrl).toBeTruthy();
    } finally {
      child.kill();
    }
  });

  it('tools/call with invalid lnurl returns error', async () => {
    const { child } = spawnMCP();
    try {
      await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });

      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'lnurl_auth', arguments: { lnurl: 'invalid-lnurl' } },
      });

      const result = JSON.parse(resp.result.content[0].text);
      expect(result.error).toBeTruthy();
    } finally {
      child.kill();
    }
  });

  it('linking pubkey is stable for same domain', async () => {
    const { child } = spawnMCP();
    const challenge = await getChallenge();
    try {
      await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });

      const a = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'lnurl_auth', arguments: { lnurl: challenge.lnurl } },
      });

      const b = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'lnurl_auth', arguments: { lnurl: challenge.lnurl } },
      });

      const rA = JSON.parse(a.result.content[0].text);
      const rB = JSON.parse(b.result.content[0].text);
      expect(rA.linkingPubkey).toBe(rB.linkingPubkey);
    } finally {
      child.kill();
    }
  });
});

describe('protocol conformance (zero-dependency server)', () => {
  it('responds to JSON-RPC batch requests as an array', async () => {
    const { child } = spawnMCP();
    try {
      const batch = await new Promise((resolve) => {
        child.stdout.on('data', (d) => {
          try {
            const parsed = JSON.parse(d.toString().trim());
            if (Array.isArray(parsed) && parsed.length === 2) resolve(parsed);
          } catch (e) { /* partial line */ }
        });
        child.stdin.write(JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'ping', params: {} },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
          },
        ]) + '\n');
      });
      expect(batch.map((r) => r.id)).toEqual([1, 2]);
      expect(batch[0].result).toEqual({});
      expect(batch[1].result.serverInfo.name).toBe('lnurl-auth');
    } finally {
      child.kill();
    }
  });

  it('ignores notifications without id', async () => {
    const { child } = spawnMCP();
    try {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }) + '\n');

      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/list',
        params: {},
      });
      expect(resp.id).toBe(7);
      expect(resp.result.tools).toHaveLength(1);
    } finally {
      child.kill();
    }
  });

  it('falls back to 2024-11-05 for unsupported protocol versions', async () => {
    const { child } = spawnMCP();
    try {
      const resp = await sendRequest(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2049-01-01', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      });
      expect(resp.result.protocolVersion).toBe('2024-11-05');
    } finally {
      child.kill();
    }
  });
});
