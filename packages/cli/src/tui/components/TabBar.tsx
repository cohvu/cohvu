import React from 'react';
import { Box, Text } from 'ink';
import { TABS, type Tab } from '../state.js';

const TAB_LABELS: Record<Tab, string> = {
  knowledge: 'Knowledge',
  team: 'Team',
  billing: 'Billing',
  project: 'Project',
  you: 'You',
};

export function TabBar({ active }: { active: Tab }) {
  return (
    <Box>
      {TABS.map(t => (
        t === active
          ? <Text key={t}>[<Text bold>{TAB_LABELS[t]}</Text>]</Text>
          : <Text key={t}>  <Text color="gray">{TAB_LABELS[t]}</Text></Text>
      ))}
    </Box>
  );
}
