"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PanelCard } from "@/components/common/PanelCard";
import { RiskBadge } from "@/components/common/RiskBadge";

import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { SimulationResponse, WeatherSimResponse } from "@/types/grid";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
  ContentSwitcher,
  Select,
  SelectItem,
  Switch,
} from "@carbon/react";
import { Play, Rain, Receipt } from "@carbon/icons-react";

export default function SimulationPage() {
  const searchParams = useSearchParams();
  const initialAsset = searchParams.get("asset") || "T-1024";
  const initialTab = searchParams.get("tab") || "asset";

  const { ok, err } = useToast();

  const [activeTab, setActiveTab] = useState<"asset" | "weather">((initialTab as any) || "asset");
  const [selectedAsset, setSelectedAsset] = useState<string>(initialAsset);
  const [selectedArea, setSelectedArea] = useState<string>("WEST-05");
  const [severity, setSeverity] = useState<string>("SEVERE");

  const [assetSimResult, setAssetSimResult] = useState<SimulationResponse | null>(null);
  const [weatherSimResult, setWeatherSimResult] = useState<WeatherSimResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showRunsLog, setShowRunsLog] = useState(false);

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => API.audit(40),
    enabled: showRunsLog,
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => API.assets("?limit=500"),
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => API.areas(),
  });

  const runAssetSim = async (assetId: string) => {
    setIsSimulating(true);
    try {
      const res = await API.simulateAsset(assetId);
      setAssetSimResult(res);
      ok(`N-1 Contingency simulation completed for ${assetId}`);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const runWeatherSim = async (areaId: string, sev: string) => {
    setIsSimulating(true);
    try {
      const res = await API.simulateWeather(areaId, sev);
      setWeatherSimResult(res);
      ok(`Weather stress-test simulation completed for ${areaId}`);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  // Runs once for whatever asset the URL arrived with. Deliberately not
  // re-run on every selectedAsset change: the picker's own onChange already
  // fires the simulation, and adding it here would run each one twice.
  useEffect(() => {
    if (selectedAsset) {
      runAssetSim(selectedAsset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Simulation</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Predictive Engine</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Grid Contingency &amp; Weather Stress Simulator
          </h1>
          <p className="text-label text-ink-2">
            Evaluate cascading outage contingencies, neighbor feeder overloads, and storm impacts before they happen.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Receipt}
            onClick={() => setShowRunsLog(!showRunsLog)}
          >
            {showRunsLog ? "Hide runs log" : "Runs log"}
          </Button>

          {/* Carbon ContentSwitcher rather than two styled buttons: it is
              exactly this control, and it brings the arrow-key navigation and
              the selected state the pair of buttons never had. */}
          <ContentSwitcher
            size="sm"
            selectedIndex={activeTab === "asset" ? 0 : 1}
            onChange={({ name }) => {
              const next = (name as "asset" | "weather") ?? "asset";
              setActiveTab(next);
              if (next === "weather" && !weatherSimResult) {
                runWeatherSim(selectedArea, severity);
              }
            }}
          >
            <Switch name="asset" text="Asset trip (N-1)" />
            <Switch name="weather" text="Weather scenario" />
          </ContentSwitcher>
        </div>
      </div>

      {activeTab === "asset" ? (
        /* Asset Trip Simulation (N-1 Contingency) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* Controls (4 cols) */}
          <div className="lg:col-span-4 bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
            <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
              Select Trip Candidate
            </div>
            <div>
              <Select
                id="sim-asset"
                size="sm"
                labelText="Target asset ID"
                value={selectedAsset}
                onChange={(e) => {
                  setSelectedAsset(e.target.value);
                  runAssetSim(e.target.value);
                }}
              >
                {assets.map((a) => (
                  <SelectItem
                    key={a.asset_id}
                    value={a.asset_id}
                    text={`${a.asset_id} \u2014 ${a.asset_type} (${a.geographic_area || a.area})`}
                  />
                ))}
              </Select>
            </div>

            <Button
              size="sm"
              renderIcon={Play}
              disabled={isSimulating}
              onClick={() => runAssetSim(selectedAsset)}
              className="cds--btn--block"
            >
              {isSimulating ? "Running\u2026" : "Run N-1 simulation"}
            </Button>

            {assetSimResult && (
              <div className="p-3 bg-sunken border border-line space-y-1 text-micro">
                <div className="font-semibold text-ink">Simulated asset</div>
                <dl className="font-mono text-micro text-ink-2 grid grid-cols-[auto_1fr] gap-x-2">
                  <dt>Type</dt>
                  <dd className="font-semibold text-ink">{assetSimResult.asset_type}</dd>
                  <dt>Area</dt>
                  <dd className="font-semibold text-ink">{assetSimResult.area}</dd>
                  <dt>Direct</dt>
                  <dd className="font-semibold text-ink">
                    {F.num(assetSimResult.direct_customers)} customers
                  </dd>
                  <dt>P(fail)</dt>
                  <dd className="font-semibold text-ink">
                    {assetSimResult.failure_probability != null
                      ? `${Math.round(assetSimResult.failure_probability * 100)}%`
                      : "\u2014"}
                  </dd>
                </dl>
              </div>
            )}
          </div>

          {/* Impact Results (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            {assetSimResult ? (
              <>
                {/* Impact KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">
                      Customers affected
                    </div>
                    <div className="text-lede font-mono font-bold text-sev-critical">
                      {F.num(assetSimResult.total_customers_affected)}
                    </div>
                    <div className="text-micro text-ink-3">
                      {F.num(assetSimResult.direct_customers)} direct &middot;{" "}
                      {F.num(assetSimResult.downstream_customers)} downstream
                    </div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">Severity</div>
                    <div className="mt-1">
                      <RiskBadge level={assetSimResult.severity} size="md" />
                    </div>
                    <div className="mt-1 text-micro text-ink-3">
                      {assetSimResult.affected_areas.length} area
                      {assetSimResult.affected_areas.length === 1 ? "" : "s"} affected
                    </div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">
                      Downstream assets
                    </div>
                    <div className="text-lede font-mono font-bold text-sev-elevated">
                      {assetSimResult.downstream_assets.length}
                    </div>
                    <div className="text-micro text-ink-3">On the same substation</div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">
                      Est. outage
                    </div>
                    <div className="text-lede font-mono font-bold text-ink">
                      {Math.round(assetSimResult.estimated_outage_minutes)} min
                    </div>
                    <div className="text-micro text-ink-3">
                      {assetSimResult.nearest_crew
                        ? `Nearest crew ${assetSimResult.nearest_crew.crew_id} \u00b7 ${Math.round(
                            assetSimResult.nearest_crew.response_min
                          )} min`
                        : "No crew available"}
                    </div>
                  </Tile>
                </div>

                {/* Overloaded Lines & Mitigation Plan */}
                <div className="bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
                  <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
                    Recommended Dispatch &amp; Switching Mitigation
                  </div>
                  <ol className="space-y-2">
                    {assetSimResult.recommended_mitigation.map((action, i) => (
                      <li
                        key={action}
                        className="p-2.5 bg-canvas border border-line flex items-start gap-2.5 text-label"
                      >
                        <span className="w-5 h-5 rounded-full bg-brand-ink text-white font-mono text-micro font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-ink">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <div className="p-8 bg-panel rounded-lg border border-line text-center font-mono text-micro text-ink-3">
                Running contingency analysis…
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Weather Stress-Test Scenario */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-4 bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
            <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
              Storm Simulation Controls
            </div>
            <div>
              <Select
                id="sim-area"
                size="sm"
                labelText="Target geographic area"
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
              >
                {areas.map((a) => (
                  <SelectItem
                    key={a.area_id}
                    value={a.area_id}
                    text={`${a.area_id} \u2014 ${a.risk_level}`}
                  />
                ))}
              </Select>
            </div>
            <div>
              <Select
                id="sim-severity"
                size="sm"
                labelText="Storm severity tier"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <SelectItem value="MODERATE" text="Moderate storm (score 50–65)" />
                <SelectItem value="SEVERE" text="Severe storm (score 65–85)" />
                <SelectItem value="EXTREME" text="Extreme cyclone / gale (score >85)" />
              </Select>
            </div>
            <Button
              kind="danger"
              size="sm"
              renderIcon={Rain}
              disabled={isSimulating}
              onClick={() => runWeatherSim(selectedArea, severity)}
              className="cds--btn--block"
            >
              {isSimulating ? "Running\u2026" : "Simulate storm impact"}
            </Button>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-3">
            {weatherSimResult && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">
                      Outage probability
                    </div>
                    <div className="text-lede font-mono font-bold text-sev-critical">
                      {F.pct(weatherSimResult.new_outage_probability)}
                    </div>
                    {/* The baseline matters more than the new number on its own:
                        a storm that moves an area from 6% to 9% is a different
                        decision from one that moves it from 40% to 43%. */}
                    <div className="text-micro text-ink-3">
                      from {F.pct(weatherSimResult.baseline_outage_probability)} baseline
                    </div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">Change</div>
                    <div className="text-lede font-mono font-bold text-sev-elevated">
                      {weatherSimResult.delta >= 0 ? "+" : ""}
                      {F.pct(weatherSimResult.delta)}
                    </div>
                    <div className="text-micro text-ink-3">
                      {weatherSimResult.injected_severity.toLowerCase()} scenario
                    </div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">Risk level</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <RiskBadge level={weatherSimResult.baseline_risk_level} />
                      <span aria-hidden="true" className="text-ink-3">
                        &rarr;
                      </span>
                      <RiskBadge level={weatherSimResult.new_risk_level} />
                    </div>
                  </Tile>
                  <Tile>
                    <div className="text-micro text-ink-3 uppercase tracking-wide">
                      High-risk assets
                    </div>
                    <div className="text-lede font-mono font-bold text-ink">
                      {weatherSimResult.high_risk_assets}
                    </div>
                    <div className="text-micro text-ink-3">in {weatherSimResult.area_id}</div>
                  </Tile>
                </div>

                <PanelCard title="Most exposed assets" flush>
                  <div className="overflow-x-auto">
                    <Table size="sm" useZebraStyles={false}>
                      <TableHead>
                        <TableRow>
                          <TableHeader>Asset ID</TableHeader>
                          <TableHeader>Type</TableHeader>
                          <TableHeader className="text-right">P(fail)</TableHeader>
                          <TableHeader className="text-right">Grid impact</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {weatherSimResult.top_exposed_assets.map((a) => (
                          <TableRow key={a.asset_id}>
                            <TableCell className="font-mono font-semibold text-brand-ink">
                              {a.asset_id}
                            </TableCell>
                            <TableCell>{a.type}</TableCell>
                            <TableCell className="text-right font-mono">{F.pct(a.fp)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {a.gis?.toFixed(1)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </PanelCard>

                <PanelCard title="Recommended actions">
                  <ol className="space-y-2">
                    {weatherSimResult.recommended_actions.map((action, i) => (
                      <li
                        key={action}
                        className="p-2.5 bg-canvas border border-line flex items-start gap-2.5 text-label"
                      >
                        <span className="w-5 h-5 rounded-full bg-brand-ink text-white font-mono text-micro font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-ink">{action}</span>
                      </li>
                    ))}
                  </ol>
                </PanelCard>
              </>
            )}
          </div>
        </div>
      )}

      {/* Runs Log */}
      {showRunsLog && (
        <div className="mt-4 bg-panel rounded-xl shadow-panel border border-line overflow-hidden animate-fade-in">
          <div className="px-3.5 py-2.5 bg-header flex items-center gap-2 border-b border-line">
            <Receipt size={16} className="fill-current text-brand-ink" aria-hidden="true" />
            <span className="text-micro font-semibold text-ink uppercase">
              Engine &amp; Operator Runs Log
            </span>
          </div>
          <div className="p-3.5 overflow-y-auto max-h-[320px]">
            {loadingAudit ? (
              <div className="text-center font-mono text-micro text-ink-3 py-4">Loading logs...</div>
            ) : auditLogs.length > 0 ? (
              <div className="space-y-1.5">
                {auditLogs.map((log: any, idx: number) => (
                  <div key={idx} className="flex flex-wrap items-start gap-2 py-1.5 border-b border-sunken last:border-0 font-sans text-label">
                    <span className="font-mono text-micro text-ink-3 whitespace-nowrap">{F.date(log.ts)}</span>
                    <span className="text-micro font-semibold uppercase px-1.5 py-0.5 rounded bg-sunken text-ink-2 whitespace-nowrap">
                      {log.actor}
                    </span>
                    <span className="font-semibold text-ink">{log.action}</span>
                    <span className="font-mono text-micro text-ink-3 truncate max-w-full">
                      {JSON.stringify(log.detail)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center font-mono text-micro text-ink-3 py-4">No runs recorded yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
