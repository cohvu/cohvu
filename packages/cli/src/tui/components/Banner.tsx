import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject, getActiveTeam } from '../state.js';
import { daysUntil, timeUntil } from '../utils.js';

export function Banner({ state }: { state: AppState }) {
  const lines = generateBanners(state);
  if (lines.length === 0) return null;
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => <Box key={i}>{line}</Box>)}
    </Box>
  );
}

function generateBanners(state: AppState): React.ReactNode[] {
  const lines: React.ReactNode[] = [];
  const project = getActiveProject(state);

  // Notifications (unseen)
  for (const notif of state.notifications) {
    if (!notif.seen) {
      if (notif.type === 'role_change' && notif.message.includes('admin')) {
        lines.push(<Text key={notif.id}>  <Text color="green"> </Text> <Text dimColor>{notif.message}</Text></Text>);
      } else if (notif.type === 'role_change') {
        lines.push(<Text key={notif.id}>  <Text color="yellow">!</Text> <Text dimColor>{notif.message}</Text></Text>);
      } else if (notif.type === 'approval_completed') {
        lines.push(<Text key={notif.id}>  <Text color="red">!</Text> <Text dimColor>{notif.message}</Text></Text>);
      } else {
        lines.push(<Text key={notif.id}>  <Text color="gray">  {notif.message}</Text></Text>);
      }
    }
  }

  // Pending approvals
  for (const approval of state.pendingApprovals) {
    if (new Date(approval.expires_at) > new Date()) {
      lines.push(
        <Text key={`approval-${approval.id}`}>
          {'  '}<Text color="yellow">! </Text>
          <Text dimColor>{approval.description}</Text>
          <Text color="gray"> · by {approval.initiator_email} · {timeUntil(approval.expires_at)}</Text>
        </Text>
      );
    }
  }

  // Billing banners
  let hasBillingBanner = false;

  if (project) {
    if (project.owner.kind === 'team') {
      const team = getActiveTeam(state);
      const teamSub = team?.subscription;
      if (!teamSub || (teamSub.status !== 'active' && teamSub.status !== 'past_due')) {
        const teamData = state.teams.find(t => t.team_id === team?.team_id);
        if (teamData?.trial_ends_at) {
          const trialDays = daysUntil(teamData.trial_ends_at);
          if (trialDays <= 0) {
            lines.push(
              <Text key="team-trial-end">  <Text color="red">!</Text> <Text dimColor>trial ended · your agents have stopped working</Text> <Text color="gray">· press b to subscribe</Text></Text>
            );
            hasBillingBanner = true;
          } else if (trialDays <= 3) {
            const dayWord = trialDays === 1 ? 'tomorrow' : `in ${trialDays} days`;
            lines.push(
              <Text key="team-trial-warn">  <Text color="yellow">!</Text> <Text dimColor>trial ends {dayWord}</Text> <Text color="gray">· press b to subscribe</Text></Text>
            );
            hasBillingBanner = true;
          }
        } else {
          lines.push(
            <Text key="team-sub">  <Text color="red">!</Text> <Text dimColor>no active team subscription</Text> <Text color="gray">· press b to subscribe</Text></Text>
          );
          hasBillingBanner = true;
        }
      } else if (teamSub.status === 'past_due') {
        lines.push(
          <Text key="team-pd">  <Text color="red">!</Text> <Text dimColor>payment failed</Text> <Text color="gray">· update your payment method · press b</Text></Text>
        );
        hasBillingBanner = true;
      }
    } else {
      const user = state.user;
      const trialDays = user?.trial_ends_at ? daysUntil(user.trial_ends_at) : null;
      const sub = state.individualSubscription;

      if (trialDays !== null && trialDays <= 0 && sub?.status !== 'active') {
        lines.push(
          <Text key="trial-end">  <Text color="red">!</Text> <Text dimColor>trial ended · your agents have stopped working</Text> <Text color="gray">· press b to subscribe</Text></Text>
        );
        hasBillingBanner = true;
      } else if (sub?.status === 'past_due') {
        lines.push(
          <Text key="ind-pd">  <Text color="red">!</Text> <Text dimColor>payment failed</Text> <Text color="gray">· update your payment method · press b</Text></Text>
        );
        hasBillingBanner = true;
      } else if (trialDays !== null && trialDays > 0 && trialDays <= 3) {
        const dayWord = trialDays === 1 ? 'tomorrow' : `in ${trialDays} days`;
        lines.push(
          <Text key="trial-warn">  <Text color="yellow">!</Text> <Text dimColor>trial ends {dayWord}</Text> <Text color="gray">· press b to subscribe</Text></Text>
        );
        hasBillingBanner = true;
      }
    }
  }

  if (!hasBillingBanner) {
    if (state.firstLogin) {
      const configured = state.platforms.filter(p => p.state === 'configured').map(p => p.name);
      if (configured.length > 0) {
        lines.push(
          <Text key="first-login">  <Text color="green"> </Text> <Text dimColor>{configured.join(', ')}</Text> <Text color="gray">ready</Text></Text>
        );
      }
    }
    if (state.joinedProjectName) {
      lines.push(
        <Text key="joined">  <Text color="green"> </Text> <Text dimColor>you joined {state.joinedProjectName}</Text> <Text color="gray">· your agent is ready</Text></Text>
      );
    }
  }

  return lines;
}
