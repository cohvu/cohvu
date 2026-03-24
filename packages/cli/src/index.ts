#!/usr/bin/env node

// Cohvu CLI — one command.
//
//   npx cohvu   — TUI dashboard (interactive) or MCP proxy (piped by agent)

import { createInterface } from "readline";
import chalk from "chalk";
import ora from "ora";

import { getApiKey, deviceAuthFlow } from "./auth.js";
import { runSetup } from "./setup.js";
import { proxy } from "./proxy.js";
import { ApiClient, ApiError } from "./api.js";
import { launchDashboard } from "./tui/index.js";
import { DEFAULT_BASE_URL } from "./constants.js";

if (process.stdin.isTTY) {
  enterDashboard().catch((error: unknown) => {
    process.stderr.write(`Failed: ${error}\n`);
    process.exit(1);
  });
} else {
  proxy().catch((error: unknown) => {
    process.stderr.write(`Cohvu CLI failed: ${error}\n`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Dashboard entry — handles auth + setup + project creation before TUI
// ---------------------------------------------------------------------------

async function enterDashboard(): Promise<void> {
  const baseUrl = process.env.COHVU_API_URL ?? DEFAULT_BASE_URL;
  const needsAuth = !getApiKey();

  if (needsAuth) {
    await deviceAuthFlow(baseUrl);
    const api = new ApiClient(baseUrl);
    const me = await api.me();

    const setupSpinner = ora({ text: 'setting up your tools', indent: 2 }).start();
    await runSetup();
    setupSpinner.succeed('tools configured');

    const hasProjects = me.personal_projects.length > 0 ||
      me.teams.some(t => t.projects.length > 0);

    if (!hasProjects) {
      console.log('');
      let name = '';
      while (!name) {
        name = await prompt('  project name \u203a ');
        if (!name) console.log(chalk.dim('  a project name is required'));
      }

      const slug = deriveSlug(name);
      try {
        await api.createProject(name, slug, me.user.id);

        // Trial is set server-side during project creation (7 days)
        const trialDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const formatted = `${months[trialDate.getMonth()]} ${trialDate.getDate()}`;
        console.log('  created ' + slug + chalk.dim(' \u00b7 trial ends ' + formatted));
      } catch {
        console.log(chalk.dim("  couldn't create project \u2014 try again from the dashboard"));
      }
      console.log('');
    }
  } else {
    // Validate API key still works
    try {
      const api = new ApiClient(baseUrl);
      await api.me();
    } catch (err: unknown) {
      // Only delete credentials on auth failure (401), not network errors
      const isAuthError = err instanceof ApiError && err.status === 401;
      if (isAuthError) {
        const { unlinkSync } = await import("fs");
        const { join } = await import("path");
        const { homedir } = await import("os");
        try { unlinkSync(join(homedir(), ".cohvu", "credentials")); } catch {}
        console.log('');
        console.log(chalk.dim('  session expired'));
        await deviceAuthFlow(baseUrl);
      } else {
        // Network error — proceed anyway, TUI will handle offline state
      }
    }
  }

  const openSpinner = ora({ text: 'opening cohvu', indent: 2 }).start();
  await new Promise((r) => setTimeout(r, needsAuth ? 500 : 200));
  openSpinner.stop();
  process.stdout.write('\x1b[2K\x1b[1A\x1b[2K'); // clean spinner lines

  await launchDashboard();
}
