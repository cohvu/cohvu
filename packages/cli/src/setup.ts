// Setup orchestrator — writes MCP configs and instruction files for all detected platforms.
// No plugins. Everything is auto-configured.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { detectPlatforms } from "./platforms.js";
import { markedSection, MARKER_START, MARKER_END, CURSOR_RULE } from "./instructions.js";

type StepResult = "ok" | "skipped" | { failed: string };

interface PlatformResult {
  name: string;
  mcp: StepResult | null;
  instructions: StepResult | null;
  permissions: StepResult | null;
}

export interface SetupResult {
  platforms: PlatformResult[];
}

const MCP_ENTRY = { command: "npx", args: ["cohvu"] };

// ---------------------------------------------------------------------------
// MCP config writers
// ---------------------------------------------------------------------------

function writeJsonMcpConfig(filePath: string, rootKey: string): StepResult {
  try {
    let config: Record<string, unknown> = {};

    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8").trim();
      if (raw) {
        try {
          config = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // Malformed JSON — back up and start fresh with just cohvu
          copyFileSync(filePath, `${filePath}.cohvu-backup`);
          config = { [rootKey]: { cohvu: MCP_ENTRY } };
          ensureDir(dirname(filePath));
          writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
          return "ok"; // recovered
        }
      }
    }

    const servers = (config[rootKey] ?? {}) as Record<string, unknown>;
    if (servers.cohvu) return "skipped";

    servers.cohvu = MCP_ENTRY;
    config[rootKey] = servers;

    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) return { failed: "permission denied" };
    return { failed: msg.slice(0, 60) };
  }
}

function writeTomlMcpConfig(filePath: string): StepResult {
  try {
    let content = "";

    if (existsSync(filePath)) {
      content = readFileSync(filePath, "utf-8");
    }

    if (content.includes("[mcp_servers.cohvu]")) return "skipped";

    const section = `\n[mcp_servers.cohvu]\ncommand = "npx"\nargs = ["cohvu"]\n`;

    ensureDir(dirname(filePath));
    writeFileSync(filePath, content + section);
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) return { failed: "permission denied" };
    return { failed: msg.slice(0, 60) };
  }
}

// ---------------------------------------------------------------------------
// Instruction file writers
// ---------------------------------------------------------------------------

function writeMarkdownInstructions(filePath: string): StepResult {
  try {
    const section = markedSection();

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");

      if (content.includes(MARKER_START) && content.includes(MARKER_END)) {
        const startIdx = content.indexOf(MARKER_START);
        const endIdx = content.indexOf(MARKER_END) + MARKER_END.length;
        const existing = content.slice(startIdx, endIdx);
        if (existing === section) return "skipped";
        const updated = content.slice(0, startIdx) + section + content.slice(endIdx);
        writeFileSync(filePath, updated);
        return "ok";
      }

      writeFileSync(filePath, content.trimEnd() + "\n\n" + section + "\n");
      return "ok";
    }

    ensureDir(dirname(filePath));
    writeFileSync(filePath, section + "\n");
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) return { failed: "permission denied" };
    return { failed: msg.slice(0, 60) };
  }
}

function writeMdcRule(filePath: string): StepResult {
  try {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, "utf-8");
      if (existing === CURSOR_RULE) return "skipped";
    }

    ensureDir(dirname(filePath));
    writeFileSync(filePath, CURSOR_RULE);
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) return { failed: "permission denied" };
    return { failed: msg.slice(0, 60) };
  }
}

function writeInstructionFile(filePath: string, format: "markdown" | "mdc"): StepResult {
  if (format === "mdc") return writeMdcRule(filePath);
  return writeMarkdownInstructions(filePath);
}

// ---------------------------------------------------------------------------
// Permissions writer
// ---------------------------------------------------------------------------

function writePermissions(filePath: string, allowRules: string[]): StepResult {
  try {
    let config: Record<string, unknown> = {};

    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8").trim();
      if (raw) {
        try {
          config = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          copyFileSync(filePath, `${filePath}.cohvu-backup`);
          config = {};
        }
      }
    }

    const permissions = (config.permissions ?? {}) as Record<string, unknown>;
    const allow = Array.isArray(permissions.allow) ? ([...permissions.allow] as string[]) : [];

    const newRules = allowRules.filter((rule) => !allow.includes(rule));
    if (newRules.length === 0) return "skipped";

    allow.push(...newRules);
    permissions.allow = allow;
    config.permissions = permissions;

    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) return { failed: "permission denied" };
    return { failed: msg.slice(0, 60) };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function resolve(relativePath: string): string {
  return join(homedir(), relativePath);
}

// ---------------------------------------------------------------------------
// Orchestrator — all platforms auto-configured, no plugins
// ---------------------------------------------------------------------------

export async function runSetup(): Promise<SetupResult> {
  const detected = detectPlatforms();
  const results: PlatformResult[] = [];

  for (const { def } of detected) {
    const result: PlatformResult = {
      name: def.name,
      mcp: null,
      instructions: null,
      permissions: null,
    };

    // Write MCP config
    if (def.mcp) {
      const filePath = resolve(def.mcp.path);
      if (def.mcp.format === "toml") {
        result.mcp = writeTomlMcpConfig(filePath);
      } else {
        result.mcp = writeJsonMcpConfig(filePath, def.mcp.rootKey);
      }
    }

    // Write instruction file
    if (def.instructions) {
      const filePath = resolve(def.instructions.path);
      result.instructions = writeInstructionFile(filePath, def.instructions.format);
    }

    // Write permissions
    if (def.permissions) {
      const filePath = resolve(def.permissions.path);
      result.permissions = writePermissions(filePath, def.permissions.allowRules);
    }

    results.push(result);
  }

  return { platforms: results };
}

// ---------------------------------------------------------------------------
// Silent instruction refresh — called on proxy startup
// ---------------------------------------------------------------------------

export function refreshInstructions(): void {
  const detected = detectPlatforms();

  for (const { def } of detected) {
    if (!def.instructions) continue;
    const filePath = resolve(def.instructions.path);
    try {
      writeInstructionFile(filePath, def.instructions.format);
    } catch {
      // Silent — proxy startup shouldn't fail over this
    }
  }
}


