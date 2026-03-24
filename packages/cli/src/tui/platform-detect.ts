// Platform status detection for the You tab.
// Two states: configured or not-detected.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import type { PlatformStatus } from "./state.js";

function vscodeUserDir(): string {
  if (platform() === "darwin") {
    return join("Library", "Application Support", "Code", "User");
  }
  return join(".config", "Code", "User");
}

interface PlatformCheck {
  name: string;
  detectPath: string;
  configPath: string;
  configFormat: 'json' | 'toml';
  rootKey: string;
}

const PLATFORMS: PlatformCheck[] = [
  {
    name: 'claude code',
    detectPath: '.claude',
    configPath: '.claude.json',
    configFormat: 'json',
    rootKey: 'mcpServers',
  },
  {
    name: 'cursor',
    detectPath: '.cursor',
    configPath: join('.cursor', 'mcp.json'),
    configFormat: 'json',
    rootKey: 'mcpServers',
  },
  {
    name: 'windsurf',
    detectPath: join('.codeium', 'windsurf'),
    configPath: join('.codeium', 'windsurf', 'mcp_config.json'),
    configFormat: 'json',
    rootKey: 'mcpServers',
  },
  {
    name: 'cline',
    detectPath: join(vscodeUserDir(), 'globalStorage', 'saoudrizwan.claude-dev'),
    configPath: join(vscodeUserDir(), 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    configFormat: 'json',
    rootKey: 'mcpServers',
  },
  {
    name: 'codex',
    detectPath: '.codex',
    configPath: join('.codex', 'config.toml'),
    configFormat: 'toml',
    rootKey: 'mcp_servers',
  },
];

export function detectPlatformStatuses(): PlatformStatus[] {
  const home = homedir();
  const results: PlatformStatus[] = [];

  for (const p of PLATFORMS) {
    const detectFull = join(home, p.detectPath);

    if (!existsSync(detectFull)) {
      results.push({ name: p.name, state: 'not-detected' });
      continue;
    }

    const configFull = join(home, p.configPath);
    const configured = isConfigured(configFull, p.configFormat, p.rootKey);
    results.push({ name: p.name, state: configured ? 'configured' : 'not-detected' });
  }

  return results;
}

function isConfigured(configPath: string, format: 'json' | 'toml', rootKey: string): boolean {
  if (!existsSync(configPath)) return false;

  try {
    const content = readFileSync(configPath, 'utf8');
    if (format === 'json') {
      const parsed = JSON.parse(content);
      return !!parsed?.[rootKey]?.cohvu;
    }
    return content.includes('[mcp_servers.cohvu]');
  } catch {
    return false;
  }
}
