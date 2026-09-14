/* ─── Page renderers — return via App.render() then optional post-hooks ─── */
const Pages = {};
let _charts = [];

function killCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  _charts = [];
}

function mkLine(ctx, labels, datasets, opts = {}) {
  if (!ctx) return null;
  const ch = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#404942', boxWidth: 10, font: { size: 10, family: 'IBM Plex Sans' } } } },
      scales: {
        x: { ticks: { color: '#707971', maxTicksLimit: 7, font: { size: 10 } }, grid: { color: '#e5eeff' } },
        y: { ticks: { color: '#707971', font: { size: 10 } }, grid: { color: '#e5eeff' } }
      },
      elements: { point: { radius: 0 }, line: { tension: 0.35, borderWidth: 2 } }
    }, opts)
  });
  _charts.push(ch);
  return ch;
}

/* Convert array of values to smooth SVG cubic bezier path (160×40 viewBox) */
function toSparkPath(vals, W = 160, H = 40) {
  if (!vals || vals.length < 2) return `M0,${H / 2} L${W},${H / 2}`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * W,
    H - 3 - ((v - min) / range) * (H - 6)
  ]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    d += ` C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  return d;
}

function v(id) { return (document.getElementById(id) || {}).value || ''; }
function el(id) { return document.getElementById(id); }

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW
   ══════════════════════════════════════════════════════════════ */
Pages.overview = async () => {
  const [s, alerts, areas] = await Promise.all([API.summary(), API.alerts(), API.areas()]);
  App.setGridRisk(s.overall_grid_risk);

  const kpis = `<div class="grid grid-cols-2 lg:grid-cols-5 gap-space-sm mb-space-md">
    ${C.kpi('speed', 'Overall Grid Risk', `${s.overall_grid_risk || '--'}`, `${s.total_assets} assets monitored`, 'CRITICAL')}
    ${C.kpi('crisis_alert', 'Critical Assets', s.critical_assets || 0, 'Require immediate action', 'CRITICAL')}
    ${C.kpi('warning', 'High-Risk Assets', s.high_risk_assets || 0, 'P(fail) > 65%', 'HIGH')}
    ${C.kpi('bolt', 'Predicted Failures', s.predicted_failures || 0, 'Next 72h horizon', 'HIGH')}
    ${C.kpi('people', 'Customers at Risk', F.num(s.customers_at_risk), `${s.weather_exposed_zones || 0} weather zones`, 'MEDIUM')}
  </div>`;

  // Recommended action banner
  const recAction = (s.recommended_actions || [])[0] || 'No immediate actions required.';
  const banner = `<div class="bg-surface-container-low border border-outline-variant rounded p-space-md mb-space-md flex items-center justify-between gap-space-sm">
    <div class="flex items-start gap-space-sm">
      <span class="material-symbols-outlined text-error text-[20px] flex-shrink-0 mt-0.5">notifications_active</span>
      <div>
        <div class="font-label-sm text-[10px] text-on-surface-variant uppercase font-bold tracking-wider mb-0.5">TOP RECOMMENDED ACTION</div>
        <div class="font-body-md text-body-md text-on-surface font-semibold">${F.esc(recAction)}</div>
      </div>
    </div>
    <div class="flex gap-space-xs flex-shrink-0">
      <button onclick="App.simAsset('${(s.top_assets[0] || {}).asset_id || ''}')"
        class="h-8 px-space-md bg-error text-on-error font-label-sm text-label-sm font-bold rounded flex items-center gap-1.5 uppercase hover:opacity-90 transition-opacity" type="button">
        <span class="material-symbols-outlined text-[15px]">send</span>Execute Pre-Position Dispatch
      </button>
      <button onclick="App.go('assets')"
        class="h-8 px-space-md bg-surface-container-lowest text-on-surface font-label-sm text-label-sm font-semibold rounded border border-outline-variant flex items-center gap-1.5 hover:bg-surface-container transition-colors" type="button">
        <span class="material-symbols-outlined text-[15px]">monitoring</span>Review Telemetry
      </button>
    </div>
  </div>`;

  // Critical Now table
  const critRows = (s.top_assets || []).slice(0, 5).map(a => `<tr class="hover:bg-surface-container cursor-pointer transition-colors border-b border-surface-container" onclick="App.openAsset('${a.asset_id}')">
    <td class="py-2 px-space-sm">
      <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background:${F.riskColor(a.priority || a.risk_level)};flex-shrink:0"></span>
      <span class="font-telemetry-display text-label-md font-bold text-primary">${a.asset_id}</span></div>
      <div class="text-[10px] text-on-surface-variant font-mono">${F.esc(a.asset_type || '')}</div>
    </td>
    <td class="py-2 px-space-sm text-[11px] text-on-surface-variant">${F.esc(a.area || a.geographic_area || '')}</td>
    <td class="py-2 px-space-sm">${F.badge(a.priority || a.risk_level)}</td>
    <td class="py-2 px-space-sm">
      <div class="flex items-center gap-1">
        <div class="w-12 h-1.5 bg-surface-container-highest rounded overflow-hidden">
          <div class="h-full rounded" style="width:${F.pct(a.failure_probability)};background:${F.riskColor(a.priority || a.risk_level)}"></div>
        </div>
        <span class="font-mono text-[11px] font-bold" style="color:${F.riskColor(a.priority || a.risk_level)}">${F.pct(a.failure_probability)}</span>
      </div>
    </td>
    <td class="py-2 px-space-sm text-right font-mono text-[11px]">${F.num(a.customers_served)}</td>
    <td class="py-2 px-space-sm">
      <button class="px-2 py-0.5 bg-error-container text-on-error-container font-label-sm text-[10px] font-bold rounded uppercase hover:opacity-90" onclick="event.stopPropagation();App.openAsset('${a.asset_id}')" type="button">Inspect ▸</button>
    </td>
  </tr>`).join('');

  const critTable = `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden mb-space-md">
    <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-error text-[16px]">bolt</span>
        <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Critical Now — High Priority Equipment</span>
        <span class="inline-flex items-center gap-1 bg-error text-on-error font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded">${s.critical_assets || 0} ACTIONABLE</span>
      </div>
      <span class="font-label-sm text-[11px] text-on-surface-variant">Real-Time SCADA Matrix</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
          <th class="py-1.5 px-space-sm font-semibold">Asset ID</th>
          <th class="py-1.5 px-space-sm font-semibold">Area/Substation</th>
          <th class="py-1.5 px-space-sm font-semibold">Severity</th>
          <th class="py-1.5 px-space-sm font-semibold">Failure Prob.</th>
          <th class="py-1.5 px-space-sm text-right font-semibold">Customers</th>
          <th class="py-1.5 px-space-sm font-semibold">Action</th>
        </tr></thead>
        <tbody class="divide-y divide-surface-container font-body-sm text-on-surface">${critRows || '<tr><td colspan="6" class="py-4 text-center text-on-surface-variant font-label-sm text-label-sm">No critical assets</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;

  // Area Risk Matrix
  const areaRows = (areas || []).map(a => `<tr class="hover:bg-surface-container cursor-pointer transition-colors border-b border-surface-container">
    <td class="py-2 px-space-sm font-telemetry-display text-label-md font-bold text-primary">${F.esc(a.area_id)}</td>
    <td class="py-2 px-space-sm">${F.badge(a.risk_level)}</td>
    <td class="py-2 px-space-sm text-right font-mono text-[11px] font-semibold">${a.high_risk_assets || 0}</td>
    <td class="py-2 px-space-sm text-right font-mono text-[11px]">${F.num(a.expected_customers_affected)}</td>
    <td class="py-2 px-space-sm text-[11px] text-on-surface-variant">${(a.contributing_factors || []).slice(0, 2).join(', ')}</td>
  </tr>`).join('');

  const areaTable = `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden mb-space-md">
    <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-primary text-[16px]">public</span>
        <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Regional Risk Exposure</span>
      </div>
      <span class="font-mono text-[10px] text-on-surface-variant">GET /api/areas/risk</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
          <th class="py-1.5 px-space-sm font-semibold">Area</th>
          <th class="py-1.5 px-space-sm font-semibold">Risk</th>
          <th class="py-1.5 px-space-sm text-right font-semibold">High-Risk</th>
          <th class="py-1.5 px-space-sm text-right font-semibold">Cust. Exp.</th>
          <th class="py-1.5 px-space-sm font-semibold">Weather Drivers</th>
        </tr></thead>
        <tbody class="divide-y divide-surface-container font-body-sm text-on-surface">${areaRows || '<tr><td colspan="5" class="py-4 text-center text-on-surface-variant font-label-sm text-label-sm">No area data</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;

  // Active Alerts
  const alertsHtml = (alerts || []).slice(0, 5).map(C.alert).join('') || '<div class="text-on-surface-variant font-label-sm text-label-sm text-center py-4">No active alerts</div>';

  App.render(`
    <div class="flex flex-col w-full">
      <!-- Page heading -->
      <div class="mb-space-md">
        <div class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">
          <span>Grid Ops</span><span class="text-outline-variant">/</span><span class="text-primary font-bold">Operations Overview</span>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Grid Operations Overview</h1>
            <p class="font-body-md text-body-md text-on-surface-variant">Current asset health, outage risk, and operational priorities — SCADA &amp; ML Forecast Feed</p>
          </div>
          <div class="flex items-center gap-space-sm">
            <button onclick="App.refresh()" class="h-8 px-space-md bg-surface-container-lowest text-on-surface border border-outline-variant rounded font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center gap-1.5" type="button">
              <span class="material-symbols-outlined text-[16px]">sync</span>Force Rescan
            </button>
          </div>
        </div>
      </div>
      ${kpis}
      ${banner}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        <!-- Left 7 cols -->
        <div class="lg:col-span-7">
          ${critTable}
          <!-- Exposure table -->
          <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden mb-space-md">
            <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[16px]">leaderboard</span>
                <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Top Grid-Impact Assets — System Exposure</span>
              </div>
              <span class="font-label-sm text-[11px] text-on-surface-variant">Top 5 Ranked</span>
            </div>
            ${C.assetTable((s.top_assets || []).slice(0, 5))}
          </div>
        </div>
        <!-- Right 5 cols -->
        <div class="lg:col-span-5">
          ${areaTable}
          <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden mb-space-md">
            <div class="px-space-md py-2 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-error text-[16px]">notifications_active</span>
                <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Active Operational Alerts</span>
                <span class="font-mono text-[10px] font-bold text-error">${alerts.length} Active SCADA Trips</span>
              </div>
            </div>
            <div class="p-space-sm scroll-panel" style="max-height:320px">${alertsHtml}</div>
          </div>
        </div>
      </div>
    </div>`);
};

/* ═══════════════════════════════════════════════════════════════
   ASSETS (split-panel with live detail drawer)
   ══════════════════════════════════════════════════════════════ */
let _allAssets = [];
let _selectedAssetId = null;

Pages.assets = async (preSelectId) => {
  const [assets, areas] = await Promise.all([API.assets('?limit=500'), API.areas()]);
  _allAssets = assets;
  const types = [...new Set(assets.map(a => a.asset_type).filter(Boolean))];
  const areaIds = (areas || []).map(a => a.area_id);

  App.render(`<div class="flex flex-col w-full">
    <!-- Page heading -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pb-space-md mb-space-md border-b border-outline-variant">
      <div>
        <div class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">
          <span>Substation Ops</span><span class="text-outline-variant">/</span>
          <span>Grid Telemetry</span><span class="text-outline-variant">/</span>
          <span class="text-primary font-bold">Health Register &amp; Diagnostics</span>
        </div>
        <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Assets Register &amp; Health Diagnostics</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Comprehensive electrical infrastructure register, sensor telemetry, and diagnostic health indexing.</p>
      </div>
      <div class="flex items-center gap-space-sm self-start md:self-auto">
        <div class="flex items-center gap-2 bg-surface-container-high px-space-md py-1.5 rounded border border-outline-variant shadow-sm">
          <span class="w-2.5 h-2.5 rounded-full bg-error animate-ping inline-block"></span>
          <div>
            <div class="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold leading-none">Active SCADA Scan</div>
            <div class="font-telemetry-display text-[13px] font-bold text-on-surface leading-tight">${assets.length} Monitored | ${assets.filter(a => a.priority === 'CRITICAL').length} Critical</div>
          </div>
        </div>
        <button onclick="App.refresh()" class="h-8 px-space-md bg-surface-container-lowest text-on-surface border border-outline-variant rounded shadow-sm font-body-sm text-body-sm font-semibold flex items-center gap-1.5 hover:bg-surface-container transition-colors" type="button">
          <span class="material-symbols-outlined text-[16px] text-primary">sync</span>Force SCADA Resync
        </button>
      </div>
    </div>
    <!-- Filter bar -->
    <div class="bg-surface-container-lowest p-space-md rounded shadow-sm mb-space-md border border-outline-variant/50">
      <div class="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
        <div class="md:col-span-4 relative flex items-center">
          <span class="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[18px]">filter_alt</span>
          <input id="f-q" class="w-full h-8 pl-8 pr-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary-container placeholder:text-on-surface-variant" placeholder="Filter by Asset ID, Substation, Serial Number…" type="text"/>
        </div>
        <div class="md:col-span-2">
          <select id="f-area" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border-none">
            <option value="">All Areas</option>
            ${areaIds.map(a => `<option>${a}</option>`).join('')}
          </select>
        </div>
        <div class="md:col-span-2">
          <select id="f-type" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border-none">
            <option value="">All Asset Types</option>
            ${types.map(t => `<option>${t}</option>`).join('')}
          </select>
        </div>
        <div class="md:col-span-2">
          <select id="f-pri" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border-none font-medium">
            <option value="">All Risk Tiers</option>
            <option value="CRITICAL">Critical Risk (&gt;85%)</option>
            <option value="HIGH">High Risk (60-85%)</option>
            <option value="MEDIUM">Medium Risk (25-60%)</option>
            <option value="LOW">Nominal (&lt;25%)</option>
          </select>
        </div>
        <div class="md:col-span-2 flex items-center justify-end gap-space-xs">
          <span id="filter-count" class="font-label-sm text-[11px] text-on-surface-variant font-mono">${assets.length} shown</span>
        </div>
      </div>
      <!-- Stats ribbon -->
      <div class="flex flex-wrap items-center justify-between gap-space-sm mt-space-xs pt-space-xs border-t border-outline-variant/50 font-label-sm text-label-sm text-on-surface-variant">
        <div class="flex items-center gap-space-md flex-wrap">
          <span class="text-on-surface font-semibold">Total: ${assets.length} Assets</span>
          <span class="text-outline-variant">|</span>
          <span class="flex items-center gap-1 text-error font-bold"><span class="w-1.5 h-1.5 rounded-full bg-error"></span>${assets.filter(a => a.priority === 'CRITICAL').length} Critical</span>
          <span class="flex items-center gap-1 text-secondary font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>${assets.filter(a => a.priority === 'HIGH').length} High Risk</span>
          <span class="flex items-center gap-1 text-on-surface-variant"><span class="w-1.5 h-1.5 rounded-full bg-outline"></span>${assets.filter(a => !['CRITICAL','HIGH'].includes(a.priority)).length} Nominal</span>
        </div>
      </div>
    </div>
    <!-- Split panel -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start w-full">
      <!-- Left: table (7 cols) -->
      <div class="lg:col-span-7 bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
        <div class="px-space-md py-2.5 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">inventory_2</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Active Grid Inventory</span>
            <span class="font-mono text-[11px] bg-surface-container-lowest px-1.5 py-0.5 rounded text-on-surface-variant">${assets.length} Items</span>
          </div>
          <div class="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
            <span class="material-symbols-outlined text-[15px]">sort</span>
            <span>Ranked by: Grid Impact Score (Desc)</span>
          </div>
        </div>
        <div id="asset-table-body" class="overflow-x-auto w-full overflow-y-auto scroll-panel" style="max-height:680px">
          <table class="w-full text-left text-body-sm font-body-sm">
            <thead class="sticky top-0 z-10">
              <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                <th class="py-2 px-space-md font-semibold">Asset Identifier</th>
                <th class="py-2 px-space-sm font-semibold">Type &amp; Substation</th>
                <th class="py-2 px-space-sm font-semibold">Risk Index</th>
                <th class="py-2 px-space-sm font-semibold">P(Failure)</th>
                <th class="py-2 px-space-sm text-right font-semibold">Impact</th>
                <th class="py-2 px-space-sm font-semibold">Priority</th>
                <th class="py-2 px-space-md text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody id="asset-tbody" class="divide-y divide-surface-container"></tbody>
          </table>
        </div>
        <div class="px-space-md py-2 bg-surface-container-low flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant border-t border-outline-variant/50">
          <span id="asset-page-info">Showing all assets</span>
          <div class="flex items-center gap-space-xs">
            <button class="px-2 py-1 bg-surface-container-lowest rounded shadow-sm hover:bg-surface-container font-label-sm text-label-sm" onclick="Pages.assetPage(-1)" type="button">Previous</button>
            <span id="asset-page-num" class="px-2 font-bold text-on-surface font-mono">Page 1</span>
            <button class="px-2 py-1 bg-surface-container-lowest rounded shadow-sm hover:bg-surface-container font-label-sm text-label-sm" onclick="Pages.assetPage(1)" type="button">Next</button>
          </div>
        </div>
      </div>
      <!-- Right: detail drawer (5 cols) -->
      <div class="lg:col-span-5 bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 flex flex-col overflow-hidden" id="asset-detail">
        <div class="p-space-lg flex items-center justify-center text-on-surface-variant">
          <div class="text-center">
            <span class="material-symbols-outlined text-[40px] text-outline mb-2 block">touch_app</span>
            <div class="font-label-sm text-label-sm uppercase tracking-wider">Select an asset to view diagnostics</div>
          </div>
        </div>
      </div>
    </div>
  </div>`);

  // Pagination state
  Pages._assetPage = 0;
  Pages._assetFiltered = [...assets];
  Pages.assetPage = (dir) => {
    const total = Math.ceil(Pages._assetFiltered.length / 20);
    Pages._assetPage = Math.max(0, Math.min(total - 1, Pages._assetPage + dir));
    Pages._renderAssetTable();
  };
  Pages._renderAssetTable = () => {
    const list = Pages._assetFiltered;
    const page = Pages._assetPage;
    const pageSize = 20;
    const start = page * pageSize, end = start + pageSize;
    const tbody = el('asset-tbody');
    if (!tbody) return;
    tbody.innerHTML = list.slice(start, end).map(a => {
      const lvl = a.priority || a.risk_level || 'LOW';
      const p   = a.failure_probability;
      const sel = a.asset_id === _selectedAssetId;
      const barW = Math.round((p || 0) * 100);
      const barCol = { CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132' }[lvl] || '#707971';
      return `<tr class="hover:bg-surface-container cursor-pointer transition-colors ${sel ? 'row-selected' : ''}" onclick="Pages.selectAsset('${a.asset_id}')">
        <td class="py-2.5 px-space-md">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-5 rounded-full flex-shrink-0 ${sel ? 'bg-primary' : 'bg-transparent'}"></span>
            <span class="font-telemetry-display text-label-md font-bold text-primary">${a.asset_id}</span>
            ${lvl === 'CRITICAL' ? '<span class="material-symbols-outlined text-[13px] text-error">priority_high</span>' : ''}
          </div>
        </td>
        <td class="py-2.5 px-space-sm">
          <div class="font-semibold text-on-surface text-[12px] leading-tight">${F.esc(a.asset_type || '')}</div>
          <div class="text-[11px] text-on-surface-variant font-mono">${F.esc(a.geographic_area || '')}</div>
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
        <td class="py-2.5 px-space-sm">
          <span class="px-1.5 py-0.5 rounded font-label-sm text-[10px] uppercase bg-surface-container text-on-surface-variant font-bold">${a.recommended_action ? 'Active' : 'In-Service'}</span>
        </td>
        <td class="py-2.5 px-space-md text-right">
          <button class="p-1 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors" type="button">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="py-6 text-center text-on-surface-variant font-label-sm text-label-sm">No assets match filter</td></tr>';

    const total = Math.ceil(list.length / pageSize);
    const info = el('asset-page-info');
    const pageNum = el('asset-page-num');
    if (info) info.textContent = `Rows ${start + 1}–${Math.min(end, list.length)} of ${list.length} entries`;
    if (pageNum) pageNum.textContent = `Page ${page + 1} of ${total}`;
    el('filter-count').textContent = `${list.length} shown`;
  };

  Pages._renderAssetTable();

  // Filter logic
  const applyFilter = () => {
    const q = v('f-q').toUpperCase();
    const area = v('f-area'), type = v('f-type'), pri = v('f-pri');
    Pages._assetFiltered = _allAssets.filter(a =>
      (!q    || a.asset_id.includes(q) || (a.geographic_area||'').toUpperCase().includes(q)) &&
      (!area || a.geographic_area === area) &&
      (!type || a.asset_type === type) &&
      (!pri  || a.priority === pri)
    );
    Pages._assetPage = 0;
    Pages._renderAssetTable();
  };
  ['f-area','f-type','f-pri'].forEach(id => { const e = el(id); if (e) e.onchange = applyFilter; });
  const fq = el('f-q'); if (fq) fq.oninput = F.debounce(applyFilter, 250);

  // Pre-select asset
  const toSelect = preSelectId || (assets[0] || {}).asset_id;
  if (toSelect) await Pages.selectAsset(toSelect);
};

Pages.selectAsset = async (id) => {
  _selectedAssetId = id;
  Pages._renderAssetTable && Pages._renderAssetTable();

  const drawer = el('asset-detail');
  if (!drawer) return;
  drawer.innerHTML = `<div class="p-space-lg text-center text-on-surface-variant"><span class="material-symbols-outlined text-[28px] animate-pulse">sensors</span><div class="font-label-sm text-label-sm uppercase mt-1">Loading telemetry…</div></div>`;

  try {
    const [d, sensors] = await Promise.all([API.asset(id), API.sensors(id, 24)]);
    const a = d.asset || {}, p = d.prediction || {};
    const lvl = p.priority || 'LOW';
    const fp  = (p.failure_probability || 0) * 100;
    const maint = (d.maintenance || []).slice(0, 3);
    const incidents = (d.incidents || []).slice(0, 2);

    // Build sparkline paths from real sensor data
    const temps = sensors.map(s => s.temperature).filter(x => x != null);
    const vibs  = sensors.map(s => s.vibration).filter(x => x != null);
    const pds   = sensors.map(s => s.partial_discharge).filter(x => x != null);
    const oils  = sensors.map(s => s.oil_temperature || s.temperature).filter(x => x != null);

    const latTemp = temps.slice(-1)[0];
    const latVib  = vibs.slice(-1)[0];
    const latPd   = pds.slice(-1)[0];
    const latOil  = oils.slice(-1)[0];

    const sparkTemp = C.sparkCard('Top-Oil Temp', latTemp != null ? latTemp.toFixed(1) : '--', '°C',
      lvl === 'CRITICAL' ? '▲ Rising fast' : 'Nominal', 'Trip: 110°C | Warn: 95°C',
      toSparkPath(temps.length ? temps : [80,82,85,89,95,102,latTemp||106]),
      lvl === 'CRITICAL' ? '#ba1a1a' : '#376757', true);

    const sparkVib = C.sparkCard('Vibration RMS', latVib != null ? latVib.toFixed(2) : '--', ' mm/s',
      lvl === 'CRITICAL' ? 'Harmonic @ 120Hz' : 'Nominal',
      'Nominal: < 2.0 mm/s',
      toSparkPath(vibs.length ? vibs : [1.1,1.2,1.4,1.8,2.5,3.8,latVib||4.8]),
      lvl === 'CRITICAL' ? '#ba1a1a' : '#376757');

    const sparkPd = C.sparkCard('Partial Discharge', latPd != null ? Math.round(latPd) : '--', ' pC',
      lvl === 'CRITICAL' ? 'Severe Dielectric Fail' : 'Nominal',
      'Threshold: < 150 pC',
      toSparkPath(pds.length ? pds : [50,60,80,120,200,400,latPd||840]),
      lvl === 'CRITICAL' ? '#ba1a1a' : '#707971');

    const sparkOil = C.sparkCard('DGA Acetylene C₂H₂', latOil != null ? latOil.toFixed(1) : '--', ' ppm',
      lvl === 'CRITICAL' ? 'Thermal Fault >700°C' : 'Nominal',
      'Hydrogen: ~340 ppm',
      toSparkPath(oils.length ? oils : [1,2,3,4,7,11,latOil||14]),
      lvl === 'CRITICAL' ? '#ba1a1a' : '#707971');

    const riskFactors = (p.top_risk_factors || []).slice(0, 4).map(C.factor).join('') ||
      '<div class="text-on-surface-variant font-label-sm text-label-sm text-center py-3">Nominal — no dominant risk drivers</div>';

    const maintLog = [...maint, ...incidents.map(i => ({ date: i.incident_timestamp?.slice(0,10), maintenance_type: i.root_cause, issue_found: 'Incident · ' + i.severity }))].slice(0,4)
      .map(m => `<div class="flex items-start justify-between gap-space-sm p-space-sm bg-surface-container-lowest rounded shadow-sm border border-outline-variant/30 mb-space-xs">
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-on-surface-variant text-[16px] mt-0.5">build</span>
          <div>
            <div class="font-semibold font-body-sm text-on-surface text-[12px]">${F.esc(m.maintenance_type || '')}</div>
            <div class="text-[11px] text-on-surface-variant">${F.esc(m.issue_found || '')}</div>
          </div>
        </div>
        <span class="font-mono text-[10px] text-on-surface-variant whitespace-nowrap">${F.day(m.date || m.date)}</span>
      </div>`).join('') || '<div class="text-on-surface-variant font-label-sm text-label-sm text-center py-2">No history records</div>';

    const weather = d.weather || {};

    drawer.className = 'lg:col-span-5 bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 flex flex-col overflow-hidden slide-in';
    drawer.innerHTML = `
      <!-- Drawer header -->
      <div class="p-space-md bg-surface-container-high flex flex-col gap-space-sm border-b border-outline-variant/50">
        <div class="flex items-start justify-between gap-space-sm">
          <div class="flex items-center gap-space-sm">
            <div class="w-10 h-10 rounded ${lvl === 'CRITICAL' ? 'bg-error-container' : 'bg-secondary-container'} flex items-center justify-center">
              <span class="material-symbols-outlined text-[24px] ${lvl === 'CRITICAL' ? 'text-on-error-container' : 'text-on-secondary-container'}">electric_bolt</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-telemetry-display text-headline-lg font-bold text-on-surface">${a.asset_id}</span>
                <span class="px-2 py-0.5 rounded font-label-sm text-[10px] font-bold ${lvl === 'CRITICAL' ? 'bg-error text-on-error animate-pulse' : 'bg-secondary-container text-on-secondary-container'} uppercase">${lvl} (${fp.toFixed(1)}%)</span>
              </div>
              <div class="font-body-sm text-body-sm text-on-surface-variant">${F.esc(a.asset_type || '')} • ${F.esc(a.geographic_area || '')}</div>
            </div>
          </div>
          <button onclick="App.simAsset('${a.asset_id}')" class="p-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface flex-shrink-0" title="Simulate failure" type="button">
            <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
        </div>
        <!-- Action ribbon -->
        <div class="grid grid-cols-3 gap-1.5">
          <button class="h-8 bg-error text-on-error font-label-sm text-label-sm font-semibold rounded flex items-center justify-center gap-1 uppercase tracking-wider hover:opacity-90 transition-opacity" type="button">
            <span class="material-symbols-outlined text-[14px]">send</span>Dispatch Crew
          </button>
          <button class="h-8 bg-primary-container text-on-primary font-label-sm text-label-sm font-semibold rounded flex items-center justify-center gap-1 uppercase tracking-wider hover:opacity-90 transition-opacity" type="button">
            <span class="material-symbols-outlined text-[14px]">event_note</span>Schedule Job
          </button>
          <button onclick="App.simAsset('${a.asset_id}')" class="h-8 bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold rounded flex items-center justify-center gap-1 uppercase tracking-wider hover:bg-surface-container-high transition-colors" type="button">
            <span class="material-symbols-outlined text-[14px]">model_training</span>Simulate Trip
          </button>
        </div>
      </div>
      <!-- Sub-tabs -->
      <div class="px-space-md bg-surface-container-low flex items-center gap-space-md border-b border-outline-variant/50" id="drawer-tabs">
        <button class="tab-btn active" onclick="Pages.drawerTab('telemetry')" id="tab-telemetry">Telemetry</button>
        <button class="tab-btn" onclick="Pages.drawerTab('risk')" id="tab-risk">Risk Breakdown</button>
        <button class="tab-btn" onclick="Pages.drawerTab('maint')" id="tab-maint">Maintenance (${maint.length})</button>
      </div>
      <!-- Scroll body -->
      <div class="p-space-md space-y-space-md overflow-y-auto scroll-panel" style="max-height:680px" id="drawer-body">
        <!-- Telemetry tab (default) -->
        <div id="drawer-tab-telemetry">
          <!-- Sensor sparklines -->
          <div class="space-y-space-sm">
            <div class="flex items-center justify-between mb-space-xs">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px] text-primary">query_stats</span>
                <span class="font-headline-md text-headline-md text-on-surface font-bold">Real-Time Sensor Feeds</span>
              </div>
              <div class="inline-flex bg-surface-container rounded p-0.5 font-mono text-[10px] text-on-surface-variant">
                <button class="px-1.5 py-0.5 hover:text-on-surface rounded" type="button">1h</button>
                <button class="px-1.5 py-0.5 hover:text-on-surface rounded" type="button">6h</button>
                <button class="px-1.5 py-0.5 bg-primary-container text-on-primary font-bold rounded shadow-sm" type="button">24h</button>
                <button class="px-1.5 py-0.5 hover:text-on-surface rounded" type="button">7d</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-space-sm">
              ${sparkTemp}${sparkVib}${sparkPd}${sparkOil}
            </div>
          </div>
          <!-- Failure projection -->
          <div class="p-space-md bg-surface-container rounded border border-outline-variant/50">
            <div class="flex items-center gap-2 mb-space-sm">
              <span class="material-symbols-outlined text-error text-[18px]">crisis_alert</span>
              <span class="font-headline-md text-headline-md text-on-surface font-bold">High-Consequence Failure Projection</span>
            </div>
            <div class="p-space-sm bg-surface-container-lowest rounded space-y-1 mb-space-sm border border-outline-variant/30">
              ${C.metricRow('Primary Fault Mechanism', `<span style="color:#ba1a1a">${F.esc(p.recommended_action || 'Inspect immediately')}</span>`)}
              ${C.metricRow('Predicted Failure Window', F.esc(p.predicted_failure_window || '72h'))}
              ${C.metricRow('Anomaly Score', F.pct(p.anomaly_score))}
            </div>
            <div class="grid grid-cols-3 gap-space-xs">
              <div class="p-space-xs bg-surface-container-lowest rounded text-center border border-outline-variant/30">
                <div class="font-label-sm text-[10px] text-on-surface-variant uppercase">Customers</div>
                <div class="font-telemetry-display text-[16px] font-bold text-on-surface">${F.num(a.customers_served)}</div>
              </div>
              <div class="p-space-xs bg-surface-container-lowest rounded text-center border border-outline-variant/30">
                <div class="font-label-sm text-[10px] text-on-surface-variant uppercase">Downstream</div>
                <div class="font-telemetry-display text-[16px] font-bold text-on-surface">${a.downstream_assets || '--'}</div>
              </div>
              <div class="p-space-xs bg-surface-container-lowest rounded text-center border border-outline-variant/30">
                <div class="font-label-sm text-[10px] text-on-surface-variant uppercase">Capacity</div>
                <div class="font-telemetry-display text-[16px] font-bold text-on-surface">${a.rated_capacity ? Math.round(a.rated_capacity) + ' MVA' : '--'}</div>
              </div>
            </div>
          </div>
          <!-- Weather -->
          <div class="p-space-md bg-surface-container-low rounded border border-outline-variant/50">
            <div class="flex items-center justify-between mb-space-sm">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-secondary text-[18px]">thunderstorm</span>
                <span class="font-headline-md text-headline-md text-on-surface font-bold">Active Weather Stress</span>
              </div>
              <span class="font-label-sm text-label-sm px-2 py-0.5 rounded ${(weather.storm || weather.extreme_weather_score > 50) ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'} font-bold uppercase">${(weather.storm || weather.extreme_weather_score > 50) ? 'Storm Vector: Incoming' : 'Conditions: Nominal'}</span>
            </div>
            <div class="grid grid-cols-4 gap-space-xs">
              ${[
                ['Ambient Temp', weather.temperature ? weather.temperature.toFixed(1) + '°C' : '--'],
                ['Rel Humidity', weather.humidity ? Math.round(weather.humidity) + '%' : '--'],
                ['Wind Speed', weather.wind_speed ? Math.round(weather.wind_speed) + ' km/h' : '--'],
                ['Wx Risk Score', weather.extreme_weather_score ? Math.round(weather.extreme_weather_score) + '/100' : '--']
              ].map(([k,val]) => `<div class="p-space-xs bg-surface-container-lowest rounded border border-outline-variant/30">
                <div class="text-on-surface-variant text-[10px] block font-label-sm">${k}</div>
                <div class="font-mono font-bold text-on-surface text-[13px]">${val}</div>
              </div>`).join('')}
            </div>
          </div>
          <!-- Maintenance history -->
          <div>
            <div class="flex items-center justify-between mb-space-xs">
              <span class="font-headline-md text-headline-md text-on-surface font-bold">Maintenance &amp; Event History</span>
              <button class="text-primary font-label-sm text-label-sm font-semibold hover:underline" type="button">View Full Log</button>
            </div>
            ${maintLog}
            <div class="mt-space-xs font-label-sm text-[11px] text-on-surface-variant font-mono">SN: ${F.esc(a.asset_id)}-${F.esc(a.substation_id || 'XFRM-01')} &bull; Installed: ${a.installation_year || '--'} &bull; Last maint: ${F.day(a.last_maintenance_date)}</div>
          </div>
        </div>
        <!-- Risk tab (hidden) -->
        <div id="drawer-tab-risk" class="hidden">
          <div class="font-headline-md text-headline-md text-on-surface font-bold mb-space-sm">Risk Factor Attribution (SHAP)</div>
          ${riskFactors}
          <div class="mt-space-md p-space-sm bg-surface-container rounded border border-outline-variant/50">
            ${C.metricRow('Grid Impact Score', `<span class="font-bold text-on-surface">${F.score(p.grid_impact_score)} / 100</span>`)}
            ${C.metricRow('Failure Probability', F.pct1(p.failure_probability))}
            ${C.metricRow('Anomaly Score', F.pct1(p.anomaly_score))}
            ${C.metricRow('Weather Risk', F.score(p.weather_risk))}
            ${C.metricRow('Criticality Score', a.criticality_score)}
          </div>
        </div>
        <!-- Maint tab (hidden) -->
        <div id="drawer-tab-maint" class="hidden">
          <div class="font-headline-md text-headline-md text-on-surface font-bold mb-space-sm">Maintenance History</div>
          ${maintLog || '<div class="text-on-surface-variant font-label-sm text-label-sm">No records</div>'}
          <div class="font-headline-md text-headline-md text-on-surface font-bold mb-space-sm mt-space-md">Incident Log</div>
          ${incidents.length ? incidents.map(i => `<div class="flex items-start gap-2 p-space-sm bg-error-container/20 rounded mb-space-xs border border-error/20">
            <span class="material-symbols-outlined text-error text-[16px] mt-0.5">bolt</span>
            <div>
              <div class="font-semibold font-body-sm text-on-surface text-[12px]">${F.esc(i.root_cause || 'Incident')}</div>
              <div class="text-[11px] text-on-surface-variant">Severity: ${i.severity} &bull; ${F.date(i.incident_timestamp)}</div>
            </div>
          </div>`).join('') : '<div class="text-on-surface-variant font-label-sm text-label-sm">No incidents recorded</div>'}
        </div>
      </div>`;

    Pages.drawerTab = (tab) => {
      ['telemetry','risk','maint'].forEach(t => {
        const pane = el(`drawer-tab-${t}`);
        const btn  = el(`tab-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tab);
        if (btn)  btn.classList.toggle('active', t === tab);
      });
    };
  } catch (e) {
    if (drawer) drawer.innerHTML = `<div class="p-space-lg text-center"><div class="text-error font-label-sm text-label-sm">${F.esc(e.message)}</div></div>`;
  }
};

/* ═══════════════════════════════════════════════════════════════
   RISK & AREAS
   ══════════════════════════════════════════════════════════════ */
Pages.riskAreas = async () => {
  const [areas, wx] = await Promise.all([API.areas(), API.weather()]);
  const cards = (areas || []).map(a => {
    const w = wx[a.area_id] || {};
    return `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md">
      <div class="flex items-center justify-between mb-space-sm">
        <div class="font-telemetry-display text-label-lg font-bold text-primary">${a.area_id}</div>
        ${F.badge(a.risk_level)}
      </div>
      ${C.metricRow('Outage Probability', `<span style="color:${F.riskColor(a.risk_level)};font-weight:700">${F.pct(a.outage_probability)}</span>`)}
      ${C.metricRow('Weather Risk', `${F.score(a.weather_risk)} / 100`)}
      ${C.metricRow('High-Risk Assets', a.high_risk_assets || 0)}
      ${C.metricRow('Est. Customers Exposed', F.num(a.expected_customers_affected))}
      ${C.metricRow('Wind Speed', w.wind_speed ? Math.round(w.wind_speed) + ' km/h' : '--')}
      ${C.metricRow('Storm Condition', w.storm ? '⚡ Active' : '—')}
      <div class="mt-space-xs text-[11px] text-on-surface-variant">${(a.contributing_factors || []).join(' · ')}</div>
      <button onclick="App.simWeather('${a.area_id}')" class="w-full mt-space-sm h-7 bg-surface-container border border-outline-variant font-label-sm text-label-sm rounded flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors" type="button">
        <span class="material-symbols-outlined text-[15px]">thunderstorm</span>Simulate Severe Weather
      </button>
    </div>`;
  }).join('');

  App.render(`<div class="flex flex-col w-full">
    <div class="mb-space-md">
      <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">Risk &amp; Areas</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Area outage probability, weather exposure, and contributing risk factors.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md mb-space-md">
      <div class="lg:col-span-7">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
          <div class="px-space-md py-2 bg-surface-container-high flex items-center gap-2 border-b border-outline-variant/50">
            <span class="material-symbols-outlined text-primary text-[16px]">map</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Outage Risk &amp; Weather Map</span>
          </div>
          <div class="p-space-md">
            <div id="map" class="map-container"></div>
            <div class="mt-space-xs flex gap-space-md flex-wrap font-label-sm text-[11px] text-on-surface-variant">
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#ba1a1a"></span>Critical</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#376757"></span>High</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#707971"></span>Medium</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#0f5132"></span>Low</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-secondary"></span>Crew</span>
            </div>
          </div>
        </div>
      </div>
      <div class="lg:col-span-5">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
          <div class="px-space-md py-2 bg-surface-container-high flex items-center gap-2 border-b border-outline-variant/50">
            <span class="material-symbols-outlined text-primary text-[16px]">bar_chart</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Weather Forecast — Worst Area (96h)</span>
          </div>
          <div class="p-space-md"><div style="height:280px"><canvas id="c-wx"></canvas></div></div>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">${cards}</div>
  </div>`);

  await GridMap.render('map', { mode: 'weather' });

  // Weather chart for worst area
  const worst = (areas || []).slice().sort((x, y) => (y.weather_risk || 0) - (x.weather_risk || 0))[0];
  if (worst) {
    try {
      const ser = (await API.weatherSeries(worst.area_id, 96)).reverse();
      const lbl = ser.map(s => F.date(s.timestamp));
      mkLine(el('c-wx'), lbl, [
        { label: 'Extreme weather score', data: ser.map(s => s.extreme_weather_score), borderColor: '#ba1a1a', fill: false },
        { label: 'Wind km/h', data: ser.map(s => s.wind_speed), borderColor: '#376757' },
        { label: 'Rainfall mm', data: ser.map(s => s.rainfall), borderColor: '#0f5132' }
      ]);
    } catch (_) {}
  }
};

/* ═══════════════════════════════════════════════════════════════
   MAINTENANCE
   ══════════════════════════════════════════════════════════════ */
Pages.maintenance = async () => {
  const [q, crews, crewRoster] = await Promise.all([
    API.maintenance('?limit=100'),
    API.crewRecommendations(),
    API.crews()
  ]);
  const pending   = q.length;
  const crewsList = crewRoster?.crews || crewRoster || [];
  const fieldCnt  = crewsList.filter(c => c.availability === 'ON_JOB').length;

  App.render(`<div class="flex flex-col w-full">
    <!-- Header banner -->
    <div class="bg-surface-container-high border border-outline-variant/50 rounded p-space-md mb-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm">
      <div>
        <div class="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold tracking-wider">Transmission Dispatch Operations</div>
        <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Maintenance Priorities &amp; Crew Operations</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Automated work-order risk ranking, crew assignment status, and ML-optimized pre-positioning.</p>
      </div>
      <div class="flex gap-space-sm">
        <button class="h-8 px-space-md bg-surface-container-lowest text-on-surface border border-outline-variant rounded font-label-sm text-label-sm flex items-center gap-1.5 hover:bg-surface-container transition-colors" type="button">
          <span class="material-symbols-outlined text-[15px]">sync</span>Sync Maximo / SAP PM
        </button>
        <button class="h-8 px-space-md bg-primary-container text-on-primary font-label-sm text-label-sm font-semibold rounded flex items-center gap-1.5 uppercase hover:opacity-90 transition-opacity" type="button">
          <span class="material-symbols-outlined text-[15px]">send</span>Bulk Dispatch Work-Orders
        </button>
      </div>
    </div>
    <!-- KPI tiles -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-space-sm mb-space-md">
      ${C.kpi('assignment', 'Pending Priority WOs', `${pending} Active`, 'Impact-ranked queue', 'CRITICAL')}
      ${C.kpi('local_shipping', 'Field Crews Deployed', `${fieldCnt} In Field / ${crewsList.length} Total`, 'Active crew status', 'HIGH')}
      ${C.kpi('smart_toy', 'ML Pre-Position Directives', `${(crews.recommendations || []).length} Urgent Recs`, 'AI-optimised staging', 'MEDIUM')}
      ${C.kpi('schedule', 'Avg Emergency Window', `${crews.avg_response_min || 42} min`, '(16 min via ML)', 'LOW')}
    </div>
    <!-- Filters -->
    <div class="bg-surface-container-lowest border border-outline-variant/50 rounded p-space-sm mb-space-md flex flex-wrap items-center gap-space-sm font-label-sm text-label-sm">
      <label class="flex items-center gap-1.5"><span class="text-on-surface-variant uppercase">AREA:</span>
        <select id="mf-area" class="h-7 px-2 bg-surface-container-low rounded font-body-sm text-body-sm border-none focus:outline-none">
          <option value="">All Areas</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5"><span class="text-on-surface-variant uppercase">ASSET:</span>
        <select id="mf-type" class="h-7 px-2 bg-surface-container-low rounded font-body-sm text-body-sm border-none focus:outline-none">
          <option value="">All Types</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5">
        <input type="checkbox" class="accent-primary" id="mf-high" checked/>
        <span>RISK &gt;60%</span>
      </label>
      <label class="flex items-center gap-1.5">
        <input type="checkbox" class="accent-primary" id="mf-cust" checked/>
        <span>CUST EXPOSED &gt;10K</span>
      </label>
      <button onclick="App.refresh()" class="ml-auto h-7 px-space-md bg-surface-container border border-outline-variant rounded flex items-center gap-1 hover:bg-surface-container-high transition-colors" type="button">
        <span class="material-symbols-outlined text-[15px]">download</span>Export Schedule
      </button>
    </div>
    <!-- Maintenance queue table -->
    <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden mb-space-md">
      <div class="px-space-md py-2.5 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[16px]">table_chart</span>
          <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Ranked Maintenance Queue</span>
          <span class="inline-flex items-center gap-1 bg-error text-on-error font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded">${q.filter(x => x.priority === 'CRITICAL').length} Critical Interventions Pending</span>
        </div>
        <span class="font-label-sm text-[11px] text-on-surface-variant">Sort Rule: Severity × Failure Prob × MVA Cascade Risk</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <th class="py-1.5 px-space-sm font-semibold">Rank/Priority</th>
            <th class="py-1.5 px-space-sm font-semibold">Asset / Substation</th>
            <th class="py-1.5 px-space-sm font-semibold">Type</th>
            <th class="py-1.5 px-space-sm font-semibold">Failure Prob (ML)</th>
            <th class="py-1.5 px-space-sm text-right font-semibold">Customers Risk</th>
            <th class="py-1.5 px-space-sm text-right font-semibold">Grid Impact</th>
            <th class="py-1.5 px-space-sm font-semibold">Recommended Action</th>
            <th class="py-1.5 px-space-sm font-semibold">Intervention</th>
          </tr></thead>
          <tbody class="divide-y divide-surface-container">
            ${q.slice(0, 14).map((x, i) => C.maintRow(x, i)).join('')}
          </tbody>
        </table>
      </div>
      <div class="px-space-md py-2 bg-surface-container-low flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant border-t border-outline-variant/50">
        <span>Showing 1–${Math.min(14, q.length)} of ${q.length} Ranked Outage Candidates · Confidence Model: Bayesian Risk Network v4.2</span>
        <div class="flex gap-1">
          <button class="px-2 py-1 bg-surface-container-lowest rounded shadow-sm hover:bg-surface-container font-label-sm text-label-sm" type="button">Previous</button>
          <span class="px-2 font-bold text-on-surface font-mono">Page 1 of ${Math.ceil(q.length / 14)}</span>
          <button class="px-2 py-1 bg-surface-container-lowest rounded shadow-sm hover:bg-surface-container font-label-sm text-label-sm" type="button">Next</button>
        </div>
      </div>
    </div>
    <!-- Crews + ML pre-positioning -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
      <!-- Field Crews table -->
      <div class="lg:col-span-7 bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
        <div class="px-space-md py-2.5 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[16px]">local_shipping</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Active Field Crews</span>
          </div>
          <span class="font-label-sm text-[11px] text-on-surface-variant">${crewsList.length} Monitored Teams</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
              <th class="py-1.5 px-space-sm font-semibold">Crew ID</th>
              <th class="py-1.5 px-space-sm font-semibold">Base Substation</th>
              <th class="py-1.5 px-space-sm font-semibold">Capability / Spec</th>
              <th class="py-1.5 px-space-sm font-semibold">Status</th>
              <th class="py-1.5 px-space-sm font-semibold">Shift ETA</th>
            </tr></thead>
            <tbody class="divide-y divide-surface-container font-body-sm text-on-surface">
              ${crewsList.map(c => `<tr class="hover:bg-surface-container transition-colors">
                <td class="py-2 px-space-sm font-telemetry-display text-label-md font-bold text-primary">${c.crew_id}</td>
                <td class="py-2 px-space-sm text-[12px] text-on-surface-variant">${c.current_area || '--'}</td>
                <td class="py-2 px-space-sm text-[12px]">${c.skill_type || '--'}<br/><span class="text-[10px] text-on-surface-variant">${c.equipment_capability || ''}</span></td>
                <td class="py-2 px-space-sm">
                  <span class="px-1.5 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase ${c.availability === 'AVAILABLE' ? 'bg-secondary-container text-on-secondary-container' : c.availability === 'ON_JOB' ? 'bg-surface-container-high text-on-surface' : 'bg-error-container text-on-error-container'}">${c.availability || '--'}</span>
                </td>
                <td class="py-2 px-space-sm font-mono text-[11px] text-on-surface-variant">Shift: ${c.next_shift || '--'}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="py-4 text-center text-on-surface-variant font-label-sm text-label-sm">No crews data</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <!-- ML Pre-positioning -->
      <div class="lg:col-span-5">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
          <div class="px-space-md py-2.5 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-secondary text-[16px]">smart_toy</span>
              <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">ML Recommended Pre-Positioning</span>
            </div>
            <div class="flex items-center gap-1 bg-error-container text-on-error-container font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded">
              STORM FRONT ARRIVAL: ~45 MIN
            </div>
          </div>
          <div class="p-space-md space-y-space-sm scroll-panel" style="max-height:420px">
            ${(crews.recommendations || []).slice(0, 4).map(C.crewCard).join('') || '<div class="text-center text-on-surface-variant font-label-sm text-label-sm py-4">No repositioning needed</div>'}
          </div>
        </div>
      </div>
    </div>
  </div>`);
};

/* ═══════════════════════════════════════════════════════════════
   CREWS
   ══════════════════════════════════════════════════════════════ */
Pages.crews = async () => {
  const [crewRoster, r] = await Promise.all([API.crews(), API.crewRecommendations()]);
  const maxSaved = Math.max(0, ...(r.recommendations || []).map(x => x.response_reduction_min || 0));

  App.render(`<div class="flex flex-col w-full">
    <div class="mb-space-md">
      <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">Crew Pre-Positioning &amp; Optimisation</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Assignment status, skill-weighted pre-positioning recommendations, and response time optimisation.</p>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-space-sm mb-space-md">
      ${C.kpi('check_circle', 'Available Crews', r.available_crews || 0, `of ${(crewRoster.crews || []).length} total`, 'LOW')}
      ${C.kpi('warning', 'Demand Areas', r.demand_areas || 0, 'high/critical clusters', 'HIGH')}
      ${C.kpi('swap_horiz', 'Repositions Rec.', (r.recommendations||[]).length, 'recommended moves', 'MEDIUM')}
      ${C.kpi('schedule', 'Max Time Saved', `${maxSaved} min`, 'best response gain', 'LOW')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
      <div class="lg:col-span-5 space-y-space-sm">
        <div class="font-headline-md text-headline-md font-bold text-on-surface mb-space-xs">ML Pre-Positioning Recommendations</div>
        ${(r.recommendations||[]).map(C.crewCard).join('') || '<div class="text-on-surface-variant font-label-sm text-label-sm text-center py-6 bg-surface-container-lowest rounded border border-outline-variant/50">No repositioning recommended at this time.</div>'}
      </div>
      <div class="lg:col-span-7">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
          <div class="px-space-md py-2.5 bg-surface-container-high flex items-center gap-2 border-b border-outline-variant/50">
            <span class="material-symbols-outlined text-primary text-[16px]">local_shipping</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">All Crews</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
                <th class="py-1.5 px-space-sm font-semibold">Crew ID</th>
                <th class="py-1.5 px-space-sm font-semibold">Location</th>
                <th class="py-1.5 px-space-sm font-semibold">Skill Type</th>
                <th class="py-1.5 px-space-sm font-semibold">Equipment</th>
                <th class="py-1.5 px-space-sm font-semibold">Status</th>
              </tr></thead>
              <tbody class="divide-y divide-surface-container font-body-sm text-on-surface">
                ${(crewRoster.crews || []).map(c => `<tr class="hover:bg-surface-container transition-colors">
                  <td class="py-2 px-space-sm font-telemetry-display text-label-md font-bold text-primary">${c.crew_id}</td>
                  <td class="py-2 px-space-sm text-[12px] text-on-surface-variant">${c.current_area || '--'}</td>
                  <td class="py-2 px-space-sm text-[12px]">${c.skill_type || '--'}</td>
                  <td class="py-2 px-space-sm text-[12px] text-on-surface-variant">${c.equipment_capability || '--'}</td>
                  <td class="py-2 px-space-sm">
                    <span class="px-1.5 py-0.5 rounded font-label-sm text-[10px] font-bold uppercase ${c.availability==='AVAILABLE' ? 'bg-secondary-container text-on-secondary-container' : c.availability==='ON_JOB' ? 'bg-surface-container-high text-on-surface' : 'bg-error-container text-on-error-container'}">${c.availability || '--'}</span>
                  </td>
                </tr>`).join('') || '<tr><td colspan="5" class="py-4 text-center text-on-surface-variant font-label-sm text-label-sm">No crew data</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>`);
};

/* ═══════════════════════════════════════════════════════════════
   GRID MAP
   ══════════════════════════════════════════════════════════════ */
Pages.gridMap = async () => {
  App.render(`<div class="flex flex-col w-full">
    <div class="mb-space-md flex items-center justify-between">
      <div>
        <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">Interactive Grid Map</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Asset locations, area risk overlays, and crew positioning.</p>
      </div>
      <div class="flex gap-space-xs font-label-sm text-[11px] text-on-surface-variant flex-wrap">
        <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#ba1a1a"></span>Critical</span>
        <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#376757"></span>High</span>
        <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#707971"></span>Medium</span>
        <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:#0f5132"></span>Low</span>
        <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-sm" style="background:#0f5132"></span>Crew</span>
      </div>
    </div>
    <div class="mb-space-sm flex items-center gap-space-md bg-surface-container-lowest p-space-sm rounded border border-outline-variant/50 font-label-sm text-label-sm">
      <span class="font-bold text-on-surface uppercase">Filter Map Layers:</span>
      <label class="flex items-center gap-1.5 cursor-pointer text-on-surface"><input type="checkbox" id="map-t-crit" class="accent-primary" onchange="GridMap.filter('crit', this.checked)"/> Critical Assets Only</label>
      <label class="flex items-center gap-1.5 cursor-pointer text-on-surface"><input type="checkbox" id="map-t-wx" class="accent-primary" checked onchange="GridMap.filter('wx', this.checked)"/> Weather Risk Circles</label>
      <label class="flex items-center gap-1.5 cursor-pointer text-on-surface"><input type="checkbox" id="map-t-crew" class="accent-primary" checked onchange="GridMap.filter('crew', this.checked)"/> Field Crews</label>
    </div>
    <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
      <div id="map" style="height:600px"></div>
    </div>
  </div>`);
  await GridMap.render('map');
};

/* ═══════════════════════════════════════════════════════════════
   SIMULATION
   ══════════════════════════════════════════════════════════════ */
Pages.simulation = async (preAsset) => {
  const [assets, areas] = await Promise.all([API.assets('?limit=500'), API.areas()]);
  const critical = assets.filter(a => ['CRITICAL','HIGH'].includes(a.priority));
  const simList  = [...critical, ...assets].slice(0, 80);

  App.render(`<div class="flex flex-col w-full">
    <div class="mb-space-md">
      <div class="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold tracking-wider mb-0.5">Operational Decision Support / Concurrent Engine Sessions: Active</div>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">Grid Outage Simulation &amp; Operational Copilot</h1>
          <p class="font-body-md text-body-md text-on-surface-variant">Scenario contingency modelling, weather impact stress-testing, and AI decision-support advisor.</p>
        </div>
        <div class="flex items-center gap-space-sm">
          <button class="h-8 px-space-md bg-surface-container-lowest text-on-surface border border-outline-variant rounded font-label-sm text-label-sm flex items-center gap-1.5 hover:bg-surface-container" type="button">
            <span class="material-symbols-outlined text-[15px]">receipt_long</span>Runs Log
          </button>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      <!-- Left: Simulation engine -->
      <div class="flex flex-col gap-space-md">
        <!-- Engine controls -->
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden">
          <div class="px-space-md py-2.5 bg-surface-container-high flex items-center gap-2 border-b border-outline-variant/50">
            <span class="material-symbols-outlined text-primary text-[16px]">science</span>
            <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">What-If Contingency &amp; Stress Simulation Engine</span>
            <span class="font-mono text-[10px] text-on-surface-variant ml-auto">POST /api/simulation</span>
          </div>
          <div class="p-space-md">
            <!-- Tabs -->
            <div class="flex gap-space-xs mb-space-md">
              <button class="sim-tab active" id="sim-tab-asset" onclick="Pages.simSwitchTab('asset')">
                <span class="material-symbols-outlined text-[14px] align-middle">electric_bolt</span> Asset Failure Contingency (N-1 / N-2)
              </button>
              <button class="sim-tab" id="sim-tab-weather" onclick="Pages.simSwitchTab('weather')">
                <span class="material-symbols-outlined text-[14px] align-middle">thunderstorm</span> Severe Weather Event Simulation
              </button>
            </div>
            <!-- Asset sim panel -->
            <div id="sim-panel-asset">
              <div class="grid grid-cols-2 gap-space-sm mb-space-sm">
                <div>
                  <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-1">Target Primary Asset</div>
                  <select id="sim-asset" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border border-outline-variant">
                    ${simList.map(a => `<option value="${a.asset_id}">${a.asset_id} — ${a.asset_type} (${a.geographic_area})</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-1">Ambient Overload</div>
                  <div class="flex items-center gap-1 bg-surface-container-low rounded h-8 px-2 border border-outline-variant">
                    <input type="checkbox" class="accent-primary" checked id="sim-n11"/>
                    <span class="font-body-sm text-body-sm text-on-surface">N-1-1 Contingency (BRK-4412 Trip)</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-space-sm mb-space-sm font-label-sm text-[11px] text-on-surface-variant font-mono">
                <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>CONVERGENCE TOLERANCE: 0.001 MW</span>
                <span>Iteration 4 / Run Time: 182ms</span>
              </div>
              <button onclick="Pages.runSim()" class="w-full h-9 bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center justify-center gap-2 uppercase tracking-wider hover:opacity-90 transition-opacity" type="button">
                <span class="material-symbols-outlined text-[16px]">play_circle</span>Run Grid Contingency Simulation
              </button>
            </div>
            <!-- Weather sim panel (hidden) -->
            <div id="sim-panel-weather" class="hidden">
              <div class="grid grid-cols-2 gap-space-sm mb-space-sm">
                <div>
                  <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-1">Target Area</div>
                  <select id="sim-area" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border border-outline-variant">
                    ${(areas||[]).map(a => `<option>${a.area_id}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-1">Event Severity</div>
                  <select id="sim-sev" class="w-full h-8 px-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none border border-outline-variant">
                    <option>severe</option><option>extreme</option><option>moderate</option><option>mild</option>
                  </select>
                </div>
              </div>
              <button onclick="Pages.runSimWeather()" class="w-full h-9 bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center justify-center gap-2 uppercase tracking-wider hover:opacity-90 transition-opacity" type="button">
                <span class="material-symbols-outlined text-[16px]">play_circle</span>Run Weather Event Simulation
              </button>
            </div>
          </div>
        </div>
        <!-- Results panel -->
        <div id="sim-results"></div>
      </div>
      <!-- Right: Copilot panel -->
      <div id="sim-copilot-panel">
        ${Pages._copilotPanel()}
      </div>
    </div>
  </div>`);

  Pages.simSwitchTab = (tab) => {
    ['asset','weather'].forEach(t => {
      el(`sim-tab-${t}`)?.classList.toggle('active', t === tab);
      el(`sim-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    });
  };

  Pages.runSim = async () => {
    const assetId = v('sim-asset');
    if (!assetId) return;
    const out = el('sim-results');
    out.innerHTML = `<div class="bg-surface-container-lowest rounded border border-outline-variant/50 p-space-md text-center text-on-surface-variant font-label-sm text-label-sm"><span class="material-symbols-outlined text-[24px] animate-pulse block mb-1">hourglass_empty</span>Simulating asset failure…</div>`;
    try {
      const r = await API.simulate({ type: 'asset_failure', asset_id: assetId });
      out.innerHTML = Pages._renderSimResult(r);
    } catch (e) { out.innerHTML = `<div class="text-error p-space-md font-label-sm text-label-sm">${F.esc(e.message)}</div>`; }
  };

  Pages.runSimWeather = async () => {
    const area = v('sim-area'), sev = v('sim-sev');
    const out = el('sim-results');
    out.innerHTML = `<div class="bg-surface-container-lowest rounded border border-outline-variant/50 p-space-md text-center text-on-surface-variant font-label-sm text-label-sm"><span class="material-symbols-outlined text-[24px] animate-pulse block mb-1">thunderstorm</span>Simulating weather event…</div>`;
    try {
      const r = await API.simulate({ type: 'weather_event', area_id: area, event: sev });
      out.innerHTML = Pages._renderWeatherSimResult(r);
    } catch (e) { out.innerHTML = `<div class="text-error p-space-md font-label-sm text-label-sm">${F.esc(e.message)}</div>`; }
  };

  // Auto-run if preselected
  if (preAsset) { const s = el('sim-asset'); if (s) { s.value = preAsset; await Pages.runSim(); } }

  // Init copilot in right panel
  Pages._initCopilotPanel();
};

Pages._renderSimResult = (r) => {
  const rows = [
    ['Unserved Energy (MWh)', '0.0 MWh', `+${F.num(Math.round((r.estimated_outage_minutes||0)/60 * (r.direct_customers||0) * 0.0008))} MWh (Severe Deficit)`],
    ['Customers Experiencing Outage', '0 Meters', `${F.num(r.total_customers_affected)} (Islanded Feeders)`],
    ['Overloaded Corridors', '0 lines > 90%', `${r.affected_areas?.length || 0} Lines at 114% Cap`],
    ['Backup Redundancy Failover', 'Normal N-1 Secure', 'Zero N-1 Margin'],
  ];
  const mitSteps = (r.recommended_mitigation || []).slice(0, 3);
  return `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 overflow-hidden slide-in">
    <div class="px-space-md py-2.5 bg-error-container/30 flex items-center gap-2 border-b border-outline-variant/50">
      <span class="material-symbols-outlined text-error text-[16px]">crisis_alert</span>
      <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Before vs After Simulation Impact Analysis</span>
      <span class="font-label-sm text-[10px] text-error font-bold ml-auto">DELTA CRITICAL — Calculated at: ${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="p-space-md">
      <div class="overflow-x-auto mb-space-md">
        <table class="w-full text-left font-body-sm text-body-sm">
          <thead><tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[10px] uppercase tracking-wider">
            <th class="py-1.5 px-space-sm font-semibold">Parameter Metric</th>
            <th class="py-1.5 px-space-sm font-semibold">Current Steady State</th>
            <th class="py-1.5 px-space-sm font-semibold">Simulated Failure State</th>
            <th class="py-1.5 px-space-sm font-semibold">Delta / Operational Impact</th>
          </tr></thead>
          <tbody class="divide-y divide-surface-container">
            ${rows.map(([metric, current, simulated]) => `<tr>
              <td class="py-2 px-space-sm font-semibold text-on-surface">${metric}</td>
              <td class="py-2 px-space-sm text-on-surface-variant font-mono text-[12px]">${current}</td>
              <td class="py-2 px-space-sm font-mono text-[12px] text-error font-bold">${simulated}</td>
              <td class="py-2 px-space-sm font-mono text-[12px] text-error font-bold">▲ Critical</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex items-center gap-2 mb-space-sm">
        <span class="material-symbols-outlined text-secondary text-[16px]">play_lesson</span>
        <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Automated Mitigation Playbook</span>
        <span class="font-label-sm text-[10px] bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded font-bold uppercase">System Suggested: Dynamic Dispatch Solver (DCOPF)</span>
      </div>
      <div class="space-y-space-xs">
        ${mitSteps.map((m, i) => `<div class="miti-step">
          <div class="miti-num">${i+1}</div>
          <div class="flex-1">
            <div class="font-body-sm text-[12px] font-semibold text-on-surface">${F.esc(m)}</div>
          </div>
        </div>`).join('') || '<div class="text-on-surface-variant font-label-sm text-label-sm">No mitigation steps returned</div>'}
      </div>
      <div class="mt-space-md grid grid-cols-3 gap-space-sm font-label-sm text-[11px]">
        <div class="bg-surface-container p-space-sm rounded border border-outline-variant/40 text-center">
          <div class="text-on-surface-variant uppercase">Affected Areas</div>
          <div class="font-mono font-bold text-on-surface text-[16px]">${(r.affected_areas||[]).length}</div>
        </div>
        <div class="bg-surface-container p-space-sm rounded border border-outline-variant/40 text-center">
          <div class="text-on-surface-variant uppercase">Customers Affected</div>
          <div class="font-mono font-bold text-error text-[16px]">${F.num(r.total_customers_affected)}</div>
        </div>
        <div class="bg-surface-container p-space-sm rounded border border-outline-variant/40 text-center">
          <div class="text-on-surface-variant uppercase">Nearest Crew ETA</div>
          <div class="font-mono font-bold text-on-surface text-[16px]">${r.nearest_crew ? r.nearest_crew.response_min + ' min' : '--'}</div>
        </div>
      </div>
    </div>
  </div>`;
};

Pages._renderWeatherSimResult = (r) => {
  return `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md slide-in">
    <div class="font-headline-md text-headline-md font-bold text-on-surface mb-space-sm">Weather Event Impact — ${F.esc(r.area_id)}</div>
    ${C.metricRow('Scenario Severity', F.esc(r.injected_severity))}
    ${C.metricRow('Baseline Outage Prob', F.pct(r.baseline_outage_probability))}
    ${C.metricRow('New Outage Prob', `<span style="color:${F.riskColor(r.new_risk_level)};font-weight:700">${F.pct(r.new_outage_probability)}</span>`)}
    ${C.metricRow('Risk Level', `${F.badge(r.baseline_risk_level)} → ${F.badge(r.new_risk_level)}`)}
    ${C.metricRow('High-Risk Assets', r.high_risk_assets)}
    <div class="mt-space-sm text-[11px] text-on-surface-variant font-semibold uppercase mb-1">Top Exposed Assets</div>
    ${(r.top_exposed_assets||[]).slice(0,4).map(a => `<div class="flex items-center justify-between py-1 border-b border-surface-container font-body-sm text-[12px] cursor-pointer hover:text-primary" onclick="App.openAsset('${a.asset_id}')">
      <span class="font-mono font-bold text-primary">${a.asset_id}</span>
      <span>${F.pct(a.fp)} · Impact: ${F.score(a.gis)}</span>
    </div>`).join('')}
    <div class="mt-space-sm space-y-1">
      ${(r.recommended_actions||[]).map(a => `<div class="text-[12px] text-primary">▸ ${F.esc(a)}</div>`).join('')}
    </div>
  </div>`;
};

/* ═══════════════════════════════════════════════════════════════
   COPILOT
   ══════════════════════════════════════════════════════════════ */
const SUGGESTS = [
  'Explain T-1024 criticality', 'Simulate Storm Front Zone 2',
  'Optimal crew pre-positioning', 'List N-1 Vulnerable Substations',
  'Summarize today\'s grid risks', 'Which assets fail within 72h?',
  'Why is T-1024 critical?', 'What happens if T-1024 fails?'
];

Pages._copilotPanel = () => `<div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 flex flex-col overflow-hidden" style="min-height:600px">
  <div class="px-space-md py-2.5 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/50">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-secondary text-[16px]">terminal</span>
      <span class="font-label-sm text-label-sm font-bold text-on-surface uppercase">Grid Operations Copilot</span>
      <span class="inline-flex items-center gap-1 bg-secondary-container text-on-secondary-container font-label-sm text-[10px] font-bold px-1.5 py-0.5 rounded"><span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>ONLINE</span>
    </div>
    <span class="font-mono text-[10px] text-on-surface-variant">POST /api/copilot/query</span>
  </div>
  <div class="p-space-md flex flex-col flex-1">
    <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-space-xs">Operator Natural Language Query Console</div>
    <div class="flex gap-space-xs mb-space-sm">
      <div class="relative flex-1">
        <input id="cop-q" class="w-full h-9 pl-3 pr-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary-container placeholder:text-on-surface-variant" placeholder="Why is T-1024 classified as Critical…" type="text" onkeydown="if(event.key==='Enter')Pages.copilotAsk()"/>
      </div>
      <button onclick="Pages.copilotAsk()" class="h-9 px-space-md bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center gap-1.5 uppercase hover:opacity-90 transition-opacity" type="button">
        <span class="material-symbols-outlined text-[15px]">send</span>Query
      </button>
    </div>
    <div class="flex flex-wrap gap-space-xs mb-space-sm">
      ${SUGGESTS.slice(0, 4).map(s => `<button class="suggest-chip" onclick="Pages.copilotAsk('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('')}
    </div>
    <div id="cop-log" class="chat-log flex-1 scroll-panel" style="max-height:400px">
      <div class="chat-msg bot">
        <strong>Grid copilot ready.</strong> Ask about failures, risk drivers, weather exposure, crew positioning, or run what-if queries. Every answer is grounded in current model outputs.
      </div>
    </div>
  </div>
</div>`;

Pages._initCopilotPanel = () => {
  // Focus input if visible
  const inp = el('cop-q');
  if (inp) inp.focus();
};

Pages.copilotAsk = async (preset) => {
  const inp = el('cop-q');
  const q   = preset || (inp?.value?.trim() || '');
  if (!q) return;
  if (inp) inp.value = '';
  const log = el('cop-log');
  if (!log) return;
  log.insertAdjacentHTML('beforeend', `<div class="chat-msg user">${F.esc(q)}</div>`);
  const tid = 'msg-' + Date.now();
  log.insertAdjacentHTML('beforeend', `<div class="chat-msg bot typing" id="${tid}">Analyzing grid data…</div>`);
  log.scrollTop = log.scrollHeight;
  try {
    const r = await API.copilot(q);
    const ev = r.evidence?.length
      ? `<div class="chat-evidence">Evidence: ${r.evidence.map(e => `<code>${e.tool}</code>`).join(' ')} · mode: ${r.mode}</div>` : '';
    document.getElementById(tid).outerHTML = `<div class="chat-msg bot">${F.md(r.answer)}${ev}</div>`;
  } catch (e) {
    document.getElementById(tid).outerHTML = `<div class="chat-msg bot"><span style="color:#ba1a1a">⚠ ${F.esc(e.message)}</span></div>`;
  }
  log.scrollTop = log.scrollHeight;
};

Pages.copilot = async () => {
  App.render(`<div class="flex flex-col w-full">
    <div class="mb-space-md">
      <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">AI Operations Copilot</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">Grounded decision-support — all answers cite real model outputs and database records.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      <div class="flex flex-col gap-space-md">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md" style="min-height:400px; display:flex; flex-direction:column;">
          <div class="font-headline-md text-headline-md font-bold text-on-surface mb-space-sm flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">terminal</span>Query Console
          </div>
          <div class="flex gap-space-xs mb-space-sm">
            <input id="cop-q" class="flex-1 h-9 px-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary-container placeholder:text-on-surface-variant" placeholder="Ask about assets, failures, risk, weather, crews…" type="text" onkeydown="if(event.key==='Enter')Pages.copilotAsk()"/>
            <button onclick="Pages.copilotAsk()" class="h-9 px-space-md bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center gap-1.5 uppercase hover:opacity-90 transition-opacity" type="button">
              <span class="material-symbols-outlined text-[15px]">send</span>Query
            </button>
          </div>
          <div class="flex flex-wrap gap-space-xs mb-space-sm">
            ${SUGGESTS.map(s => `<button class="suggest-chip" onclick="Pages.copilotAsk('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('')}
          </div>
          <div id="cop-log" class="chat-log flex-1 scroll-panel" style="max-height:500px">
            <div class="chat-msg bot"><strong>Grid copilot ready.</strong> Ask about failures, risk drivers, weather exposure, crew positioning, or run what-if queries.</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-space-md">
        <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md">
          <div class="font-headline-md text-headline-md font-bold text-on-surface mb-space-sm flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary text-[18px]">psychology</span>Advisor Response Matrix
          </div>
          <div class="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">After submitting a query, the structured advisor response will appear here with evidence citations, telemetry data, and recommended tactical actions.</div>
          <div class="space-y-space-xs font-label-sm text-label-sm text-on-surface-variant">
            <div class="p-space-sm bg-surface-container rounded border border-outline-variant/30">
              <span class="uppercase font-bold text-error">Section 1: Executive Diagnostic</span>
              <div class="text-[12px] mt-0.5">Risk imminence assessment and primary sensor anomalies</div>
            </div>
            <div class="p-space-sm bg-surface-container rounded border border-outline-variant/30">
              <span class="uppercase font-bold text-secondary">Section 2: Telemetry Evidence Table</span>
              <div class="text-[12px] mt-0.5">IEEE C57.104 DGA standard match — sensor vs baseline vs anomaly</div>
            </div>
            <div class="p-space-sm bg-surface-container rounded border border-outline-variant/30">
              <span class="uppercase font-bold text-primary">Section 3: Recommended Tactical Actions</span>
              <div class="text-[12px] mt-0.5">Sequential execution steps with crew and operational directives</div>
            </div>
          </div>
          <div class="mt-space-md flex gap-space-xs">
            <button class="flex-1 h-8 bg-surface-container-low text-on-surface border border-outline-variant rounded font-label-sm text-label-sm flex items-center justify-center gap-1.5 hover:bg-surface-container transition-colors" type="button">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>Copy Diagnostics
            </button>
            <button class="flex-1 h-8 bg-secondary-container text-on-secondary-container border border-outline-variant rounded font-label-sm text-label-sm font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity" type="button">
              <span class="material-symbols-outlined text-[15px]">check_circle</span>Approve Response Order
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`);
  const inp = el('cop-q');
  if (inp) inp.focus();
};

/* ═══════════════════════════════════════════════════════════════
   OPERATOR BRIEF
   ══════════════════════════════════════════════════════════════ */
Pages.operatorBrief = async () => {
  const [b, metrics] = await Promise.all([API.brief(), API.metrics()]);
  const confidenceValue = metrics && (metrics.roc_auc ?? metrics.pr_auc ?? null);
  const confidenceLabel = confidenceValue != null ? `${(confidenceValue * 100).toFixed(0)}%` : 'N/A';
  const recActions = (b.recommended_immediate_actions || []).map((a, i) => `<div class="miti-step">
    <div class="miti-num">${i+1}</div>
    <div class="font-body-sm text-body-sm text-on-surface">${F.esc(a)}</div>
  </div>`).join('');

  App.render(`<div class="flex flex-col w-full">
    <div class="flex items-center justify-between mb-space-md">
      <div>
        <div class="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold tracking-wider mb-0.5">Generated: ${new Date().toLocaleString()}</div>
        <h1 class="font-headline-xl text-headline-xl text-on-surface font-bold">Operator Brief</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">Shift handover summary — grid risk, asset status, recommended actions.</p>
      </div>
      <div class="flex gap-space-xs">
        <button class="h-8 px-space-md bg-surface-container-lowest text-on-surface border border-outline-variant rounded font-label-sm text-label-sm flex items-center gap-1.5 hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined text-[15px]">download</span>Export PDF
        </button>
        <button onclick="App.refresh()" class="h-8 px-space-md bg-primary-container text-on-primary font-label-sm text-label-sm font-bold rounded flex items-center gap-1.5 uppercase hover:opacity-90" type="button">
          <span class="material-symbols-outlined text-[15px]">refresh</span>Regenerate
        </button>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-space-md mb-space-md">
      ${C.kpi('speed', 'Overall Grid Risk', b.overall_grid_risk || '--', b.major_risk_driver || '', 'CRITICAL')}
      ${C.kpi('people', 'Customers at Risk', F.num(b.customers_at_risk), `${b.weather_exposed_zones || 0} weather zones`, 'HIGH')}
      ${C.kpi('public', 'Weather Exposed Zones', b.weather_exposed_zones || 0, 'Active weather risk', 'MEDIUM')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md">
        <div class="flex items-center gap-2 mb-space-md">
          <span class="material-symbols-outlined text-primary text-[18px]">assignment</span>
          <span class="font-headline-md text-headline-md font-bold text-on-surface uppercase">Recommended Immediate Actions</span>
        </div>
        <div class="space-y-space-xs">${recActions || '<div class="text-on-surface-variant font-label-sm text-label-sm text-center py-4">No immediate actions required</div>'}</div>
      </div>
      <div class="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/50 p-space-md">
        <div class="flex items-center gap-2 mb-space-md">
          <span class="material-symbols-outlined text-error text-[18px]">crisis_alert</span>
          <span class="font-headline-md text-headline-md font-bold text-on-surface uppercase">Major Risk Driver</span>
        </div>
        <div class="font-body-md text-body-md text-on-surface">${F.esc(b.major_risk_driver || 'No primary risk driver identified.')}</div>
        <div class="mt-space-md pt-space-md border-t border-outline-variant">
          <div class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold mb-space-xs">Model Confidence</div>
          <div class="font-telemetry-display text-[22px] font-bold text-primary">${confidenceLabel}</div>
          <div class="font-label-sm text-[11px] text-on-surface-variant">${metrics && metrics.model ? `${metrics.model} model metrics` : 'Model metrics available from seeded backend data'}</div>
        </div>
      </div>
    </div>
  </div>`);
};

/* ─── Action Dispatch & Modal Helpers ─── */
Pages.dispatchMaint = async (asset_id, action) => {
  try {
    const res = await API.dispatchMaintenance({ asset_id, action });
    alert(`✅ ${res.message}`);
    App.refresh();
  } catch (e) {
    alert(`❌ Action failed: ${e.message}`);
  }
};

Pages.repositionCrew = async (crew_id, target_area) => {
  try {
    const res = await API.repositionCrew({ crew_id, target_area });
    alert(`✅ ${res.message}`);
    App.refresh();
  } catch (e) {
    alert(`❌ Repositioning failed: ${e.message}`);
  }
};

Pages.openSensorModal = (label, value, unit, status, threshold) => {
  let existing = document.getElementById('sensor-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'sensor-modal-overlay';
  overlay.className = 'fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="bg-surface-container-lowest rounded-lg shadow-xl border border-outline-variant max-w-2xl w-full p-space-lg relative slide-in">
      <div class="flex items-center justify-between border-b border-outline-variant pb-space-sm mb-space-md">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[24px]">analytics</span>
          <div>
            <h3 class="font-headline-md text-headline-md font-bold text-on-surface">${F.esc(label)} Historical Telemetry</h3>
            <p class="font-label-sm text-label-sm text-on-surface-variant">24-Hour SCADA Trend • Threshold: ${F.esc(threshold)}</p>
          </div>
        </div>
        <button class="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer" onclick="document.getElementById('sensor-modal-overlay').remove()">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      <div class="grid grid-cols-2 gap-space-sm mb-space-md">
        <div class="p-space-sm bg-surface-container-low rounded">
          <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Latest Reading</span>
          <div class="font-telemetry-display text-[20px] font-bold text-primary">${F.esc(value)} ${F.esc(unit)}</div>
        </div>
        <div class="p-space-sm bg-surface-container-low rounded">
          <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Telemetry Status</span>
          <div class="font-telemetry-display text-[15px] font-bold text-error">${F.esc(status)}</div>
        </div>
      </div>
      <div class="w-full h-64 bg-surface-container-lowest rounded p-space-sm">
        <canvas id="sensor-modal-chart"></canvas>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const ctx = document.getElementById('sensor-modal-chart');
  if (ctx) {
    const labels = Array.from({length: 24}, (_, i) => `${24 - i}h ago`).reverse();
    const base = parseFloat(value) || 50;
    const mockData = labels.map((_, i) => Math.max(0, base * (0.85 + 0.3 * Math.sin(i / 3) + (Math.random() - 0.5) * 0.1)));
    mkLine(ctx, labels, [{
      label: label,
      data: mockData,
      borderColor: '#ba1a1a',
      backgroundColor: 'rgba(186, 26, 26, 0.1)',
      fill: true
    }]);
  }
};

