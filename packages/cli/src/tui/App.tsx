// Main TUI component — state, data loading, SSE, key handling, and layout.
// Direct translation of dashboard.ts into React hooks.

import React, { useReducer, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { reduce, initialState, TABS, getActiveProject, getActiveTeam, type AppState } from './state.js';
import { ApiClient } from '../api.js';
import { runSetup } from '../setup.js';
import { detectPlatformStatuses } from './platform-detect.js';
import { Header } from './components/Header.js';
import { TabBar } from './components/TabBar.js';
import { Banner } from './components/Banner.js';
import { Footer } from './components/Footer.js';
import { Toast } from './components/Toast.js';
import { Divider } from './components/Divider.js';
import { ModalView } from './components/Modal.js';
import { KnowledgeTab } from './tabs/KnowledgeTab.js';
import { TeamTab } from './tabs/TeamTab.js';
import { BillingTab } from './tabs/BillingTab.js';
import { ProjectTab } from './tabs/ProjectTab.js';
import { YouTab } from './tabs/YouTab.js';
import { daysUntil, timeUntil } from './utils.js';
import { exec, execFile } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, watch, type FSWatcher } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATE_FILE = join(homedir(), '.cohvu', 'state.json');
const PAGE_SIZE = 20;

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows;
  const cols = stdout.columns;

  // ---- State ----
  const [state, rawDispatch] = useReducer(reduce, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const api = useRef(new ApiClient()).current;

  // Timers
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlineErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedDisconnectRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchersRef = useRef<FSWatcher[]>([]);
  const lastSyncErrorAt = useRef(0);
  const busyRef = useRef(false);

  const dispatch = rawDispatch;

  // ---- Helpers ----

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info', durationMs = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    dispatch({ type: 'SET_TOAST', toast: { message, type, expiresAt: Date.now() + durationMs } });
    toastTimerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_TOAST', toast: null });
    }, durationMs);
  }, [dispatch]);

  const showInlineError = useCallback((message: string, durationMs: number) => {
    dispatch({ type: 'SET_INLINE_ERROR', message });
    if (inlineErrorTimerRef.current) clearTimeout(inlineErrorTimerRef.current);
    inlineErrorTimerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_INLINE_ERROR', message: null });
    }, durationMs);
  }, [dispatch]);

  function openBrowser(url: string): void {
    if (process.platform === 'win32') {
      exec(`start "" "${url}"`);
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFile(cmd, [url], () => {});
    }
  }

  function shouldRequireConsensus(s: AppState): boolean {
    if (!s.requireConsensus) return false;
    const admins = s.members.filter(m => m.role === 'admin');
    return admins.length >= 2;
  }

  function copyToClipboard(text: string): void {
    const cmd = process.platform === 'darwin' ? 'pbcopy'
      : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard';
    const child = exec(cmd);
    child.stdin?.write(text);
    child.stdin?.end();
  }

  // ---- SSE feed ----

  const connectFeed = useCallback((projectId: string) => {
    if (feedDisconnectRef.current) feedDisconnectRef.current();
    const conn = api.connectFeed(projectId, {
      onEvent: (eventType, data) => {
        // Guard: ignore events if we've since switched to a different project
        if (stateRef.current.activeProjectId !== projectId) return;
        if (eventType === 'memory') {
          const event = data as { id: string; body: string; updated_at: string; operation: string; contributed_by?: Record<string, unknown>; memory_type?: string };
          if (event.operation === 'create') {
            dispatch({ type: 'ADD_MEMORY', memory: { id: event.id, body: event.body, updated_at: event.updated_at, contributed_by: event.contributed_by, memory_type: event.memory_type } });
            dispatch({ type: 'SET_LIVE_DOT', memoryId: event.id });
            if (liveDotTimerRef.current) clearTimeout(liveDotTimerRef.current);
            liveDotTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_LIVE_DOT' }), 10000);
          } else if (event.operation === 'update') {
            dispatch({ type: 'UPDATE_MEMORY', memory: { id: event.id, body: event.body, updated_at: event.updated_at } });
            dispatch({ type: 'SET_LIVE_DOT', memoryId: event.id });
            if (liveDotTimerRef.current) clearTimeout(liveDotTimerRef.current);
            liveDotTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_LIVE_DOT' }), 10000);
          } else if (event.operation === 'delete') {
            dispatch({ type: 'REMOVE_MEMORY', id: event.id });
          }
        } else if (eventType === 'role_change') {
          api.me().then(me => dispatch({ type: 'SET_USER_DATA', me })).catch(() => {
            if (Date.now() - lastSyncErrorAt.current > 30000) {
              lastSyncErrorAt.current = Date.now();
              showToast('Sync error', 'error');
            }
          });
        } else if (eventType === 'notification') {
          api.listNotifications().then(notifications => {
            dispatch({ type: 'SET_NOTIFICATIONS', notifications });
            api.markNotificationsSeen().catch(() => {});
          }).catch(() => {
            if (Date.now() - lastSyncErrorAt.current > 30000) {
              lastSyncErrorAt.current = Date.now();
              showToast('Sync error', 'error');
            }
          });
        } else if (eventType === 'approval') {
          const team = getActiveTeam(stateRef.current);
          if (team) {
            api.listApprovals(team.team_id).then(approvals => {
              dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
            }).catch(() => {});
          }
        }
      },
      onConnected: () => {
        dispatch({ type: 'SET_SSE_CONNECTED', connected: true });
        // Refresh memories on reconnection — guard against stale project
        if (stateRef.current.activeProjectId === projectId) {
          api.listMemories(projectId, { limit: PAGE_SIZE, offset: 0 }).then(result => {
            if (result && stateRef.current.activeProjectId === projectId) {
              dispatch({ type: 'SET_MEMORIES', memories: result.memories, total: result.total });
            }
          }).catch(() => {});
        }
      },
      onDisconnected: () => {
        dispatch({ type: 'SET_SSE_CONNECTED', connected: false });
      },
    });
    feedDisconnectRef.current = conn.disconnect;
  }, [api, dispatch, showToast]);

  // ---- Data loading ----

  const loadTabData = useCallback(async () => {
    const s = stateRef.current;
    const projectId = s.activeProjectId;
    if (!projectId) return;

    const activeProject = getActiveProject(s);
    const activeTeam = getActiveTeam(s);
    const isTeamProject = activeProject?.owner.kind === 'team';

    try {
      switch (s.tab) {
        case 'knowledge': {
          dispatch({ type: 'SET_LOADING', loading: true });
          const result = await api.listMemories(projectId, { limit: PAGE_SIZE, offset: 0 });
          // Guard: project may have changed during async load
          if (stateRef.current.activeProjectId !== projectId) break;
          dispatch({ type: 'SET_MEMORIES', memories: result.memories, total: result.total });
          break;
        }
        case 'team': {
          if (isTeamProject && activeTeam) {
            const [members, links] = await Promise.all([
              api.listTeamMembers(activeTeam.team_id),
              api.listTeamInviteLinks(activeTeam.team_id).catch(() => [] as Awaited<ReturnType<typeof api.listTeamInviteLinks>>),
            ]);
            if (stateRef.current.activeProjectId !== projectId) break;
            dispatch({ type: 'SET_MEMBERS', members });
            dispatch({ type: 'SET_INVITE_LINKS', links });
            const approvals = await api.listApprovals(activeTeam.team_id).catch(() => []);
            if (stateRef.current.activeProjectId !== projectId) break;
            dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
          } else {
            dispatch({ type: 'SET_MEMBERS', members: [] });
            dispatch({ type: 'SET_INVITE_LINKS', links: [] });
          }
          break;
        }
        case 'billing': {
          if (isTeamProject && activeTeam) {
            const billing = await api.getTeamBilling(activeTeam.team_id);
            if (stateRef.current.activeProjectId !== projectId) break;
            dispatch({ type: 'SET_BILLING', billing });
          } else {
            const billing = await api.getIndividualBilling();
            if (stateRef.current.activeProjectId !== projectId) break;
            dispatch({ type: 'SET_BILLING', billing });
          }
          break;
        }
      }
    } catch { showToast('Failed to load data', 'error'); }
  }, [api, dispatch, showToast]);

  const loadMoreMemories = useCallback(async () => {
    const s = stateRef.current;
    const projectId = s.activeProjectId;
    if (!projectId || !s.memoryHasMore) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const result = await api.listMemories(projectId, { limit: PAGE_SIZE, offset: s.memories.length });
      dispatch({ type: 'SET_MEMORIES', memories: result.memories, total: result.total, append: true });
    } catch {
      showToast('Failed to load more', 'error');
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [api, dispatch, showToast]);

  // ---- Project switching (single source of truth) ----
  // Every flow that changes the active project calls this.

  const switchToProject = useCallback((projectId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    connectFeed(projectId);
    pollIntervalRef.current = setInterval(async () => {
      const ps = stateRef.current;
      if (ps.tab !== 'knowledge' || ps.activeProjectId !== projectId) return;
      try {
        const result = await api.listMemories(projectId, { limit: PAGE_SIZE, offset: 0 });
        if (result && stateRef.current.activeProjectId === projectId && result.total !== stateRef.current.memoryTotal) {
          dispatch({ type: 'SET_MEMORIES', memories: result.memories, total: result.total });
        }
      } catch {}
    }, 30_000);
    setTimeout(() => loadTabData(), 0);
  }, [api, connectFeed, dispatch, loadTabData]);

  const executeSearch = useCallback(async () => {
    const s = stateRef.current;
    const projectId = s.activeProjectId;
    if (!projectId || s.searchQuery.length === 0) return;
    dispatch({ type: 'SET_SEARCHING', searching: true });
    try {
      const result = await api.searchMemories(projectId, s.searchQuery);
      dispatch({ type: 'SET_SEARCH_RESULTS', results: result.memories });
    } catch { showToast('Search failed', 'error'); }
    dispatch({ type: 'SET_SEARCHING', searching: false });
  }, [api, dispatch, showToast]);

  // ---- Initial data load ----

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // First-login state
      const saved = loadPersistedState();
      if (!saved.hasOpenedDashboard) {
        dispatch({ type: 'SET_FIRST_LOGIN', firstLogin: true });
      }

      try {
        const me = await api.me();
        if (cancelled) return;
        dispatch({ type: 'SET_USER_DATA', me });

        // Detect platforms without re-running setup (setup already ran in enterDashboard)
        const platforms = detectPlatformStatuses();
        dispatch({ type: 'SET_PLATFORMS', platforms });

        const flatProjects = deriveFlatProjectsFromMe(me);
        const activeProject = flatProjects.find(p => p.project_id === me.user.active_project_id) ?? flatProjects[0] ?? null;
        const projectId = activeProject?.project_id ?? null;
        const isTeamProject = activeProject?.owner.kind === 'team';
        const activeTeamId = isTeamProject && activeProject.owner.kind === 'team' ? activeProject.owner.teamId : null;
        const activeTeam = activeTeamId ? me.teams.find(t => t.team_id === activeTeamId) : null;

        if (projectId) {
          let loadError = false;
          const [memResult, members, billing, inviteLinks, notifications] = await Promise.all([
            api.listMemories(projectId, { limit: PAGE_SIZE, offset: 0 }).catch(() => { loadError = true; return null; }),
            isTeamProject && activeTeam
              ? api.listTeamMembers(activeTeam.team_id).catch(() => { loadError = true; return [] as Awaited<ReturnType<typeof api.listTeamMembers>>; })
              : Promise.resolve([] as Awaited<ReturnType<typeof api.listTeamMembers>>),
            isTeamProject && activeTeam
              ? api.getTeamBilling(activeTeam.team_id).catch(() => { loadError = true; return null; })
              : api.getIndividualBilling().catch(() => { loadError = true; return null; }),
            isTeamProject && activeTeam
              ? api.listTeamInviteLinks(activeTeam.team_id).catch(() => [] as Awaited<ReturnType<typeof api.listTeamInviteLinks>>)
              : Promise.resolve([] as Awaited<ReturnType<typeof api.listTeamInviteLinks>>),
            api.listNotifications().catch(() => [] as Awaited<ReturnType<typeof api.listNotifications>>),
          ]);

          if (cancelled) return;
          if (loadError) showToast('Some data failed to load', 'error');

          if (memResult) dispatch({ type: 'SET_MEMORIES', memories: memResult.memories, total: memResult.total });
          dispatch({ type: 'SET_MEMBERS', members });
          if (billing) dispatch({ type: 'SET_BILLING', billing });
          dispatch({ type: 'SET_INVITE_LINKS', links: inviteLinks });
          dispatch({ type: 'SET_NOTIFICATIONS', notifications });

          if (isTeamProject && activeTeam) {
            dispatch({ type: 'SET_REQUIRE_CONSENSUS', value: activeTeam.require_consensus ?? false });
            const ssoConfig = await api.getSso(activeTeam.team_id).catch(() => null);
            if (ssoConfig) dispatch({ type: 'SET_SSO_CONFIG', config: ssoConfig });
          }

          if (isTeamProject && activeTeam) {
            const approvals = await api.listApprovals(activeTeam.team_id).catch(() => []);
            dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
          }

          if (notifications.length > 0) api.markNotificationsSeen().catch(() => {});

          connectFeed(projectId);

          // Background poll
          pollIntervalRef.current = setInterval(async () => {
            const s = stateRef.current;
            if (s.tab !== 'knowledge' || s.activeProjectId !== projectId) return;
            try {
              const result = await api.listMemories(projectId, { limit: PAGE_SIZE, offset: 0 });
              if (result && stateRef.current.activeProjectId === projectId && result.total !== stateRef.current.memoryTotal) {
                dispatch({ type: 'SET_MEMORIES', memories: result.memories, total: result.total });
              }
            } catch {}
          }, 30_000);
        }

        if (!saved.hasOpenedDashboard) {
          savePersistedState({ hasOpenedDashboard: true });
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'SET_OFFLINE', offline: true });
          dispatch({ type: 'SET_ERROR', error: "can't reach cohvu" });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (feedDisconnectRef.current) feedDisconnectRef.current();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- File watchers ----

  useEffect(() => {
    const configPaths = [
      join(homedir(), '.claude.json'),
      join(homedir(), '.cursor', 'mcp.json'),
    ];

    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const w = watch(configPath, () => {
            const platforms = detectPlatformStatuses();
            dispatch({ type: 'SET_PLATFORMS', platforms });
          });
          watchersRef.current.push(w);
        } catch {}
      }
    }

    return () => {
      watchersRef.current.forEach(w => w.close());
      watchersRef.current = [];
    };
  }, [dispatch]);

  // ---- Cleanup timers on unmount ----

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (liveDotTimerRef.current) clearTimeout(liveDotTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (inlineErrorTimerRef.current) clearTimeout(inlineErrorTimerRef.current);
    };
  }, []);

  // ---- Key handling ----

  useInput((input, key) => {
    void handleKey(input, key);
  });

  async function handleKey(input: string, key: import('ink').Key): Promise<void> {
    const s = stateRef.current;

    // Global: ctrl+c always exits
    if (input === 'c' && key.ctrl) { exit(); return; }

    // Global: q exits (unless modal open or in knowledge search/forget mode)
    if (input === 'q' && !s.modal && !(s.tab === 'knowledge' && s.knowledgeMode !== 'browse')) { exit(); return; }

    // Prevent re-entrant async operations (double-press protection)
    if (busyRef.current && (key.return || input === 'y')) return;


    // Modal keys
    if (s.modal) {
      await handleModalKey(input, key);
      return;
    }

    // Approval keys (when approvals exist, on team/project tab, team project)
    if ((input === 'a' || input === 'x') && !s.modal && s.pendingApprovals.length > 0 && (s.tab === 'team' || s.tab === 'project')) {
      const activeProject = getActiveProject(s);
      if (activeProject?.owner.kind === 'team') {
        const approval = s.pendingApprovals[0];
        if (input === 'a') {
          dispatch({ type: 'OPEN_MODAL', modal: {
            kind: 'approve-action',
            approvalId: approval.id,
            description: approval.description,
            initiator: approval.initiator_email,
            expiresIn: timeUntil(approval.expires_at),
          } });
        } else if (input === 'x') {
          const team = getActiveTeam(s);
          if (team) {
            try {
              await api.cancelApproval(team.team_id, approval.id);
              const approvals = await api.listApprovals(team.team_id);
              dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
              showToast('Canceled', 'success');
            } catch { showToast('Failed to cancel', 'error'); }
          }
        }
        return;
      }
    }

    // Tab switching
    if (key.tab) {
      dispatch({ type: 'NEXT_TAB' });
      setTimeout(() => loadTabData(), 0);
      return;
    }

    // Number keys switch tabs (but not when typing in search mode)
    const tabIdx = parseInt(input, 10);
    if (tabIdx >= 1 && tabIdx <= 5 && !key.ctrl && !key.meta && !(s.tab === 'knowledge' && s.knowledgeMode !== 'browse')) {
      dispatch({ type: 'SWITCH_TAB', tab: TABS[tabIdx - 1] });
      setTimeout(() => loadTabData(), 0);
      return;
    }

    // Global 'b' shortcut — subscribe/billing portal from banner
    if (input === 'b' && s.userRole === 'admin' && s.tab !== 'billing') {
      await handleBillingShortcut();
      return;
    }

    // Tab-specific keys
    switch (s.tab) {
      case 'knowledge': await handleKnowledgeKey(input, key); break;
      case 'team': await handleTeamKey(input, key); break;
      case 'billing': await handleBillingKey(input, key); break;
      case 'project': await handleProjectKey(input, key); break;
      case 'you': await handleYouKey(input, key); break;
    }
  }

  // ---- Knowledge keys ----

  async function handleKnowledgeKey(input: string, key: import('ink').Key): Promise<void> {
    const s = stateRef.current;

    // alt+d or ∂ enters forget mode
    if (((key.meta && input === 'd') || input === '∂') && s.userRole !== 'viewer') {
      const list = s.searchResults ?? s.memories;
      if (list.length > 0) dispatch({ type: 'ENTER_FORGET' });
      return;
    }

    if (s.knowledgeMode === 'search') {
      if (key.escape) { dispatch({ type: 'EXIT_SEARCH' }); }
      else if (key.return && s.searchQuery.length > 0) { await executeSearch(); }
      else if (key.backspace || key.delete) { dispatch({ type: 'SEARCH_BACKSPACE' }); }
      else if (input === ' ') { dispatch({ type: 'SEARCH_INPUT', char: ' ' }); }
      else if (key.upArrow) { dispatch({ type: 'SCROLL_UP' }); }
      else if (key.downArrow) { dispatch({ type: 'SCROLL_DOWN' }); }
      else if (input.length === 1 && !key.ctrl && !key.meta) {
        dispatch({ type: 'SEARCH_INPUT', char: input });
      }
      return;
    }

    if (s.knowledgeMode === 'forget') {
      const forgetList = s.searchResults ?? s.memories;
      const filtered = s.userRole === 'admin'
        ? forgetList
        : forgetList.filter(m => m.contributed_by?.user_id === s.user?.id);

      if (s.forgetConfirming && input === 'y') {
        const projectId = s.activeProjectId;
        if (projectId) {
          let failures = 0;
          dispatch({ type: 'SET_OPERATION', operation: 'Removing memories' });
          await Promise.all(
            [...s.forgetSelected].map(async (id) => {
              try {
                await api.deleteMemory(projectId, id);
                dispatch({ type: 'REMOVE_MEMORY', id });
              } catch { failures++; }
            })
          );
          dispatch({ type: 'SET_OPERATION', operation: null });
          dispatch({ type: 'EXIT_FORGET' });
          if (failures > 0) showToast(`${failures} failed to remove`, 'error');
          else showToast('Removed', 'success');
        }
      } else if (s.forgetConfirming && (key.escape || input === 'n')) {
        dispatch({ type: 'SET_FORGET_CONFIRMING', confirming: false });
      } else if (key.escape) {
        dispatch({ type: 'EXIT_FORGET' });
      } else if (input === ' ') {
        const mem = filtered[s.memorySelected];
        if (mem) dispatch({ type: 'TOGGLE_FORGET', memoryId: mem.id });
      } else if (key.upArrow) {
        if (s.memorySelected > 0) dispatch({ type: 'SCROLL_UP' });
      } else if (key.downArrow) {
        if (s.memorySelected < filtered.length - 1) dispatch({ type: 'SCROLL_DOWN' });
      } else if (key.return && s.forgetSelected.size > 0 && !s.forgetConfirming) {
        dispatch({ type: 'SET_FORGET_CONFIRMING', confirming: true });
      }
      return;
    }

    // Browse mode
    if (input === '/') { dispatch({ type: 'ENTER_SEARCH' }); }
    else if (input === 'd' && s.userRole !== 'viewer' && s.memories.length > 0) {
      dispatch({ type: 'ENTER_FORGET' });
    }
    else if (input === 'D' && s.userRole === 'admin') {
      const project = getActiveProject(s);
      if (project) dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-forget-all', slug: project.slug, memoryCount: s.memoryTotal, input: '' } });
    }
    else if (key.upArrow) { dispatch({ type: 'SCROLL_UP' }); }
    else if (key.downArrow) { dispatch({ type: 'SCROLL_DOWN' }); }
    else if (input === ' ') { await loadMoreMemories(); }
  }

  // ---- Team keys ----

  async function handleTeamKey(input: string, key: import('ink').Key): Promise<void> {
    const s = stateRef.current;
    const activeProject = getActiveProject(s);
    if (!activeProject || activeProject.owner.kind === 'personal') return;

    const team = getActiveTeam(s);
    if (!team) return;

    const memberCount = s.members.length;
    const linkRoles = ['admin', 'member', 'viewer'];
    // Settings rows (admin only): name, consensus, sso, then 3 invite link rows
    const settingsCount = s.userRole === 'admin' ? 6 : 0; // 3 settings + 3 links
    const totalRows = memberCount + settingsCount;
    const sel = s.teamSelected;
    const onMemberRow = sel < memberCount;
    const onLinkRow = s.userRole === 'admin' && sel >= memberCount + 3;

    if (key.upArrow) { dispatch({ type: 'SET_TEAM_SELECTED', index: Math.max(0, sel - 1) }); return; }
    if (key.downArrow) { dispatch({ type: 'SET_TEAM_SELECTED', index: Math.min(totalRows - 1, sel + 1) }); return; }

    // 'i' key (admin) — open invite modal
    if (input === 'i' && s.userRole === 'admin') {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'invite', selected: 0 } });
      return;
    }

    // Enter or 'r' key on name row — rename team
    if ((key.return || input === 'r') && s.userRole === 'admin' && sel === memberCount + 0) {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-rename-team', input: '' } });
      return;
    }

    // 'r' key on invite link row — regen link
    if (input === 'r' && s.userRole === 'admin' && onLinkRow) {
      const linkIdx = sel - memberCount - 3;
      const role = linkRoles[linkIdx];
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-regen-link', role } });
      return;
    }

    // Enter on consensus row — toggle
    if (key.return && s.userRole === 'admin' && sel === memberCount + 1) {
      if (team) {
        try {
          const newValue = !s.requireConsensus;
          await api.updateTeamSettings(team.team_id, { require_consensus: newValue });
          dispatch({ type: 'SET_REQUIRE_CONSENSUS', value: newValue });
          showToast(newValue ? 'Consensus required' : 'Consensus off', 'success');
        } catch { showToast('Failed to update', 'error'); }
      }
      return;
    }

    // Enter or 's' key on SSO row — configure or manage SSO
    if ((key.return || input === 's') && s.userRole === 'admin' && sel === memberCount + 2) {
      if (s.ssoConfig) {
        // SSO already exists — offer edit/delete
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'manage-sso' } });
      } else {
        dispatch({ type: 'OPEN_MODAL', modal: {
          kind: 'configure-sso', step: 1, issuer: '', clientId: '', clientSecret: '', domains: '', defaultRole: 0, requireSso: false,
        } });
      }
      return;
    }

    // 'c' key on invite link row — copy link
    if (input === 'c' && s.userRole === 'admin' && onLinkRow) {
      const linkIdx = sel - memberCount - 3;
      const role = linkRoles[linkIdx];
      const link = s.inviteLinks.find(l => l.role === role);
      if (link) {
        copyToClipboard(link.url);
        dispatch({ type: 'SET_COPIED_FEEDBACK', active: true });
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => dispatch({ type: 'SET_COPIED_FEEDBACK', active: false }), 1500);
      }
      return;
    }

    // 'o' key on invite link row — open in browser
    if (input === 'o' && s.userRole === 'admin' && onLinkRow) {
      const linkIdx = sel - memberCount - 3;
      const role = linkRoles[linkIdx];
      const link = s.inviteLinks.find(l => l.role === role);
      if (link) openBrowser(link.url);
      return;
    }

    // 'd' key (admin) — delete team
    if (input === 'd' && s.userRole === 'admin') {
      if (team) {
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-delete-team', slug: team.slug, teamName: team.name, input: '' } });
      }
      return;
    }

    // 'e' key on member row — edit role
    if (input === 'e' && s.userRole === 'admin' && onMemberRow) {
      const target = s.members[sel];
      if (target) {
        if (target.user_id === s.user?.id) { showInlineError('you cannot change your own role', 2000); return; }
        const roleIdx = ['admin', 'member', 'viewer'].indexOf(target.role ?? 'member');
        dispatch({ type: 'OPEN_MODAL', modal: {
          kind: 'edit-role',
          targetEmail: target.email ?? target.user_id,
          targetUserId: target.user_id,
          currentRole: target.role ?? 'member',
          selected: roleIdx >= 0 ? roleIdx : 1,
        }});
      }
      return;
    }

    // 'x' key — remove member or leave
    if (input === 'x') {
      if (s.userRole === 'admin' && onMemberRow && team) {
        const target = s.members[sel];
        if (target) {
          if (target.user_id === s.user?.id) {
            const adminCount = s.members.filter(m => m.role === 'admin').length;
            if (adminCount <= 1) { showInlineError('you are the only admin · promote another member before leaving', 3000); return; }
            dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-leave' } });
          } else {
            dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-remove-member', email: target.email ?? target.user_id, userId: target.user_id } });
          }
        }
      } else if (s.userRole !== 'admin') {
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-leave' } });
      }
    }
  }

  // ---- Billing keys ----

  async function handleBillingKey(input: string, _key: import('ink').Key): Promise<void> {
    const s = stateRef.current;
    if (s.userRole !== 'admin') return;
    const project = getActiveProject(s);
    if (!project) return;
    const isTeam = project.owner.kind === 'team';
    const team = getActiveTeam(s);

    if (input === 's') {
      try {
        showToast('Opening checkout...', 'info');
        if (isTeam && team) {
          const checkout = await api.createTeamCheckout(team.team_id);
          if (checkout.checkout_url) openBrowser(checkout.checkout_url);
        } else {
          const checkout = await api.createIndividualCheckout();
          if (checkout.checkout_url) openBrowser(checkout.checkout_url);
        }
      } catch { showToast('Failed to open checkout', 'error'); }
    } else if (input === 'p') {
      try {
        showToast('Opening billing portal...', 'info');
        if (isTeam && team) {
          const portal = await api.getTeamPortalUrl(team.team_id);
          if (portal.url) openBrowser(portal.url);
        } else {
          const portal = await api.getIndividualPortalUrl();
          if (portal.url) openBrowser(portal.url);
        }
      } catch { showToast('Failed to open billing portal', 'error'); }
    }
  }

  // ---- Project keys ----

  async function handleProjectKey(input: string, _key: import('ink').Key): Promise<void> {
    const s = stateRef.current;
    if (input === 't') {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'create-team', input: '' } });
      return;
    }
    if (input === 'r' && s.userRole === 'admin' && s.activeProjectId) {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'rename', input: '' } });
    } else if (input === 'n') {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'select-owner', selected: 0 } });
    } else if (input === 'w' && s.projects.length > 1) {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'switch-project', selected: 0 } });
    } else if (input === 'c' && s.userRole === 'admin') {
      const project = getActiveProject(s);
      if (project) dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-clear', slug: project.slug, memoryCount: s.memoryTotal, input: '' } });
    } else if (input === 'd' && s.userRole === 'admin') {
      const project = getActiveProject(s);
      if (project) dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-delete', slug: project.slug, memoryCount: s.memoryTotal, input: '' } });
    }
  }

  // ---- You keys ----

  async function handleYouKey(input: string, _key: import('ink').Key): Promise<void> {
    if (input === 'r') {
      await runSetup();
      const platforms = detectPlatformStatuses();
      dispatch({ type: 'SET_PLATFORMS', platforms });
    } else if (input === 'l') {
      dispatch({ type: 'OPEN_MODAL', modal: { kind: 'confirm-logout' } });
    }
  }

  // ---- Billing shortcut (from banner) ----

  async function handleBillingShortcut(): Promise<void> {
    const s = stateRef.current;
    const project = getActiveProject(s);
    if (!project) return;
    const isTeam = project.owner.kind === 'team';
    const team = getActiveTeam(s);

    if (isTeam && team) {
      const sub = team.subscription;
      if (!sub || sub.status !== 'active') {
        try { showToast('Opening checkout...', 'info'); const c = await api.createTeamCheckout(team.team_id); if (c.checkout_url) openBrowser(c.checkout_url); }
        catch { showToast('Failed to open checkout', 'error'); }
      } else {
        try { showToast('Opening billing portal...', 'info'); const p = await api.getTeamPortalUrl(team.team_id); if (p.url) openBrowser(p.url); }
        catch { showToast('Failed to open billing portal', 'error'); }
      }
    } else {
      const sub = s.individualSubscription;
      if (!sub || sub.status !== 'active') {
        try { showToast('Opening checkout...', 'info'); const c = await api.createIndividualCheckout(); if (c.checkout_url) openBrowser(c.checkout_url); }
        catch { showToast('Failed to open checkout', 'error'); }
      } else {
        try { showToast('Opening billing portal...', 'info'); const p = await api.getIndividualPortalUrl(); if (p.url) openBrowser(p.url); }
        catch { showToast('Failed to open billing portal', 'error'); }
      }
    }
  }

  // ---- Modal keys ----

  async function handleModalKey(input: string, key: import('ink').Key): Promise<void> {
    const s = stateRef.current;
    if (!s.modal) return;

    if (key.escape) { dispatch({ type: 'CLOSE_MODAL' }); return; }

    const modal = s.modal;

    // y/n modals
    if (modal.kind === 'confirm-forget' || modal.kind === 'confirm-remove-member' ||
        modal.kind === 'confirm-leave' || modal.kind === 'confirm-logout' ||
        modal.kind === 'confirm-regen-link' || modal.kind === 'initiate-consensus' ||
        modal.kind === 'approve-action') {
      if (input === 'y') {
        const willExit = modal.kind === 'confirm-logout';
        await confirmModal(modal);
        if (!willExit) dispatch({ type: 'CLOSE_MODAL' });
      }
      else if (input === 'n') { dispatch({ type: 'CLOSE_MODAL' }); }
      return;
    }

    // Text input modals
    if ('input' in modal) {
      if (key.return) { const chained = await confirmModal(modal); if (!chained) dispatch({ type: 'CLOSE_MODAL' }); }
      else if (key.backspace || key.delete) { dispatch({ type: 'MODAL_BACKSPACE' }); }
      else if (input === ' ') { dispatch({ type: 'MODAL_INPUT', char: ' ' }); }
      else if (input.length === 1 && !key.ctrl && !key.meta) { dispatch({ type: 'MODAL_INPUT', char: input }); }
      return;
    }

    // Switch project modal
    if (modal.kind === 'switch-project') {
      if (key.upArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'switch-project', selected: Math.max(0, modal.selected - 1) } });
      } else if (key.downArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'switch-project', selected: Math.min(s.projects.length, modal.selected + 1) } });
      } else if (key.return) {
        if (modal.selected === s.projects.length) {
          dispatch({ type: 'CLOSE_MODAL' });
          dispatch({ type: 'OPEN_MODAL', modal: { kind: 'select-owner', selected: 0 } });
        } else {
          const project = s.projects[modal.selected];
          if (project) {
            try {
              await api.switchProject(project.project_id);
              const me = await api.me();
              dispatch({ type: 'SET_USER_DATA', me });
              dispatch({ type: 'CLOSE_MODAL' });
              const newProjectId = me.user.active_project_id;
              if (newProjectId) switchToProject(newProjectId);
            } catch {
              dispatch({ type: 'CLOSE_MODAL' });
              showToast('Failed to switch project', 'error');
            }
          }
        }
      }
      return;
    }

    // Edit role modal
    if (modal.kind === 'edit-role') {
      const roles = ['admin', 'member', 'viewer'];
      if (key.upArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.max(0, modal.selected - 1) } });
      } else if (key.downArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.min(roles.length - 1, modal.selected + 1) } });
      } else if (key.return) {
        const newRole = roles[modal.selected];
        if (newRole !== modal.currentRole) {
          if (modal.currentRole === 'admin' && newRole !== 'admin') {
            const adminCount = s.members.filter(m => m.role === 'admin').length;
            if (adminCount <= 1) {
              showInlineError('cannot demote the last admin · promote another member first', 2000);
              dispatch({ type: 'CLOSE_MODAL' });
              return;
            }
          }
          if (shouldRequireConsensus(stateRef.current) && modal.currentRole === 'admin' && newRole !== 'admin') {
            const team = getActiveTeam(stateRef.current);
            if (team) {
              try {
                await api.initiateApproval(team.team_id, 'demote_admin', `demote ${modal.targetEmail} from admin`, modal.targetUserId);
                const approvals = await api.listApprovals(team.team_id);
                dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
                dispatch({ type: 'CLOSE_MODAL' });
                showToast('Approval requested', 'info');
              } catch { showToast('Failed to request approval', 'error'); dispatch({ type: 'CLOSE_MODAL' }); }
              return;
            }
          }
          const changeTeam = getActiveTeam(s);
          if (changeTeam) {
            try {
              await api.changeTeamRole(changeTeam.team_id, modal.targetUserId, newRole);
              const members = await api.listTeamMembers(changeTeam.team_id);
              dispatch({ type: 'SET_MEMBERS', members });
              showToast('Role updated', 'success');
            } catch { showToast('Failed to update role', 'error'); }
          }
        }
        dispatch({ type: 'CLOSE_MODAL' });
      }
    }

    // Select owner modal
    if (modal.kind === 'select-owner') {
      const itemCount = 1 + s.teams.length + 1; // "personal" + each team + "+ new team"
      if (key.upArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.max(0, modal.selected - 1) } });
      } else if (key.downArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.min(itemCount - 1, modal.selected + 1) } });
      } else if (key.return) {
        dispatch({ type: 'CLOSE_MODAL' });
        if (modal.selected === 0) {
          // Personal
          dispatch({ type: 'OPEN_MODAL', modal: { kind: 'create-project', input: '', teamId: null } });
        } else if (modal.selected <= s.teams.length) {
          // Existing team
          const team = s.teams[modal.selected - 1];
          dispatch({ type: 'OPEN_MODAL', modal: { kind: 'create-project', input: '', teamId: team.team_id } });
        } else {
          // + new team → chains to create-team → create-team-project
          dispatch({ type: 'OPEN_MODAL', modal: { kind: 'create-team', input: '' } });
        }
      }
      return;
    }

    // Invite modal — select role
    if (modal.kind === 'invite') {
      const roles = ['admin', 'member', 'viewer'];
      if (key.upArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.max(0, modal.selected - 1) } });
      } else if (key.downArrow) {
        dispatch({ type: 'OPEN_MODAL', modal: { ...modal, selected: Math.min(2, modal.selected + 1) } });
      } else if (key.return) {
        const role = roles[modal.selected];
        const link = s.inviteLinks.find(l => l.role === role);
        if (link) {
          dispatch({ type: 'CLOSE_MODAL' });
          dispatch({ type: 'OPEN_MODAL', modal: { kind: 'invite-link', role, url: link.url } });
        } else {
          dispatch({ type: 'CLOSE_MODAL' });
          showToast('Invite link not available', 'error');
        }
      }
      return;
    }

    // Invite link modal — copy or open
    if (modal.kind === 'invite-link') {
      if (input === 'c') {
        copyToClipboard(modal.url);
        dispatch({ type: 'SET_COPIED_FEEDBACK', active: true });
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => dispatch({ type: 'SET_COPIED_FEEDBACK', active: false }), 1500);
      } else if (input === 'o') {
        openBrowser(modal.url);
        showToast('Opened in browser', 'info');
      }
      return;
    }

    // Manage existing SSO — edit or delete
    if (modal.kind === 'manage-sso') {
      if (input === 'e') {
        // Edit — open wizard pre-filled with current values
        const sso = s.ssoConfig;
        dispatch({ type: 'CLOSE_MODAL' });
        dispatch({ type: 'OPEN_MODAL', modal: {
          kind: 'configure-sso', step: 1,
          issuer: sso?.issuer ?? '', clientId: '', clientSecret: '',
          domains: sso?.allowed_domains.join(', ') ?? '', defaultRole: ['member', 'viewer', 'admin'].indexOf(sso?.default_role ?? 'member'),
          requireSso: sso?.require_sso ?? false,
        } });
      } else if (input === 'd') {
        const team = getActiveTeam(s);
        if (team) {
          try {
            await api.deleteSso(team.team_id);
            dispatch({ type: 'SET_SSO_CONFIG', config: null });
            dispatch({ type: 'CLOSE_MODAL' });
            showToast('SSO removed', 'success');
          } catch { showToast('Failed to remove SSO', 'error'); }
        }
      }
      return;
    }

    // Configure SSO wizard
    if (modal.kind === 'configure-sso') {
      if (key.escape) { dispatch({ type: 'CLOSE_MODAL' }); return; }

      const fieldMap: Record<number, keyof typeof modal> = { 1: 'issuer', 2: 'clientId', 3: 'clientSecret', 4: 'domains' };

      if (modal.step >= 1 && modal.step <= 4) {
        const field = fieldMap[modal.step]!;
        const current = modal[field] as string;
        if (key.return && current.length > 0) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, step: modal.step + 1 } });
        } else if (key.backspace || key.delete) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, [field]: current.slice(0, -1) } });
        } else if (input === ' ') {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, [field]: current + ' ' } });
        } else if (input.length === 1 && !key.ctrl && !key.meta) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, [field]: current + input } });
        }
      } else if (modal.step === 5) {
        // Role selection (member=0, viewer=1, admin=2)
        if (key.upArrow) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, defaultRole: Math.max(0, modal.defaultRole - 1) } });
        } else if (key.downArrow) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, defaultRole: Math.min(2, modal.defaultRole + 1) } });
        } else if (key.return) {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, step: 6 } });
        }
      } else if (modal.step === 6) {
        // Require SSO toggle
        if (input === 'y') {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, requireSso: true, step: 7 } });
        } else if (input === 'n') {
          dispatch({ type: 'OPEN_MODAL', modal: { ...modal, requireSso: false, step: 7 } });
        }
      } else if (modal.step === 7) {
        // Confirm
        if (key.return) {
          const team = getActiveTeam(s);
          if (team) {
            const roles = ['member', 'viewer', 'admin'];
            try {
              dispatch({ type: 'SET_OPERATION', operation: 'Configuring SSO' });
              const ssoPayload = {
                issuer: modal.issuer,
                client_id: modal.clientId,
                client_secret: modal.clientSecret,
                allowed_domains: modal.domains.split(',').map((d: string) => d.trim()).filter(Boolean),
                default_role: roles[modal.defaultRole],
                require_sso: modal.requireSso,
              };
              if (s.ssoConfig) {
                await api.updateSso(team.team_id, ssoPayload);
              } else {
                await api.configureSso(team.team_id, ssoPayload);
              }
              const ssoConfig = await api.getSso(team.team_id);
              dispatch({ type: 'SET_SSO_CONFIG', config: ssoConfig });
              dispatch({ type: 'SET_OPERATION', operation: null });
              showToast('SSO configured', 'success');
            } catch {
              dispatch({ type: 'SET_OPERATION', operation: null });
              showToast('Failed to configure SSO', 'error');
            }
          }
          dispatch({ type: 'CLOSE_MODAL' });
        }
      }
      return;
    }
  }

  // ---- Modal confirmation ----

  async function confirmModal(modal: NonNullable<AppState['modal']>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      return await confirmModalInner(modal);
    } finally {
      busyRef.current = false;
    }
  }

  async function confirmModalInner(modal: NonNullable<AppState['modal']>): Promise<boolean> {
    const s = stateRef.current;

    // Logout doesn't need a project
    if (modal.kind === 'confirm-logout') {
      try {
        const credentialsFile = join(homedir(), '.cohvu', 'credentials');
        if (existsSync(credentialsFile)) unlinkSync(credentialsFile);
      } catch {}
      exit();
      return false;
    }

    // These modals don't require an active project
    if (modal.kind === 'create-project') {
      if (!modal.input) return false;
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      try {
        dispatch({ type: 'SET_OPERATION', operation: 'Creating project' });
        const project = modal.teamId
          ? await api.createTeamProject(modal.teamId, modal.input, slug)
          : await api.createProject(modal.input, slug);
        await api.switchProject(project.id);
        const me = await api.me();
        dispatch({ type: 'SET_USER_DATA', me });
        dispatch({ type: 'SET_OPERATION', operation: null });
        const newProjectId = me.user.active_project_id;
        if (newProjectId) switchToProject(newProjectId);
        showToast('Project created', 'success');
      } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to create project', 'error'); }
      return false;
    }

    if (modal.kind === 'create-team') {
      if (!modal.input) return false;
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      try {
        dispatch({ type: 'SET_OPERATION', operation: 'Creating team' });
        const team = await api.createTeam(modal.input, slug);
        dispatch({ type: 'CLOSE_MODAL' });
        dispatch({ type: 'OPEN_MODAL', modal: { kind: 'create-team-project', teamId: team.id, teamName: modal.input, input: '' } });
        dispatch({ type: 'SET_OPERATION', operation: null });
        return true; // chained to create-team-project — caller must not CLOSE_MODAL
      } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to create team', 'error'); }
      return false;
    }

    if (modal.kind === 'create-team-project') {
      if (!modal.input) return false;
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      try {
        dispatch({ type: 'SET_OPERATION', operation: 'Creating project' });
        const project = await api.createTeamProject(modal.teamId, modal.input, slug);
        await api.switchProject(project.id);
        const me = await api.me();
        dispatch({ type: 'SET_USER_DATA', me });
        dispatch({ type: 'SET_OPERATION', operation: null });
        const newProjectId = me.user.active_project_id;
        if (newProjectId) switchToProject(newProjectId);
        showToast('Team created', 'success');
      } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to create project', 'error'); }
      return false;
    }

    const projectId = s.activeProjectId;
    if (!projectId) return false;

    switch (modal.kind) {
      case 'approve-action': {
        const team = getActiveTeam(s);
        if (team && 'approvalId' in modal) {
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Approving' });
            await api.approveAction(team.team_id, (modal as any).approvalId);
            const approvals = await api.listApprovals(team.team_id);
            dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
            dispatch({ type: 'SET_OPERATION', operation: null });
            const me = await api.me();
            dispatch({ type: 'SET_USER_DATA', me });
            await loadTabData();
            showToast('Approved', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to approve', 'error'); }
        }
        break;
      }

      case 'confirm-forget':
        try {
          dispatch({ type: 'SET_OPERATION', operation: 'Removing memory' });
          await api.deleteMemory(projectId, modal.memoryId);
          dispatch({ type: 'REMOVE_MEMORY', id: modal.memoryId });
          dispatch({ type: 'SET_OPERATION', operation: null });
          showToast('Memory removed', 'success');
        } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to remove memory', 'error'); }
        break;

      case 'confirm-forget-all':
      case 'confirm-clear': {
        const project = getActiveProject(s);
        if (project && modal.input === project.slug) {
          if (shouldRequireConsensus(s)) {
            const team = getActiveTeam(s);
            if (team) {
              try {
                await api.initiateApproval(team.team_id, 'clear_memories', `clear all memories from "${project.slug}"`, projectId);
                const approvals = await api.listApprovals(team.team_id);
                dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
                showToast('Approval requested', 'info');
              } catch { showToast('Failed to request approval', 'error'); }
              break;
            }
          }
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Clearing memories' });
            await api.clearMemories(projectId);
            dispatch({ type: 'SET_MEMORIES', memories: [], total: 0 });
            dispatch({ type: 'SET_OPERATION', operation: null });
            showToast('All memories cleared', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to clear memories', 'error'); }
        }
        break;
      }

      case 'confirm-delete': {
        const project = getActiveProject(s);
        if (project && modal.input === project.slug) {
          if (shouldRequireConsensus(s)) {
            const team = getActiveTeam(s);
            if (team) {
              try {
                await api.initiateApproval(team.team_id, 'delete_project', `delete project "${project.slug}"`, projectId);
                const approvals = await api.listApprovals(team.team_id);
                dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
                showToast('Approval requested', 'info');
              } catch { showToast('Failed to request approval', 'error'); }
              break;
            }
          }
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Deleting project' });
            await api.deleteProject(projectId);
            const me = await api.me();
            dispatch({ type: 'SET_USER_DATA', me });
            dispatch({ type: 'SWITCH_TAB', tab: 'knowledge' });
            dispatch({ type: 'SET_OPERATION', operation: null });
            const newProjectId = me.user.active_project_id;
            if (newProjectId) {
              switchToProject(newProjectId);
            } else {
              if (feedDisconnectRef.current) { feedDisconnectRef.current(); feedDisconnectRef.current = null; }
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              dispatch({ type: 'SET_MEMORIES', memories: [], total: 0 });
              dispatch({ type: 'SET_MEMBERS', members: [] });
            }
            showToast('Project deleted', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to delete project', 'error'); }
        }
        break;
      }

      case 'confirm-remove-member': {
        const teamForRemove = getActiveTeam(s);
        if (teamForRemove) {
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Removing member' });
            await api.removeTeamMember(teamForRemove.team_id, modal.userId);
            const members = await api.listTeamMembers(teamForRemove.team_id);
            dispatch({ type: 'SET_MEMBERS', members });
            dispatch({ type: 'SET_OPERATION', operation: null });
            showToast('Member removed', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to remove member', 'error'); }
        }
        break;
      }

      case 'confirm-leave': {
        const teamForLeave = getActiveTeam(s);
        if (teamForLeave) {
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Leaving' });
            await api.removeTeamMember(teamForLeave.team_id, s.user!.id);
            const me = await api.me();
            dispatch({ type: 'SET_USER_DATA', me });
            dispatch({ type: 'SWITCH_TAB', tab: 'knowledge' });
            dispatch({ type: 'SET_OPERATION', operation: null });
            const newProjectId = me.user.active_project_id;
            if (newProjectId) {
              switchToProject(newProjectId);
            } else {
              if (feedDisconnectRef.current) { feedDisconnectRef.current(); feedDisconnectRef.current = null; }
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              dispatch({ type: 'SET_MEMORIES', memories: [], total: 0 });
              dispatch({ type: 'SET_MEMBERS', members: [] });
            }
            showToast('Left', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to leave', 'error'); }
        }
        break;
      }

      // confirm-logout handled above (before projectId check)

      case 'rename': {
        if (!modal.input) break;
        const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        try {
          dispatch({ type: 'SET_OPERATION', operation: 'Renaming' });
          await api.renameProject(projectId, modal.input, slug);
          const me = await api.me();
          dispatch({ type: 'SET_USER_DATA', me });
          dispatch({ type: 'SET_OPERATION', operation: null });
          showToast('Project renamed', 'success');
        } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to rename', 'error'); }
        break;
      }

      case 'confirm-regen-link': {
        const teamForRegen = getActiveTeam(s);
        if (teamForRegen) {
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Regenerating link' });
            await api.regenerateTeamInviteLink(teamForRegen.team_id, modal.role);
            const links = await api.listTeamInviteLinks(teamForRegen.team_id);
            dispatch({ type: 'SET_INVITE_LINKS', links });
            dispatch({ type: 'SET_OPERATION', operation: null });
            showToast('Link regenerated', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to regenerate link', 'error'); }
        }
        break;
      }

      case 'confirm-rename-team': {
        if (!modal.input) break;
        const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const teamForRename = getActiveTeam(s);
        if (teamForRename) {
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Renaming team' });
            await api.renameTeam(teamForRename.team_id, modal.input, slug);
            const me = await api.me();
            dispatch({ type: 'SET_USER_DATA', me });
            dispatch({ type: 'SET_OPERATION', operation: null });
            showToast('Team renamed', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to rename team', 'error'); }
        }
        break;
      }

      case 'confirm-delete-team': {
        const teamForDelete = getActiveTeam(s);
        if (teamForDelete && modal.input === modal.slug) {
          if (shouldRequireConsensus(s)) {
            const team = getActiveTeam(s);
            if (team) {
              try {
                await api.initiateApproval(team.team_id, 'delete_team', `delete team "${team.name}"`);
                const approvals = await api.listApprovals(team.team_id);
                dispatch({ type: 'SET_PENDING_APPROVALS', approvals });
                showToast('Approval requested', 'info');
              } catch { showToast('Failed to request approval', 'error'); }
              break;
            }
          }
          try {
            dispatch({ type: 'SET_OPERATION', operation: 'Deleting team' });
            await api.deleteTeam(teamForDelete.team_id);
            const me = await api.me();
            dispatch({ type: 'SET_USER_DATA', me });
            dispatch({ type: 'SWITCH_TAB', tab: 'knowledge' });
            dispatch({ type: 'SET_OPERATION', operation: null });
            const newProjectId = me.user.active_project_id;
            if (newProjectId) {
              switchToProject(newProjectId);
            } else {
              if (feedDisconnectRef.current) { feedDisconnectRef.current(); feedDisconnectRef.current = null; }
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              dispatch({ type: 'SET_MEMORIES', memories: [], total: 0 });
              dispatch({ type: 'SET_MEMBERS', members: [] });
            }
            showToast('Team deleted', 'success');
          } catch { dispatch({ type: 'SET_OPERATION', operation: null }); showToast('Failed to delete team', 'error'); }
        }
        break;
      }
    }
    return false;
  }

  // ---- Small terminal guard ----

  if (cols < 80 || rows < 20) {
    return (
      <Box flexDirection="column" height={rows}>
        <Box height={1} />
        <Text color="gray">  terminal too small</Text>
        <Text color="gray" dimColor>  resize to continue</Text>
      </Box>
    );
  }

  // ---- Determine content height ----
  // Header + divider + (banner + divider?) + tabbar + divider = top
  // toast? + operation? + divider + footer = bottom
  const hasBanners = state.notifications.some(n => !n.seen) || hasBillingBanner(state) || state.firstLogin || !!state.joinedProjectName || state.pendingApprovals.some(a => new Date(a.expires_at) > new Date());
  const topLines = 2 + (hasBanners ? 2 : 0) + 2; // header+div, (banner+div), tabbar+div
  const bottomLines = (state.toast ? 1 : 0) + (state.operationPending ? 1 : 0) + 2; // div + footer
  const contentHeight = Math.max(1, rows - topLines - bottomLines);

  // ---- Render ----

  return (
    <Box flexDirection="column" height={rows}>
      <Header state={state} />
      <Divider />
      <Banner state={state} />
      {hasBanners && <Divider />}
      <TabBar active={state.tab} />
      <Divider />
      <Box flexGrow={1} flexDirection="column">
        {state.modal
          ? <ModalView state={state} height={contentHeight} />
          : renderTab(state, contentHeight)
        }
      </Box>
      {state.toast && <Toast toast={state.toast} />}
      {state.operationPending && <Text color="gray" dimColor>  {state.operationPending}...</Text>}
      <Divider />
      <Footer state={state} />
    </Box>
  );
}

function renderTab(state: AppState, height: number): React.ReactNode {
  switch (state.tab) {
    case 'knowledge': return <KnowledgeTab state={state} height={height} />;
    case 'team': return <TeamTab state={state} />;
    case 'billing': return <BillingTab state={state} />;
    case 'project': return <ProjectTab state={state} />;
    case 'you': return <YouTab state={state} />;
  }
}

function hasBillingBanner(state: AppState): boolean {
  const project = getActiveProject(state);
  if (!project) return false;

  if (project.owner.kind === 'team') {
    const team = getActiveTeam(state);
    const sub = team?.subscription;
    return !sub || (sub.status !== 'active' && sub.status !== 'past_due') || sub.status === 'past_due';
  }

  const user = state.user;
  const trialDays = user?.trial_ends_at ? daysUntil(user.trial_ends_at) : null;
  const sub = state.individualSubscription;
  if (trialDays !== null && trialDays <= 0 && sub?.status !== 'active') return true;
  if (sub?.status === 'past_due') return true;
  if (trialDays !== null && trialDays > 0 && trialDays <= 3) return true;
  return false;
}

// Helper: derive flat projects from MeResponse (same logic as state.ts)
function deriveFlatProjectsFromMe(me: import('../api.js').MeResponse) {
  const list: Array<{ project_id: string; slug: string; name: string; created_at: string; owner: { kind: 'personal' } | { kind: 'team'; teamId: string; teamName: string; teamSlug: string } }> = [];
  for (const p of me.personal_projects) {
    list.push({ project_id: p.project_id, slug: p.slug, name: p.name, created_at: p.created_at, owner: { kind: 'personal' } });
  }
  for (const team of me.teams) {
    for (const p of team.projects) {
      list.push({ project_id: p.project_id, slug: p.slug, name: p.name, created_at: p.created_at, owner: { kind: 'team', teamId: team.team_id, teamName: team.name, teamSlug: team.slug } });
    }
  }
  return list;
}

function loadPersistedState(): { hasOpenedDashboard: boolean } {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return { hasOpenedDashboard: false };
}

function savePersistedState(data: { hasOpenedDashboard: boolean }): void {
  try {
    const dir = join(homedir(), '.cohvu');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}
