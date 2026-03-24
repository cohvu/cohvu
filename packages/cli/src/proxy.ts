// MCP proxy — thin stateless translator.
//
// Agent speaks MCP on stdin. Proxy speaks REST to the backend.
// No sessions. No state. No reconnection. Each tool call is
// an independent HTTP request.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getApiKey } from "./auth.js";
import { refreshInstructions } from "./setup.js";
import { DEFAULT_BASE_URL } from "./constants.js";

interface Manifest {
  serverInfo: { name: string; version: string };
  instructions: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export async function proxy(): Promise<void> {
  const baseUrl = process.env.COHVU_API_URL ?? DEFAULT_BASE_URL;

  // API key auth — one string, never expires, no refresh
  const apiKey = getApiKey();
  if (!apiKey) {
    const transport = new StdioServerTransport();
    transport.onmessage = async (message) => {
      const msg = message as { id?: string | number };
      if (msg.id === undefined) return;
      transport.send({
        jsonrpc: "2.0" as const,
        id: msg.id,
        error: {
          code: -32600,
          message: "Cohvu is not connected. Run `npx cohvu` in your terminal to sign in.",
        },
      }).catch(() => {});
    };
    await transport.start();
    return;
  }

  const authHeader = `Bearer ${apiKey}`;

  // Silently update instruction files
  refreshInstructions();

  // Fetch manifest (tool list + instructions) — keep retrying until we get it
  let manifest: Manifest | null = null;

  async function fetchManifest(): Promise<Manifest | null> {
    try {
      const res = await fetch(`${baseUrl}/v1/tools/manifest`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return (await res.json()) as Manifest;
    } catch {}
    return null;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    manifest = await fetchManifest();
    if (manifest) break;
    await new Promise((r) => setTimeout(r, 1000 * Math.min(attempt + 1, 5)));
  }

  // Build MCP protocol responses (or error responses if manifest unavailable)
  const initializeResult = manifest
    ? {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: manifest.serverInfo,
        instructions: manifest.instructions,
      }
    : {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "cohvu", version: "0.1.0" },
        instructions: "Cohvu could not connect to the server. Restart your editor to retry.",
      };

  const toolsListResult = manifest
    ? {
        tools: manifest.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }
    : { tools: [] };

  // Call backend tool endpoint
  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch(`${baseUrl}/v1/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ tool: name, arguments: args }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "Unknown error");
      return {
        content: [{ type: "text", text: body }],
        isError: true,
      };
    }

    return await res.json();
  }

  // Start stdio transport and handle MCP messages
  const transport = new StdioServerTransport();

  transport.onmessage = async (message) => {
    const msg = message as {
      id?: string | number;
      method?: string;
      params?: Record<string, unknown>;
    };

    // Notifications (no id) — acknowledge silently
    if (msg.id === undefined) return;

    try {
      switch (msg.method) {
        case "initialize":
          await transport.send({ jsonrpc: "2.0" as const, id: msg.id, result: initializeResult });
          break;

        case "tools/list":
          await transport.send({ jsonrpc: "2.0" as const, id: msg.id, result: toolsListResult });
          break;

        case "ping":
          await transport.send({ jsonrpc: "2.0" as const, id: msg.id, result: {} });
          break;

        case "tools/call": {
          if (!manifest) {
            manifest = await fetchManifest();
          }
          if (!manifest) {
            await transport.send({
              jsonrpc: "2.0" as const,
              id: msg.id,
              error: {
                code: -32603,
                message: "Cohvu could not connect to the server. Restart your editor to retry.",
              },
            });
            break;
          }
          const params = msg.params as { name: string; arguments?: Record<string, unknown> };
          const result = await callTool(params.name, params.arguments ?? {});
          await transport.send({ jsonrpc: "2.0" as const, id: msg.id, result: result as Record<string, unknown> });
          break;
        }

        default:
          await transport.send({
            jsonrpc: "2.0" as const,
            id: msg.id,
            error: { code: -32601, message: `Method not found: ${msg.method}` },
          });
      }
    } catch (err) {
      await transport.send({
        jsonrpc: "2.0" as const,
        id: msg.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
      }).catch(() => {});
    }
  };

  transport.onclose = () => {
    process.exit(0);
  };

  await transport.start();
}
