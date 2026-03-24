import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { Divider } from '../components/Divider.js';

export function YouTab({ state }: { state: AppState }) {
  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Box>
        <Text dimColor>  {state.user?.email ?? ''}</Text>
        <Text color="gray" dimColor>  ·  </Text>
        <Text color="gray">{state.userRole}</Text>
      </Box>
      <Box height={1} />
      <Divider />
      <Box height={1} />

      {/* Platform setup */}
      <Text color="gray">  tools</Text>
      <Box height={1} />
      {state.platforms.map(p => (
        p.state === 'configured'
          ? (
            <Box key={p.name}>
              <Box width={15}><Text color="gray">  {p.name}</Text></Box>
              <Text color="green">✓  </Text>
              <Text color="gray">configured</Text>
            </Box>
          )
          : (
            <Box key={p.name}>
              <Box width={15}><Text color="gray" dimColor>  {p.name}</Text></Box>
              <Text color="gray">—  not detected</Text>
            </Box>
          )
      ))}

      <Box height={1} />
      <Divider />
      <Box height={1} />
      <Text color="gray" dimColor>  for setup help visit <Text color="gray">github.com/cohvu/cohvu</Text></Text>
    </Box>
  );
}
