import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject } from '../state.js';
import { formatDate, timeUntil } from '../utils.js';
import { Divider } from '../components/Divider.js';

export function ProjectTab({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const width = stdout.columns - 1;
  const project = getActiveProject(state);

  if (!project) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="gray">  no active project</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Field label="name"><Text dimColor>{project.name}</Text></Field>
      <Field label="slug"><Text color="gray">{project.slug}</Text></Field>
      {project.owner.kind === 'team'
        ? <Field label="owner"><Text color="gray">team: </Text><Text dimColor>{project.owner.teamName}</Text></Field>
        : <Field label="owner"><Text color="gray">personal</Text></Field>
      }
      {project.created_at && (
        <Field label="created"><Text color="gray">{formatDate(project.created_at)}</Text></Field>
      )}

      {/* Actions */}
      <Box height={1} />
      <Divider />
      <Box height={1} />
      {state.userRole === 'admin' && (
        <Box><Text color="gray">  r  </Text><Text dimColor>rename project</Text></Box>
      )}
      <Box><Text color="gray">  n  </Text><Text dimColor>new project</Text></Box>
      {state.projects.length > 1 && (
        <Box><Text color="gray">  w  </Text><Text dimColor>switch project</Text></Box>
      )}

      {/* Destructive — admin only */}
      {state.userRole === 'admin' && (
        <>
          <Box height={1} />
          <Divider />
          <Box height={1} />
          {renderDestructive(state)}
        </>
      )}
    </Box>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box width={12}><Text color="gray" dimColor>  {label}</Text></Box>
      {children}
    </Box>
  );
}

function renderDestructive(state: AppState): React.ReactNode {
  const pendingApproval = state.pendingApprovals.find(
    a => a.action === 'delete_project' || a.action === 'clear_memories'
  );

  if (pendingApproval) {
    const actionLabel = pendingApproval.action === 'delete_project' ? 'delete project' : 'clear memories';
    const approved = pendingApproval.approved_by.length;
    const required = pendingApproval.required_count;
    const expires = timeUntil(pendingApproval.expires_at);
    return (
      <>
        <Box>
          <Text color="yellow">  ! </Text>
          <Text dimColor>pending: {actionLabel}</Text>
          <Text color="gray">  {approved}/{required} approved  expires {expires}</Text>
        </Box>
        <Box>
          <Text color="gray">  a  </Text><Text dimColor>approve</Text>
          <Text>   </Text>
          <Text color="gray">  x  </Text><Text dimColor>cancel</Text>
        </Box>
      </>
    );
  }

  return (
    <>
      <Box><Text color="red">  c  </Text><Text color="gray">clear all memories</Text></Box>
      <Box><Text color="red">  d  </Text><Text color="gray">delete project</Text></Box>
    </>
  );
}
