import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { truncate, timeAgo, wrapText } from '../utils.js';

export function KnowledgeTab({ state, height }: { state: AppState; height: number }) {
  switch (state.knowledgeMode) {
    case 'browse': return <BrowseMode state={state} height={height} />;
    case 'search': return <SearchMode state={state} height={height} />;
    case 'forget': return <ForgetMode state={state} height={height} />;
  }
}

function BrowseMode({ state, height }: { state: AppState; height: number }) {
  const { stdout } = useStdout();
  const width = stdout.columns - 1;

  if (state.memories.length === 0 && !state.memoryLoading) {
    if (state.offline || state.error) {
      return (
        <Box flexDirection="column" alignItems="center" justifyContent="center" height={height}>
          <Text color="red">{state.error ?? "can't reach cohvu"}</Text>
          <Text color="gray" dimColor>check your connection and restart</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={height}>
        <Text color="gray">your agents will start contributing automatically</Text>
        <Text color="gray" dimColor>open any agent and start working</Text>
      </Box>
    );
  }

  const maxLines = height - 3;
  const visible = state.memories.slice(state.memoryScroll, state.memoryScroll + maxLines);
  const rows: React.ReactNode[] = [];
  let linesUsed = 0;

  for (let i = 0; i < visible.length && linesUsed < maxLines; i++) {
    const mem = visible[i];
    const globalIdx = state.memoryScroll + i;
    const isSelected = globalIdx === state.memorySelected;
    const isLive = mem.id === state.liveDotId && Date.now() < state.liveDotExpiry;
    const bodyWidth = width - 12;

    if (isSelected) {
      rows.push(
        <Box key={mem.id} width={width}>
          <Text>{'> '}</Text>
          <Text color={isLive ? 'green' : 'gray'} dimColor={!isLive}>· </Text>
          <Text>{truncate(mem.body, bodyWidth)}</Text>
          <Box flexGrow={1} />
          {mem.memory_type && <Text color="gray" dimColor>{mem.memory_type}  </Text>}
          <Text color="gray">{timeAgo(mem.updated_at)}</Text>
        </Box>
      );
      linesUsed++;

      const bodyLines = wrapText(mem.body, width - 6);
      if (bodyLines.length > 1 && linesUsed < maxLines) {
        rows.push(
          <Box key={`${mem.id}-1`}>
            <Text color="gray">    {truncate(bodyLines[1], width - 6)}</Text>
          </Box>
        );
        linesUsed++;
      }
      if (bodyLines.length > 2 && linesUsed < maxLines) {
        rows.push(
          <Box key={`${mem.id}-2`}>
            <Text color="gray">    {truncate(bodyLines[2], width - 6)}{bodyLines.length > 3 ? '…' : ''}</Text>
          </Box>
        );
        linesUsed++;
      }
    } else {
      rows.push(
        <Box key={mem.id} width={width}>
          <Text>{'  '}</Text>
          <Text color={isLive ? 'green' : 'gray'} dimColor={!isLive}>· </Text>
          <Text dimColor>{truncate(mem.body, bodyWidth)}</Text>
          <Box flexGrow={1} />
          {mem.memory_type && <Text color="gray" dimColor>{mem.memory_type}  </Text>}
          <Text color="gray">{timeAgo(mem.updated_at)}</Text>
        </Box>
      );
      linesUsed++;
    }
  }

  // Pagination
  let pagination = '';
  if (state.memories.length > 0) {
    const start = state.memoryScroll + 1;
    const end = Math.min(state.memoryScroll + maxLines, state.memories.length);
    pagination = `${start}\u2013${end} of ${state.memoryTotal}`;
    if (state.memoryHasMore) pagination += '  ·  space for more';
  }

  return (
    <Box flexDirection="column">
      <Box height={1} />
      {rows}
      <Box height={1} />
      <Text color="gray">  {pagination}</Text>
    </Box>
  );
}

function SearchMode({ state, height }: { state: AppState; height: number }) {
  const { stdout } = useStdout();
  const width = stdout.columns - 1;

  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Box>
        <Text color="gray">  / </Text>
        <Text>{state.searchQuery}_</Text>
      </Box>
      <Box height={1} />
      <Box><Text color="gray" dimColor>  {'─'.repeat(width - 4)}</Text></Box>
      <Box height={1} />
      {state.searching ? (
        <Text color="gray" dimColor>  searching…</Text>
      ) : state.searchResults === null ? null : state.searchResults.length === 0 ? (
        <Text color="gray">  no results</Text>
      ) : (
        <>
          {state.searchResults.map((mem, i) => {
            const isSelected = i === state.memorySelected;
            const isLive = mem.id === state.liveDotId && Date.now() < state.liveDotExpiry;
            const bodyWidth = width - 12;
            return (
              <Box key={mem.id} width={width}>
                <Text>{isSelected ? '> ' : '  '}</Text>
                <Text color={isLive ? 'green' : 'gray'} dimColor={!isLive}>· </Text>
                <Text {...(isSelected ? {} : { dimColor: true })}>{truncate(mem.body, bodyWidth)}</Text>
                <Box flexGrow={1} />
                <Text color="gray">{timeAgo(mem.updated_at)}</Text>
              </Box>
            );
          })}
          <Box height={1} />
          <Text color="gray">  {state.searchResults.length} result{state.searchResults.length !== 1 ? 's' : ''}</Text>
        </>
      )}
    </Box>
  );
}

function ForgetMode({ state, height }: { state: AppState; height: number }) {
  const { stdout } = useStdout();
  const width = stdout.columns - 1;
  const list = state.searchResults ?? state.memories;
  const filtered = state.userRole === 'admin'
    ? list
    : list.filter(m => m.contributed_by?.user_id === state.user?.id);

  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Text color="gray">  select memories to remove · space to toggle</Text>
      <Box height={1} />
      {filtered.length === 0 && state.userRole !== 'admin' ? (
        <Text color="gray">  you can only forget memories your agents contributed</Text>
      ) : (
        filtered.map((mem, i) => {
          const isCursor = i === state.memorySelected;
          const isToggled = state.forgetSelected.has(mem.id);
          return (
            <Box key={mem.id}>
              <Text>{isCursor ? '> ' : '  '}</Text>
              {isToggled
                ? <><Text color="red">[x] </Text><Text dimColor>{truncate(mem.body, width - 8)}</Text></>
                : <><Text color="gray" dimColor>[ ] </Text><Text color="gray">{truncate(mem.body, width - 8)}</Text></>
              }
            </Box>
          );
        })
      )}
      <Box height={1} />
      {state.forgetSelected.size > 0
        ? <Text color="yellow" dimColor>  {state.forgetSelected.size} selected</Text>
        : <Text color="gray">  0 selected</Text>
      }
    </Box>
  );
}
