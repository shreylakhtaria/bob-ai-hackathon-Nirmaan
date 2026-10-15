import type {
  Asset,
  AssetDetailResponse,
  SensorResponse,
  DashboardSummary,
  MaintenanceItem,
  Crew,
  CrewResponse,
  CrewRecResponse,
  AlertItem,
  AreaRisk,
  SimulationResponse,
  WeatherSimResponse,
  CopilotResponse,
  BriefResponse,
  ModelMetrics,
  PublicStats,
  JiraStatusResponse,
  JiraTicketsResponse,
  ProofOfWorkPayload,
  ResolutionResponse,
  WorkOrder,
  NotificationStatus,
  NotificationDelivery,
  DeliveryResult,
} from "@/types/grid";
import type { AuthResponse, LoginRequest, SignupRequest, User, AdminStats, AdminUser, AdminAuditEntry, AccessRequest } from "@/types/auth";

const API_BASE = "/api";

// The access token is held in memory only. It used to live in localStorage,
// where any XSS payload could read it at rest; the long-lived credential is now
// the HttpOnly refresh cookie, which JavaScript cannot touch at all.
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

/** Echo the CSRF cookie back as a header — the double-submit check the cookie
 *  endpoints require. Only needed where the cookie itself authenticates. */
function csrfHeaders(): Record<string, string> {
  const t = readCookie("grid_csrf");
  return t ? { "X-CSRF-Token": t } : {};
}

/** Swap the refresh cookie for a new access token. Concurrent callers share one
 *  request, so a burst of 401s doesn't trigger a stampede of refreshes. */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setAccessToken(data.access_token);
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Unwrap the API's error envelope: {success, error:{code, message, details}}. */
async function toError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  const message =
    body?.error?.message ?? body?.detail ?? `Request failed with status ${res.status}`;
  const err = new Error(message) as Error & { code?: string; status?: number; details?: unknown };
  err.code = body?.error?.code;
  err.status = res.status;
  err.details = body?.error?.details;
  return err;
}

async function send(endpoint: string, options: RequestInit, withBody: boolean): Promise<Response> {
  const headers: Record<string, string> = {
    ...(withBody ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...csrfHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers, credentials: "include" });
}

async function request(endpoint: string, options: RequestInit, withBody: boolean): Promise<Response> {
  let res = await send(endpoint, options, withBody);
  // Access tokens are short-lived by design, so a 401 mid-session is expected
  // rather than exceptional: refresh once, transparently, and retry.
  if (res.status === 401 && !endpoint.startsWith("/auth/")) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(endpoint, options, withBody);
  }
  if (!res.ok) throw await toError(res);
  return res;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return (await request(endpoint, options, true)).json();
}

export async function apiTextRequest(endpoint: string, options: RequestInit = {}): Promise<string> {
  return (await request(endpoint, options, false)).text();
}

export const API = {
  // Auth
  signup: (data: SignupRequest) =>
    apiRequest<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  login: (data: LoginRequest) =>
    apiRequest<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => apiRequest<User>("/auth/me"),
  logout: () => apiRequest<{ success: boolean }>("/auth/logout", { method: "POST" }),
  logoutAll: () =>
    apiRequest<{ success: boolean; sessions_revoked: number }>("/auth/logout-all", { method: "POST" }),
  publicStats: () => apiRequest<PublicStats>("/public/stats"),

  // System & Health
  health: () => apiRequest<{ status: string; seeded: boolean; is_simulation: boolean; now?: string }>("/health"),
  metrics: () => apiRequest<ModelMetrics>("/model/metrics"),
  summary: () => apiRequest<DashboardSummary>("/dashboard/summary"),
  stats: () => apiRequest<Record<string, any>>("/system/stats"),

  // Assets & Sensors
  assets: (query = "") => apiRequest<Asset[]>(`/assets${query}`),
  asset: (id: string) => apiRequest<AssetDetailResponse>(`/assets/${id}`),
  sensors: (id: string, hours = 24) => apiRequest<SensorResponse>(`/assets/${id}/sensors?hours=${hours}`),
  assetHistory: (id: string) => apiRequest<any[]>(`/assets/${id}/history`),

  // Areas & Risk
  areas: () => apiRequest<AreaRisk[]>("/areas/risk"),
  risks: (query = "") => apiRequest<any[]>(`/risks${query}`),
  criticalRisks: () => apiRequest<any[]>("/risks/critical"),
  weather: (area?: string) => apiRequest<any[]>(area ? `/weather?area=${area}` : "/weather"),
  weatherSeries: (area: string, hours = 96) => apiRequest<any[]>(`/weather/series?area=${area}&hours=${hours}`),
  incidents: (limit = 50) => apiRequest<any[]>(`/incidents?limit=${limit}`),

  // Maintenance & Crews
  maintenance: (query = "") => apiRequest<MaintenanceItem[]>(`/maintenance/priorities${query}`),
  crews: () => apiRequest<CrewResponse>("/crews"),
  crewRecommendations: () => apiRequest<CrewRecResponse>("/crews/recommendations"),
  updateCrew: (crewId: string, data: { email?: string | null }) =>
    apiRequest<{ message: string; crew: Crew }>(`/crews/${crewId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  workOrders: (query = "") => apiRequest<any[]>(`/work-orders${query}`),
  audit: (limit = 50) => apiRequest<any[]>(`/audit?limit=${limit}`),

  // Action Mutations
  dispatch: (assetId: string, crewId?: string | null) =>
    apiRequest<{ message: string }>("/work-orders/dispatch", {
      method: "POST",
      body: JSON.stringify({ asset_id: assetId, crew_id: crewId || null }),
    }),
  schedule: (assetId: string, hours?: number | null) =>
    apiRequest<{ message: string }>("/work-orders/schedule", {
      method: "POST",
      body: JSON.stringify({ asset_id: assetId, hours: hours ?? null }),
    }),
  defer: (assetId: string, reason?: string | null) =>
    apiRequest<{ message: string }>("/work-orders/defer", {
      method: "POST",
      body: JSON.stringify({ asset_id: assetId, reason: reason || null }),
    }),
  reposition: (crewId: string, areaId: string) =>
    apiRequest<{ message: string }>("/crews/reposition", {
      method: "POST",
      body: JSON.stringify({ crew_id: crewId, area_id: areaId }),
    }),
  // Completes whatever the crew is on: records maintenance, stamps the asset
  // and re-derives risk, so risk_before/risk_after show the operator what the
  // repair actually changed rather than only freeing the crew.
  releaseCrew: (crewId: string) =>
    apiRequest<{
      message: string;
      completed: string[];
      risk_before?: { grid_impact_score?: number; priority?: string } | null;
      risk_after?: { grid_impact_score?: number; priority?: string } | null;
    }>(`/crews/${crewId}/release`, { method: "POST" }),
  emergency: (limit = 5) =>
    apiRequest<{ message: string; skipped: any[] }>(`/dispatch/emergency?limit=${limit}`, { method: "POST" }),

  // Direct Email Notifications
  notificationStatus: () => apiRequest<NotificationStatus>("/notifications/status"),
  emailTest: (recipient?: string) =>
    apiRequest<DeliveryResult>("/notifications/email/test", {
      method: "POST",
      body: recipient ? JSON.stringify({ recipient }) : undefined,
    }),
  sendEmailAlert: (alertId: string, force = true) =>
    apiRequest<DeliveryResult>(`/notifications/send-alert/${alertId}`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  telegramTest: () =>
    apiRequest<DeliveryResult>("/notifications/email/test", { method: "POST" }),
  telegramSendAlert: (alertId: string, force = true) =>
    apiRequest<DeliveryResult>(`/notifications/send-alert/${alertId}`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  retryDelivery: (deliveryId: string) =>
    apiRequest<DeliveryResult>(`/notifications/deliveries/${deliveryId}/retry`, {
      method: "POST",
    }),
  deliveries: (limit = 50, status?: string) =>
    apiRequest<{ count: number; deliveries: NotificationDelivery[] }>(
      `/notifications/deliveries?limit=${limit}${status ? `&status=${status}` : ""}`),
  sendBriefing: () =>
    apiRequest<DeliveryResult>("/notifications/briefing/send", { method: "POST" }),

  // Alerts
  alerts: () => apiRequest<AlertItem[]>("/alerts"),
  ackAlert: (id: string) => apiRequest<{ message: string }>(`/alerts/${id}/ack`, { method: "POST" }),

  // Simulation & Map
  map: () => apiRequest<{ assets: Asset[]; areas: AreaRisk[]; crews: any[] }>("/map"),
  simulateAsset: (assetId: string, notify = false) =>
    apiRequest<SimulationResponse>("/simulation", {
      method: "POST",
      body: JSON.stringify({
        type: "asset_failure", asset_id: assetId, notify_email: notify, notify_telegram: notify,
      }),
    }),
  simulateWeather: (areaId: string, severity = "SEVERE", notify = false) =>
    apiRequest<WeatherSimResponse>("/simulation", {
      method: "POST",
      body: JSON.stringify({
        type: "weather_event", area_id: areaId, event: severity,
        notify_email: notify, notify_telegram: notify,
      }),
    }),

  // AI Copilot & Brief
  copilot: (query: string) =>
    apiRequest<CopilotResponse>("/copilot/query", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  brief: () => apiRequest<BriefResponse>("/brief"),
  briefText: () => apiTextRequest("/brief/text"),
  exportUrl: (kind: string) => `/api/export/${kind}`,

  // ── Work Order field-crew status update ───────────────────────────────────
  updateWorkOrderStatus: (woId: string, fieldStatus: string) =>
    apiRequest<{ ok: boolean; jira_key?: string; new_status?: string; mode?: string }>(
      `/work-orders/${woId}/status`,
      { method: "POST", body: JSON.stringify({ field_status: fieldStatus }) },
    ),

  // ── Proof-of-work evidence upload (multipart) ─────────────────────────────
  uploadProof: async (woId: string, files: File[]): Promise<{ ok: boolean; total_attachments: number }> => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(`${API_BASE}/work-orders/${woId}/proof`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...csrfHeaders(),
      },
      body: fd,
    });
    if (!res.ok) throw await toError(res);
    return res.json();
  },

  // ── Full resolution with proof payload ────────────────────────────────────
  resolveWorkOrder: (woId: string, payload: ProofOfWorkPayload) =>
    apiRequest<ResolutionResponse>(
      `/work-orders/${woId}/resolve`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  // ── Jira integration ──────────────────────────────────────────────────────
  jiraStatus: () => apiRequest<JiraStatusResponse>("/jira/status"),
  jiraTickets: (limit = 50) =>
    apiRequest<JiraTicketsResponse>(`/jira/tickets?limit=${limit}`),

  // ── Admin Console ──────────────────────────────────────────────────────────
  adminStats: () => apiRequest<AdminStats>("/admin/stats"),
  adminUsers: () => apiRequest<AdminUser[]>("/admin/users"),
  adminUpdateRole: (userId: number, role: 'admin' | 'operator' | 'crew') =>
    apiRequest<{ message: string; user: AdminUser }>(`/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  adminRevokeSessions: (userId: number) =>
    apiRequest<{ success: boolean; message: string; sessions_revoked: number }>(
      `/admin/users/${userId}/revoke-sessions`,
      { method: "POST" },
    ),
  adminDeleteUser: (userId: number) =>
    apiRequest<{ success: boolean; message: string }>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
  adminRequests: () => apiRequest<AccessRequest[]>("/admin/requests"),
  adminApproveRequest: (userId: number) =>
    apiRequest<{ success: boolean; message: string; user_id: number; status: string }>(
      `/admin/requests/${userId}/approve`,
      { method: "POST" },
    ),
  adminRejectRequest: (userId: number) =>
    apiRequest<{ success: boolean; message: string; user_id: number }>(
      `/admin/requests/${userId}/reject`,
      { method: "POST" },
    ),
  adminAudit: (limit = 100, category = "all", search?: string) => {
    let url = `/admin/audit?limit=${limit}&category=${category}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiRequest<AdminAuditEntry[]>(url);
  },
};

