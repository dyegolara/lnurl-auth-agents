#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { performHandshake } = require('../lib/handshake');

const VERSION = '1.4.1';
const SERVER_NAME = 'lnurl-auth';
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-06-18'];
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'lnurl_auth',
    description:
      'Performs an LNURL-auth (LUD-04) cryptographic handshake. Given an lnurl1... string from a "Sign in with Lightning" button or QR code, this tool decodes the service URL, derives a per-domain linking key, signs the k1 challenge, submits the DER-encoded signature to the service callback, and returns the server response. No Lightning node, wallet, or payment required.',
    inputSchema: {
      type: 'object',
      properties: {
        lnurl: {
          type: 'string',
          description: 'The lnurl1... string from a "Sign in with Lightning" link, QR code, or button.',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, decodes the lnurl, derives the key, and builds the callback URL — but does NOT submit the signature.',
        },
        single_key: {
          type: 'boolean',
          description: 'If true, use one global linking key for all services instead of per-domain derivation (less private).',
        },
        key: {
          type: 'string',
          description: '64-char hex private key to use as the master secret instead of the persisted keyfile.',
        },
      },
      required: ['lnurl'],
    },
  },
];

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error };
}

async function handleToolsCall(params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};
  if (name !== 'lnurl_auth') {
    return rpcError(null, -32602, `Unknown tool: ${name}`);
  }

  try {
    const result = await performHandshake(args.lnurl, {
      dryRun: !!args.dry_run,
      singleKey: !!args.single_key,
      key: args.key || undefined,
    });

    if (result.dryRun) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                serviceUrl: result.serviceUrl,
                domain: result.domain,
                k1: result.k1,
                action: result.action,
                linkingPubkey: result.linkingPubkey,
                callbackUrl: result.callbackUrl,
                dryRun: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              httpStatus: result.httpStatus,
              serviceUrl: result.serviceUrl,
              domain: result.domain,
              k1: result.k1,
              linkingPubkey: result.linkingPubkey,
              response: result.response,
              ok: result.ok,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: e.message }, null, 2) }],
      isError: true,
    };
  }
}

async function handleRequest(msg) {
  if (msg == null || typeof msg !== 'object' || Array.isArray(msg)) return null;
  if (msg.jsonrpc !== '2.0') return null;
  const isNotification = msg.id === undefined;
  const method = msg.method;

  if (isNotification) {
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
    return null;
  }

  switch (method) {
    case 'initialize': {
      const requested =
        msg.params && typeof msg.params.protocolVersion === 'string'
          ? msg.params.protocolVersion
          : null;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: SERVER_NAME, version: VERSION },
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
      };
    }
    case 'tools/call': {
      const result = await handleToolsCall(msg.params);
      return { jsonrpc: '2.0', id: msg.id, result };
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${method}`);
  }
}

async function processLine(raw, write) {
  const line = raw.trim();
  if (!line) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    write(JSON.stringify(rpcError(null, -32700, 'Parse error')) + '\n');
    return;
  }

  if (Array.isArray(msg)) {
    const responses = [];
    for (const item of msg) {
      const response = await handleRequest(item);
      if (response) responses.push(response);
    }
    if (responses.length) write(JSON.stringify(responses) + '\n');
    return;
  }

  if (msg == null || typeof msg !== 'object' || typeof msg.method !== 'string') {
    write(JSON.stringify(rpcError(msg && msg.id, -32600, 'Invalid Request')) + '\n');
    return;
  }

  const response = await handleRequest(msg);
  if (response) write(JSON.stringify(response) + '\n');
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (s) => process.stdout.write(s);
  rl.on('line', (line) => {
    processLine(line, write).catch((e) => {
      write(JSON.stringify(rpcError(null, -32603, `Internal error: ${e.message}`)) + '\n');
    });
  });
  console.error(`[lnurl-auth-mcp] MCP server (${SERVER_NAME}@${VERSION}) running on stdio`);
}

main();