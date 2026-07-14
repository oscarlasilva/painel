const CSV_PATH = "dados/fila.csv";

const fmtInt = v => v == null || Number.isNaN(v) ? "—" : new Intl.NumberFormat("pt-BR").format(v);
const fmtDec = v => v == null || Number.isNaN(v) ? "—" : new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(v);
const pct = v => new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(v) + "%";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).filter(Boolean).map(line => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h,i) => row[h.trim()] = values[i] ?? "");
    return normalizeRow(row);
  });
}

function splitCSVLine(line) {
  const out=[]; let cur=""; let quoted=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if ((ch === ',' || ch === ';') && !quoted) {
      out.push(cur); cur="";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r) {
  return {
    periodo:r["Período"],
    tipo:r["Tipo"],
    data_base:r["Data base"],
    fila_anterior:toNumber(r["Fila anterior"]),
    entrada:toNumber(r["Entrada"]),
    permanecem:toNumber(r["Permanecem"]),
    saida:toNumber(r["Saída"]),
    fila_final:toNumber(r["Fila final"]),
    dias_uteis:toNumber(r["Dias úteis"]),
    media_espera:toNumber(r["Média de Espera (dias)"]),
    max_espera:toNumber(r["Máxima Espera (dias)"])
  };
}

function periodKey(p) {
  const [m,y] = p.split("-").map(Number);
  return y*100+m;
}

function monthLabel(p) {
  const [m,y]=p.split("-");
  const names=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[Number(m)-1]}/${String(y).slice(-2)}`;
}

function queueValue(r){ return r.fila_final ?? r.fila_anterior ?? 0; }

function groupData(rows) {
  const byPeriod={};
  rows.forEach(r => {
    byPeriod[r.periodo] ??= {};
    byPeriod[r.periodo][r.tipo] = r;
  });
  return byPeriod;
}

function makeKpis(rows, byPeriod, periods) {
  const latest = periods.at(-1);
  const previous = periods.length > 1 ? periods.at(-2) : latest;
  const first = periods[0];
  const latestAPS=byPeriod[latest]?.APS;
  const latestESP=byPeriod[latest]?.Especializada;
  const prevAPS=byPeriod[previous]?.APS;
  const prevESP=byPeriod[previous]?.Especializada;
  const total=(latestAPS?.fila_anterior??0)+(latestESP?.fila_anterior??0);
  const firstTotal=(byPeriod[first]?.APS?.fila_anterior??0)+(byPeriod[first]?.Especializada?.fila_anterior??0);
  const diff=total-firstTotal;

  const completePeriods=periods.filter(p => byPeriod[p]?.APS?.media_espera != null || byPeriod[p]?.Especializada?.media_espera != null);
  const lastComplete=completePeriods.at(-1);
  const lcAPS=byPeriod[lastComplete]?.APS;
  const lcESP=byPeriod[lastComplete]?.Especializada;
  const maxWait=Math.max(lcAPS?.max_espera ?? 0, lcESP?.max_espera ?? 0);

  if (getEl("updateBadge")) getEl("updateBadge").textContent = `Última competência: ${monthLabel(latest)}`;
  const latestRows=[latestAPS,latestESP].filter(Boolean);
  const partial=latestRows.some(r => r.fila_final == null || r.entrada == null);
  if (getEl("notice")) getEl("notice").innerHTML = partial
    ? `<strong>Competência parcial:</strong> ${monthLabel(latest)} apresenta dados incompletos. Indicadores de movimentação e espera usam a última competência consolidada.`
    : "";

  const cards=[
    {label:"Fila total atual",value:fmtInt(total),sub:"APS + Especializada",delta:(diff<0?"↓ ":"↑ ")+fmtInt(Math.abs(diff))+" desde "+monthLabel(first),cls:diff<0?"good":"bad"},
    {label:"Fila APS",value:fmtInt(latestAPS?.fila_anterior),sub:monthLabel(latest),delta:pct((latestAPS?.fila_anterior??0)/total*100)+" da fila",cls:"neutral"},
    {label:"Fila Especializada",value:fmtInt(latestESP?.fila_anterior),sub:monthLabel(latest),delta:pct((latestESP?.fila_anterior??0)/total*100)+" da fila",cls:"neutral"},
    {label:"Tempo médio APS",value:fmtDec(lcAPS?.media_espera)+" dias",sub:"último consolidado: "+monthLabel(lastComplete),delta:"",cls:"neutral"},
    {label:"Tempo médio Especializada",value:fmtDec(lcESP?.media_espera)+" dias",sub:"último consolidado: "+monthLabel(lastComplete),delta:"",cls:"neutral"},
    {label:"Maior espera",value:fmtInt(maxWait)+" dias",sub:"último consolidado: "+monthLabel(lastComplete),delta:"",cls:"neutral"}
  ];

  if (getEl("kpis")) getEl("kpis").innerHTML=cards.map(c=>`
    <article class="card kpi">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
      ${c.delta?`<span class="delta ${c.cls}">${c.delta}</span>`:""}
    </article>`).join("");

  const apsShare=total ? (latestAPS?.fila_anterior??0)/total*100 : 0;
  if (getEl("donut")) getEl("donut").style.background=`conic-gradient(var(--aps) 0 ${apsShare}%,var(--esp) ${apsShare}% 100%)`;
  if (getEl("donutTotal")) getEl("donutTotal").textContent=fmtInt(total);
  if (getEl("donutLegend")) getEl("donutLegend").innerHTML=`
    <span><i class="swatch aps"></i>APS: ${fmtInt(latestAPS?.fila_anterior)} (${pct(apsShare)})</span>
    <span><i class="swatch esp"></i>Especializada: ${fmtInt(latestESP?.fila_anterior)} (${pct(100-apsShare)})</span>`;
}

const tooltip=document.getElementById("tooltip");
const getEl = id => document.getElementById(id);
function showTip(e,html){tooltip.innerHTML=html;tooltip.style.left=e.clientX+"px";tooltip.style.top=e.clientY+"px";tooltip.style.opacity=1}
function hideTip(){tooltip.style.opacity=0}

function lineChart(el, labels, series, suffix="") {
  if (!el) return;
  const W=760,H=280,m={l:50,r:22,t:18,b:42},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const vals=series.flatMap(s=>s.values.filter(v=>v!=null));
  if (!vals.length) { el.innerHTML='<div class="error">Sem dados para este gráfico.</div>'; return; }
  const max=Math.max(10,Math.ceil(Math.max(...vals)*1.12/10)*10);
  const x=i=>m.l+(labels.length===1?iw/2:i*iw/(labels.length-1));
  const y=v=>m.t+ih-(v/max)*ih;
  let out=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){const val=max*(4-i)/4,yy=m.t+ih*i/4;out+=`<line class="grid-line" x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}"/><text class="axis-label" x="${m.l-8}" y="${yy+4}" text-anchor="end">${fmtDec(val)}</text>`}
  labels.forEach((lab,i)=>out+=`<text class="axis-label" x="${x(i)}" y="${H-12}" text-anchor="middle">${lab}</text>`);
  series.forEach((s,si)=>{
    const cls=si===0?"aps":"esp";
    const pts=s.values.map((v,i)=>v==null?null:`${x(i)},${y(v)}`).filter(Boolean);
    out+=`<polyline class="line-${cls}" points="${pts.join(" ")}"/>`;
    s.values.forEach((v,i)=>{if(v==null)return;out+=`<circle class="point-${cls} hover" cx="${x(i)}" cy="${y(v)}" r="5" data-tip="<strong>${s.name}</strong><br>${labels[i]}: ${fmtDec(v)}${suffix}"/><text class="chart-label" x="${x(i)}" y="${y(v)-11}" text-anchor="middle">${fmtDec(v)}</text>`});
  });
  out+="</svg>"; el.innerHTML=out;
  el.querySelectorAll(".hover").forEach(n=>{n.addEventListener("mousemove",e=>showTip(e,n.dataset.tip));n.addEventListener("mouseleave",hideTip)});
}

function groupedBars(el, labels, categories, series) {
  if (!el) return;
  const W=760,H=280,m={l:50,r:20,t:20,b:52},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const vals=series.flatMap(s=>s.values.filter(v=>v!=null));
  if (!vals.length) { el.innerHTML='<div class="error">Sem dados para este gráfico.</div>'; return; }
  const max=Math.max(10,Math.ceil(Math.max(...vals)*1.15/10)*10);
  const groupW=iw/labels.length,barW=Math.min(34,groupW/(series.length+1));
  let out=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){const val=max*(4-i)/4,yy=m.t+ih*i/4;out+=`<line class="grid-line" x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}"/><text class="axis-label" x="${m.l-8}" y="${yy+4}" text-anchor="end">${fmtDec(val)}</text>`}
  labels.forEach((lab,gi)=>{
    const center=m.l+groupW*(gi+.5);out+=`<text class="axis-label" x="${center}" y="${H-12}" text-anchor="middle">${lab}</text>`;
    series.forEach((s,si)=>{const v=s.values[gi];if(v==null)return;const h=v/max*ih,xx=center+(si-(series.length-1)/2)*(barW+6)-barW/2,yy=m.t+ih-h;
      out+=`<rect class="${s.cls} hover" x="${xx}" y="${yy}" width="${barW}" height="${h}" rx="5" data-tip="<strong>${categories[gi]}</strong><br>${s.name}: ${fmtInt(v)}"/><text class="chart-label" x="${xx+barW/2}" y="${yy-7}" text-anchor="middle">${fmtInt(v)}</text>`});
  });
  out+="</svg>";el.innerHTML=out;
  el.querySelectorAll(".hover").forEach(n=>{n.addEventListener("mousemove",e=>showTip(e,n.dataset.tip));n.addEventListener("mouseleave",hideTip)});
}

function signedGroupedBars(el, labels, categories, series) {
  if (!el) return;
  const W=760,H=280,m={l:50,r:20,t:20,b:52},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const vals=series.flatMap(s=>s.values.filter(v=>v!=null));
  if (!vals.length) { el.innerHTML='<div class="error">Sem dados para este gráfico.</div>'; return; }

  let min=Math.min(0,...vals), max=Math.max(0,...vals);
  const range=Math.max(10,max-min);
  const pad=range*.15;
  min=Math.floor((min-pad)/10)*10;
  max=Math.ceil((max+pad)/10)*10;
  if(min===max){min-=10;max+=10}

  const y=v=>m.t+(max-v)/(max-min)*ih;
  const zeroY=y(0);
  const groupW=iw/labels.length,barW=Math.min(34,groupW/(series.length+1));
  let out=`<svg viewBox="0 0 ${W} ${H}">`;

  for(let i=0;i<=4;i++){
    const val=max-(max-min)*i/4,yy=m.t+ih*i/4;
    out+=`<line class="grid-line" x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}"/>
    <text class="axis-label" x="${m.l-8}" y="${yy+4}" text-anchor="end">${fmtDec(val)}</text>`;
  }
  out+=`<line x1="${m.l}" y1="${zeroY}" x2="${W-m.r}" y2="${zeroY}" stroke="#9299a5" stroke-width="1.5"/>`;

  labels.forEach((lab,gi)=>{
    const center=m.l+groupW*(gi+.5);
    out+=`<text class="axis-label" x="${center}" y="${H-12}" text-anchor="middle">${lab}</text>`;
    series.forEach((s,si)=>{
      const v=s.values[gi]; if(v==null)return;
      const valueY=y(v);
      const yy=Math.min(zeroY,valueY);
      const h=Math.max(2,Math.abs(valueY-zeroY));
      const xx=center+(si-(series.length-1)/2)*(barW+6)-barW/2;
      const labelY=v>=0 ? yy-7 : yy+h+15;
      const display=v>0?`+${fmtInt(v)}`:fmtInt(v);
      out+=`<rect class="${s.cls} hover" x="${xx}" y="${yy}" width="${barW}" height="${h}" rx="5"
      data-tip="<strong>${categories[gi]}</strong><br>${s.name}: ${display}"/>
      <text class="chart-label" x="${xx+barW/2}" y="${labelY}" text-anchor="middle">${display}</text>`;
    });
  });

  out+="</svg>";el.innerHTML=out;
  el.querySelectorAll(".hover").forEach(n=>{
    n.addEventListener("mousemove",e=>showTip(e,n.dataset.tip));
    n.addEventListener("mouseleave",hideTip);
  });
}

function renderTables(rows) {
  const complete=rows.filter(r=>r.entrada!=null && r.fila_anterior!=null).sort((a,b)=>periodKey(a.periodo)-periodKey(b.periodo)||a.tipo.localeCompare(b.tipo));
  const sorted=[...rows].sort((a,b)=>periodKey(b.periodo)-periodKey(a.periodo)||a.tipo.localeCompare(b.tipo));
  const dataTable = getEl("dataTable");
  if (!dataTable) return;
  dataTable.innerHTML=`<thead><tr><th>Período</th><th>Serviço</th><th>Data-base</th><th class="num">Fila anterior</th><th class="num">Entradas</th><th class="num">Permanecem</th><th class="num">Saídas</th><th class="num">Fila final</th><th class="num">Média espera</th><th class="num">Máxima espera</th><th>Status</th></tr></thead><tbody>`+
  sorted.map(r=>`<tr><td>${monthLabel(r.periodo)}</td><td class="service">${r.tipo}</td><td>${r.data_base}</td><td class="num">${fmtInt(r.fila_anterior)}</td><td class="num">${fmtInt(r.entrada)}</td><td class="num">${fmtInt(r.permanecem)}</td><td class="num">${fmtInt(r.saida)}</td><td class="num">${fmtInt(r.fila_final)}</td><td class="num">${r.media_espera==null?"—":fmtDec(r.media_espera)+" dias"}</td><td class="num">${r.max_espera==null?"—":fmtInt(r.max_espera)+" dias"}</td><td><span class="status ${r.fila_final==null?"partial":"complete"}">${r.fila_final==null?"Parcial":"Completo"}</span></td></tr>`).join("")+"</tbody>";
}

async function init() {
  try {
    const response=await fetch(CSV_PATH,{cache:"no-store"});
    if(!response.ok) throw new Error("Não foi possível carregar o CSV.");
    const rows=parseCSV(await response.text());
    const byPeriod=groupData(rows);
    const periods=[...new Set(rows.map(r=>r.periodo))].sort((a,b)=>periodKey(a)-periodKey(b));

    makeKpis(rows,byPeriod,periods);

    lineChart(document.getElementById("queueChart"),periods.map(monthLabel),[
      {name:"APS",values:periods.map(p=>byPeriod[p]?.APS?.fila_anterior??null)},
      {name:"Especializada",values:periods.map(p=>byPeriod[p]?.Especializada?.fila_anterior??null)}
    ]);

    const completeRows=rows.filter(r=>r.entrada!=null).sort((a,b)=>periodKey(a.periodo)-periodKey(b.periodo)||a.tipo.localeCompare(b.tipo));
    groupedBars(document.getElementById("movementChart"),
      completeRows.map(r=>monthLabel(r.periodo)+" "+(r.tipo==="Especializada"?"Esp.":"APS")),
      completeRows.map(r=>r.tipo),
      [{name:"Entradas",cls:"bar-entry",values:completeRows.map(r=>r.entrada)},{name:"Saídas",cls:"bar-exit",values:completeRows.map(r=>r.saida)}]
    );

    const waitPeriods=periods.filter(p=>byPeriod[p]?.APS?.media_espera!=null||byPeriod[p]?.Especializada?.media_espera!=null);
    lineChart(document.getElementById("waitChart"),waitPeriods.map(monthLabel),[
      {name:"APS",values:waitPeriods.map(p=>byPeriod[p]?.APS?.media_espera??null)},
      {name:"Especializada",values:waitPeriods.map(p=>byPeriod[p]?.Especializada?.media_espera??null)}
    ]," dias");

    groupedBars(document.getElementById("maxWaitChart"),waitPeriods.map(monthLabel),waitPeriods.map(monthLabel),[
      {name:"APS",cls:"bar-aps",values:waitPeriods.map(p=>byPeriod[p]?.APS?.max_espera??null)},
      {name:"Especializada",cls:"bar-esp",values:waitPeriods.map(p=>byPeriod[p]?.Especializada?.max_espera??null)}
    ]);

    const balancePeriods=periods.filter(p =>
      byPeriod[p]?.APS?.entrada!=null || byPeriod[p]?.Especializada?.entrada!=null
    );
    signedGroupedBars(
      document.getElementById("balanceChart"),
      balancePeriods.map(monthLabel),
      balancePeriods.map(monthLabel),
      [
        {
          name:"APS",
          cls:"bar-aps",
          values:balancePeriods.map(p => {
            const r=byPeriod[p]?.APS;
            return r?.entrada!=null && r?.saida!=null ? r.entrada-r.saida : null;
          })
        },
        {
          name:"Especializada",
          cls:"bar-esp",
          values:balancePeriods.map(p => {
            const r=byPeriod[p]?.Especializada;
            return r?.entrada!=null && r?.saida!=null ? r.entrada-r.saida : null;
          })
        }
      ]
    );

    renderTables(rows);
  } catch(err) {
    document.body.innerHTML=`<div class="dashboard"><div class="error"><strong>Erro ao carregar o painel.</strong><br>${err.message}<br><br>Este painel precisa ser aberto por um servidor web ou hospedado. Não funciona corretamente ao abrir diretamente pelo Explorador de Arquivos.</div></div>`;
  }
}
init();