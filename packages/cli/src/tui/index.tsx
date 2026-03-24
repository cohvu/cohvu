// TUI entry point — manages alt-screen and Ink lifecycle.

import React from 'react';
import { render } from 'ink';
import App from './App.js';

export async function launchDashboard(): Promise<void> {
  // Enter alt-screen + hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l');

  const { waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: false,
  });

  try {
    await waitUntilExit();
  } finally {
    // Show cursor + reset attributes + exit alt-screen
    process.stdout.write('\x1b[?25h\x1b[0m\x1b[?1049l');
    process.exit(0);
  }
}
