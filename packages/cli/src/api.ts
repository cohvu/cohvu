// Typed API client for the Cohvu REST API.
// Centralizes all fetch calls with auth headers and error handling.

import { getApiKey } from "./auth.js";
import { DEFAULT_BASE_URL } from "./constants.js";

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    active_project_id: string | null;
    has_used_trial: boolean;
    trial_ends_at: string | null;
    created_at: string;
  };
  individual_subscription: {
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  } | null;
  personal_projects: Array<{
    project_id: string;
    slug: string;
    name: string;
    created_at: string;
  }>;
  teams: Array<{
    team_id: string;
    name: string;
    slug: string;
    role: string;
    trial_ends_at: string | null;
    require_consensus: boolean;
    subscription: {
      status: string;
      seat_count: number;
      current_period_end: string;
      cancel_at_period_end: boolean;
    } | null;
    projects: Array<{
      project_id: string;
      slug: string;
      name: string;
      created_at: string;
    }>;
  }>;
}

export interface MemoryItem {
  id: string;
  body: string;
  updated_at: string;
  contributed_by?: Record<string, unknown>;
  memory_type?: string | null;
  quality_score?: number | null;
}

export interface MemberItem {
  user_id: string;
  role: string;
  email: string | null;
  name: string | null;
  last_active_at: string | null;
}

export interface BillingInfo {
  subscription: {
    status: string;
    seat_count?: number;
    current_period_end: string;
    cancel_at_period_end: boolean;
  } | null;
}

export interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  trial_ends_at: string | null;
}

export interface InviteLink {
  role: string;
  code: string;
  url: string;
}

export interface PendingApproval {
  id: string;
  action: string;
  description: string;
  initiator_email: string;
  target_user_id?: string;
  approved_by: string[];
  required_count: number;
  created_at: string;
  expires_at: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  created_at: string;
  seen: boolean;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.COHVU_API_URL ?? DEFAULT_BASE_URL;
  }

  private headers(): Record<string, string> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Not logged in. Run `npx cohvu` first.");
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const h = this.headers();

    for (let attempt = 0; attempt < 2; attempt++) {
      const opts: RequestInit = {
        ...init,
        headers: { ...h, ...init?.headers },
        signal: AbortSignal.timeout(15_000),
      };
      try {
        const res = await fetch(`${this.baseUrl}${path}`, opts);
        if (res.ok) return (await res.json()) as T;
        if (res.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new ApiError(res.status, await res.text());
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Request failed");
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  // Auth
  async me(): Promise<MeResponse> {
    return this.get("/v1/auth/me");
  }

  async switchProject(projectId: string): Promise<void> {
    await this.post("/v1/auth/active-project", { project_id: projectId });
  }

  // Knowledge
  async listMemories(projectId: string, opts: { limit: number; offset: number }): Promise<{ total: number; memories: MemoryItem[] }> {
    return this.get(`/v1/projects/${projectId}/memories?limit=${opts.limit}&offset=${opts.offset}`);
  }

  async searchMemories(projectId: string, query: string): Promise<{ memories: MemoryItem[] }> {
    return this.get(`/v1/projects/${projectId}/memories/search?q=${encodeURIComponent(query)}`);
  }

  async deleteMemory(projectId: string, memoryId: string): Promise<void> {
    await this.del(`/v1/projects/${projectId}/memories/${memoryId}`);
  }

  async clearMemories(projectId: string): Promise<{ memories_removed: number }> {
    return this.del(`/v1/projects/${projectId}/knowledge`);
  }

  // Teams
  async listTeamMembers(teamId: string): Promise<MemberItem[]> {
    return this.get(`/v1/teams/${teamId}/members`);
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.del(`/v1/teams/${teamId}/members/${userId}`);
  }

  async changeTeamRole(teamId: string, userId: string, role: string): Promise<void> {
    await this.patch(`/v1/teams/${teamId}/members/${userId}`, { role });
  }

  async listTeamInviteLinks(teamId: string): Promise<InviteLink[]> {
    return this.get(`/v1/teams/${teamId}/invite-links`);
  }

  async regenerateTeamInviteLink(teamId: string, role: string): Promise<InviteLink> {
    return this.post(`/v1/teams/${teamId}/invite-links/regenerate`, { role });
  }

  // Billing — individual or team
  async getIndividualBilling(): Promise<BillingInfo> {
    return this.get("/v1/billing");
  }

  async getTeamBilling(teamId: string): Promise<BillingInfo> {
    return this.get(`/v1/teams/${teamId}/billing`);
  }

  async createIndividualCheckout(): Promise<{ checkout_url: string }> {
    return this.post("/v1/billing/checkout");
  }

  async getIndividualPortalUrl(): Promise<{ url: string }> {
    return this.post("/v1/billing/portal", { return_url: this.baseUrl });
  }

  async createTeamCheckout(teamId: string): Promise<{ checkout_url: string }> {
    return this.post(`/v1/teams/${teamId}/billing/checkout`);
  }

  async getTeamPortalUrl(teamId: string): Promise<{ url: string }> {
    return this.post(`/v1/teams/${teamId}/billing/portal`, { return_url: this.baseUrl });
  }

  // Project
  async createProject(name: string, slug: string, ownerId?: string): Promise<ProjectInfo> {
    return this.post("/v1/projects", { name, slug, owner_id: ownerId });
  }

  async renameProject(projectId: string, name: string, slug: string): Promise<void> {
    await this.patch(`/v1/projects/${projectId}`, { name, slug });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.del(`/v1/projects/${projectId}`);
  }

  async createTeam(name: string, slug: string): Promise<{ id: string; name: string; slug: string; trial_ends_at: string | null }> {
    return this.post("/v1/teams", { name, slug });
  }

  async renameTeam(teamId: string, name: string, slug: string): Promise<void> {
    await this.patch(`/v1/teams/${teamId}`, { name, slug });
  }

  async updateTeamSettings(teamId: string, settings: { require_consensus?: boolean }): Promise<void> {
    await this.patch(`/v1/teams/${teamId}`, settings);
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.del(`/v1/teams/${teamId}`);
  }

  async createTeamProject(teamId: string, name: string, slug: string): Promise<ProjectInfo> {
    return this.post(`/v1/teams/${teamId}/projects`, { name, slug });
  }

  // SSO
  async getSso(teamId: string): Promise<{ id: string; issuer: string; client_id: string; allowed_domains: string[]; default_role: string; require_sso: boolean; enabled: boolean } | null> {
    try { return await this.get(`/v1/teams/${teamId}/sso`); }
    catch { return null; }
  }

  async configureSso(teamId: string, config: { issuer: string; client_id: string; client_secret: string; allowed_domains: string[]; default_role: string; require_sso: boolean }): Promise<void> {
    await this.post(`/v1/teams/${teamId}/sso`, config);
  }

  async updateSso(teamId: string, config: Record<string, unknown>): Promise<void> {
    await this.patch(`/v1/teams/${teamId}/sso`, config);
  }

  async deleteSso(teamId: string): Promise<void> {
    await this.del(`/v1/teams/${teamId}/sso`);
  }

  // Approvals
  async listApprovals(teamId: string): Promise<PendingApproval[]> {
    return this.get(`/v1/teams/${teamId}/approvals`);
  }

  async initiateApproval(teamId: string, action: string, description: string, targetUserId?: string): Promise<PendingApproval> {
    return this.post(`/v1/teams/${teamId}/approvals`, { action, description, target_user_id: targetUserId });
  }

  async approveAction(teamId: string, approvalId: string): Promise<void> {
    await this.post(`/v1/teams/${teamId}/approvals/${approvalId}/approve`);
  }

  async cancelApproval(teamId: string, approvalId: string): Promise<void> {
    await this.del(`/v1/teams/${teamId}/approvals/${approvalId}`);
  }

  // Notifications
  async listNotifications(): Promise<Notification[]> {
    return this.get(`/v1/notifications`);
  }

  async markNotificationsSeen(): Promise<void> {
    await this.post(`/v1/notifications/seen`);
  }

  // SSE feed — returns a disconnect function
  connectFeed(
    projectId: string,
    callbacks: {
      onEvent: (eventType: string, data: Record<string, unknown>) => void;
      onConnected?: () => void;
      onDisconnected?: () => void;
    },
  ): { disconnect: () => void } {
    let aborted = false;
    let currentController: AbortController | null = null;
    let retryDelay = 1000;
    let wasConnected = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delay: number) => {
      if (aborted) return;
      retryTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (aborted) return;
      retryTimer = null;
      currentController = new AbortController();

      try {
        const h = this.headers();
        const res = await fetch(`${this.baseUrl}/v1/projects/${projectId}/memories/feed`, {
          headers: { Authorization: h.Authorization },
          signal: currentController.signal,
        });

        if (!res.ok || !res.body) {
          // Don't retry auth errors — they won't resolve on their own
          if (res.status === 401 || res.status === 403) {
            if (wasConnected) { wasConnected = false; callbacks.onDisconnected?.(); }
            return;
          }
          if (wasConnected) { wasConnected = false; callbacks.onDisconnected?.(); }
          retryDelay = Math.min(retryDelay * 2, 5000);
          scheduleRetry(retryDelay);
          return;
        }

        retryDelay = 1000;
        wasConnected = true;
        callbacks.onConnected?.();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim() || part.startsWith(":")) continue;

            let eventType = 'memory';
            let dataJson = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: ')) dataJson = line.slice(6);
            }
            if (!dataJson) continue;

            try {
              const data = JSON.parse(dataJson) as Record<string, unknown>;
              try { callbacks.onEvent(eventType, data); } catch {}
            } catch {}
          }
        }

        // Stream ended cleanly — reconnect immediately
        if (wasConnected) { wasConnected = false; callbacks.onDisconnected?.(); }
        retryDelay = 1000;
        scheduleRetry(retryDelay);
      } catch {
        if (wasConnected) { wasConnected = false; callbacks.onDisconnected?.(); }
        retryDelay = Math.min(retryDelay * 2, 5000);
        scheduleRetry(retryDelay);
      }
    };

    connect();

    return {
      disconnect: () => {
        aborted = true;
        if (retryTimer) clearTimeout(retryTimer);
        currentController?.abort();
      },
    };
  }
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}
