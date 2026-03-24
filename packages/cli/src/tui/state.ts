// TUI state machine — single source of truth for the dashboard.
// Reducer pattern: keypresses → actions → new state → render.

import type { MeResponse, MemoryItem, MemberItem, BillingInfo, InviteLink, PendingApproval, Notification } from "../api.js";

/** A project in the flat navigation list — knows its ownership context. */
export interface FlatProject {
  project_id: string;
  slug: string;
  name: string;
  created_at: string;
  owner: { kind: 'personal' } | { kind: 'team'; teamId: string; teamName: string; teamSlug: string };
}

/** Team as stored in state (mirroring MeResponse shape). */
export type TeamInfo = MeResponse['teams'][0];

export type Tab = 'knowledge' | 'team' | 'billing' | 'project' | 'you';
export type KnowledgeMode = 'browse' | 'search' | 'forget';

export type Modal =
  | null
  | { kind: 'confirm-forget'; memoryId: string; preview: string }
  | { kind: 'confirm-forget-all'; slug: string; memoryCount: number; input: string }
  | { kind: 'confirm-delete'; slug: string; memoryCount: number; input: string }
  | { kind: 'confirm-clear'; slug: string; memoryCount: number; input: string }
  | { kind: 'confirm-remove-member'; email: string; userId: string }
  | { kind: 'confirm-leave' }
  | { kind: 'confirm-logout' }
  | { kind: 'rename'; input: string }
  | { kind: 'create-project'; input: string; teamId: string | null }
  | { kind: 'create-team'; input: string }
  | { kind: 'create-team-project'; teamId: string; teamName: string; input: string }
  | { kind: 'select-owner'; selected: number }
  | { kind: 'invite'; selected: number }
  | { kind: 'invite-link'; role: string; url: string }
  | { kind: 'configure-sso'; step: number; issuer: string; clientId: string; clientSecret: string; domains: string; defaultRole: number; requireSso: boolean }
  | { kind: 'confirm-delete-team'; slug: string; teamName: string; input: string }
  | { kind: 'confirm-rename-team'; input: string }
  | { kind: 'manage-sso' }
  | { kind: 'switch-project'; selected: number }
  | { kind: 'edit-role'; targetEmail: string; targetUserId: string; currentRole: string; selected: number }
  | { kind: 'initiate-consensus'; action: string; description: string; targetUserId?: string }
  | { kind: 'approve-action'; approvalId: string; description: string; initiator: string; expiresIn: string }
  | { kind: 'confirm-regen-link'; role: string };

export interface PlatformStatus {
  name: string;
  state: 'configured' | 'not-detected';
}

export interface AppState {
  // Auth
  user: MeResponse['user'] | null;

  // Projects — flat list derived from personal + team projects
  projects: FlatProject[];
  activeProjectId: string | null;
  userRole: 'admin' | 'member' | 'viewer';

  // Teams & subscriptions
  teams: TeamInfo[];
  individualSubscription: MeResponse['individual_subscription'];

  // Navigation
  tab: Tab;

  // Knowledge
  knowledgeMode: KnowledgeMode;
  memories: MemoryItem[];
  memoryTotal: number;
  memoryScroll: number;
  memorySelected: number;
  memoryLoading: boolean;
  memoryHasMore: boolean;
  searchQuery: string;
  searchResults: MemoryItem[] | null;
  searching: boolean;
  forgetSelected: Set<string>;
  forgetConfirming: boolean;
  liveDotId: string | null;
  liveDotExpiry: number;

  // Team
  members: MemberItem[];
  inviteLinks: InviteLink[];
  teamSelected: number;
  inlineError: string | null;

  // Billing
  billing: BillingInfo | null;

  // Platforms
  platforms: PlatformStatus[];

  // Modal
  modal: Modal;

  // Banners
  firstLogin: boolean;
  joinedProjectName: string | null;

  // SSO & consensus
  ssoConfig: { issuer: string; allowed_domains: string[]; default_role: string; require_sso: boolean; enabled: boolean } | null;
  requireConsensus: boolean;

  // Approvals & notifications
  pendingApprovals: PendingApproval[];
  notifications: Notification[];

  // Transient UI
  copiedFeedback: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info'; expiresAt: number } | null;
  operationPending: string | null;

  // Network
  error: string | null;
  offline: boolean;
  sseConnected: boolean;
}

export const TABS: Tab[] = ['knowledge', 'team', 'billing', 'project', 'you'];

export function initialState(): AppState {
  return {
    user: null,
    projects: [],
    activeProjectId: null,
    userRole: 'member',
    teams: [],
    individualSubscription: null,
    tab: 'knowledge',
    knowledgeMode: 'browse',
    memories: [],
    memoryTotal: 0,
    memoryScroll: 0,
    memorySelected: 0,
    memoryLoading: false,
    memoryHasMore: false,
    searchQuery: '',
    searchResults: null,
    searching: false,
    forgetSelected: new Set(),
    forgetConfirming: false,
    liveDotId: null,
    liveDotExpiry: 0,
    members: [],
    inviteLinks: [],
    teamSelected: 0,
    inlineError: null,
    billing: null,
    platforms: [],
    modal: null,
    firstLogin: false,
    joinedProjectName: null,
    ssoConfig: null,
    requireConsensus: false,
    pendingApprovals: [],
    notifications: [],
    copiedFeedback: false,
    toast: null,
    operationPending: null,
    error: null,
    offline: false,
    sseConnected: false,
  };
}

export type Action =
  | { type: 'SET_USER_DATA'; me: MeResponse }
  | { type: 'SWITCH_TAB'; tab: Tab }
  | { type: 'NEXT_TAB' }
  | { type: 'SCROLL_UP' }
  | { type: 'SCROLL_DOWN' }
  | { type: 'ENTER_SEARCH' }
  | { type: 'EXIT_SEARCH' }
  | { type: 'SEARCH_INPUT'; char: string }
  | { type: 'SEARCH_BACKSPACE' }
  | { type: 'ENTER_FORGET' }
  | { type: 'EXIT_FORGET' }
  | { type: 'TOGGLE_FORGET'; memoryId: string }
  | { type: 'SET_MEMORIES'; memories: MemoryItem[]; total: number; append?: boolean }
  | { type: 'SET_SEARCH_RESULTS'; results: MemoryItem[] }
  | { type: 'ADD_MEMORY'; memory: MemoryItem }
  | { type: 'REMOVE_MEMORY'; id: string }
  | { type: 'SET_MEMBERS'; members: MemberItem[] }
  | { type: 'SET_BILLING'; billing: BillingInfo }
  | { type: 'SET_PLATFORMS'; platforms: PlatformStatus[] }
  | { type: 'OPEN_MODAL'; modal: NonNullable<Modal> }
  | { type: 'CLOSE_MODAL' }
  | { type: 'MODAL_INPUT'; char: string }
  | { type: 'MODAL_BACKSPACE' }
  | { type: 'SET_COPIED_FEEDBACK'; active: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_OFFLINE'; offline: boolean }
  | { type: 'SET_SSE_CONNECTED'; connected: boolean }
  | { type: 'SET_LIVE_DOT'; memoryId: string }
  | { type: 'CLEAR_LIVE_DOT' }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SEARCHING'; searching: boolean }
  | { type: 'SET_INVITE_LINKS'; links: InviteLink[] }
  | { type: 'SET_PENDING_APPROVALS'; approvals: PendingApproval[] }
  | { type: 'SET_NOTIFICATIONS'; notifications: Notification[] }
  | { type: 'SET_USER_ROLE'; role: 'admin' | 'member' | 'viewer' }
  | { type: 'SET_TEAM_SELECTED'; index: number }
  | { type: 'SET_INLINE_ERROR'; message: string | null }
  | { type: 'SET_TOAST'; toast: AppState['toast'] }
  | { type: 'SET_OPERATION'; operation: string | null }
  | { type: 'SET_FORGET_CONFIRMING'; confirming: boolean }
  | { type: 'UPDATE_MEMORY'; memory: MemoryItem }
  | { type: 'SET_FIRST_LOGIN'; firstLogin: boolean }
  | { type: 'SET_SSO_CONFIG'; config: AppState['ssoConfig'] }
  | { type: 'SET_REQUIRE_CONSENSUS'; value: boolean };

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER_DATA': {
      const me = action.me;
      const flatProjects = deriveFlatProjects(me);
      const activeId = me.user.active_project_id;
      const activeProject = flatProjects.find(p => p.project_id === activeId) ?? flatProjects[0] ?? null;
      // Derive role: personal projects → admin; team projects → team role
      let role: 'admin' | 'member' | 'viewer' = 'admin';
      if (activeProject && activeProject.owner.kind === 'team') {
        const ownerTeamId = activeProject.owner.teamId;
        const team = me.teams.find(t => t.team_id === ownerTeamId);
        role = (team?.role ?? 'member') as 'admin' | 'member' | 'viewer';
      }
      // Clear all knowledge state when project changes to prevent stale data
      const projectChanged = activeProject?.project_id !== state.activeProjectId;
      return {
        ...state,
        user: me.user,
        projects: flatProjects,
        activeProjectId: activeProject?.project_id ?? null,
        userRole: role,
        teams: me.teams,
        individualSubscription: me.individual_subscription,
        ...(projectChanged ? {
          memories: [], memoryTotal: 0, memoryHasMore: false, memoryLoading: false,
          memorySelected: 0, memoryScroll: 0,
          searchResults: null, searchQuery: '', searching: false,
          knowledgeMode: 'browse' as KnowledgeMode,
          forgetSelected: new Set<string>(), forgetConfirming: false,
          members: [], inviteLinks: [], billing: null, teamSelected: 0,
          pendingApprovals: [], ssoConfig: null,
        } : {}),
      };
    }

    case 'SWITCH_TAB':
      return { ...state, tab: action.tab, modal: null, teamSelected: 0 };

    case 'NEXT_TAB': {
      const idx = TABS.indexOf(state.tab);
      return { ...state, tab: TABS[(idx + 1) % TABS.length], modal: null, teamSelected: 0 };
    }

    case 'SCROLL_UP': {
      const newSelected = Math.max(0, state.memorySelected - 1);
      const newScroll = newSelected < state.memoryScroll ? newSelected : state.memoryScroll;
      return { ...state, memorySelected: newSelected, memoryScroll: newScroll };
    }

    case 'SCROLL_DOWN': {
      const list = currentList(state);
      if (list.length === 0) return state;
      const newSelected = Math.min(list.length - 1, state.memorySelected + 1);
      // Adjust scroll if selection moves past visible area (assume ~15 visible rows)
      const visibleRows = 15;
      const newScroll = newSelected >= state.memoryScroll + visibleRows
        ? newSelected - visibleRows + 1
        : state.memoryScroll;
      return { ...state, memorySelected: newSelected, memoryScroll: newScroll };
    }

    case 'ENTER_SEARCH':
      return { ...state, knowledgeMode: 'search', searchQuery: '', searchResults: null, memorySelected: 0 };

    case 'EXIT_SEARCH':
      return { ...state, knowledgeMode: 'browse', searchQuery: '', searchResults: null, memorySelected: 0 };

    case 'SEARCH_INPUT':
      return { ...state, searchQuery: state.searchQuery + action.char };

    case 'SEARCH_BACKSPACE':
      return { ...state, searchQuery: state.searchQuery.slice(0, -1) };

    case 'ENTER_FORGET':
      return { ...state, knowledgeMode: 'forget', forgetSelected: new Set(), forgetConfirming: false, memorySelected: 0, memoryScroll: 0 };

    case 'EXIT_FORGET':
      return { ...state, knowledgeMode: 'browse', forgetSelected: new Set(), forgetConfirming: false };

    case 'TOGGLE_FORGET': {
      const next = new Set(state.forgetSelected);
      if (next.has(action.memoryId)) next.delete(action.memoryId);
      else next.add(action.memoryId);
      return { ...state, forgetSelected: next };
    }

    case 'SET_MEMORIES': {
      const memories = action.append
        ? [...state.memories, ...action.memories]
        : action.memories;
      // Reset selection to bounds when replacing (not appending)
      const resetSelection = !action.append;
      const selected = resetSelection ? 0 : Math.min(state.memorySelected, Math.max(0, memories.length - 1));
      const scroll = resetSelection ? 0 : Math.min(state.memoryScroll, Math.max(0, memories.length - 1));
      return {
        ...state,
        memories,
        memoryTotal: action.total,
        memoryHasMore: memories.length < action.total,
        memoryLoading: false,
        memorySelected: selected,
        memoryScroll: scroll,
      };
    }

    case 'SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.results, memorySelected: 0 };

    case 'ADD_MEMORY':
      return {
        ...state,
        memories: [action.memory, ...state.memories],
        memoryTotal: state.memoryTotal + 1,
      };

    case 'REMOVE_MEMORY': {
      const filtered = state.memories.filter(m => m.id !== action.id);
      return {
        ...state,
        memories: filtered,
        memoryTotal: Math.max(0, state.memoryTotal - 1),
        memorySelected: Math.min(state.memorySelected, Math.max(0, filtered.length - 1)),
        searchResults: state.searchResults?.filter(m => m.id !== action.id) ?? null,
      };
    }

    case 'SET_MEMBERS':
      return { ...state, members: action.members };

    case 'SET_BILLING':
      return { ...state, billing: action.billing };

    case 'SET_PLATFORMS':
      return { ...state, platforms: action.platforms };

    case 'OPEN_MODAL':
      return { ...state, modal: action.modal };

    case 'CLOSE_MODAL':
      return { ...state, modal: null };

    case 'MODAL_INPUT': {
      if (!state.modal) return state;
      if ('input' in state.modal) {
        return { ...state, modal: { ...state.modal, input: state.modal.input + action.char } };
      }
      return state;
    }

    case 'MODAL_BACKSPACE': {
      if (!state.modal) return state;
      if ('input' in state.modal) {
        return { ...state, modal: { ...state.modal, input: state.modal.input.slice(0, -1) } };
      }
      return state;
    }

    case 'SET_COPIED_FEEDBACK':
      return { ...state, copiedFeedback: action.active };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'SET_OFFLINE':
      return { ...state, offline: action.offline };

    case 'SET_SSE_CONNECTED':
      return { ...state, sseConnected: action.connected };

    case 'SET_LIVE_DOT':
      return { ...state, liveDotId: action.memoryId, liveDotExpiry: Date.now() + 10000 };

    case 'CLEAR_LIVE_DOT':
      return { ...state, liveDotId: null, liveDotExpiry: 0 };

    case 'SET_LOADING':
      return { ...state, memoryLoading: action.loading };

    case 'SET_SEARCHING':
      return { ...state, searching: action.searching };

    case 'SET_INVITE_LINKS':
      return { ...state, inviteLinks: action.links };

    case 'SET_PENDING_APPROVALS':
      return { ...state, pendingApprovals: action.approvals };

    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.notifications };

    case 'SET_USER_ROLE':
      return { ...state, userRole: action.role };

    case 'SET_TEAM_SELECTED':
      return { ...state, teamSelected: action.index };

    case 'SET_INLINE_ERROR':
      return { ...state, inlineError: action.message };

    case 'SET_TOAST':
      return { ...state, toast: action.toast };

    case 'SET_OPERATION':
      return { ...state, operationPending: action.operation };

    case 'SET_FORGET_CONFIRMING':
      return { ...state, forgetConfirming: action.confirming };

    case 'UPDATE_MEMORY': {
      const updated = action.memory;
      return {
        ...state,
        memories: state.memories.map(m => m.id === updated.id ? updated : m),
        searchResults: state.searchResults?.map(m => m.id === updated.id ? updated : m) ?? null,
      };
    }

    case 'SET_FIRST_LOGIN':
      return { ...state, firstLogin: action.firstLogin };

    case 'SET_SSO_CONFIG':
      return { ...state, ssoConfig: action.config };

    case 'SET_REQUIRE_CONSENSUS':
      return { ...state, requireConsensus: action.value };

    default:
      return state;
  }
}

function currentList(state: AppState): MemoryItem[] {
  if (state.knowledgeMode === 'search' && state.searchResults) return state.searchResults;
  return state.memories;
}

export function getActiveProject(state: AppState): FlatProject | null {
  return state.projects.find(p => p.project_id === state.activeProjectId) ?? null;
}

/** Get the team info for the active project, or null if personal. */
export function getActiveTeam(state: AppState): TeamInfo | null {
  const project = getActiveProject(state);
  if (project && project.owner.kind === 'team') {
    const teamId = project.owner.teamId;
    return state.teams.find(t => t.team_id === teamId) ?? null;
  }
  return null;
}

/** Flatten personal_projects + team projects into a single navigable list. */
function deriveFlatProjects(me: MeResponse): FlatProject[] {
  const list: FlatProject[] = [];

  for (const p of me.personal_projects) {
    list.push({
      project_id: p.project_id,
      slug: p.slug,
      name: p.name,
      created_at: p.created_at,
      owner: { kind: 'personal' },
    });
  }

  for (const team of me.teams) {
    for (const p of team.projects) {
      list.push({
        project_id: p.project_id,
        slug: p.slug,
        name: p.name,
        created_at: p.created_at,
        owner: { kind: 'team', teamId: team.team_id, teamName: team.name, teamSlug: team.slug },
      });
    }
  }

  return list;
}
