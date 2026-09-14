/* ─── App shell: routing, nav, map, simulation ─── */

const NAV = [
  { id: 'overview',       icon: 'grid_view',      label: 'Overview',        crumb: 'Operations Overview' },
  { id: 'assets',         icon: 'memory',         label: 'Assets',          crumb: 'Asset Register & Diagnostics' },
  { id: 'risk-areas',     icon: 'shield',         label: 'Risk & Areas',    crumb: 'Risk & Areas' },
  { id: 'maintenance',    icon: 'build',          label: 'Maintenance',     crumb: 'Maintenance Queue' },
  { id: 'crews',          icon: 'local_shipping', label: 'Crews',           crumb: 'Field Crews' },
  { id: 'grid-map',       icon: 'map',            label: 'Grid Map',        crumb: 'Interactive Grid Map' },
  { id: 'simulation',     icon: 'tune',           label: 'Simulation',      crumb: 'What-If Simulation' },
  { id: 'copilot',        icon: 'terminal',       label: 'Copilot',         crumb: 'AI Operations Copilot' },
  { id: 'operator-brief', icon: 'assignment',     label: 'Operator Brief',  crumb: 'Operator Brief' },
];

/* ─── Leaflet map singleton ─── */
const GridMap = {
  _map: null,

  async render(elId, opts = {}) {
    const data = await API.map();
    if (this._map) { try { this._map.remove(); } catch (e) {} this._map = null; }
    const el = document.getElementById(elId);
    if (!el) return;

    const map = L.map(elId, { zoomControl: true, attributionControl: false }).setView([23.05, 72.58], 11);
    this._map = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

    // Area weather circles
    (data.areas || []).forEach(a => {
      if (a.lat == null) return;
      L.circle([a.lat, a.lon], {
        radius: 1200 + (a.outage_probability || 0) * 3000,
        color: F.riskColor(a.risk_level), weight: 1.5, opacity: 0.7,
        fillColor: F.riskColor(a.risk_level), fillOpacity: 0.08
      }).addTo(map).bindPopup(
        `<b>${a.area_id}</b><br>Outage ${((a.outage_probability || 0) * 100).toFixed(0)}% · ${a.risk_level}<br>Weather ${Math.round(a.weather_risk || 0)}/100 · ${a.high_risk_assets} high-risk`
      );
    });

    // Assets
    (data.assets || []).forEach(a => {
      if (a.latitude == null) return;
      const lvl = a.priority || 'LOW';
      const r   = lvl === 'CRITICAL' ? 8 : lvl === 'HIGH' ? 6 : lvl === 'MEDIUM' ? 5 : 4;
      const m   = L.circleMarker([a.latitude, a.longitude], {
        radius: r, color: F.riskColor(lvl), weight: 1.5,
        fillColor: F.riskColor(lvl), fillOpacity: 0.85
      }).addTo(map);
      m.bindPopup(
        `<b>${a.asset_id}</b> — ${a.asset_type}<br>${a.area}<br>
         P(fail) ${a.failure_probability != null ? (a.failure_probability * 100).toFixed(0) : '--'}% · Impact ${a.grid_impact_score != null ? Math.round(a.grid_impact_score) : '--'}<br>
         ${F.num(a.customers_served)} customers<br>
         <a href="#" onclick="App.openAsset('${a.asset_id}');return false;" style="color:#003820;font-weight:600">Open detail →</a>`
      );
      if (lvl === 'CRITICAL') {
        L.circleMarker([a.latitude, a.longitude], {
          radius: 14, color: F.riskColor(lvl), weight: 1, fillOpacity: 0,
          className: 'leaflet-pulse-ring'
        }).addTo(map);
      }
    });

    // Crews
    (data.crews || []).forEach(c => {
      if (c.latitude == null) return;
      L.marker([c.latitude, c.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#0f5132;color:#fff;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;border:1px solid #003820;font-family:'JetBrains Mono',monospace">⛑ ${c.crew_id}</div>`,
          iconSize: [52, 18]
        })
      }).addTo(map).bindPopup(`<b>${c.crew_id}</b><br>${c.skill_type} · ${c.availability}<br>${c.current_area}`);
    });

    setTimeout(() => map.invalidateSize(), 120);
  }
};

/* ─── App controller ─── */
const App = {
  current: 'overview',
  _selectedAsset: null,

  buildNav() {
    document.getElementById('nav').innerHTML = NAV.map(n =>
      `<a id="nav-${n.id}" onclick="App.go('${n.id}')"
          class="flex items-center gap-space-md px-space-md py-2 rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors font-body-md font-medium cursor-pointer select-none">
        <span class="material-symbols-outlined text-[20px]">${n.icon}</span>${n.label}
      </a>`
    ).join('');
  },

  setActive(id) {
    const realId = id === 'asset' ? 'assets' : id;
    document.querySelectorAll('#nav a').forEach(a => {
      const isActive = a.id === 'nav-' + realId;
      a.className = isActive
        ? 'flex items-center gap-space-md px-space-md py-2 rounded transition-colors bg-primary-container text-on-primary font-semibold cursor-pointer select-none'
        : 'flex items-center gap-space-md px-space-md py-2 rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors font-body-md font-medium cursor-pointer select-none';
    });
    const crumb = NAV.find(n => n.id === realId)?.crumb || realId;
    document.getElementById('breadcrumb-page').textContent = crumb;
  },

  setGridRisk(lvl) {
    const pill = document.getElementById('grid-status-pill');
    const labels = {
      CRITICAL: 'CRITICAL ALERT', HIGH: 'ELEVATED RISK', ELEVATED: 'ELEVATED RISK',
      MEDIUM: 'MEDIUM RISK', LOW: 'NOMINAL', NORMAL: 'NOMINAL'
    };
    pill.textContent = `GRID STATUS: ${labels[lvl] || lvl || 'UNKNOWN'}`;
    pill.className = lvl === 'CRITICAL' || lvl === 'HIGH' || lvl === 'ELEVATED'
      ? 'inline-flex items-center gap-1.5 text-error font-semibold bg-error-container/40 px-2 py-0.5 rounded border border-error/30 font-label-sm text-label-sm'
      : 'inline-flex items-center gap-1.5 text-secondary font-semibold bg-secondary-container/40 px-2 py-0.5 rounded border border-secondary/30 font-label-sm text-label-sm';
    // Re-add the pulse dot
    pill.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-error animate-pulse"></span>${pill.textContent}`;
  },

  render(html) {
    killCharts();
    document.getElementById('view').innerHTML = html;
  },

  loading() {
    document.getElementById('view').innerHTML = `
      <div class="flex items-center justify-center h-64">
        <div class="flex flex-col items-center gap-space-sm text-on-surface-variant">
          <span class="material-symbols-outlined text-[36px] text-outline animate-pulse">electrical_services</span>
          <span class="font-label-sm text-label-sm uppercase tracking-widest">Loading…</span>
        </div>
      </div>`;
  },

  errorView(msg) {
    this.render(`<div class="bg-error-container/30 border border-error/30 rounded p-space-lg text-on-surface">
      <div class="flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined text-error text-[20px]">error</span>
        <span class="font-headline-md text-headline-md font-bold text-error">Load Error</span>
      </div>
      <div class="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">${F.esc(msg)}</div>
      <div class="font-body-sm text-body-sm text-on-surface-variant">
        If the database is not seeded, run: <code class="bg-surface px-2 py-0.5 rounded font-mono text-primary border border-outline-variant">python -m scripts.seed</code>
      </div>
    </div>`);
  },

  _createPdf(title, subtitle) {
    const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) throw new Error('PDF export library is not loaded.');
    const doc = new JsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    doc.setProperties({
      title,
      subject: subtitle || title,
      creator: 'Grid Risk Command Center',
      author: 'Grid Risk Command Center'
    });
    return doc;
  },

  _startPdf(title, subtitle) {
    const doc = this._createPdf(title, subtitle);
    this._pdfHeader(doc, title, subtitle);
    return {
      doc,
      title,
      subtitle,
      margin: 40,
      pageWidth: doc.internal.pageSize.getWidth(),
      pageHeight: doc.internal.pageSize.getHeight(),
      y: 90,
    };
  },

  _pdfHeader(doc, title, subtitle) {
    const width = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 56, 32);
    doc.rect(0, 0, width, 72, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 40, 30);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(subtitle, 40, 50);
    }
    doc.setTextColor(11, 28, 48);
  },

  _pdfEnsureRoom(state, neededHeight = 0) {
    if (state.y + neededHeight > state.pageHeight - state.margin) {
      state.doc.addPage();
      this._pdfHeader(state.doc, state.title, state.subtitle);
      state.y = 90;
    }
  },

  _pdfSection(state, heading, lines = []) {
    const { doc, margin, pageWidth } = state;
    const contentWidth = pageWidth - (margin * 2);
    const textLines = lines.flatMap(line => doc.splitTextToSize(String(line), contentWidth));
    const neededHeight = 20 + (textLines.length * 12);
    this._pdfEnsureRoom(state, neededHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(heading, margin, state.y);
    state.y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    lines.forEach(line => {
      const wrapped = doc.splitTextToSize(String(line), contentWidth);
      doc.text(wrapped, margin, state.y);
      state.y += wrapped.length * 12;
    });
    state.y += 10;
  },

  _pdfTable(state, heading, columns, rows) {
    const { doc, margin } = state;
    this._pdfEnsureRoom(state, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(heading, margin, state.y);
    state.y += 8;
    doc.autoTable({
      startY: state.y,
      head: [columns],
      body: rows,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 4,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [0, 56, 32],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 249, 255],
      },
      tableLineColor: [192, 201, 192],
      tableLineWidth: 0.25,
    });
    state.y = (doc.lastAutoTable?.finalY || state.y) + 16;
  },

  _pdfSave(state, filename) {
    state.doc.save(filename);
  },

  async exportOperationsLog() {
    try {
      const [summary, alerts, areas] = await Promise.all([API.summary(), API.alerts(), API.areas()]);
      const state = this._startPdf(
        'Grid Operations Log',
        `Generated ${new Date().toLocaleString()} · Simulation data`
      );
      this._pdfSection(state, 'Current Situation', [
        `Overall grid risk: ${summary.overall_grid_risk || '--'}`,
        `Critical assets: ${summary.critical_assets || 0}`,
        `High-risk assets: ${summary.high_risk_assets || 0}`,
        `Predicted failures: ${summary.predicted_failures || 0}`,
        `Customers at risk: ${F.num(summary.customers_at_risk)}`,
        `Weather exposed zones: ${summary.weather_exposed_zones || 0}`,
      ]);
      this._pdfTable(
        state,
        'Top Ranked Assets',
        ['Asset ID', 'Area', 'Priority', 'P(Fail)', 'Impact', 'Customers'],
        (summary.top_assets || []).slice(0, 10).map(a => [
          a.asset_id || '--',
          a.area || a.geographic_area || '--',
          a.priority || a.risk_level || '--',
          F.pct(a.failure_probability),
          F.score(a.grid_impact_score),
          F.num(a.customers_served),
        ])
      );
      this._pdfTable(
        state,
        'Area Risk Snapshot',
        ['Area', 'Risk', 'High-Risk Assets', 'Customers Affected', 'Drivers'],
        (areas || []).slice(0, 8).map(a => [
          a.area_id || '--',
          a.risk_level || '--',
          String(a.high_risk_assets || 0),
          F.num(a.expected_customers_affected),
          (a.contributing_factors || []).slice(0, 2).join('; '),
        ])
      );
      this._pdfTable(
        state,
        'Active Alerts',
        ['Priority', 'Title', 'Reason', 'Recommended Action'],
        (alerts || []).slice(0, 12).map(al => [
          al.priority || '--',
          al.title || '--',
          al.reason || '--',
          al.recommended_action || '--',
        ])
      );
      this._pdfSave(state, `grid-operations-log-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert(`Unable to export log PDF: ${e.message}`);
    }
  },

  async exportMaintenanceSchedule() {
    try {
      const [queue, crewRecs, roster] = await Promise.all([
        API.maintenance('?limit=100'),
        API.crewRecommendations(),
        API.crews(),
      ]);
      const crewsList = roster?.crews || roster || [];
      const state = this._startPdf(
        'Maintenance Priority Schedule',
        `Generated ${new Date().toLocaleString()} · Impact-ranked queue`
      );
      this._pdfSection(state, 'Schedule Summary', [
        `Ranked maintenance candidates: ${queue.length}`,
        `Active field crews: ${crewsList.filter(c => c.availability === 'ON_JOB').length} / ${crewsList.length}`,
        `Crew recommendations: ${(crewRecs.recommendations || []).length}`,
      ]);
      this._pdfTable(
        state,
        'Ranked Outage Candidates',
        ['Rank', 'Asset ID', 'Area', 'Type', 'P(Fail)', 'Impact', 'Customers', 'Action'],
        queue.map((x, i) => [
          String(i + 1),
          x.asset_id || '--',
          x.area || '--',
          x.asset_type || '--',
          F.pct(x.failure_probability),
          F.score(x.grid_impact_score),
          F.num(x.customers_served),
          x.recommended_action || '--',
        ])
      );
      this._pdfTable(
        state,
        'Crew Repositioning Recommendations',
        ['Crew ID', 'Current Area', 'Recommended Area', 'Time Saved', 'Rationale'],
        (crewRecs.recommendations || []).slice(0, 8).map(r => [
          r.crew_id || '--',
          r.current_area || '--',
          r.recommended_area || '--',
          `${r.response_reduction_min || 0} min`,
          r.rationale || '--',
        ])
      );
      this._pdfSave(state, `maintenance-schedule-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert(`Unable to export maintenance schedule PDF: ${e.message}`);
    }
  },

  async exportOperatorBrief() {
    try {
      const [brief, metrics] = await Promise.all([API.brief(), API.metrics()]);
      const state = this._startPdf(
        'Operator Brief',
        `Generated ${new Date().toLocaleString()} · Shift handover summary`
      );
      this._pdfSection(state, 'Situation Snapshot', [
        `Overall grid risk: ${brief.overall_grid_risk || '--'}`,
        `Customers at risk: ${F.num(brief.customers_at_risk)}`,
        `Weather exposed zones: ${brief.weather_exposed_zones || 0}`,
        `Major risk driver: ${brief.major_risk_driver || 'Not identified'}`,
      ]);
      this._pdfTable(
        state,
        'Recommended Immediate Actions',
        ['#', 'Action'],
        (brief.recommended_immediate_actions || []).map((action, index) => [String(index + 1), action])
      );
      this._pdfSection(state, 'Model Confidence', [
        `Model: ${metrics && metrics.model ? metrics.model : 'N/A'}`,
        `ROC-AUC: ${metrics && metrics.roc_auc != null ? metrics.roc_auc : 'N/A'}`,
        `PR-AUC: ${metrics && metrics.pr_auc != null ? metrics.pr_auc : 'N/A'}`,
      ]);
      this._pdfSave(state, `operator-brief-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert(`Unable to export operator brief PDF: ${e.message}`);
    }
  },

  async go(id, arg) {
    this.current = id;
    this.setActive(id === 'asset' ? 'assets' : id);
    this.loading();
    try {
      switch (id) {
        case 'overview':       await Pages.overview();          break;
        case 'assets':         await Pages.assets(arg);         break;
        case 'asset':          await Pages.assets(arg);         break;
        case 'risk-areas':     await Pages.riskAreas();         break;
        case 'maintenance':    await Pages.maintenance();       break;
        case 'crews':          await Pages.crews();             break;
        case 'grid-map':       await Pages.gridMap();           break;
        case 'simulation':     await Pages.simulation(arg);     break;
        case 'copilot':        await Pages.copilot();           break;
        case 'operator-brief': await Pages.operatorBrief();     break;
        default:               await Pages.overview();
      }
    } catch (e) {
      console.error(e);
      this.errorView(e.message);
    }
  },

  openAsset(id) { this.go('assets', id); },

  async simAsset(id) {
    await this.go('simulation');
    const sel = document.getElementById('sim-asset');
    if (sel) { sel.value = id; await Pages.runSim(); }
  },

  async simWeather(area, sev) {
    await this.go('simulation');
    const tabs = document.querySelectorAll('.sim-tab');
    tabs.forEach(t => { if (t.dataset.tab === 'weather') t.click(); });
    const sel = document.getElementById('sim-area');
    if (sel) { sel.value = area; await Pages.runSimWeather(); }
  },

  refresh() { this.go(this.current); },

  async init() {
    this.buildNav();
    setInterval(() => {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    }, 1000);
    try {
      const h = await API.health();
      if (!h.seeded) {
        this.setActive('overview');
        this.render(`<div class="max-w-xl mx-auto mt-8">
          <div class="bg-surface-container-high border border-outline-variant rounded p-space-lg">
            <div class="flex items-center gap-2 mb-space-sm">
              <span class="material-symbols-outlined text-error text-[22px]">warning</span>
              <span class="font-headline-lg text-headline-lg font-bold text-on-surface">Database Not Seeded</span>
            </div>
            <p class="font-body-md text-body-md text-on-surface-variant mb-space-md">The ML pipeline and synthetic dataset have not been initialised yet. Run the seed script:</p>
            <pre class="bg-surface-container-lowest border border-outline-variant rounded p-space-md font-mono text-label-md text-on-surface">cd src
python -m scripts.seed</pre>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">Then start the server: <code class="font-mono">uvicorn backend.main:app --reload --port 8000</code></p>
          </div>
        </div>`);
        return;
      }
      // Pull predicted outages count for sidebar
      try {
        const s = await API.summary();
        const el = document.getElementById('sidebar-outages');
        if (el) el.textContent = (s.predicted_failures || '--') + ' Active';
        this.setGridRisk(s.overall_grid_risk);
      } catch (_) {}
    } catch (e) { /* server offline */ }
    this.go('overview');
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
