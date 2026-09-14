/* App shell: routing, nav, map, and cross-page actions */
const NAV = [
  {id:'overview',   icon:'▦', label:'Operations Overview', title:'Operations Overview', sub:'Real-time grid health & priorities'},
  {id:'assets',     icon:'▤', label:'Asset Risk',          title:'Asset Risk Register', sub:'All assets ranked by risk'},
  {id:'maintenance',icon:'✚', label:'Maintenance Queue',   title:'Predictive Maintenance', sub:'Impact-ranked work queue'},
  {id:'crew',       icon:'⛑', label:'Crew Optimisation',   title:'Crew Pre-Positioning', sub:'Assignment & response optimisation'},
  {id:'weather',    icon:'⛈', label:'Weather & Outage',    title:'Weather & Outage Risk', sub:'Area exposure & forecasts'},
  {id:'simulator',  icon:'◈', label:'What-If Simulator',   title:'What-If Simulator', sub:'Failure & weather scenarios'},
  {id:'copilot',    icon:'✦', label:'AI Copilot',          title:'AI Operations Copilot', sub:'Grounded decision support'},
];

const GridMap = {
  _map:null,
  async render(elId, opts={}){
    const data = await API.map();
    if(this._map){ try{this._map.remove()}catch(e){} this._map=null; }
    const el=document.getElementById(elId); if(!el) return;
    const map=L.map(elId,{zoomControl:true,attributionControl:false}).setView([23.05,72.58],11);
    this._map=map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
    // area weather circles
    (data.areas||[]).forEach(a=>{
      if(a.lat==null) return;
      L.circle([a.lat,a.lon],{radius:1400+ (a.outage_probability||0)*3200,
        color:F.riskColor(a.risk_level),weight:1.5,opacity:.6,
        fillColor:F.riskColor(a.risk_level),fillOpacity:0.06}).addTo(map)
        .bindPopup(`<b>${a.area_id}</b><br>Outage ${(a.outage_probability*100).toFixed(0)}% · ${a.risk_level}<br>Weather ${Math.round(a.weather_risk)}/100 · ${a.high_risk_assets} high-risk`);
      if(a.weather_risk>=45){
        L.circleMarker([a.lat,a.lon],{radius:9,color:'#38bdf8',weight:2,fillOpacity:0,dashArray:'3'}).addTo(map);
      }
    });
    // assets
    (data.assets||[]).forEach(a=>{
      if(a.latitude==null) return;
      const lvl=a.priority||'LOW';
      const r = lvl==='CRITICAL'?7:lvl==='HIGH'?6:lvl==='MEDIUM'?4:3;
      const m=L.circleMarker([a.latitude,a.longitude],{radius:r,color:F.riskColor(lvl),
        weight:1,fillColor:F.riskColor(lvl),fillOpacity:.85}).addTo(map);
      m.bindPopup(`<b>${a.asset_id}</b> — ${a.asset_type}<br>${a.area}<br>
        Fail ${(a.failure_probability!=null?(a.failure_probability*100).toFixed(0):'--')}% · Impact ${a.grid_impact_score!=null?Math.round(a.grid_impact_score):'--'}<br>
        ${F.num(a.customers_served)} customers<br><a href="#" onclick="App.openAsset('${a.asset_id}');return false;">Open detail →</a>`);
      if(lvl==='CRITICAL'){
        L.circleMarker([a.latitude,a.longitude],{radius:12,color:F.riskColor(lvl),weight:1,
          fillOpacity:0,className:'pulse'}).addTo(map);
      }
    });
    // crews
    (data.crews||[]).forEach(c=>{
      if(c.latitude==null) return;
      L.marker([c.latitude,c.longitude],{icon:L.divIcon({className:'',
        html:`<div style="background:#38bdf8;color:#04121f;border-radius:6px;padding:1px 5px;font-size:10px;font-weight:800;border:1px solid #0a0e15">⛑ ${c.crew_id}</div>`,
        iconSize:[44,16]})}).addTo(map)
        .bindPopup(`<b>${c.crew_id}</b><br>${c.skill_type} · ${c.availability}<br>${c.current_area}`);
    });
    setTimeout(()=>map.invalidateSize(),120);
  }
};

const App = {
  current:'overview',
  buildNav(){
    document.getElementById('nav').innerHTML = NAV.map(n=>
      `<a data-id="${n.id}" onclick="App.go('${n.id}')"><span class="ic">${n.icon}</span>${n.label}</a>`).join('');
  },
  setActive(id){
    document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.id===id));
    const n=NAV.find(x=>x.id===id)||{};
    document.getElementById('page-title').textContent=n.title||'';
    document.getElementById('page-sub').textContent=n.sub||'';
  },
  setSub(t){ document.getElementById('page-sub').textContent=t; },
  setGridRisk(lvl){
    const p=document.getElementById('grid-risk-pill');
    p.textContent='GRID: '+(lvl||'--'); p.className='risk-pill b-'+(lvl||'LOW');
  },
  render(html){ killCharts(); document.getElementById('view').innerHTML=html; },
  async go(id, arg){
    this.current=id; this.setActive(id==='asset'?'assets':id);
    document.getElementById('view').innerHTML='<div class="loading">Loading…</div>';
    try{
      if(id==='asset'){ this.setActive('assets'); document.getElementById('page-title').textContent='Asset Detail'; await Pages.asset(arg); }
      else await Pages[id]();
    }catch(e){ this.render(`<div class="card"><h3>Error</h3><div class="muted">${F.esc(e.message)}</div>
      <div class="small muted" style="margin-top:8px">If the database is not seeded run <code>python -m scripts.seed</code>.</div></div>`); }
  },
  openAsset(id){ this.go('asset', id); },
  async simAsset(id){
    if(this.current!=='simulator'){ await this.go('simulator'); }
    const sel=document.getElementById('sim-asset'); if(sel) sel.value=id;
    const out=document.getElementById('sim-asset-out'); if(out) out.innerHTML='<div class="loading">Simulating…</div>';
    const r=await API.simulate({type:'asset_failure',asset_id:id}); App.renderAssetSim(r);
  },
  async simWeather(area, sev){
    if(this.current!=='simulator'){ await this.go('simulator'); }
    const sel=document.getElementById('sim-area'); if(sel) sel.value=area;
    const out=document.getElementById('sim-weather-out'); if(out) out.innerHTML='<div class="loading">Simulating…</div>';
    const r=await API.simulate({type:'weather_event',area_id:area,event:sev||'severe'}); App.renderWeatherSim(r);
  },
  renderAssetSim(r){
    const el=document.getElementById('sim-asset-out'); if(!el) return;
    el.innerHTML=`<div class="metric-row"><span class="muted">Asset</span><b>${r.asset_id} (${r.asset_type}, ${r.area})</b></div>
      <div class="metric-row"><span class="muted">Severity</span><b>${F.badge(r.severity)}</b></div>
      <div class="metric-row"><span class="muted">Total customers affected</span><b style="color:#ef4444">${F.num(r.total_customers_affected)}</b></div>
      <div class="metric-row"><span class="muted">Direct / downstream</span><b>${F.num(r.direct_customers)} / ${F.num(r.downstream_customers)}</b></div>
      <div class="metric-row"><span class="muted">Affected areas</span><b>${r.affected_areas.join(', ')}</b></div>
      <div class="metric-row"><span class="muted">Est. outage</span><b>${F.score(r.estimated_outage_minutes)} min</b></div>
      <div class="metric-row"><span class="muted">Nearest crew</span><b>${r.nearest_crew?`${r.nearest_crew.crew_id} (~${r.nearest_crew.response_min} min)`:'—'}</b></div>
      <div class="metric-row"><span class="muted">Downstream assets</span><b>${r.downstream_assets.length}</b></div>
      <div class="sep"></div><div class="small muted">Recommended mitigation</div>
      <ol style="margin:6px 0;padding-left:18px;line-height:1.7">${r.recommended_mitigation.map(m=>`<li>${F.esc(m)}</li>`).join('')}</ol>`;
  },
  renderWeatherSim(r){
    const el=document.getElementById('sim-weather-out'); if(!el) return;
    el.innerHTML=`<div class="metric-row"><span class="muted">Area</span><b>${r.area_id} · ${r.injected_severity} (wx ${r.injected_weather_score})</b></div>
      <div class="metric-row"><span class="muted">Outage probability</span><b>${F.pct(r.baseline_outage_probability)} → <span style="color:${F.riskColor(r.new_risk_level)}">${F.pct(r.new_outage_probability)}</span></b></div>
      <div class="metric-row"><span class="muted">Risk level</span><b>${F.badge(r.baseline_risk_level)} → ${F.badge(r.new_risk_level)}</b></div>
      <div class="metric-row"><span class="muted">High-risk assets</span><b>${r.high_risk_assets}</b></div>
      <div class="sep"></div><div class="small muted">Top exposed assets</div>
      ${r.top_exposed_assets.slice(0,6).map(a=>`<div class="metric-row" style="cursor:pointer" onclick="App.openAsset('${a.asset_id}')"><span class="mono">${a.asset_id} · ${a.type}</span><b>${F.pct(a.fp)} · impact ${F.score(a.gis)}</b></div>`).join('')}
      <div class="sep"></div>${r.recommended_actions.map(a=>`<div class="aa">▸ ${F.esc(a)}</div>`).join('')}`;
  },
  refresh(){ this.go(this.current); },
  async init(){
    this.buildNav();
    try{
      const h=await API.health();
      if(!h.seeded){ this.setActive('overview');
        this.render(`<div class="card"><h3>Database not seeded</h3>
          <div class="muted">Run the pipeline first:</div>
          <pre style="background:#0b0f17;padding:12px;border-radius:8px;margin-top:8px">python -m scripts.seed</pre></div>`);
        return; }
    }catch(e){}
    setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString();},1000);
    this.go('overview');
  }
};
window.addEventListener('DOMContentLoaded',()=>App.init());
