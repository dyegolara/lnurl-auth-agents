#!/usr/bin/env node
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { performHandshake } = require('../lib/handshake');

const server = new McpServer({
  name: 'lnurl-auth',
  version: '1.2.0',
  description: 'LNURL-auth (LUD-04) signer — performs "Sign in with Lightning" handshake without a Lightning node or wallet.',
});

server.registerTool(
  'lnurl_auth',
  {
    description:
      'Performs an LNURL-auth (LUD-04) cryptographic handshake. Given an lnurl1... string from a "Sign in with Lightning" button or QR code, this tool decodes the service URL, derives a per-domain linking key, signs the k1 challenge, submits the DER-encoded signature to the service callback, and returns the server response. No Lightning node, wallet, or payment required.',
    inputSchema: {
      lnurl: z
        .string()
        .describe('The lnurl1... string from a "Sign in with Lightning" link, QR code, or button.'),
      dry_run: z
        .boolean()
        .optional()
        .describe('If true, decodes the lnurl, derives the key, and builds the callback URL — but does NOT submit the signature.'),
      single_key: z
        .boolean()
        .optional()
        .describe('If true, use one global linking key for all services instead of per-domain derivation (less private).'),
      key: z
        .string()
        .optional()
        .describe('64-char hex private key to use as the master secret instead of the persisted keyfile.'),
    },
  },
  async ({ lnurl, dry_run, single_key, key }) => {
    try {
      const result = await performHandshake(lnurl, {
        dryRun: !!dry_run,
        singleKey: !!single_key,
        key: key || undefined,
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
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: e.message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[lnurl-auth-mcp] MCP server running on stdio');
}

main().catch((e) => {
  console.error('[lnurl-auth-mcp] Fatal error:', e.message);
  process.exit(1);
});
