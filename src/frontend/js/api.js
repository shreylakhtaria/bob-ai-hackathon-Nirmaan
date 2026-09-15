/* ─── API client + shared formatting helpers ─── */
const API = {
  lastLatencyMs: null,
  lastStatus: null,

  _detail(text) {
    try { const j = JSON.parse(text); return j.detail || text; } catch (e) { return text; }
  },

  _handleUnauthorized() {
    localStorage.removeItem('grid-risk-token');
    localStorage.removeItem('grid-risk-user');
    if (window.Auth) Auth.show();
  },

  async get(path) {
    const t0 = performance.now();
    const r = await fetch('/api' + path, { headers: API._headers() });
    API.lastLatencyMs = Math.round(performance.now() - t0);
    API.lastStatus = r.status;
    if (!r.ok) {
      if (r.status === 401) API._handleUnauthorized();
      throw new Error(API._detail(await r.text()));
    }
    return r.json();
  },
  async post(path, body) {
    const t0 = performance.now();
    const r = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...API._headers() },
      body: JSON.stringify(body || {})
    });
    API.lastLatencyMs = Math.round(performance.now() - t0);
    API.lastStatus = r.status;
    if (!r.ok) {
      if (r.status === 401) API._handleUnauthorized();
      throw new Error(API._detail(await r.text()));
    }
    return r.json();
  },
  async text(path) {
    const r = await fetch('/api' + path, { headers: API._headers() });
    if (!r.ok) {
      if (r.status === 401) API._handleUnauthorized();
      throw new Error(API._detail(await r.text()));
    }
    return r.text();
  },

  _headers() {
    const token = localStorage.getItem('grid-risk-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },

  login:  credentials => API.post('/auth/login', credentials),
  signup: credentials => API.post('/auth/signup', credentials),

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

/* ─── Toast notifications (Image 1 reference, replaces native browser alert()) ─── */
const Toast = {
  show(message, kind = 'ok', duration = 4000) {
    if (!message) return;
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const iconName = {
      ok:   'check',
      warn: 'info',
      err:  'priority_high',
      info: 'info'
    }[kind] || 'check';

    const node = document.createElement('div');
    node.className = `toast-item toast-${kind}`;
    node.setAttribute('role', 'alert');
    node.innerHTML = `
      <div class="toast-icon-circle ${kind}">
        <span class="material-symbols-outlined">${iconName}</span>
      </div>
      <div class="toast-text">${F.esc(message)}</div>
      <button class="toast-close" title="Dismiss" type="button" aria-label="Close notification">
        <span class="material-symbols-outlined text-[16px]">close</span>
      </button>
    `;

    const dismiss = () => {
      if (node._dismissed) return;
      node._dismissed = true;
      node.classList.add('toast-leaving');
      setTimeout(() => node.remove(), 260);
    };

    node.querySelector('.toast-close').addEventListener('click', dismiss);
    host.appendChild(node);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  },
  ok:   (m, dur) => Toast.show(m, 'ok', dur),
  warn: (m, dur) => Toast.show(m, 'warn', dur),
  err:  (m, dur) => Toast.show(m, 'err', dur),
  info: (m, dur) => Toast.show(m, 'info', dur),
};

/* Intercept native window.alert so all unexpected or localhost alerts show the custom toast */
window.alert = function(msg) {
  Toast.show(String(msg), 'warn');
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
