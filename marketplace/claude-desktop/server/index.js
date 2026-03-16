#!/usr/bin/env node

// Cohvu MCP proxy for Claude Desktop .mcpb bundle.
//
// Reads COHVU_TOKEN from env (injected by Claude Desktop from user_config),
// opens stdio transport for the local MCP client, connects to the Cohvu
// backend via StreamableHTTPClientTransport, and bridges the two.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE_URL = "https://api.cohvu.com";
const token = process.env.COHVU_TOKEN;

async function main() {
  if (!token) {
    // No token — stay alive but tell the agent to ask the user to log in
    const stdioTransport = new StdioServerTransport();
    stdioTransport.onmessage = (message) => {
      const msg = message;
      if (msg.id !== undefined) {
        stdioTransport.send({
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32600,
            message:
              "Cohvu is not configured. Ask the user to run `npx cohvu login` in their terminal to get their API token, then enter it in Claude Desktop settings.",
          },
        }).catch(() => {});
      }
    };
    await stdioTransport.start();
    return;
  }

  // Create the stdio transport (accepts MCP from Claude Desktop)
  const stdioTransport = new StdioServerTransport();

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  // Custom fetch adds a 300s timeout on POST requests to prevent indefinite hangs.
  // GET requests (SSE streams) are left untouched — they're meant to be long-lived.
  const timeoutFetch = (url, init) => {
    if (init?.method === "POST") {
      const timeout = AbortSignal.timeout(300_000);
      const combined = init.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;
      return fetch(url, { ...init, signal: combined });
    }
    return fetch(url, init);
  };

  const httpTransport = new StreamableHTTPClientTransport(
    new URL(`${BASE_URL}/v1/mcp`),
    { requestInit: { headers }, fetch: timeoutFetch },
  );

  // Bridge: stdio → HTTP → stdio
  stdioTransport.onmessage = (message) => {
    httpTransport.send(message).catch((error) => {
      process.stderr.write(`Error forwarding to server: ${error}\n`);
      const msg = message;
      if (msg.id !== undefined) {
        stdioTransport.send({
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32603,
            message: `Server request failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        }).catch(() => {});
      }
    });
  };

  httpTransport.onmessage = (message) => {
    stdioTransport.send(message).catch((error) => {
      process.stderr.write(`Error forwarding to client: ${error}\n`);
    });
  };

  httpTransport.onclose = () => {
    stdioTransport.close().catch(() => {});
    process.exit(0);
  };

  stdioTransport.onclose = () => {
    httpTransport.close().catch(() => {});
    process.exit(0);
  };

  httpTransport.onerror = (error) => {
    process.stderr.write(`Remote transport error: ${error}\n`);
  };

  stdioTransport.onerror = (error) => {
    process.stderr.write(`Stdio transport error: ${error}\n`);
  };

  // Start both transports
  await stdioTransport.start();
  await httpTransport.start();
}

main().catch((error) => {
  process.stderr.write(`Cohvu proxy failed: ${error}\n`);
  process.exit(1);
});
