import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject, getActiveTeam } from '../state.js';
import { formatDate, daysUntil } from '../utils.js';

export function BillingTab({ state }: { state: AppState }) {
  const project = getActiveProject(state);
  if (!project) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="gray">  no active project</Text>
      </Box>
    );
  }

  if (project.owner.kind === 'team') return <TeamBilling state={state} />;
  return <IndividualBilling state={state} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box width={12}><Text color="gray" dimColor>  {label}</Text></Box>
      {children}
    </Box>
  );
}

function IndividualBilling({ state }: { state: AppState }) {
  const sub = state.individualSubscription;
  const user = state.user;

  // Trial state
  if (user?.trial_ends_at) {
    const days = daysUntil(user.trial_ends_at);
    if (days > 0) {
      return (
        <Box flexDirection="column">
          <Box height={1} />
          <Field label="status"><Text color="yellow" dimColor>trial</Text></Field>
          <Field label="ends">
            <Text dimColor>{formatDate(user.trial_ends_at)}</Text>
            <Text color="gray" dimColor>  ·  </Text>
            <Text color="yellow" dimColor>{days} day{days !== 1 ? 's' : ''} left</Text>
          </Field>
          <Field label="plan"><Text color="gray">$19/month after trial</Text></Field>
        </Box>
      );
    }

    // Trial ended
    if (!sub || sub.status !== 'active') {
      return (
        <Box flexDirection="column">
          <Box height={1} />
          <Text color="red">  trial ended {formatDate(user.trial_ends_at)}</Text>
          <Text color="gray">  subscribe to keep your agents connected</Text>
          <Box height={1} />
          <Field label="plan"><Text color="gray">$19/month</Text></Field>
        </Box>
      );
    }
  }

  // No subscription
  if (!sub) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="red">  locked</Text>
        <Text color="gray">  subscribe to keep your agents connected</Text>
        <Box height={1} />
        <Field label="plan"><Text color="gray">$19/month</Text></Field>
      </Box>
    );
  }

  // Payment failed
  if (sub.status === 'past_due') {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="red">  ! payment failed</Text>
        <Text color="gray">    update your payment method to continue</Text>
      </Box>
    );
  }

  // Canceled
  if (sub.status === 'canceled' || sub.cancel_at_period_end) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="red">  subscription canceled</Text>
        {sub.current_period_end && (
          <Text color="gray">  your agents will stop working {formatDate(sub.current_period_end)}</Text>
        )}
        <Box height={1} />
        {sub.current_period_end && (
          <Field label="ends"><Text dimColor>{formatDate(sub.current_period_end)}</Text></Field>
        )}
      </Box>
    );
  }

  // Active
  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Field label="status"><Text color="green">active</Text></Field>
      <Field label="plan"><Text dimColor>$19/month</Text></Field>
      {sub.current_period_end && (
        <Field label="renews"><Text dimColor>{formatDate(sub.current_period_end)}</Text></Field>
      )}
    </Box>
  );
}

function TeamBilling({ state }: { state: AppState }) {
  const team = getActiveTeam(state);
  if (!team) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="gray">  no team context</Text>
      </Box>
    );
  }

  const sub = team.subscription;
  const isAdmin = state.userRole === 'admin';

  // Team trial
  const teamData = state.teams.find(t => t.team_id === team?.team_id);
  if (!sub && teamData?.trial_ends_at) {
    const days = daysUntil(teamData.trial_ends_at);
    if (days > 0) {
      return (
        <Box flexDirection="column">
          <Box height={1} />
          <Field label="team"><Text dimColor>{team.name}</Text></Field>
          <Field label="status"><Text color="yellow" dimColor>trial</Text></Field>
          <Field label="ends">
            <Text dimColor>{formatDate(teamData.trial_ends_at)}</Text>
            <Text color="gray" dimColor>  ·  </Text>
            <Text color="yellow" dimColor>{days} day{days !== 1 ? 's' : ''} left</Text>
          </Field>
          <Field label="plan"><Text color="gray">$34/seat/month after trial</Text></Field>
        </Box>
      );
    }
  }

  // No subscription
  if (!sub) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Field label="team"><Text dimColor>{team.name}</Text></Field>
        {isAdmin ? (
          <>
            <Text color="red">  no subscription</Text>
            <Text color="gray">  subscribe to keep your agents connected</Text>
            <Box height={1} />
            <Field label="plan"><Text color="gray">$34/seat/month</Text></Field>
          </>
        ) : (
          <Field label="status"><Text color="red">locked</Text></Field>
        )}
      </Box>
    );
  }

  // Payment failed
  if (sub.status === 'past_due') {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Field label="team"><Text dimColor>{team.name}</Text></Field>
        {isAdmin ? (
          <>
            <Text color="red">  ! payment failed</Text>
            <Text color="gray">    update your payment method to continue</Text>
            <Box height={1} />
            <Field label="seats"><Text dimColor>{String(sub.seat_count)}</Text></Field>
          </>
        ) : (
          <>
            <Field label="status"><Text color="red">past due</Text></Field>
            <Field label="seats"><Text dimColor>{String(sub.seat_count)}</Text></Field>
          </>
        )}
      </Box>
    );
  }

  // Canceled
  if (sub.status === 'canceled' || sub.cancel_at_period_end) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Field label="team"><Text dimColor>{team.name}</Text></Field>
        {isAdmin ? (
          <>
            <Text color="red">  subscription canceled</Text>
            {sub.current_period_end && (
              <Text color="gray">  your agents will stop working {formatDate(sub.current_period_end)}</Text>
            )}
            <Box height={1} />
            <Field label="seats"><Text dimColor>{String(sub.seat_count)}</Text></Field>
            {sub.current_period_end && (
              <Field label="ends"><Text dimColor>{formatDate(sub.current_period_end)}</Text></Field>
            )}
          </>
        ) : (
          <>
            <Field label="status"><Text color="red">canceled</Text></Field>
            <Field label="seats"><Text dimColor>{String(sub.seat_count)}</Text></Field>
          </>
        )}
      </Box>
    );
  }

  // Active
  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Field label="team"><Text dimColor>{team.name}</Text></Field>
      {isAdmin ? (
        <>
          <Field label="status"><Text color="green">active</Text></Field>
          <Field label="seats">
            <Text dimColor>{String(sub.seat_count)}</Text>
            <Text color="gray">  (${sub.seat_count * 34}/month)</Text>
          </Field>
          {sub.current_period_end && (
            <Field label="renews"><Text dimColor>{formatDate(sub.current_period_end)}</Text></Field>
          )}
        </>
      ) : (
        <>
          <Field label="status"><Text color="green">active</Text></Field>
          <Field label="seats"><Text dimColor>{String(sub.seat_count)}</Text></Field>
        </>
      )}
    </Box>
  );
}
