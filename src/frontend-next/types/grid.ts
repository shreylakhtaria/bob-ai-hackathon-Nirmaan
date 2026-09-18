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

export interface SimulationResponse {
  simulated_asset: Asset;
  contingency_impact: ContingencyImpact;
  mitigation_steps: Array<{
    step: number;
    action: string;
    target_asset?: string;
    expected_response_min: number;
  }>;
}

export interface WeatherSimResponse {
  area_id: string;
  scenario: string;
  weather_score: number;
  updated_outage_probability: number;
  affected_assets_count: number;
  critical_assets_count: number;
  impacted_assets: Asset[];
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
