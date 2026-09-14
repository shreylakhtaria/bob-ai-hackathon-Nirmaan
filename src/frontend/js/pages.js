/* Page renderers. Each returns via App.render(html) then optional post-hooks. */
const Pages = {};
let _charts = [];
function killCharts(){ _charts.forEach(c=>{try{c.destroy()}catch(e){}}); _charts=[]; }
function mkLine(ctx, labels, datasets, opts={}){
  const ch = new Chart(ctx,{type:'line',data:{labels,datasets},options:Object.assign({
    responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{legend:{labels:{color:'#9fb0c9',boxWidth:12,font:{size:11}}}},
    scales:{x:{ticks:{color:'#67788f',maxTicksLimit:8,font:{size:10}},grid:{color:'#1a2334'}},
            y:{ticks:{color:'#67788f',font:{size:10}},grid:{color:'#1a2334'}}},
    elements:{point:{radius:0},line:{tension:.3,borderWidth:2}}
  },opts)});
  _charts.push(ch); return ch;
}

/* ============================ OVERVIEW ============================ */
Pages.overview = async ()=>{
  const s = await API.summary();
  App.setGridRisk(s.overall_grid_risk);
  const kpis = `<div class="grid g4">
    ${C.kpi('Overall Grid Risk', s.overall_grid_risk, `${s.total_assets} assets monitored`, riskBand(s.overall_grid_risk))}
    ${C.kpi('Critical Assets', s.critical_assets, `${s.high_risk_assets} high-risk`, 'CRITICAL')}
    ${C.kpi('Predicted Failures', s.predicted_failures, `next 72h horizon`, 'HIGH')}
    ${C.kpi('Customers at Risk', F.num(s.customers_at_risk), `${s.weather_exposed_zones} weather zones`, 'MEDIUM')}
  </div>`;

  const actions = `<div class="card"><h3>Recommended Immediate Actions</h3>
    <ol style="margin:0;padding-left:18px;line-height:1.9">
    ${s.recommended_actions.map(a=>`<li>${F.esc(a)}</li>`).join('')}</ol>
    <div class="sep"></div>
    <div class="small muted">Primary driver</div>
    <div class="dim">${F.esc(s.major_risk_driver)}</div></div>`;

  const alerts = `<div class="card"><h3>Active Alerts <span>${s.active_alerts}</span></h3>
    <div style="max-height:340px;overflow:auto">${s.alerts.map(C.alert).join('')||'<div class="muted">None</div>'}</div></div>`;

  App.render(`${kpis}
    <div class="grid g23" style="margin-top:16px">
      <div class="card"><h3>Grid Map — Risk & Weather Overlay</h3><div id="map"></div>
        <div class="map-legend">
          <span><i class="lg-dot" style="background:#ef4444"></i>Critical</span>
          <span><i class="lg-dot" style="background:#f59e0b"></i>High</span>
          <span><i class="lg-dot" style="background:#eab308"></i>Medium</span>
          <span><i class="lg-dot" style="background:#22c55e"></i>Low</span>
          <span><i class="lg-dot" style="background:#38bdf8"></i>Crew</span>
          <span>◯ weather-exposed area</span>
        </div></div>
      ${actions}
    </div>
    <div class="grid g23" style="margin-top:16px">
      ${C.assetTable(s.top_assets,'Top 10 Assets by Grid Impact')}
      ${alerts}
    </div>`);
  await GridMap.render('map');
};

/* ============================ ASSET RISK ============================ */
Pages.assets = async ()=>{
  const [assets, areas] = await Promise.all([API.assets('?limit=500'), API.areas()]);
  const types=[...new Set(assets.map(a=>a.asset_type))];
  const areaIds=areas.map(a=>a.area_id);
  App.render(`<div class="card"><h3>Asset Risk Register <span>${assets.length} assets</span></h3>
    <div class="row" style="margin-bottom:12px">
      <select id="f-area"><option value="">All areas</option>${areaIds.map(a=>`<option>${a}</option>`).join('')}</select>
      <select id="f-type"><option value="">All types</option>${types.map(t=>`<option>${t}</option>`).join('')}</select>
      <select id="f-pri"><option value="">All priorities</option>${['CRITICAL','HIGH','MEDIUM','LOW'].map(p=>`<option>${p}</option>`).join('')}</select>
      <input id="f-q" placeholder="Search asset id…" style="flex:1;min-width:160px"/>
    </div>
    <div id="asset-table">${C.assetTable(assets)}</div></div>`);
  const apply=()=>{
    const ar=v('f-area'),ty=v('f-type'),pr=v('f-pri'),q=v('f-q').toUpperCase();
    let r=assets.filter(a=>(!ar||a.geographic_area===ar)&&(!ty||a.asset_type===ty)&&(!pr||a.priority===pr)&&(!q||a.asset_id.includes(q)));
    document.getElementById('asset-table').innerHTML=C.assetTable(r);
  };
  ['f-area','f-type','f-pri'].forEach(id=>document.getElementById(id).onchange=apply);
  document.getElementById('f-q').oninput=apply;
};

/* ============================ ASSET DETAIL ============================ */
Pages.asset = async (id)=>{
  const [d, sensors] = await Promise.all([API.asset(id), API.sensors(id,168)]);
  const a=d.asset, p=d.prediction||{};
  const factors=(p.top_risk_factors||[]);
  const comps=p.impact_components||{};
  App.setSub(`${a.asset_type} · ${a.geographic_area} · ${a.manufacturer||''}`);

  const info = C.card('Asset', `
    <div class="metric-row"><span class="muted">Asset ID</span><b>${a.asset_id}</b></div>
    <div class="metric-row"><span class="muted">Substation</span><b>${a.substation_id}</b></div>
    <div class="metric-row"><span class="muted">Installed</span><b>${a.installation_year} (${new Date().getFullYear()-a.installation_year} yrs)</b></div>
    <div class="metric-row"><span class="muted">Rated capacity</span><b>${a.rated_capacity} MVA</b></div>
    <div class="metric-row"><span class="muted">Criticality</span><b>${a.criticality_score}/100</b></div>
    <div class="metric-row"><span class="muted">Customers served</span><b>${F.num(a.customers_served)}</b></div>
    <div class="metric-row"><span class="muted">Downstream assets</span><b>${a.downstream_assets}</b></div>
    <div class="metric-row"><span class="muted">Last maintenance</span><b>${F.day(a.last_maintenance_date)}</b></div>`);

  const pred = C.card('Failure Prediction', `
    <div class="row spread"><div>
      <div class="value" style="font-size:36px;font-weight:800;color:${F.riskColor(p.priority)}">${F.pct(p.failure_probability)}</div>
      <div class="muted small">within ${p.predicted_failure_window||'--'} · confidence ${F.pct(p.confidence)}</div>
    </div><div class="center">
      <div class="value" style="font-size:36px;font-weight:800">${F.score(p.grid_impact_score)}</div>
      <div class="muted small">Grid Impact / 100</div>
    </div><div>${F.badge(p.priority)}</div></div>
    <div class="sep"></div>
    <div class="small muted" style="margin-bottom:6px">Impact score components</div>
    ${['failure','criticality','customers','network','weather'].map(k=>`
      <div class="factor" style="border:none;padding:5px 0"><div class="fl"><div class="fname" style="font-size:12px;text-transform:capitalize">${k}</div></div>
      <div class="fbar"><span style="width:${Math.round((comps[k]||0)*100)}%;background:#3b82f6"></span></div></div>`).join('')}
    <div class="sep"></div>
    <div class="small muted">Anomaly score</div>
    <div class="pbar" style="margin-top:5px"><span style="width:${Math.round((p.anomaly_score||0)*100)}%;background:#38bdf8"></span></div>`);

  const explain = C.card('Why is this asset high risk?', factors.length?
    factors.map(C.factor).join('')+`<div class="aa" style="margin-top:12px;color:#60a5fa">▸ ${F.esc(p.recommended_action||'')}</div>`
    : '<div class="muted">No dominant risk factors — nominal readings.</div>', 'model feature attribution');

  const history = C.card('History', `
    <div class="small muted">Incidents (${d.incidents.length})</div>
    ${d.incidents.slice(0,4).map(i=>`<div class="metric-row"><span>${F.date(i.incident_timestamp)} · ${i.root_cause}</span><b>${F.badge(i.severity)}</b></div>`).join('')||'<div class="muted small">None</div>'}
    <div class="sep"></div>
    <div class="small muted">Maintenance (${d.maintenance.length})</div>
    ${d.maintenance.slice(0,4).map(m=>`<div class="metric-row"><span>${F.day(m.date)} · ${m.maintenance_type}</span><span class="muted">${m.issue_found||''}</span></div>`).join('')||'<div class="muted small">None</div>'}`);

  App.render(`<span class="back" onclick="App.go('assets')">← Asset Risk Register</span>
    <div class="grid g3">${info}${pred}${explain}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Thermal & Load (7d)</h3><div style="height:220px"><canvas id="c-temp"></canvas></div></div>
      <div class="card"><h3>Vibration & Partial Discharge (7d)</h3><div style="height:220px"><canvas id="c-vib"></canvas></div></div>
    </div>
    <div class="grid g32" style="margin-top:16px">
      <div class="card"><h3>Oil Quality & Humidity (7d)</h3><div style="height:200px"><canvas id="c-oil"></canvas></div></div>
      ${history}
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn" onclick="App.simAsset('${a.asset_id}')">▶ Simulate failure of ${a.asset_id}</button>
    </div>`);

  const lbl=sensors.map(s=>F.date(s.timestamp));
  mkLine(document.getElementById('c-temp'),lbl,[
    {label:'Temperature °C',data:sensors.map(s=>s.temperature),borderColor:'#ef4444'},
    {label:'Oil temp °C',data:sensors.map(s=>s.oil_temperature),borderColor:'#f59e0b'},
    {label:'Load %',data:sensors.map(s=>s.load_percentage),borderColor:'#60a5fa',yAxisID:'y1'}
  ],{scales:{y:{position:'left',ticks:{color:'#67788f'},grid:{color:'#1a2334'}},y1:{position:'right',ticks:{color:'#67788f'},grid:{display:false}},x:{ticks:{color:'#67788f',maxTicksLimit:8},grid:{color:'#1a2334'}}}});
  mkLine(document.getElementById('c-vib'),lbl,[
    {label:'Vibration mm/s',data:sensors.map(s=>s.vibration),borderColor:'#a78bfa'},
    {label:'Partial discharge pC',data:sensors.map(s=>s.partial_discharge),borderColor:'#f472b6',yAxisID:'y1'}
  ],{scales:{y:{position:'left',ticks:{color:'#67788f'},grid:{color:'#1a2334'}},y1:{position:'right',ticks:{color:'#67788f'},grid:{display:false}},x:{ticks:{color:'#67788f',maxTicksLimit:8},grid:{color:'#1a2334'}}}});
  mkLine(document.getElementById('c-oil'),lbl,[
    {label:'Oil quality',data:sensors.map(s=>s.oil_quality),borderColor:'#22c55e'},
    {label:'Humidity %',data:sensors.map(s=>s.humidity),borderColor:'#38bdf8'}
  ]);
};

/* ============================ MAINTENANCE ============================ */
Pages.maintenance = async ()=>{
  const q = await API.maintenance('?limit=100');
  const rows = q.map(x=>`<tr onclick="App.openAsset('${x.asset_id}')">
    <td class="right"><b>${x.rank}</b></td>
    <td class="mono">${x.asset_id}</td><td>${x.asset_type}</td><td class="muted">${x.area}</td>
    <td>${F.badge(x.priority)}</td>
    <td>${F.pct(x.failure_probability)} ${F.probBar(x.failure_probability,x.risk_level)}</td>
    <td class="right"><b>${F.score(x.grid_impact_score)}</b></td>
    <td class="right muted">${F.num(x.customers_served)}</td>
    <td>${x.due_window}</td>
    <td class="dim">${F.esc(x.recommended_action)}</td></tr>`).join('');
  App.render(`<div class="card"><h3>Predictive Maintenance Queue <span>ranked by grid impact</span></h3>
    <div class="small muted" style="margin-bottom:10px">Ranking blends ML failure probability with customer, criticality, network and weather exposure — so the highest-consequence work rises to the top.</div>
    <div class="tabwrap"><table><thead><tr><th class="right">#</th><th>Asset</th><th>Type</th><th>Area</th>
    <th>Priority</th><th>Failure Prob</th><th class="right">Impact</th><th class="right">Customers</th>
    <th>Due</th><th>Recommended Action</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
};

/* ============================ CREW ============================ */
Pages.crew = async ()=>{
  const r = await API.crews();
  const recRows = r.recommendations.map(x=>`<tr>
    <td class="mono">${x.crew_id}</td>
    <td>${x.current_area} → <b style="color:#60a5fa">${x.recommended_area}</b></td>
    <td>${x.crew_skill} ${x.crew_skill===x.req_skill?'✓':`<span class="muted">(need ${x.req_skill})</span>`}</td>
    <td class="right">${x.high_risk_assets}</td>
    <td class="mono">${x.top_asset}</td>
    <td class="right">${F.score(x.weather_risk)}</td>
    <td class="right">${x.current_response_min} → <b>${x.projected_response_min}</b> min
      <span class="badge b-LOW">-${x.response_reduction_min}</span></td></tr>`).join('');
  const crewRows = r.crews.map(c=>`<tr><td class="mono">${c.crew_id}</td><td>${c.current_area}</td>
    <td>${c.skill_type}</td><td>${c.equipment_capability}</td>
    <td>${F.badge(c.availability==='AVAILABLE'?'LOW':c.availability==='ON_JOB'?'MEDIUM':'HIGH')} ${c.availability}</td></tr>`).join('');
  App.render(`<div class="grid g4">
      ${C.kpi('Available Crews', r.available_crews, `of ${r.crews.length} total`, 'LOW')}
      ${C.kpi('Demand Areas', r.demand_areas, 'high/critical clusters', 'HIGH')}
      ${C.kpi('Repositions', r.recommendations.length, 'recommended moves', 'MEDIUM')}
      ${C.kpi('Max Time Saved', (Math.max(0,...r.recommendations.map(x=>x.response_reduction_min))||0)+' min', 'best response gain', 'LOW')}
    </div>
    <div class="card" style="margin-top:16px"><h3>Crew Pre-Positioning Recommendations <span>greedy skill-weighted assignment</span></h3>
      <div class="tabwrap"><table><thead><tr><th>Crew</th><th>Move</th><th>Skill</th>
      <th class="right">High-risk</th><th>Top asset</th><th class="right">Wx</th><th class="right">Response time</th></tr></thead>
      <tbody>${recRows||'<tr><td colspan=7 class="muted center">No repositioning needed</td></tr>'}</tbody></table></div>
      <div class="small muted" style="margin-top:10px">Rationale: ${r.recommendations[0]?F.esc(r.recommendations[0].rationale):'—'}</div></div>
    <div class="card" style="margin-top:16px"><h3>All Crews</h3>
      <div class="tabwrap"><table><thead><tr><th>Crew</th><th>Location</th><th>Skill</th><th>Equipment</th><th>Status</th></tr></thead>
      <tbody>${crewRows}</tbody></table></div></div>`);
};

/* ============================ WEATHER & OUTAGE ============================ */
Pages.weather = async ()=>{
  const [areas, wx] = await Promise.all([API.areas(), API.weather()]);
  const cards = areas.map(a=>{
    const w=wx[a.area_id]||{};
    return `<div class="card"><h3>${a.area_id} ${F.badge(a.risk_level)}</h3>
      <div class="metric-row"><span class="muted">Outage probability</span><b style="color:${F.riskColor(a.risk_level)}">${F.pct(a.outage_probability)}</b></div>
      <div class="metric-row"><span class="muted">Weather risk</span><b>${F.score(a.weather_risk)}/100</b></div>
      <div class="metric-row"><span class="muted">Wind</span><b>${F.score(w.wind_speed)} km/h</b></div>
      <div class="metric-row"><span class="muted">Rainfall (24h)</span><b>${F.score(w.rainfall)} mm</b></div>
      <div class="metric-row"><span class="muted">Storm / Lightning</span><b>${w.storm?'⚡ YES':'—'} ${w.lightning?'🌩':''}</b></div>
      <div class="metric-row"><span class="muted">High-risk assets</span><b>${a.high_risk_assets}</b></div>
      <div class="metric-row"><span class="muted">Est. customers exposed</span><b>${F.num(a.expected_customers_affected)}</b></div>
      <div class="small muted" style="margin-top:8px">${(a.contributing_factors||[]).join(' · ')}</div>
      <button class="btn sm ghost" style="margin-top:10px" onclick="App.simWeather('${a.area_id}')">Simulate severe weather</button></div>`;
  }).join('');
  const worst = areas.slice().sort((x,y)=>y.weather_risk-x.weather_risk)[0];
  App.render(`<div class="grid g23">
      <div class="card"><h3>Outage Risk & Weather Map</h3><div id="map"></div>
        <div class="map-legend"><span>Circle size ∝ area outage probability · color ∝ risk</span></div></div>
      <div class="card"><h3>Forecast — ${worst?worst.area_id:''} (96h)</h3><div style="height:340px"><canvas id="c-wx"></canvas></div></div>
    </div>
    <div class="grid g3" style="margin-top:16px">${cards}</div>`);
  await GridMap.render('map', {mode:'weather'});
  if(worst){
    const ser=(await API.weatherSeries(worst.area_id,96)).reverse();
    const lbl=ser.map(s=>F.date(s.timestamp));
    mkLine(document.getElementById('c-wx'),lbl,[
      {label:'Extreme weather score',data:ser.map(s=>s.extreme_weather_score),borderColor:'#ef4444'},
      {label:'Wind km/h',data:ser.map(s=>s.wind_speed),borderColor:'#60a5fa'},
      {label:'Rainfall mm',data:ser.map(s=>s.rainfall),borderColor:'#38bdf8'}
    ]);
  }
};

/* ============================ COPILOT ============================ */
const SUGGESTS=['Summarize today\'s grid risks','Which assets are most likely to fail this week?',
  'Why is Transformer T-1024 critical?','What happens if T-1024 fails?',
  'Which substations are most exposed to today\'s weather?','Which crew should be pre-positioned?',
  'Give me a maintenance plan for the next 72 hours'];
Pages.copilot = async ()=>{
  const h = await API.health();
  App.render(`<div class="card chat">
    <h3>AI Operations Copilot <span>${h.llm_enabled?'LLM + tools':'grounded tool mode'} · answers use real model data</span></h3>
    <div class="suggest">${SUGGESTS.map(s=>`<div class="chip" onclick="Pages.ask('${s.replace(/'/g,"\\'")}')">${s}</div>`).join('')}</div>
    <div id="chat-log" class="chat-log">
      <div class="msg bot">${F.md('**Grid copilot ready.** Ask about failures, risk, weather exposure, crews, or run a what-if. Every answer is grounded in current model outputs and cites the tools it used.')}</div>
    </div>
    <div class="chat-input"><input id="chat-q" placeholder="Ask the grid copilot…" onkeydown="if(event.key==='Enter')Pages.ask()"/>
      <button class="btn" onclick="Pages.ask()">Send</button></div></div>`);
  document.getElementById('chat-q').focus();
};
Pages.ask = async (preset)=>{
  const inp=document.getElementById('chat-q'); const q=preset||inp.value.trim(); if(!q) return;
  inp.value='';
  const log=document.getElementById('chat-log');
  log.insertAdjacentHTML('beforeend',`<div class="msg user">${F.esc(q)}</div>`);
  const tid='t'+Date.now();
  log.insertAdjacentHTML('beforeend',`<div class="msg bot typing" id="${tid}">analyzing grid data…</div>`);
  log.scrollTop=log.scrollHeight;
  try{
    const r=await API.copilot(q);
    const ev=r.evidence&&r.evidence.length?`<div class="evidence">Evidence: ${r.evidence.map(e=>`<code>${e.tool}</code>`).join(' ')} · mode: ${r.mode}</div>`:'';
    document.getElementById(tid).outerHTML=`<div class="msg bot">${F.md(r.answer)}${ev}</div>`;
  }catch(e){ document.getElementById(tid).outerHTML=`<div class="msg bot">⚠ ${F.esc(e.message)}</div>`; }
  log.scrollTop=log.scrollHeight;
};

/* ============================ SIMULATOR ============================ */
Pages.simulator = async ()=>{
  const [assets, areas] = await Promise.all([API.assets('?limit=500'), API.areas()]);
  const critical=assets.filter(a=>['CRITICAL','HIGH'].includes(a.priority));
  App.render(`<div class="grid g2">
    <div class="card"><h3>Asset Failure Simulation</h3>
      <div class="small muted" style="margin-bottom:10px">Estimate blast radius, customer impact and response if an asset fails.</div>
      <div class="row"><select id="sim-asset" style="flex:1">
        ${critical.concat(assets).slice(0,80).map(a=>`<option value="${a.asset_id}">${a.asset_id} — ${a.asset_type} (${a.geographic_area})</option>`).join('')}
      </select><button class="btn" onclick="App.simAsset(v('sim-asset'))">Run</button></div>
      <div id="sim-asset-out" style="margin-top:14px"></div></div>
    <div class="card"><h3>Weather Event Simulation</h3>
      <div class="small muted" style="margin-bottom:10px">Inject an extreme-weather event and recompute area outage risk.</div>
      <div class="row"><select id="sim-area" style="flex:1">${areas.map(a=>`<option>${a.area_id}</option>`).join('')}</select>
        <select id="sim-sev"><option>severe</option><option>extreme</option><option>moderate</option><option>mild</option></select>
        <button class="btn" onclick="App.simWeather(v('sim-area'),v('sim-sev'))">Run</button></div>
      <div id="sim-weather-out" style="margin-top:14px"></div></div>
  </div>`);
};

/* helpers (global, used by inline onclick handlers) */
function v(id){return document.getElementById(id).value;}
function riskBand(x){return ['CRITICAL','HIGH'].includes(x)?'CRITICAL':(['ELEVATED','MEDIUM'].includes(x)?'HIGH':'LOW');}
