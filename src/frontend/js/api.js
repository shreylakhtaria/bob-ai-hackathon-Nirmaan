/* ─── API client + shared formatting helpers ─── */
const API = {
  lastLatencyMs: null,
  lastStatus: null,

  _detail(text) {
    try { const j = JSON.parse(text); return j.detail || text; } catch (e) { return text; }
  },

  async get(path) {
    const t0 = performance.now();
    const r = await fetch('/api' + path);
    API.lastLatencyMs = Math.round(performance.now() - t0);
    API.lastStatus = r.status;
    if (!r.ok) throw new Error(API._detail(await r.text()));
    return r.json();
  },
  async post(path, body) {
    const t0 = performance.now();
    const r = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    API.lastLatencyMs = Math.round(performance.now() - t0);
    API.lastStatus = r.status;
    if (!r.ok) throw new Error(API._detail(await r.text()));
    return r.json();
  },
  async text(path) {
    const r = await fetch('/api' + path);
    if (!r.ok) throw new Error(API._detail(await r.text()));
    return r.text();
  },

  health:              ()        => API.get('/health'),
  summary:             ()        => API.get('/dashboard/summary'),
  assets:              (q = '')  => API.get('/assets' + q),
  asset:               (id)      => API.get('/assets/' + id),
  sensors:             (id, h)   => API.get(`/assets/${id}/sensors?hours=${h || 24}`),
  assetHistory:        (id)      => API.get(`/assets/${id}/history`),
  criticalRisks:       ()        => API.get('/risks/critical'),
  risksCritical:       ()        => API.criticalRisks(),
  risks:               (q = '')  => API.get('/risks' + q),
  areas:               ()        => API.get('/areas/risk'),
  weather:             (area)    => area ? API.get('/weather?area=' + area) : API.get('/weather'),
  weatherSeries:       (a, h)    => API.get(`/weather/series?area=${a}&hours=${h || 96}`),
  maintenance:         (q = '')  => API.get('/maintenance/priorities' + q),
  crews:               ()        => API.get('/crews'),
  crewRecommendations: ()        => API.get('/crews/recommendations'),
  map:                 ()        => API.get('/map'),
  brief:               ()        => API.get('/brief'),
  metrics:             ()        => API.get('/model/metrics'),
  alerts:              ()        => API.get('/alerts'),
  incidents:           ()        => API.get('/incidents?limit=50'),
  simulate:            (b)       => API.post('/simulation', b),
  copilot:             (q)       => API.post('/copilot/query', { query: q }),

  /* Operator actions — each mutates real backend state */
  stats:               ()        => API.get('/system/stats'),
  workOrders:          (q = '')  => API.get('/work-orders' + q),
  audit:               (n = 50)  => API.get('/audit?limit=' + n),
  dispatch:            (assetId, crewId) => API.post('/work-orders/dispatch', { asset_id: assetId, crew_id: crewId || null }),
  schedule:            (assetId, hours)  => API.post('/work-orders/schedule', { asset_id: assetId, hours: hours ?? null }),
  defer:               (assetId, reason) => API.post('/work-orders/defer', { asset_id: assetId, reason: reason || null }),
  reposition:          (crewId, areaId)  => API.post('/crews/reposition', { crew_id: crewId, area_id: areaId }),
  releaseCrew:         (crewId)  => API.post(`/crews/${crewId}/release`),
  emergency:           (n = 5)   => API.post('/dispatch/emergency?limit=' + n),
  ackAlert:            (id)      => API.post(`/alerts/${id}/ack`),
  briefText:           ()        => API.text('/brief/text'),
  exportUrl:           (kind)    => '/api/export/' + kind,
};

/* ─── Toast notifications (real action feedback, replaces alert()) ─── */
const Toast = {
  show(message, kind = 'ok') {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end';
      document.body.appendChild(host);
    }
    const tone = {
      ok:   ['#0f5132', 'check_circle'],
      warn: ['#376757', 'info'],
      err:  ['#ba1a1a', 'error'],
    }[kind] || ['#0f5132', 'check_circle'];
    const node = document.createElement('div');
    node.className = 'toast-item flex items-start gap-2 bg-surface-container-lowest border rounded shadow-lg px-space-md py-space-sm max-w-sm';
    node.style.borderColor = tone[0];
    node.innerHTML = `<span class="material-symbols-outlined text-[18px]" style="color:${tone[0]}">${tone[1]}</span>
      <span class="font-body-sm text-body-sm text-on-surface">${F.esc(message)}</span>`;
    host.appendChild(node);
    setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 300); }, 4200);
  },
  ok:   m => Toast.show(m, 'ok'),
  warn: m => Toast.show(m, 'warn'),
  err:  m => Toast.show(m, 'err'),
};

/* Trigger a real file download from an API endpoint */
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ─── Shared formatting utilities ─── */
const F = {
  debounce: (fn, delay = 300) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },
  pct:   v  => v == null ? '--' : (v * 100).toFixed(0) + '%',
  pct1:  v  => v == null ? '--' : (v * 100).toFixed(1) + '%',
  num:   v  => v == null ? '--' : Number(v).toLocaleString(),
  score: v  => v == null ? '--' : Math.round(v),
  date:  s  => {
    if (!s) return '--';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
  day:   s  => {
    if (!s) return '--';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },
  esc:   s  => (s == null ? '' : String(s)).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])),
  md:    s  => F.esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:#e5eeff;padding:1px 4px;border-radius:3px;font-family:JetBrains Mono,monospace">$1</code>')
    .replace(/\n/g, '<br>'),

  riskColor: lvl => ({
    CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132',
    ELEVATED: '#376757', NORMAL: '#0f5132'
  }[lvl] || '#707971'),

  riskBg: lvl => ({
    CRITICAL: '#ffdad6', HIGH: '#dce9ff', MEDIUM: '#e5eeff', LOW: '#baeed9',
    ELEVATED: '#dce9ff', NORMAL: '#baeed9'
  }[lvl] || '#e5eeff'),

  badge: lvl => {
    const colors = {
      CRITICAL: 'bg-error-container text-on-error-container',
      HIGH:     'bg-surface-container-highest text-on-surface',
      MEDIUM:   'bg-surface-container text-on-surface-variant',
      LOW:      'bg-secondary-container text-on-secondary-container',
      ELEVATED: 'bg-surface-container-highest text-on-surface',
      NORMAL:   'bg-secondary-container text-on-secondary-container',
    };
    const dots = {
      CRITICAL: 'bg-error', HIGH: 'bg-secondary', MEDIUM: 'bg-outline', LOW: 'bg-primary-container',
      ELEVATED: 'bg-secondary', NORMAL: 'bg-primary-container'
    };
    const cls = colors[lvl] || 'bg-surface-container text-on-surface-variant';
    const dot = dots[lvl] || 'bg-outline';
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold ${cls}"><span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${lvl || '--'}</span>`;
  },

  probBar: (v, lvl) => {
    const pct = Math.round((v || 0) * 100);
    const col = {
      CRITICAL: '#ba1a1a', HIGH: '#376757', MEDIUM: '#707971', LOW: '#0f5132'
    }[lvl] || (pct >= 75 ? '#ba1a1a' : pct >= 55 ? '#376757' : pct >= 30 ? '#707971' : '#0f5132');
    return `<div class="prob-bar"><div class="prob-bar-fill" style="width:${pct}%;background:${col}"></div></div>`;
  },
};
