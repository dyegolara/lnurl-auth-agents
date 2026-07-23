import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = path.join(__dirname, '..');

function readJSON(relPath) {
  const p = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('plugin manifests', () => {
  it('.claude-plugin/plugin.json is valid with required fields', () => {
    const m = readJSON('.claude-plugin/plugin.json');
    expect(m.name).toBe('lnurl-auth');
    expect(m.version).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.license).toBe('MIT');
  });

  it('.claude-plugin/plugin.json declares MCP server', () => {
    const m = readJSON('.claude-plugin/plugin.json');
    expect(m.mcpServers).toBeTruthy();
    expect(m.mcpServers['lnurl-auth']).toBeTruthy();
    expect(m.mcpServers['lnurl-auth'].command).toBe('node');
    expect(m.mcpServers['lnurl-auth'].args[0]).toContain('mcp/server.js');
  });

  it('.mcp.json is valid with mcpServers', () => {
    const m = readJSON('.mcp.json');
    expect(m.mcpServers).toBeTruthy();
    expect(m.mcpServers['lnurl-auth'].command).toBe('node');
    expect(m.mcpServers['lnurl-auth'].args).toContain('mcp/server.js');
  });

  it('.codex-plugin/plugin.json is valid', () => {
    const m = readJSON('.codex-plugin/plugin.json');
    expect(m.name).toBe('lnurl-auth');
    expect(m.version).toBeTruthy();
  });

  it('.cursor-plugin/plugin.json is valid', () => {
    const m = readJSON('.cursor-plugin/plugin.json');
    expect(m.name).toBe('lnurl-auth');
    expect(m.version).toBeTruthy();
  });

  it('SKILL.md at repo root is a valid agentskills.io skill', () => {
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
    expect(content).toMatch(/^---/);
    const fm = content.split('---')[1];
    expect(fm).toContain('name:');
    expect(fm).toContain('description:');
  });

  it('SKILL.md name matches plugin name', () => {
    const m = readJSON('.claude-plugin/plugin.json');
    const content = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
    const fm = content.split('---')[1];
    expect(fm).toContain(`name: ${m.name}`.trim());
  });

  it('AGENTS.md exists at repo root', () => {
    const exists = fs.existsSync(path.join(ROOT, 'AGENTS.md'));
    expect(exists).toBe(true);
  });
});

describe('plugin MCP server', () => {
  // Read .mcp.json and verify the referenced server starts
  it('.mcp.json references working MCP server', async () => {
    const mcpConfig = readJSON('.mcp.json');
    const serverPath = path.join(ROOT, mcpConfig.mcpServers['lnurl-auth'].args[0]);
    expect(fs.existsSync(serverPath)).toBe(true);

    const child = spawn(process.execPath, [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: ROOT,
    });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
    }) + '\n');

    await new Promise(r => setTimeout(r, 500));

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}
    }) + '\n');
    child.stdin.end();

    await new Promise(r => setTimeout(r, 1500));

    const lines = stdout.trim().split('\n').filter(Boolean);
    const lastLine = JSON.parse(lines[lines.length - 1]);
    expect(lastLine.result.tools).toHaveLength(1);
    expect(lastLine.result.tools[0].name).toBe('lnurl_auth');

    child.kill();
  }, 10000);
});