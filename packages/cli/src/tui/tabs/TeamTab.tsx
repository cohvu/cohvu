import React from 'react';
import { Box, Text, Spacer, useStdout } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject, getActiveTeam } from '../state.js';
import { timeUntil, truncate } from '../utils.js';
import { Divider } from '../components/Divider.js';

export function TeamTab({ state }: { state: AppState }) {
  const { stdout } = useStdout();
  const width = stdout.columns - 1;
  const project = getActiveProject(state);

  const team = getActiveTeam(state);

  if (!project || project.owner.kind === 'personal' || !team) {
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Text color="gray">  personal project — no team members to manage</Text>
      </Box>
    );
  }
  const userId = state.user?.id;
  const isAdmin = state.userRole === 'admin';
  const memberCount = state.members.length;

  return (
    <Box flexDirection="column">
      <Box height={1} />
      {team && (
        <>
          <Box>
            <Box width={12}><Text color="gray" dimColor>  team</Text></Box>
            <Text dimColor>{team.name}</Text>
          </Box>
          <Box height={1} />
        </>
      )}

      {/* Member list */}
      {state.members.map((m, i) => {
        const isYou = m.user_id === userId;
        const email = m.email ?? m.name ?? m.user_id;
        const memberRole = m.role ?? 'member';
        const roleLabel = isYou ? `${memberRole} · you` : memberRole;
        const selected = isAdmin && state.teamSelected === i;

        const demoteApproval = state.pendingApprovals.find(
          a => a.action === 'demote_admin' && a.target_user_id === m.user_id
        );

        return (
          <React.Fragment key={m.user_id}>
            <Box>
              <Text>{selected ? '> ' : '  '}</Text>
              <Box width={38}>
                <Text {...(isYou || selected ? {} : { dimColor: true })}>{email}</Text>
              </Box>
              <Box width={16}>
                <Text color="gray">{roleLabel}</Text>
              </Box>
            </Box>
            {demoteApproval && (
              <Box>
                <Text>    </Text>
                <Text color="yellow">! </Text>
                <Text color="gray">pending demotion  {demoteApproval.approved_by.length}/{demoteApproval.required_count} approved  expires {timeUntil(demoteApproval.expires_at)}</Text>
              </Box>
            )}
          </React.Fragment>
        );
      })}

      {/* Solo message */}
      {memberCount <= 1 && (
        <>
          <Box height={1} />
          <Text color="gray" dimColor>  just you so far.</Text>
        </>
      )}

      {/* Inline error */}
      {state.inlineError && (
        <>
          <Box height={1} />
          <Text color="red">  {state.inlineError}</Text>
        </>
      )}

      {/* Settings section — admin only */}
      {isAdmin && (
        <>
          <Box height={1} />
          <Divider />
          <Box height={1} />
          <Text color="gray">  settings</Text>
          <Box height={1} />

          {/* Name row — index memberCount + 0 */}
          {(() => {
            const sel = state.teamSelected === memberCount + 0;
            return (
              <Box>
                <Text>{sel ? '> ' : '  '}</Text>
                <Box width={12}><Text color="gray" dimColor>name</Text></Box>
                <Text {...(sel ? {} : { dimColor: true })}>{team?.name ?? ''}</Text>
              </Box>
            );
          })()}

          {/* Consensus row — index memberCount + 1 */}
          {(() => {
            const sel = state.teamSelected === memberCount + 1;
            return (
              <Box>
                <Text>{sel ? '> ' : '  '}</Text>
                <Box width={12}><Text color="gray" dimColor>consensus</Text></Box>
                <Text {...(sel ? {} : { dimColor: true })}>{state.requireConsensus ? 'on' : 'off'}</Text>
              </Box>
            );
          })()}

          {/* SSO row — index memberCount + 2 */}
          {(() => {
            const sel = state.teamSelected === memberCount + 2;
            const ssoLabel = state.ssoConfig?.issuer
              ? state.ssoConfig.issuer.replace(/^https?:\/\//, '')
              : 'not configured';
            return (
              <Box>
                <Text>{sel ? '> ' : '  '}</Text>
                <Box width={12}><Text color="gray" dimColor>sso</Text></Box>
                <Text {...(sel ? {} : { dimColor: true })}>{ssoLabel}</Text>
              </Box>
            );
          })()}

          <Box height={1} />
          <Text color="gray">  invite links</Text>

          {/* Invite link rows — indices memberCount + 3, +4, +5 */}
          {['admin', 'member', 'viewer'].map((role, li) => {
            const link = state.inviteLinks.find(l => l.role === role);
            if (!link) return null;
            const linkIdx = memberCount + 3 + li;
            const selected = state.teamSelected === linkIdx;
            const linkWidth = selected ? width - 24 : width - 12;

            return (
              <Box key={role}>
                <Text>{selected ? '> ' : '  '}</Text>
                <Box width={9}><Text color="gray" dimColor>{role}</Text></Box>
                <Text {...(selected ? {} : { dimColor: true })}>{truncate(link.url, linkWidth)}</Text>
                {selected && (
                  state.copiedFeedback
                    ? <Text color="green">  copied!</Text>
                    : <Text color="gray" dimColor>  c copy  r regen</Text>
                )}
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
