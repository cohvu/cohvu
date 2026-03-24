import React from 'react';
import { Box, Text, useStdout } from 'ink';

export function Divider() {
  const { stdout } = useStdout();
  const width = Math.max(1, stdout.columns - 1);
  return (
    <Box>
      <Text color="gray" dimColor>{'─'.repeat(width)}</Text>
    </Box>
  );
}
