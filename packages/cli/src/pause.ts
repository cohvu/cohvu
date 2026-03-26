// Pause flag — file-based, survives restarts.
// The proxy checks this on startup to decide whether to expose tools.

import { existsSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".cohvu");
export const PAUSED_FILE = join(CONFIG_DIR, "paused");

export function isPaused(): boolean {
  return existsSync(PAUSED_FILE);
}

export function setPaused(paused: boolean): void {
  if (paused) {
    writeFileSync(PAUSED_FILE, "1", { mode: 0o600 });
  } else {
    try {
      unlinkSync(PAUSED_FILE);
    } catch {
      // Already gone — that's fine
    }
  }
}
