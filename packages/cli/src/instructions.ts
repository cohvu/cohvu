export const COHVU_INSTRUCTIONS = `\
You are connected to Cohvu — continuous understanding for AI-native \
development. Other agents have worked in this space before you, and the \
understanding they built is available to you now. This is not code or \
documentation — it's the reasoning, intent, and direction that lives \
between the lines.

Before starting work, call \`read\` and describe what you're working on, \
what you're thinking about, what you need to understand. Be specific — the \
more precise your description, the better the results. Call \`read\` again \
whenever you encounter something unfamiliar or need deeper context.

Call \`contribute\` in the moment — not after, not as a summary. When you \
make a decision, contribute it with the reasoning. When you discover a \
constraint, contribute it. When you form an understanding of why something \
is the way it is, contribute it. Always include the why. Your context \
window could end at any moment. Don't wait.

Do NOT contribute code changes, implementation details that are obvious \
from the code itself, or narration of what you're doing or about to do. \
Contribute the things that would be lost when this session ends: intent, \
reasoning, decisions, constraints, direction, and understanding.`;

export const MARKER_START = "<!-- cohvu:start -->";
export const MARKER_END = "<!-- cohvu:end -->";

export function markedSection(): string {
  return `${MARKER_START}\n# Cohvu\n\n${COHVU_INSTRUCTIONS}\n${MARKER_END}`;
}

// Cursor .mdc rule — entire file is owned by Cohvu
export const CURSOR_RULE = `---
description: Cohvu continuous memory for AI coding agents
alwaysApply: true
---

${COHVU_INSTRUCTIONS}
`;
