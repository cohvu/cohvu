// Teardown — reverses what setup.ts does.
// Removes Cohvu from all detected agent configs, instruction files,
// permissions, and local credentials. Preserves other MCP servers.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  copyFileSync,
} from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { detectPlatforms } from "./platforms.js";
import { MARKER_START, MARKER_END } from "./instructions.js";

type StepResult = "ok" | "skipped" | { failed: string };

interface PlatformResult {
  name: string;
  mcp: StepResult | null;
  instructions: StepResult | null;
  permissions: StepResult | null;
}

export interface TeardownResult {
  platforms: PlatformResult[];
  credentials: StepResult;
}

// ---------------------------------------------------------------------------
// MCP config removers
// ---------------------------------------------------------------------------

function removeJsonMcpEntry(filePath: string, rootKey: string): StepResult {
  try {
    if (!existsSync(filePath)) return "skipped";

    const raw = readFileSync(filePath, "utf-8").trim();
    if (!raw) return "skipped";

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { failed: "could not parse JSON" };
    }

    const servers = config[rootKey] as Record<string, unknown> | undefined;
    if (!servers || !servers.cohvu) return "skipped";

    delete servers.cohvu;
    config[rootKey] = servers;

    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return "ok";
  } catch (err) {
    return { failed: (err instanceof Error ? err.message : String(err)).slice(0, 60) };
  }
}

function removeTomlMcpEntry(filePath: string): StepResult {
  try {
    if (!existsSync(filePath)) return "skipped";

    const content = readFileSync(filePath, "utf-8");
    if (!content.includes("[mcp_servers.cohvu]")) return "skipped";

    const lines = content.split("\n");
    const result: string[] = [];
    let skipping = false;

    for (const line of lines) {
      if (line.trim() === "[mcp_servers.cohvu]") {
        skipping = true;
        continue;
      }
      if (skipping && line.trim().startsWith("[")) {
        skipping = false;
      }
      if (!skipping) {
        result.push(line);
      }
    }

    const cleaned = result.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    writeFileSync(filePath, cleaned);
    return "ok";
  } catch (err) {
    return { failed: (err instanceof Error ? err.message : String(err)).slice(0, 60) };
  }
}

// ---------------------------------------------------------------------------
// Instruction removers
// ---------------------------------------------------------------------------

function removeMarkdownInstructions(filePath: string): StepResult {
  try {
    if (!existsSync(filePath)) return "skipped";

    const content = readFileSync(filePath, "utf-8");
    if (!content.includes(MARKER_START)) return "skipped";

    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);
    if (startIdx === -1 || endIdx === -1) return "skipped";

    const before = content.slice(0, startIdx).replace(/\n+$/, "");
    const after = content.slice(endIdx + MARKER_END.length).replace(/^\n+/, "");

    const result = before && after
      ? before + "\n\n" + after
      : before || after;

    if (!result.trim()) {
      unlinkSync(filePath);
    } else {
      writeFileSync(filePath, result.trimEnd() + "\n");
    }
    return "ok";
  } catch (err) {
    return { failed: (err instanceof Error ? err.message : String(err)).slice(0, 60) };
  }
}

function removeMdcRule(filePath: string): StepResult {
  try {
    if (!existsSync(filePath)) return "skipped";
    unlinkSync(filePath);
    return "ok";
  } catch (err) {
    return { failed: (err instanceof Error ? err.message : String(err)).slice(0, 60) };
  }
}

function removeInstructions(filePath: string, format: "markdown" | "mdc"): StepResult {
  if (format === "mdc") return removeMdcRule(filePath);
  return removeMarkdownInstructions(filePath);
}

// ---------------------------------------------------------------------------
// Permissions remover
// ---------------------------------------------------------------------------

function removePermissions(filePath: string): StepResult {
  try {
    if (!existsSync(filePath)) return "skipped";

    const raw = readFileSync(filePath, "utf-8").trim();
    if (!raw) return "skipped";

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { failed: "could not parse JSON" };
    }

    const permissions = config.permissions as Record<string, unknown> | undefined;
    if (!permissions) return "skipped";

    const allow = Array.isArray(permissions.allow) ? [...permissions.allow] as string[] : [];
    const filtered = allow.filter((rule) => !rule.startsWith("mcp__cohvu__"));
    if (filtered.length === allow.length) return "skipped";

    permissions.allow = filtered;
    config.permissions = permissions;

    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return "ok";
  } catch (err) {
    return { failed: (err instanceof Error ? err.message : String(err)).slice(0, 60) };
  }
}

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

function deleteFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function resolve(relativePath: string): string {
  return join(homedir(), relativePath);
}

export async function runTeardown(): Promise<TeardownResult> {
  const detected = detectPlatforms();
  const results: PlatformResult[] = [];

  for (const { def } of detected) {
    const result: PlatformResult = {
      name: def.name,
      mcp: null,
      instructions: null,
      permissions: null,
    };

    if (def.mcp) {
      const filePath = resolve(def.mcp.path);
      if (def.mcp.format === "toml") {
        result.mcp = removeTomlMcpEntry(filePath);
      } else {
        result.mcp = removeJsonMcpEntry(filePath, def.mcp.rootKey);
      }
    }

    if (def.instructions) {
      const filePath = resolve(def.instructions.path);
      result.instructions = removeInstructions(filePath, def.instructions.format);
    }

    if (def.permissions) {
      const filePath = resolve(def.permissions.path);
      result.permissions = removePermissions(filePath);
    }

    results.push(result);
  }

  // Delete local state
  const home = homedir();
  deleteFile(join(home, ".cohvu", "credentials"));
  deleteFile(join(home, ".cohvu", "paused"));

  return {
    platforms: results,
    credentials: "ok",
  };
}
