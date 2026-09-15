"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

export const GridMapClient: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);
  const [filterShowWeather, setFilterShowWeather] = useState(true);
  const [filterShowCrews, setFilterShowCrews] = useState(true);

  const layersRef = useRef<{ wx: L.Circle[]; assets: L.CircleMarker[]; crews: L.Marker[] }>({
    wx: [],
    assets: [],
    crews: [],
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([23.05, 72.58], 11);

    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layersRef.current = { wx: [], assets: [], crews: [] };

    API.map()
      .then((data) => {
        // 1. Weather Impact Rings
        (data.areas || []).forEach((area) => {
          if (area.lat == null || area.lon == null) return;
          const circle = L.circle([area.lat, area.lon], {
            radius: 1200 + (area.outage_probability || 0) * 3000,
            color: F.riskColor(area.risk_level),
            weight: 1.5,
            opacity: 0.7,
            fillColor: F.riskColor(area.risk_level),
            fillOpacity: 0.08,
          })
            .addTo(map)
            .bindPopup(
              `<b>${area.area_id}</b><br>Outage ${(
                (area.outage_probability || 0) * 100
              ).toFixed(0)}% &bull; ${area.risk_level}<br>Weather Score: ${Math.round(
                area.weather_risk || 0
              )}/100`
            );
          layersRef.current.wx.push(circle);
        });

        // 2. Assets
        (data.assets || []).forEach((asset) => {
          if (asset.latitude == null || asset.longitude == null) return;
          const lvl = asset.priority || "LOW";
          const radius = lvl === "CRITICAL" ? 8 : lvl === "HIGH" ? 6 : lvl === "MEDIUM" ? 5 : 4;

          const marker = L.circleMarker([asset.latitude, asset.longitude], {
            radius,
            color: F.riskColor(lvl),
            weight: 1.5,
            fillColor: F.riskColor(lvl),
            fillOpacity: 0.85,
          })
            .addTo(map)
            .bindPopup(
              `<b>${asset.asset_id}</b> &mdash; ${asset.asset_type}<br>${asset.geographic_area || asset.area}<br>
               P(Fail): ${F.pct(asset.failure_probability)} &bull; Impact: ${F.score(
                asset.grid_impact_score
              )}<br>
               ${F.num(asset.customers_served)} customers`
            );

          (marker as any)._assetPriority = lvl;
          layersRef.current.assets.push(marker);

          if (lvl === "CRITICAL") {
            const ring = L.circleMarker([asset.latitude, asset.longitude], {
              radius: 14,
              color: F.riskColor(lvl),
              weight: 1,
              fillOpacity: 0,
              className: "leaflet-pulse-ring",
            }).addTo(map);
            (ring as any)._assetPriority = lvl;
            layersRef.current.assets.push(ring);
          }
        });

        // 3. Field Crews
        (data.crews || []).forEach((c) => {
          if (c.latitude == null || c.longitude == null) return;
          const crewMarker = L.marker([c.latitude, c.longitude], {
            icon: L.divIcon({
              className: "",
              html: `<div style="background:#0f5132;color:#fff;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;border:1px solid #003820;font-family:'JetBrains Mono',monospace">⛑ ${c.crew_id}</div>`,
              iconSize: [52, 18],
            }),
          })
            .addTo(map)
            .bindPopup(`<b>${c.crew_id}</b><br>${c.skill_type} &bull; ${c.availability}`);
          layersRef.current.crews.push(crewMarker);
        });

        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => {});

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Filter layer toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    layersRef.current.wx.forEach((l) =>
      filterShowWeather ? l.addTo(map) : map.removeLayer(l)
    );
    layersRef.current.crews.forEach((c) =>
      filterShowCrews ? c.addTo(map) : map.removeLayer(c)
    );
    layersRef.current.assets.forEach((a) => {
      if (filterCriticalOnly && (a as any)._assetPriority !== "CRITICAL") {
        map.removeLayer(a);
      } else {
        a.addTo(map);
      }
    });
  }, [filterCriticalOnly, filterShowWeather, filterShowCrews]);

  return (
    <div className="flex flex-col gap-3.5 w-full font-sans">
      {/* Layer Toggles */}
      <div className="bg-white p-3 rounded-lg shadow-sm border border-[#c0c9c0]/60 flex items-center justify-between font-mono text-[11px] text-[#404942]">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filterCriticalOnly}
              onChange={(e) => setFilterCriticalOnly(e.target.checked)}
              className="rounded border-[#c0c9c0] text-[#0f5132] focus:ring-[#0f5132]"
            />
            <span className="font-bold text-[#ba1a1a]">Only Critical Assets (Trips)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filterShowWeather}
              onChange={(e) => setFilterShowWeather(e.target.checked)}
              className="rounded border-[#c0c9c0] text-[#0f5132] focus:ring-[#0f5132]"
            />
            <span>Weather Storm Zones</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filterShowCrews}
              onChange={(e) => setFilterShowCrews(e.target.checked)}
              className="rounded border-[#c0c9c0] text-[#0f5132] focus:ring-[#0f5132]"
            />
            <span>Field Crew Locations</span>
          </label>
        </div>
        <span>OpenStreetMap Live GIS Feed</span>
      </div>

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className="w-full h-[520px] rounded-lg border border-[#c0c9c0] shadow-sm overflow-hidden"
      />
    </div>
  );
};
