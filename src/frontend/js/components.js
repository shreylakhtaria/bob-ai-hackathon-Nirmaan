/* Reusable UI component builders (return HTML strings) */
const C = {
  kpi(label, value, sub, level){
    return `<div class="kpi"><div class="bar bar-${level||'LOW'}"></div>
      <div class="label">${label}</div><div class="value">${value}</div>
      <div class="sub">${sub||''}</div></div>`;
  },

  card(title, body, extra){
    return `<div class="card"><h3>${title}${extra?`<span>${extra}</span>`:''}</h3>${body}</div>`;
  },

  assetRow(a){
    const p = a.failure_probability, lvl = a.priority || a.risk_level || 'LOW';
    return `<tr onclick="App.openAsset('${a.asset_id}')">
      <td class="mono">${a.asset_id}</td>
      <td>${a.asset_type||''}</td>
      <td class="muted">${a.geographic_area||a.area||''}</td>
      <td>${F.pct(p)} ${F.probBar(p, a.risk_level)}</td>
      <td class="right"><b>${F.score(a.grid_impact_score)}</b></td>
      <td class="right muted">${F.score(a.weather_risk)}</td>
      <td class="right muted">${F.num(a.customers_served)}</td>
      <td>${F.badge(lvl)}</td>
    </tr>`;
  },

  assetTable(rows, title, extra){
    const body = `<div class="tabwrap"><table>
      <thead><tr><th>Asset</th><th>Type</th><th>Area</th><th>Failure Prob</th>
      <th class="right">Impact</th><th class="right">Wx</th><th class="right">Customers</th><th>Priority</th></tr></thead>
      <tbody>${rows.map(C.assetRow).join('')||'<tr><td colspan="8" class="muted center">No assets</td></tr>'}</tbody>
      </table></div>`;
    return title!==undefined ? C.card(title, body, extra) : body;
  },

  alert(al){
    return `<div class="alert"><div class="ab bar-${al.priority}"></div>
      <div style="flex:1">
        <div class="at ${'dot-'+al.priority}">${F.badge(al.priority)} &nbsp;${F.esc(al.title)}</div>
        <div class="ar">${F.esc(al.reason)}</div>
        <div class="aa">▸ ${F.esc(al.recommended_action)}</div>
      </div></div>`;
  },

  factor(f){
    const w = Math.min(100, Math.abs(f.z)*22);
    return `<div class="factor"><div class="fl">
      <div class="fname">${F.esc(f.label)}</div>
      <div class="fval">value ${f.value} · z=${f.z} · ${f.direction}</div></div>
      <div class="fbar"><span style="width:${w}%"></span></div></div>`;
  },

  metricRow(k,v){ return `<div class="metric-row"><span class="muted">${k}</span><b>${v}</b></div>`; },
};
