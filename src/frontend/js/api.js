/* ─── API client + shared formatting helpers ─── */
const API = {
  async get(path) {
    const r = await fetch('/api' + path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
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
};

/* ─── Shared formatting utilities ─── */
const F = {
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
