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
