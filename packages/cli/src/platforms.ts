// Platform definitions and detection for auto-configuration.

import { existsSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

export interface PlatformDef {
  name: string;
  detectPath: string;
  mcp: {
    path: string;
    rootKey: string;
    format: "json" | "toml";
  } | null;
  instructions: {
    path: string;
    format: "markdown" | "mdc";
  } | null;
  permissions: {
    path: string;
    allowRules: string[];
  } | null;
}

function vscodeUserDir(): string {
  if (platform() === "darwin") {
    return join("Library", "Application Support", "Code", "User");
  }
  // Linux / WSL
  return join(".config", "Code", "User");
}

const PLATFORMS: PlatformDef[] = [
  {
    name: "Claude Code",
    detectPath: ".claude",
    mcp: { path: ".claude.json", rootKey: "mcpServers", format: "json" },
    instructions: { path: join(".claude", "CLAUDE.md"), format: "markdown" },
    permissions: {
      path: join(".claude", "settings.json"),
      allowRules: ["mcp__cohvu__*"],
    },
  },
  {
    name: "Cursor",
    detectPath: ".cursor",
    mcp: { path: join(".cursor", "mcp.json"), rootKey: "mcpServers", format: "json" },
    instructions: { path: join(".cursor", "rules", "cohvu.mdc"), format: "mdc" },
    permissions: null,
  },
  {
    name: "Windsurf",
    detectPath: join(".codeium", "windsurf"),
    mcp: {
      path: join(".codeium", "windsurf", "mcp_config.json"),
      rootKey: "mcpServers",
      format: "json",
    },
    instructions: {
      path: join(".codeium", "windsurf", "memories", "global_rules.md"),
      format: "markdown",
    },
    permissions: null,
  },
  {
    name: "Cline",
    detectPath: join(vscodeUserDir(), "globalStorage", "saoudrizwan.claude-dev"),
    mcp: {
      path: join(
        vscodeUserDir(),
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
      ),
      rootKey: "mcpServers",
      format: "json",
    },
    instructions: { path: join("Documents", "Cline", "Rules", "cohvu.md"), format: "markdown" },
    permissions: null,
  },
  {
    name: "Codex",
    detectPath: ".codex",
    mcp: { path: join(".codex", "config.toml"), rootKey: "mcp_servers", format: "toml" },
    instructions: { path: join(".codex", "AGENTS.md"), format: "markdown" },
    permissions: null,
  },
];

export interface DetectedPlatform {
  def: PlatformDef;
}

export function detectPlatforms(): DetectedPlatform[] {
  const home = homedir();
  const detected: DetectedPlatform[] = [];

  for (const def of PLATFORMS) {
    const fullPath = join(home, def.detectPath);
    if (existsSync(fullPath)) {
      detected.push({ def });
    }
  }

  return detected;
}
