import React from 'react';
import { Box, Text, Spacer, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject, getActiveTeam } from '../state.js';
import { daysUntil } from '../utils.js';

export function Header({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const project = getActiveProject(state);
  const projectName = project?.name ?? 'no project';

  return (
    <Box width={stdout.columns}>
      <Text color="gray">cohvu</Text>
      <Text color="gray" dimColor>  ·  </Text>
      <Text dimColor>{projectName}</Text>
      {renderStatus(state)}
      {state.projects.length >= 2 && (
        <>
          <Text color="gray" dimColor>  ·  </Text>
          <Text color="gray">{state.projects.length} projects</Text>
        </>
      )}
      <Spacer />
      <Text color="gray">{state.user?.email ?? ''}</Text>
    </Box>
  );
}

function renderStatus(state: AppState): React.ReactNode {
  if (state.offline) return <><Text color="gray" dimColor>  ·  </Text><Text color="red">offline</Text></>;
  if (!state.sseConnected && state.activeProjectId) return <><Text color="gray" dimColor>  ·  </Text><Text color="gray" dimColor>reconnecting</Text></>;

  const project = getActiveProject(state);
  if (!project) return null;

  if (project.owner.kind === 'team') {
    const team = getActiveTeam(state);
    const sub = team?.subscription;
    if (!sub) {
      const teamData = state.teams.find(t => t.team_id === team?.team_id);
      if (teamData?.trial_ends_at) {
        const days = daysUntil(teamData.trial_ends_at);
        if (days > 0) {
          const label = days === 1 ? '1 day left' : `${days} days left`;
          return <><Text color="gray" dimColor>  ·  </Text><Text color="yellow" dimColor>trial · {label}</Text></>;
        }
      }
      return <><Text color="gray" dimColor>  ·  </Text><Text color="red">locked</Text></>;
    }
    if (sub.status === 'active') return <><Text color="gray" dimColor>  ·  </Text><Text color="green">active</Text></>;
    if (sub.status === 'past_due') return <><Text color="gray" dimColor>  ·  </Text><Text color="red">past due</Text></>;
    if (sub.status === 'canceled' || sub.cancel_at_period_end) return <><Text color="gray" dimColor>  ·  </Text><Text color="red">canceled</Text></>;
    return <><Text color="gray" dimColor>  ·  </Text><Text color="red">locked</Text></>;
  }

  // Personal project
  const user = state.user;
  if (user?.trial_ends_at) {
    const days = daysUntil(user.trial_ends_at);
    if (days > 0) {
      const label = days === 1 ? '1 day left' : `${days} days left`;
      return <><Text color="gray" dimColor>  ·  </Text><Text color="yellow" dimColor>trial · {label}</Text></>;
    }
    if (!state.individualSubscription || state.individualSubscription.status !== 'active') {
      return <><Text color="gray" dimColor>  ·  </Text><Text color="red">trial ended</Text></>;
    }
  }

  const sub = state.individualSubscription;
  if (sub?.status === 'active') return <><Text color="gray" dimColor>  ·  </Text><Text color="green">active</Text></>;
  if (sub?.status === 'past_due') return <><Text color="gray" dimColor>  ·  </Text><Text color="red">past due</Text></>;
  if (sub?.status === 'canceled' || sub?.cancel_at_period_end) return <><Text color="gray" dimColor>  ·  </Text><Text color="red">canceled</Text></>;

  return <><Text color="gray" dimColor>  ·  </Text><Text color="red">locked</Text></>;
}
