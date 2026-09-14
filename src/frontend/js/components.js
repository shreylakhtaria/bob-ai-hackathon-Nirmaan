/* ─── Reusable UI component builders (return HTML strings) ─── */
const C = {

  /* KPI tile */
  kpi(icon, label, value, sub, level) {
    const accent = {
      CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132'
    }[level] || '#707971';
    return `<div class="bg-surface-container-lowest rounded shadow-sm p-space-md flex gap-space-sm border border-outline-variant/60">
      <div class="kpi-accent" style="background:${accent}"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant">${icon}</span>
          <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">${label}</span>
        </div>
        <div class="font-telemetry-display text-[22px] font-bold text-on-surface leading-none">${value}</div>
        <div class="font-label-sm text-[11px] text-on-surface-variant mt-0.5">${sub || ''}</div>
      </div>
    </div>`;
  },

  /* Panel card wrapper */
  panel(title, icon, body, extraHeader = '') {
    return `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
      <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
        <div class="flex items-center gap-2">
          ${icon ? `<span class="material-symbols-outlined text-primary text-[16px]">${icon}</span>` : ''}
          <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase tracking-tight">${title}</span>
        </div>
        ${extraHeader}
      </div>
      <div class="p-space-md">${body}</div>
    </div>`;
  },

  /* Risk badge */
  badge: lvl => F.badge(lvl),

  /* Asset table (full) */
  assetTable(rows) {
    const hdr = `<tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
      <th class="py-2 px-space-md font-semibold sticky top-0 bg-surface-container-low">Asset ID</th>
      <th class="py-2 px-space-sm font-semibold sticky top-0 bg-surface-container-low">Type &amp; Location</th>
      <th class="py-2 px-space-sm font-semibold sticky top-0 bg-surface-container-low">Risk</th>
      <th class="py-2 px-space-sm font-semibold sticky top-0 bg-surface-container-low">P(Fail)</th>
      <th class="py-2 px-space-sm font-semibold text-right sticky top-0 bg-surface-container-low">Impact</th>
      <th class="py-2 px-space-sm font-semibold text-right sticky top-0 bg-surface-container-low">Customers</th>
      <th class="py-2 px-space-md text-right font-semibold sticky top-0 bg-surface-container-low">Action</th>
    </tr>`;
    const body = rows.map(a => C.assetRow(a)).join('') ||
      '<tr><td colspan="7" class="text-center py-6 text-on-surface-variant font-label-sm text-label-sm">No assets match the current filter</td></tr>';
    return `<div class="overflow-x-auto w-full">
      <table class="w-full text-left"><thead>${hdr}</thead>
      <tbody class="divide-y divide-surface-container">${body}</tbody></table></div>`;
  },

  /* Single asset table row */
  assetRow(a, selected = false) {
    const lvl = a.priority || a.risk_level || 'LOW';
    const p   = a.failure_probability;
    const sel = selected ? 'row-selected' : '';
    const barW = Math.round((p || 0) * 100);
    const barCol = { CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132' }[lvl] || '#707971';
    return `<tr class="hover:bg-surface-container cursor-pointer transition-colors text-on-surface font-body-sm text-body-sm ${sel}" onclick="App.openAsset('${a.asset_id}')">
      <td class="py-2.5 px-space-md">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-5 rounded-full ${selected ? 'bg-primary' : 'bg-transparent'} inline-block flex-shrink-0"></span>
          <span class="font-telemetry-display text-label-md font-bold text-primary">${a.asset_id}</span>
          ${lvl === 'CRITICAL' ? '<span class="material-symbols-outlined text-[13px] text-error">priority_high</span>' : ''}
        </div>
      </td>
      <td class="py-2.5 px-space-sm">
        <div class="font-semibold text-on-surface text-[12px] leading-tight">${F.esc(a.asset_type || '')}</div>
        <div class="text-[11px] text-on-surface-variant font-mono">${F.esc(a.geographic_area || a.area || '')}</div>
      </td>
      <td class="py-2.5 px-space-sm">${F.badge(lvl)}</td>
      <td class="py-2.5 px-space-sm">
        <div class="flex items-center gap-2">
          <div class="w-14 h-1.5 bg-surface-container-highest rounded overflow-hidden">
            <div class="h-full rounded" style="width:${barW}%;background:${barCol}"></div>
          </div>
          <span class="font-telemetry-display text-label-sm font-bold" style="color:${barCol}">${F.pct(p)}</span>
        </div>
      </td>
      <td class="py-2.5 px-space-sm text-right font-telemetry-display text-label-sm font-semibold">${F.score(a.grid_impact_score)}</td>
      <td class="py-2.5 px-space-sm text-right font-telemetry-display text-label-sm">${F.num(a.customers_served)}</td>
      <td class="py-2.5 px-space-md text-right">
        <button class="p-1 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors" type="button">
          <span class="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </td>
    </tr>`;
  },

  /* Alert card */
  alert(al) {
    const colors = { CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132' };
    const col = colors[al.priority] || '#707971';
    const timeFmt = al.created_at ? F.date(al.created_at) : '--';
    return `<div class="flex gap-space-sm p-space-sm bg-surface-container-lowest rounded border border-outline-variant/60 mb-space-xs">
      <div style="width:3px;border-radius:3px;background:${col};flex-shrink:0"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5">
            ${F.badge(al.priority)}
            <span class="font-body-sm text-body-sm font-semibold text-on-surface">${F.esc(al.title)}</span>
          </div>
          <span class="font-mono text-[10px] text-on-surface-variant whitespace-nowrap flex-shrink-0">${timeFmt}</span>
        </div>
        <div class="font-body-sm text-[12px] text-on-surface-variant mt-0.5">${F.esc(al.reason)}</div>
        <div class="font-body-sm text-[12px] text-primary mt-0.5">▸ ${F.esc(al.recommended_action)}</div>
        <div class="flex gap-1 mt-1.5">
          ${al.asset_id ? `<button onclick="App.openAsset('${al.asset_id}')" class="px-1.5 py-0.5 bg-surface-container font-label-sm text-[10px] font-bold rounded uppercase hover:bg-surface-container-high" type="button">Open</button>
          <button onclick="Actions.dispatch('${al.asset_id}', this)" class="px-1.5 py-0.5 bg-error-container text-on-error-container font-label-sm text-[10px] font-bold rounded uppercase hover:opacity-90" type="button">Dispatch</button>` : ''}
          ${al.acknowledged
            ? '<span class="px-1.5 py-0.5 bg-surface-container font-label-sm text-[10px] font-bold rounded uppercase text-on-surface-variant">Acknowledged</span>'
            : `<button onclick="App.ackAlert('${al.alert_id}')" class="px-1.5 py-0.5 bg-secondary-container text-on-secondary-container font-label-sm text-[10px] font-bold rounded uppercase hover:opacity-90" type="button">Ack</button>`}
        </div>
      </div>
    </div>`;
  },

  /* SHAP risk factor */
  factor(f) {
    const w   = Math.min(100, Math.abs(f.z || 0) * 22);
    const danger = (f.direction === 'above_normal') || f.z > 1.5;
    return `<div class="flex items-center gap-space-sm py-1.5 border-b border-surface-container-low last:border-0">
      <div class="flex-1 min-w-0">
        <div class="font-body-sm text-[12px] font-semibold text-on-surface">${F.esc(f.label)}</div>
        <div class="font-mono text-[10px] text-on-surface-variant">val: ${f.value} · z=${f.z} · ${f.direction}</div>
      </div>
      <div class="fbar-track">
        <div class="fbar-fill ${danger ? 'danger' : ''}" style="width:${w}%"></div>
      </div>
    </div>`;
  },

  /* Inline SVG sparkline card for sensor telemetry */
  sparkCard(label, value, unit, status, threshold, path, color, animate = false) {
    const strokeColor = color || '#ba1a1a';
    return `<div class="p-space-sm bg-surface-container-low rounded flex flex-col gap-0.5 shadow-sm border border-outline-variant/30 cursor-pointer hover:border-primary/50 transition-colors" onclick="Pages.openSensorModal('${F.esc(label)}', '${F.esc(value)}', '${F.esc(unit)}', '${F.esc(status)}', '${F.esc(threshold)}')">
      <div class="flex items-center justify-between">
        <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">${label}</span>
        <span class="font-telemetry-display text-[15px] font-bold" style="color:${strokeColor}">${value}${unit ? '<span class="text-[10px] ml-0.5">' + unit + '</span>' : ''}</span>
      </div>
      ${threshold ? `<div class="text-[10px] font-mono text-on-surface-variant flex items-center justify-between leading-tight">
        <span>${F.esc(threshold)}</span>
        <span style="color:${strokeColor}" class="font-bold">${F.esc(status)}</span>
      </div>` : ''}
      <div class="w-full h-12 mt-0.5">
        <svg class="w-full h-full" viewBox="0 0 160 40" preserveAspectRatio="none">
          <line x1="0" x2="160" y1="28" y2="28" stroke="#c0c9c0" stroke-width="0.7" stroke-dasharray="2 2" opacity="0.6"/>
          <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round"/>
          <circle cx="160" cy="${path.match(/L160,(\S+)/)?.[1] || '20'}" r="2.5" fill="${strokeColor}" ${animate ? 'class="animate-pulse"' : ''}/>
        </svg>
      </div>
    </div>`;
  },

  /* Maintenance queue row */
  maintRow(x, idx) {
    const urgCls = x.priority === 'CRITICAL' ? 'rank-urgent' : x.priority === 'HIGH' ? 'rank-high' : 'rank-planned';
    const urgLabel = x.priority === 'CRITICAL' ? 'URGENT' : x.priority === 'HIGH' ? 'HIGH' : 'PLANNED';
    return `<tr class="text-on-surface font-body-sm text-body-sm hover:bg-surface-container transition-colors cursor-pointer border-b border-surface-container" onclick="App.openAsset('${x.asset_id}')">
      <td class="py-2 px-space-sm">
        <span class="inline-flex items-center justify-center w-6 h-5 rounded ${urgCls} font-label-sm text-[10px] font-bold">#${idx + 1}</span>
        <span class="ml-1 inline-block px-1.5 py-0.5 rounded font-label-sm text-[10px] font-bold ${urgCls}">${urgLabel}</span>
      </td>
      <td class="py-2 px-space-sm">
        <div class="font-telemetry-display text-label-md font-bold text-primary">${x.asset_id}</div>
        <div class="text-[10px] text-on-surface-variant font-mono">${F.esc(x.area || '')}</div>
      </td>
      <td class="py-2 px-space-sm text-[11px] text-on-surface-variant">${F.esc(x.asset_type || '')}</td>
      <td class="py-2 px-space-sm">
        <div class="flex items-center gap-1.5">
          <div class="w-12 h-1.5 bg-surface-container-highest rounded overflow-hidden">
            <div class="h-full rounded" style="width:${F.pct(x.failure_probability)};background:${F.riskColor(x.priority)}"></div>
          </div>
          <span class="font-mono text-[11px] font-bold" style="color:${F.riskColor(x.priority)}">${F.pct(x.failure_probability)}</span>
        </div>
      </td>
      <td class="py-2 px-space-sm text-right font-mono text-[11px]">${F.num(x.customers_served)}</td>
      <td class="py-2 px-space-sm font-mono text-[11px] font-bold text-on-surface">${F.score(x.grid_impact_score)}</td>
      <td class="py-2 px-space-sm text-[11px] text-on-surface-variant max-w-[140px] truncate" title="${F.esc(x.recommended_action)}">${F.esc(x.recommended_action)}</td>
      <td class="py-2 px-space-sm text-right">
        <div class="flex items-center gap-1 justify-end">
          <button class="px-2 py-1 bg-error text-on-error font-label-sm text-[10px] font-bold rounded uppercase hover:opacity-90 transition-opacity" onclick="event.stopPropagation(); Actions.dispatch('${x.asset_id}', this)" type="button">Dispatch</button>
          <button class="px-2 py-1 bg-surface-container text-on-surface font-label-sm text-[10px] font-bold rounded uppercase hover:bg-surface-container-high transition-colors" onclick="event.stopPropagation(); Actions.defer('${x.asset_id}', this)" type="button">Defer</button>
        </div>
      </td>
    </tr>`;
  },

  /* Crew pre-positioning card */
  crewCard(r) {
    const isCrit = r.high_risk_assets >= 3;
    return `<div class="bg-surface-container-lowest rounded border border-outline-variant/60 p-space-md slide-in">
      <div class="flex items-start justify-between mb-space-xs">
        <div>
          ${isCrit ? `<span class="inline-flex items-center gap-1 bg-error-container text-on-error-container font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mb-1">CRITICAL</span>` : `<span class="inline-flex items-center gap-1 bg-surface-container-highest text-on-surface font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mb-1">HIGH</span>`}
          <div class="font-headline-md text-headline-md font-bold text-on-surface">${F.esc(r.crew_id)} <span class="text-[13px] font-normal text-on-surface-variant">(${F.esc(r.crew_skill)})</span></div>
        </div>
        <div class="text-right">
          <div class="font-label-sm text-[11px] text-error font-bold">Cuts Response: ${r.response_reduction_min} min (-${Math.round(r.response_reduction_min / (r.current_response_min || 1) * 100)}%)</div>
        </div>
      </div>
      <div class="font-body-sm text-[12px] text-on-surface-variant mb-space-sm">
        <span class="font-semibold text-on-surface">MOVE:</span> ${F.esc(r.current_area)} → <span class="font-semibold text-primary">${F.esc(r.recommended_area)}</span>
      </div>
      <div class="font-body-sm text-[12px] text-on-surface-variant mb-space-sm">${F.esc(r.rationale)}</div>
      <button onclick="Actions.reposition('${r.crew_id}', '${r.recommended_area}', this)" class="w-full h-7 bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center justify-center gap-1.5 uppercase tracking-wider hover:opacity-90 transition-opacity" type="button">
        <span class="material-symbols-outlined text-[14px]">check_circle</span>Authorize Pre-Positioning Order
      </button>
    </div>`;
  },

  /* Metric row for detail panels */
  metricRow: (k, v) => `<div class="flex items-center justify-between py-1.5 border-b border-surface-container-low last:border-0 font-body-sm text-body-sm">
    <span class="text-on-surface-variant font-medium">${k}</span>
    <span class="font-mono font-semibold text-on-surface text-right">${v}</span>
  </div>`,

  /* SCADA Ingestion & Contingency Inference Skeleton Loader (Image 4 reference) */
  skeletonLoader() {
    return `<div class="flex flex-col gap-space-md w-full animate-fade-in">
      <!-- Ingestion Pipeline Stage Banner -->
      <div class="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-space-md shadow-sm">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-space-sm border-b border-outline-variant/40">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase tracking-wider">
              <span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>STAGE 3/4 ACTIVE
            </span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase tracking-tight">Telemetry Ingestion &amp; Contingency Inference Engine</span>
          </div>
          <div class="flex items-center gap-space-md font-mono text-[11px] text-on-surface-variant">
            <span class="text-primary font-bold">88.2% INITIALIZED</span>
            <span>ELAPSED: 0.88s &bull; EST REMAINING: 0.22s</span>
          </div>
        </div>
        <!-- 4 Pipeline Stage Badges -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-space-sm mt-space-sm">
          <div class="flex items-center gap-2 p-1.5 bg-surface-container-low rounded border border-outline-variant/40">
            <span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>
            <div class="min-w-0 flex-1">
              <div class="font-label-sm text-[10px] font-bold text-on-surface truncate">1. SCADA Gateway</div>
              <div class="font-mono text-[9px] text-on-surface-variant">TLS 1.3 [12ms]</div>
            </div>
          </div>
          <div class="flex items-center gap-2 p-1.5 bg-surface-container-low rounded border border-outline-variant/40">
            <span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>
            <div class="min-w-0 flex-1">
              <div class="font-label-sm text-[10px] font-bold text-on-surface truncate">2. Synchrophasor</div>
              <div class="font-mono text-[9px] text-on-surface-variant">IEEE C37.118 [4.8kHz]</div>
            </div>
          </div>
          <div class="flex items-center gap-2 p-1.5 bg-primary-container text-on-primary rounded border border-primary/50">
            <span class="material-symbols-outlined text-[16px] text-on-primary animate-spin">sync</span>
            <div class="min-w-0 flex-1">
              <div class="font-label-sm text-[10px] font-bold truncate">3. DGA Telemetry</div>
              <div class="font-mono text-[9px] opacity-90">1,194/1,420 (84%)</div>
            </div>
          </div>
          <div class="flex items-center gap-2 p-1.5 bg-surface-container rounded border border-outline-variant/40 opacity-70">
            <span class="material-symbols-outlined text-[16px] text-on-surface-variant">hourglass_empty</span>
            <div class="min-w-0 flex-1">
              <div class="font-label-sm text-[10px] font-bold text-on-surface-variant truncate">4. XGBoost Ingest</div>
              <div class="font-mono text-[9px] text-on-surface-variant">v4.2.1 [QUEUED]</div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI Skeleton Row -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-space-sm">
        ${[1, 2, 3, 4, 5].map(() => `
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 p-space-md shadow-sm flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="h-3 w-20 sk-shimmer rounded"></div>
              <div class="w-4 h-4 sk-shimmer rounded-full"></div>
            </div>
            <div class="h-6 w-28 sk-shimmer-dark rounded"></div>
            <div class="h-2.5 w-36 sk-shimmer rounded"></div>
          </div>
        `).join('')}
      </div>

      <!-- Main 12-column Skeleton Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        <!-- Left: Telemetry Live Stream & DGA Curve (7 cols) -->
        <div class="lg:col-span-7 flex flex-col gap-space-md">
          <!-- Critical Telemetry Live Stream Table Skeleton -->
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 shadow-sm overflow-hidden">
            <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
                <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Critical Telemetry Live Stream</span>
              </div>
              <span class="font-mono text-[10px] text-primary font-bold">SYNCING 4.8 KHZ</span>
            </div>
            <div class="p-space-md space-y-3">
              ${[1, 2, 3, 4, 5].map(i => `
                <div class="flex items-center justify-between gap-2 py-1.5 border-b border-surface-container-low last:border-0">
                  <div class="flex items-center gap-2 w-1/4">
                    <span class="w-2 h-2 rounded-full ${i <= 2 ? 'bg-error animate-pulse' : 'bg-outline'}"></span>
                    <div class="h-3.5 w-16 sk-shimmer-dark rounded"></div>
                  </div>
                  <div class="h-3.5 w-24 sk-shimmer rounded"></div>
                  <div class="h-3.5 w-14 sk-shimmer rounded"></div>
                  <div class="h-3 w-16 sk-shimmer rounded-full"></div>
                  <div class="h-5 w-12 sk-shimmer rounded"></div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Substation DGA & Thermal Runaway Telemetry Curve Skeleton -->
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 shadow-sm p-space-md">
            <div class="flex items-center justify-between mb-space-sm">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-primary">show_chart</span>
                <span class="font-label-sm text-label-sm font-bold uppercase">Substation DGA &amp; Thermal Runaway Telemetry Curve</span>
              </div>
              <span class="font-mono text-[10px] text-on-surface-variant">REAL-TIME HISTORIAN BUFFER</span>
            </div>
            <div class="h-36 w-full bg-surface-container-low rounded-lg p-space-sm relative overflow-hidden flex items-end">
              <svg class="w-full h-28" viewBox="0 0 500 120" preserveAspectRatio="none">
                <line x1="0" x2="500" y1="40" y2="40" stroke="#ba1a1a" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>
                <path d="M0,90 Q80,105 160,85 T320,95 T440,35 L500,28" fill="none" stroke="#0f5132" stroke-width="2.5" class="animate-pulse"/>
                <circle cx="440" cy="35" r="4" fill="#ba1a1a" class="animate-ping"/>
                <circle cx="440" cy="35" r="3" fill="#ba1a1a"/>
              </svg>
            </div>
            <div class="flex items-center justify-between mt-2 font-mono text-[10px] text-on-surface-variant">
              <span>T - 180 MIN</span>
              <span>T - 120 MIN</span>
              <span>T - 60 MIN</span>
              <span class="text-error font-bold">LIVE TELEMETRY (0s)</span>
            </div>
          </div>
        </div>

        <!-- Right: Risk Exposure, Alarm Feed & SCADA Cam (5 cols) -->
        <div class="lg:col-span-5 flex flex-col gap-space-md">
          <!-- Feeder Risk Exposure Skeleton -->
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 shadow-sm p-space-md">
            <div class="flex items-center justify-between mb-space-sm pb-1 border-b border-outline-variant/40">
              <span class="font-label-sm text-label-sm font-bold uppercase">Feeder Risk Exposure</span>
              <span class="font-mono text-[10px] text-on-surface-variant">REGION-RC4</span>
            </div>
            <div class="space-y-2.5">
              <div class="h-4 w-full sk-shimmer rounded"></div>
              <div class="h-4 w-5/6 sk-shimmer rounded"></div>
              <div class="h-4 w-4/6 sk-shimmer rounded"></div>
            </div>
          </div>

          <!-- High-Priority Alarm Feed Skeleton -->
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 shadow-sm p-space-md">
            <div class="flex items-center justify-between mb-space-sm pb-1 border-b border-outline-variant/40">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-error text-[16px]">campaign</span>
                <span class="font-label-sm text-label-sm font-bold uppercase">High-Priority Alarm Feed</span>
              </div>
            </div>
            <div class="space-y-2">
              <div class="p-2 bg-error-container/30 border border-error/30 rounded flex items-center justify-between">
                <span class="font-mono text-[10px] text-error font-bold">&bull; PRIORITY 1 ALARM</span>
                <span class="font-mono text-[9px] text-on-surface-variant">LIVE INGESTION</span>
              </div>
              <div class="p-2 bg-surface-container-low border border-outline-variant/40 rounded flex items-center justify-between">
                <span class="font-mono text-[10px] text-secondary font-bold">&bull; WARNING L2</span>
                <span class="font-mono text-[9px] text-on-surface-variant">SYNCHRONIZED</span>
              </div>
              <div class="p-2 bg-surface-container-low border border-outline-variant/40 rounded flex items-center justify-between">
                <span class="font-mono text-[10px] text-on-surface-variant font-bold">&bull; ADVISORY</span>
                <span class="font-mono text-[9px] text-on-surface-variant">NORMALIZED</span>
              </div>
            </div>
          </div>

          <!-- Substation Optical Feed Skeleton -->
          <div class="bg-surface-container-lowest rounded-lg border border-outline-variant/50 shadow-sm p-space-md">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-primary text-[16px]">videocam</span>
                <span class="font-label-sm text-label-sm font-bold uppercase">Substation Optical Feed</span>
              </div>
              <span class="font-mono text-[10px] text-error font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-error animate-ping"></span>LIVE SCADA CAM</span>
            </div>
            <div class="h-28 bg-surface-container-low rounded-lg flex flex-col items-center justify-center gap-1 border border-outline-variant/40 text-on-surface-variant">
              <span class="material-symbols-outlined text-[24px] text-primary animate-pulse">radar</span>
              <span class="font-mono text-[10px] tracking-wider uppercase">Awaiting H.264 Keyframe…</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Ingestion Status Strip -->
      <div class="bg-surface-container-high/60 border border-outline-variant/40 rounded px-space-md py-1.5 flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
        <div class="flex items-center gap-2 truncate">
          <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          <span>INIT SCADA RPC &bull; GET /api/v4/grid/state-vector [200 OK] &bull; GET /api/v4/assets/health/matrix [POLLING]</span>
        </div>
        <span class="text-primary font-semibold flex-shrink-0">GRID CLUSTER: RC4 ONLINE</span>
      </div>
    </div>`;
  },
};

/* ─── Operator actions — every one hits a real endpoint and mutates state ─── */
const Actions = {
  async _run(btn, fn, { refresh = true } = {}) {
    const label = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      const r = await fn();
      Toast.ok(r.message || 'Done');
      if (refresh) {
        await App.refreshChrome();
        if (['maintenance', 'crews', 'overview'].includes(App.current)) App.refresh();
      }
      return r;
    } catch (e) {
      Toast.err(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; if (label) btn.innerHTML = label; }
    }
  },

  dispatch(assetId, btn)            { return this._run(btn, () => API.dispatch(assetId)); },

  /* Pre-position a crew into an area: prefer the optimiser's own recommendation
     for that area, otherwise send the first available crew. */
  prepositionArea(areaId, btn) {
    return this._run(btn, async () => {
      const r = await API.crewRecommendations();
      const rec = (r.recommendations || []).find(x => x.recommended_area === areaId);
      const crewId = rec ? rec.crew_id
        : (r.crews || []).find(c => c.availability === 'AVAILABLE')?.crew_id;
      if (!crewId) throw new Error('No crew is currently AVAILABLE to pre-position');
      return API.reposition(crewId, areaId);
    });
  },
  defer(assetId, btn)               { return this._run(btn, () => API.defer(assetId, 'Deferred from maintenance queue')); },
  schedule(assetId, btn)            { return this._run(btn, () => API.schedule(assetId)); },
  reposition(crewId, areaId, btn)   { return this._run(btn, () => API.reposition(crewId, areaId)); },
  release(crewId, btn)              { return this._run(btn, () => API.releaseCrew(crewId)); },
};
