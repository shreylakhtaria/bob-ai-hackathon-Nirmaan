import type {
  Asset,
  AssetDetailResponse,
  SensorResponse,
  DashboardSummary,
  MaintenanceItem,
  CrewResponse,
  CrewRecResponse,
  AlertItem,
  AreaRisk,
  SimulationResponse,
  WeatherSimResponse,
  CopilotResponse,
  BriefResponse,
  ModelMetrics,
} from "@/types/grid";
import type { AuthResponse, LoginRequest, ProfileUpdateRequest, SignupRequest, User } from "@/types/auth";

const API_BASE = "/api";

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("grid_auth_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function apiTextRequest(endpoint: string, options: RequestInit = {}): Promise<string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("grid_auth_token") : null;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }

  return res.text();
}

export const API = {
  // Auth
  signup: (data: SignupRequest) =>
    apiRequest<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  login: (data: LoginRequest) =>
    apiRequest<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => apiRequest<User>("/auth/me"),
  updateProfile: (data: ProfileUpdateRequest) =>
    apiRequest<{ message: string; user: User }>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),

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
  releaseCrew: (crewId: string) =>
    apiRequest<{ message: string }>(`/crews/${crewId}/release`, { method: "POST" }),
  emergency: (limit = 5) =>
    apiRequest<{ message: string; skipped: any[] }>(`/dispatch/emergency?limit=${limit}`, { method: "POST" }),

  // Alerts
  alerts: () => apiRequest<AlertItem[]>("/alerts"),
  ackAlert: (id: string) => apiRequest<{ message: string }>(`/alerts/${id}/ack`, { method: "POST" }),

  // Simulation & Map
  map: () => apiRequest<{ assets: Asset[]; areas: AreaRisk[]; crews: any[] }>("/map"),
  simulateAsset: (assetId: string) =>
    apiRequest<SimulationResponse>("/simulation", {
      method: "POST",
      body: JSON.stringify({ type: "asset_failure", asset_id: assetId }),
    }),
  simulateWeather: (areaId: string, severity = "SEVERE") =>
    apiRequest<WeatherSimResponse>("/simulation", {
      method: "POST",
      body: JSON.stringify({ type: "weather_event", area_id: areaId, event: severity }),
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
};
