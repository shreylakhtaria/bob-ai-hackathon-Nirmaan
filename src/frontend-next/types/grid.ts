export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ELEVATED' | 'NORMAL';

export interface Asset {
  asset_id: string;
  asset_type: string;
  geographic_area: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  criticality_score?: number;
  customers_served: number;
  failure_probability: number;
  grid_impact_score: number;
  priority: RiskLevel;
  risk_level?: RiskLevel;
  current_status?: string;
  recommended_action?: string;
  serial_number?: string;
  substation_id?: string;
  substation?: string;
  manufacturer?: string;
  installation_date?: string;
  last_maintenance_date?: string;
  weather_risk?: number;
}

export interface ShapFactor {
  feature: string;
  label: string;
  value: string | number;
  z?: number;
  shap?: number;
  direction?: 'above_normal' | 'below_normal' | 'nominal';
  importance?: number;
}

export interface SensorSummary {
  label: string;
  latest: number;
  unit: string;
  status: string;
  threshold: string;
  color: string;
  path: string;
  trend: number[];
}

export interface AssetDetailResponse {
  asset: Asset;
  prediction: {
    failure_probability: number;
    risk_level: RiskLevel;
    priority: RiskLevel;
    grid_impact_score: number;
    shap_factors: ShapFactor[];
    recommended_action: string;
    rationale: string;
  };
  sensors_summary: Record<string, SensorSummary>;
  maintenance?: Array<{
    action_type: string;
    description: string;
    scheduled_date: string;
    status: string;
  }>;
  incidents?: Array<{
    incident_date: string;
    description: string;
    outage_duration_min: number;
  }>;
}

export interface SensorSeriesPoint {
  timestamp: string;
  value: number;
}

export interface SensorResponse {
  asset_id: string;
  hours: number;
  series: Record<string, SensorSeriesPoint[]>;
  latest: Record<string, number>;
  status: Record<string, string>;
  thresholds: Record<string, { warning: number; critical: number; unit: string }>;
}

export interface Crew {
  crew_id: string;
  current_area: string;
  skill_type: string;
  availability: 'AVAILABLE' | 'ON_JOB' | 'EN_ROUTE';
  latitude?: number;
  longitude?: number;
  active_assignment?: string;
  contact?: string;
  vehicle_type?: string;
}

export interface CrewRecommendation {
  crew_id: string;
  crew_skill: string;
  current_area: string;
  recommended_area: string;
  current_response_min: number;
  recommended_response_min: number;
  response_reduction_min: number;
  high_risk_assets: number;
  rationale: string;
}

export interface CrewResponse {
  crews: Crew[];
}

export interface CrewRecResponse {
  recommendations: CrewRecommendation[];
  crews?: Crew[];
}

export interface AlertItem {
  alert_id: string;
  asset_id?: string;
  priority: RiskLevel;
  title: string;
  reason: string;
  recommended_action: string;
  acknowledged: boolean;
  created_at: string;
}

export interface AreaRisk {
  area_id: string;
  risk_level: RiskLevel;
  outage_probability: number;
  weather_risk: number;
  high_risk_assets: number;
  customers_exposed: number;
  primary_driver: string;
  lat?: number;
  lon?: number;
}

export interface DashboardSummary {
  as_of?: string;
  is_simulation: boolean;
  overall_grid_risk: RiskLevel;
  critical_assets: number;
  high_risk_assets: number;
  predicted_failures: number;
  total_assets: number;
  customers_at_risk: number;
  weather_exposed_zones: number;
  active_alerts: number;
  alerts: AlertItem[];
  top_assets: Asset[];
  areas: AreaRisk[];
  recommended_actions: string[];
  major_risk_driver?: string;
}

export interface MaintenanceItem extends Asset {
  action_type?: string;
  status?: string;
}

export interface ContingencyImpact {
  direct_customers_interrupted: number;
  cascading_risk_level: RiskLevel;
  overloaded_neighbor_assets: Array<{
    asset_id: string;
    asset_type: string;
    loading_pct: number;
    capacity_exceeded: boolean;
  }>;
  load_shedding_recommended_mw: number;
  estimated_economic_impact_usd: number;
}

/**
 * Mirrors backend/services/simulation.py `simulate_asset_failure()`.
 *
 * The previous shape here described a `simulated_asset` / `contingency_impact`
 * nesting the backend has never returned. Every field read through it was
 * `undefined`, and the page papered over that with hardcoded fallbacks
 * ("2 overloaded assets", "$1,200,000"), so the simulator showed invented
 * constants instead of model output.
 */
export interface SimulationResponse {
  scenario: string;
  asset_id: string;
  asset_type: string;
  area: string;
  failure_probability: number | null;
  grid_impact_score: number | null;
  direct_customers: number;
  downstream_customers: number;
  total_customers_affected: number;
  affected_areas: string[];
  downstream_assets: Array<{ asset_id: string; type: string; customers: number }>;
  severity: RiskLevel | string;
  estimated_outage_minutes: number;
  required_skill: string;
  nearest_crew: { crew_id: string; response_min: number; skill: string } | null;
  recommended_mitigation: string[];
  is_simulation: boolean;
  /** Present only when the request set notify_telegram=true. */
  notification?: { delivery_id: string; status: string; error_message: string | null };
}

/** Mirrors backend/services/simulation.py `simulate_weather_event()`. */
export interface WeatherSimResponse {
  scenario: string;
  area_id: string;
  injected_severity: string;
  injected_weather_score: number;
  baseline_outage_probability: number;
  baseline_risk_level: RiskLevel | string;
  new_outage_probability: number;
  new_risk_level: RiskLevel | string;
  delta: number;
  high_risk_assets: number;
  top_exposed_assets: Array<{
    asset_id: string;
    fp: number;
    gis: number;
    type: string;
  }>;
  recommended_actions: string[];
  is_simulation: boolean;
  /** Present only when the request set notify_telegram=true. */
  notification?: { delivery_id: string; status: string; error_message: string | null };
}

export interface CopilotResponse {
  answer: string;
  intent?: string;
  confidence?: number;
  identified_asset?: string;
  /** Backend sends the tool calls the answer was built from, not plain strings. */
  evidence?: { tool: string; args?: Record<string, unknown>; result?: unknown }[];
  recommended_action?: string;
}

export interface BriefResponse {
  as_of: string;
  overall_grid_risk: RiskLevel;
  major_risk_driver: string;
  customers_at_risk: number;
  weather_exposed_zones: number;
  key_findings: string[];
  recommended_immediate_actions: string[];
  system_state_summary: {
    total_assets: number;
    critical_assets: number;
    high_risk_assets: number;
    available_crews: number;
  };
}

export interface ModelMetrics {
  model?: string;
  roc_auc?: number;
  pr_auc?: number;
  f1_score?: number;
  features_count?: number;
  dataset_rows?: number;
  training_date?: string;
}

/** Unauthenticated aggregates for the public landing page. */
export interface PublicStats {
  seeded: boolean;
  is_simulation: boolean;
  assets_monitored?: number;
  assets_at_risk?: number;
  customers_protected?: number;
  areas_monitored?: number;
  model?: string | null;
  roc_auc?: number | null;
  prediction_horizon_hours?: number;
  as_of?: string | null;
}

// ---------------------------------------------------------------------------
// Jira / Enterprise Work Management & Field Crew Proof-of-Work
// ---------------------------------------------------------------------------

export type FieldStatus =
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'RESOLVING'
  | 'COMPLETED';

export interface ProofAttachment {
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
  url_or_data?: string;
}

export interface WorkOrder {
  wo_id: string;
  created_at: string;
  asset_id?: string | null;
  area_id?: string | null;
  crew_id?: string | null;
  wo_type: 'DISPATCH' | 'SCHEDULED' | 'DEFERRED' | 'PRE_POSITION' | 'EMERGENCY';
  status: 'OPEN' | 'DEFERRED' | 'CLOSED';
  priority?: string | null;
  scheduled_for?: string | null;
  eta_min?: number | null;
  notes?: string | null;
  // Jira integration fields
  jira_key?: string | null;
  jira_url?: string | null;
  field_status?: FieldStatus | null;
  proof_attachments?: ProofAttachment[] | null;
  technician_signature?: string | null;
  completed_at?: string | null;
}

export interface JiraTicket {
  key: string;
  url: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  work_order_id?: string;
  asset_id?: string;
  crew_id?: string | null;
  mode?: 'real' | 'simulated';
}

export interface JiraStatusResponse {
  ok: boolean;
  mode: 'real' | 'simulated';
  message: string;
}

export interface JiraTicketsResponse {
  tickets: JiraTicket[];
  mode: 'real' | 'simulated';
}

export interface ProofOfWorkPayload {
  action_taken?: string;
  parts_replaced?: string;
  notes?: string;
  result?: 'COMPLETED' | 'PARTIAL' | 'NO_FAULT_FOUND';
  proof_attachments?: ProofAttachment[];
  technician_signature?: string;
  field_status?: FieldStatus;
}

export interface ResolutionResponse {
  work_order: string;
  asset_id?: string | null;
  maintenance_id: string;
  result: string;
  completed_at: string;
  crew_id?: string | null;
  crew_released: boolean;
  risk_before?: { grid_impact_score?: number; failure_probability?: number; priority?: string } | null;
  risk_after?: { grid_impact_score?: number; failure_probability?: number; priority?: string } | null;
  recalculation?: Record<string, unknown> | null;
  jira?: { ok?: boolean; jira_key?: string; new_status?: string; mode?: string } | null;
}
