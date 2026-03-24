// Device auth flow + API key storage for the Cohvu CLI.
// Stores API key in ~/.cohvu/credentials.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { exec, execFile } from "child_process";
import chalk from "chalk";
import ora from "ora";

const CONFIG_DIR = join(homedir(), ".cohvu");
const API_KEY_FILE = join(CONFIG_DIR, "credentials");
const POLL_INTERVAL_MS = 5000;

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Read the long-lived API key. Returns null if not stored. */
export function getApiKey(): string | null {
  if (!existsSync(API_KEY_FILE)) return null;
  try {
    const key = readFileSync(API_KEY_FILE, "utf-8").trim();
    return key.startsWith("chv_") ? key : null;
  } catch {
    return null;
  }
}

export function storeApiKey(key: string): void {
  ensureConfigDir();
  const tmp = `${API_KEY_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, key, { mode: 0o600 });
  renameSync(tmp, API_KEY_FILE);
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
  } else {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(cmd, [url], () => {});
  }
}

export async function deviceAuthFlow(baseUrl: string): Promise<string> {
  // Request device code
  const deviceRes = await fetch(`${baseUrl}/v1/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!deviceRes.ok) {
    throw new Error(`Device auth request failed: ${deviceRes.status}`);
  }

  const deviceData = (await deviceRes.json()) as {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
  };

  console.log('');
  console.log(chalk.dim('  sign in at ') + deviceData.verification_url);
  console.log(chalk.dim('  code: ') + deviceData.user_code);
  console.log('');
  openBrowser(deviceData.verification_url);

  const spinner = ora({ text: 'waiting for sign in', indent: 2 }).start();

  // Poll for API key
  const deadline = Date.now() + deviceData.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const tokenRes = await fetch(`${baseUrl}/v1/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceData.device_code }),
    });

    if (!tokenRes.ok) {
      const body = (await tokenRes.json()) as { error?: string };
      if (body.error === "authorization_pending") continue;
      if (body.error === "expired_token") {
        spinner.fail('sign in expired');
        throw new Error("Device code expired");
      }
      continue;
    }

    const data = (await tokenRes.json()) as {
      api_key: string;
      user_id: string;
    };

    storeApiKey(data.api_key);
    spinner.succeed('signed in');
    return data.api_key;
  }

  spinner.fail('sign in timed out');
  throw new Error("Device auth timed out");
}
