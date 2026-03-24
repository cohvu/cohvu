import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../state.js';

export function Toast({ toast }: { toast: NonNullable<AppState['toast']> }) {
  if (Date.now() > toast.expiresAt) return null;
  const color = toast.type === 'success' ? 'green' : toast.type === 'error' ? 'red' : 'gray';
  return (
    <Box>
      <Text color={color}>  {toast.message}</Text>
    </Box>
  );
}
