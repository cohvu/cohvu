import React from 'react';
import { Box, Text } from 'ink';
import type { AppState } from '../state.js';
import { getActiveProject, getActiveTeam } from '../state.js';

export function Footer({ state }: { state: AppState }) {
  if (state.modal) return <ModalFooter modal={state.modal} />;

  let hint = '';
  switch (state.tab) {
    case 'knowledge': hint = knowledgeHint(state); break;
    case 'team': hint = teamHint(state); break;
    case 'billing': hint = billingHint(state); break;
    case 'project': hint = projectHint(state); break;
    case 'you': hint = 'r re-run setup   l logout   q quit'; break;
  }

  return <Box><Text color="gray">{hint}</Text></Box>;
}

function knowledgeHint(state: AppState): string {
  switch (state.knowledgeMode) {
    case 'browse':
      if (state.memories.length === 0) return 'tab switch tab   q quit';
      if (state.userRole === 'viewer') return '/ search   \u2191\u2193 navigate   tab switch   q quit';
      if (state.userRole === 'admin') return '/ search   d forget   D forget all   \u2191\u2193 navigate   q quit';
      return '/ search   d forget   \u2191\u2193 navigate   q quit';
    case 'search':
      if (state.userRole === 'viewer') return 'enter search   esc cancel   \u2191\u2193 navigate';
      return 'enter search   esc cancel   \u2325d forget   \u2191\u2193 navigate';
    case 'forget':
      if (state.forgetConfirming) {
        const n = state.forgetSelected.size;
        return `remove ${n} memor${n === 1 ? 'y' : 'ies'}? y confirm   n cancel`;
      }
      return 'space toggle   enter confirm   esc cancel';
  }
}

function teamHint(state: AppState): string {
  const project = getActiveProject(state);
  if (!project || project.owner.kind === 'personal') return 'q quit';
  if (state.userRole !== 'admin') return 'x leave   q quit';

  const memberCount = state.members.length;
  const sel = state.teamSelected;
  const onMemberRow = sel < memberCount;
  const onSettingsRow = sel >= memberCount && sel < memberCount + 3;
  const onLinkRow = sel >= memberCount + 3;

  if (onLinkRow) return '\u2191\u2193 navigate   c copy   r regen   q quit';
  if (onSettingsRow) return '\u2191\u2193 navigate   enter select   q quit';

  if (state.pendingApprovals.length > 0 && onMemberRow) return '\u2191\u2193 navigate   a approve   x cancel   e edit role   q quit';
  if (state.pendingApprovals.length > 0) return '\u2191\u2193 navigate   a approve   x cancel   q quit';

  const others = state.members.filter(m => m.user_id !== state.user?.id);
  if (onMemberRow && others.length > 0) return '\u2191\u2193 navigate   i invite   e edit role   x remove   d delete team   q quit';
  return '\u2191\u2193 navigate   i invite   d delete team   q quit';
}

function billingHint(state: AppState): string {
  if (state.userRole !== 'admin') return 'q quit';
  const project = getActiveProject(state);
  if (!project) return 'q quit';

  const isTeam = project.owner.kind === 'team';

  if (isTeam) {
    const team = getActiveTeam(state);
    const sub = team?.subscription;
    if (sub && (sub.status === 'canceled' || sub.cancel_at_period_end)) return 's resubscribe   q quit';
    if (!sub || sub.status !== 'active') return 's subscribe   q quit';
    return 'p billing portal   q quit';
  }

  const sub = state.individualSubscription;
  if (sub && (sub.status === 'canceled' || sub.cancel_at_period_end)) return 's resubscribe   q quit';
  if (!sub || sub.status !== 'active') return 's subscribe   q quit';
  return 'p billing portal   q quit';
}

function projectHint(state: AppState): string {
  if (state.userRole === 'admin') {
    const hasPending = state.pendingApprovals.some(
      a => a.action === 'delete_project' || a.action === 'clear_memories'
    );
    const parts = ['r rename', 't team', 'n new'];
    if (state.projects.length > 1) parts.push('w switch');
    if (hasPending) { parts.push('a approve', 'x cancel'); }
    else { parts.push('c clear', 'd delete'); }
    parts.push('q quit');
    return parts.join('   ');
  }
  const parts = ['t team', 'n new'];
  if (state.projects.length > 1) parts.push('w switch');
  parts.push('q quit');
  return parts.join('   ');
}

function ModalFooter({ modal }: { modal: NonNullable<AppState['modal']> }) {
  let hint = '';
  switch (modal.kind) {
    case 'confirm-forget':
    case 'confirm-remove-member':
    case 'confirm-leave':
    case 'confirm-logout':
      hint = 'y confirm   n cancel'; break;
    case 'confirm-forget-all':
    case 'confirm-delete':
    case 'confirm-clear':
    case 'rename':
      hint = 'enter confirm   esc cancel'; break;
    case 'create-project':
      hint = 'enter create   esc cancel'; break;
    case 'switch-project':
      hint = '\u2191\u2193 navigate   enter select   esc cancel'; break;
    case 'edit-role':
      hint = '\u2191\u2193 navigate   enter confirm   esc cancel'; break;
    case 'initiate-consensus':
    case 'confirm-regen-link':
      hint = 'y confirm   n cancel'; break;
    case 'approve-action':
      hint = 'y approve   n decline   esc back'; break;
    case 'create-team':
    case 'confirm-rename-team':
      hint = 'enter confirm   esc cancel'; break;
    case 'create-team-project':
      hint = 'enter create   esc cancel'; break;
    case 'select-owner':
    case 'invite':
      hint = '\u2191\u2193 navigate   enter select   esc cancel'; break;
    case 'invite-link':
      hint = 'c copy   o open in browser   esc back'; break;
    case 'manage-sso':
      hint = 'e edit   d delete   esc back'; break;
    case 'configure-sso':
      if ((modal as any).step === 7) hint = 'enter confirm   esc cancel';
      else if ((modal as any).step === 5) hint = '\u2191\u2193 select   enter next   esc cancel';
      else if ((modal as any).step === 6) hint = 'y yes   n no   esc cancel';
      else hint = 'enter next   esc cancel';
      break;
    case 'confirm-delete-team':
      hint = 'enter confirm   esc cancel'; break;
  }
  return <Box><Text color="gray">{hint}</Text></Box>;
}
