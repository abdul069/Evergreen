import express from 'express'
import { Memory } from '../core/memory'
import { EvergreenLoop } from '../core/loop'
import { BootstrapProtocol } from '../bootstrap/protocol'
import { logger } from '../core/logger'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())

// Dashboard
app.get('/', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`
  res.send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Evergreen</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--gold:#c8a96e;--gold-dim:rgba(200,169,110,0.15);--dark:#080808;--surface:#0f0f0f;--border:#1a1a1a;--text:#e8e8e8;--muted:#555;--green:#2ecc71;--red:#e74c3c}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--dark);color:var(--text);font-family:'Syne',sans-serif;min-height:100vh}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(200,169,110,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(200,169,110,0.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.wrap{max-width:720px;margin:0 auto;padding:0 16px;position:relative;z-index:1}
header{padding:28px 16px 20px;border-bottom:1px solid var(--border);position:relative;z-index:1}
.header-inner{max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:10px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:var(--gold);animation:pulse 2s infinite}
.logo-text{font-size:20px;font-weight:800;letter-spacing:-0.02em}
.logo-text span{color:var(--gold)}
.server-status{display:flex;align-items:center;gap:8px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--muted)}
.status-dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}
.status-dot.alive{background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.tabs{display:flex;gap:4px;margin:20px 0 16px;border-bottom:1px solid var(--border)}
.tab{padding:10px 16px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;margin-bottom:-1px;font-family:'IBM Plex Mono',monospace;letter-spacing:.05em;text-transform:uppercase}
.tab:hover{color:var(--text)}
.tab.active{color:var(--gold);border-bottom-color:var(--gold)}
.panel{display:none;animation:fadeIn .3s ease}
.panel.active{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:14px}
.card-title{font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}
.field{margin-bottom:14px}
.field label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-family:'IBM Plex Mono',monospace}
.field input,.field textarea{width:100%;background:#0a0a0a;border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-family:'Syne',sans-serif;font-size:15px;transition:border-color .2s;-webkit-appearance:none}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--gold)}
.field textarea{resize:vertical;min-height:90px;line-height:1.6}
.field input::placeholder,.field textarea::placeholder{color:#333}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{padding:13px 22px;border:none;border-radius:8px;font-size:15px;font-weight:700;font-family:'Syne',sans-serif;cursor:pointer;transition:all .2s;letter-spacing:.02em}
.btn:active{transform:scale(.98)}
.btn-primary{background:var(--gold);color:#080808;width:100%;margin-top:6px}
.btn-primary:disabled{background:var(--border);color:var(--muted);cursor:not-allowed}
.btn-sm{padding:8px 14px;font-size:13px;width:auto;margin-top:0}
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted)}
.btn-ghost:hover{border-color:var(--gold);color:var(--gold)}
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:13px 22px;font-size:14px;z-index:999;transition:transform .3s ease;white-space:nowrap}
#toast.show{transform:translateX(-50%) translateY(0)}
#toast.success{border-color:var(--green);color:var(--green)}
#toast.error{border-color:var(--red);color:var(--red)}
.venture-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:10px;cursor:pointer;transition:border-color .2s}
.venture-card:hover{border-color:#333}
.venture-card.selected{border-color:var(--gold)}
.venture-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px}
.venture-name{font-size:16px;font-weight:700}
.venture-status{font-size:11px;font-family:'IBM Plex Mono',monospace;padding:4px 10px;border-radius:4px;font-weight:600;letter-spacing:.05em;white-space:nowrap;margin-left:8px}
.status-active{background:rgba(46,204,113,.15);color:var(--green)}
.status-bootstrapping{background:rgba(200,169,110,.15);color:var(--gold)}
.status-paused{background:rgba(85,85,85,.3);color:var(--muted)}
.venture-intent{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:14px}
.venture-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{text-align:center;padding:10px;background:#0a0a0a;border-radius:6px}
.stat-val{font-size:18px;font-weight:700;color:var(--gold)}
.stat-label{font-size:10px;color:var(--muted);font-family:'IBM Plex Mono',monospace;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
.budget-bar{background:var(--border);border-radius:4px;height:5px;margin-top:10px;overflow:hidden}
.budget-fill{height:100%;background:var(--gold);border-radius:4px}
.loop-info{display:flex;align-items:center;gap:8px;font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted);margin-top:4px;flex-wrap:wrap}
.phase-badge{font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--muted);background:#111;padding:2px 7px;border-radius:4px;letter-spacing:.05em}
.venture-actions{display:flex;gap:8px;margin-top:14px}
.detail-section{margin-bottom:22px}
.detail-title{font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.decision-item{padding:11px;background:#0a0a0a;border-radius:6px;margin-bottom:7px;border-left:3px solid transparent}
.decision-item.success{border-left-color:var(--green)}
.decision-item.fail{border-left-color:var(--red)}
.decision-type{font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted);margin-bottom:4px}
.decision-reasoning{font-size:13px;color:#aaa;line-height:1.5}
.decision-learnings{font-size:12px;color:var(--gold);margin-top:5px;font-style:italic}
.learning-item{padding:10px 13px;background:rgba(200,169,110,.05);border:1px solid rgba(200,169,110,.1);border-radius:6px;margin-bottom:7px;font-size:13px;color:#aaa;line-height:1.5}
.learning-cat{font-size:10px;font-family:'IBM Plex Mono',monospace;color:var(--gold);margin-bottom:3px;text-transform:uppercase}
.metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.metric-item{background:#0a0a0a;border-radius:8px;padding:13px}
.metric-val{font-size:20px;font-weight:700;color:var(--text)}
.metric-label{font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;margin-top:3px;text-transform:uppercase}
.back-btn{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;cursor:pointer;margin-bottom:18px;font-family:'IBM Plex Mono',monospace}
.back-btn:hover{color:var(--text)}
.refresh-btn{display:flex;align-items:center;gap:6px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--muted);cursor:pointer;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;margin-bottom:14px}
.refresh-btn:hover{border-color:var(--gold);color:var(--gold)}
.spinning{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.scroll-list{max-height:360px;overflow-y:auto}
.empty{text-align:center;padding:40px 24px;color:var(--muted)}
.empty-icon{font-size:36px;margin-bottom:14px;opacity:.3}
.empty p{font-size:14px}
.loading{text-align:center;padding:28px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:13px}
.pb-24{padding-bottom:80px}
</style>
</head>
<body>
<header>
<div class="header-inner">
<div class="logo"><div class="logo-dot"></div><div class="logo-text">Ever<span>green</span></div></div>
<div class="server-status"><div class="status-dot" id="status-dot"></div><span id="status-text">verbinden...</span></div>
</div>
</header>
<div class="wrap pb-24">
<div class="tabs">
<div class="tab active" onclick="switchTab('ventures')">Ventures</div>
<div class="tab" onclick="switchTab('new')">+ Nieuw</div>
</div>
<div class="panel active" id="panel-ventures">
<div id="detail-view" style="display:none"><div class="back-btn" onclick="closeDetail()">← Terug</div><div id="detail-content"></div></div>
<div id="list-view">
<button class="refresh-btn" onclick="loadVentures()"><span id="refresh-icon">↻</span> Vernieuwen</button>
<div id="ventures-list"><div class="loading">Laden...</div></div>
</div>
</div>
<div class="panel" id="panel-new">
<div class="card">
<div class="card-title">Nieuwe Intentie</div>
<div class="field"><label>Jouw intentie *</label><textarea id="intent" placeholder="Beschrijf wat Evergreen moet bereiken..."></textarea></div>
<div class="row">
<div class="field"><label>Budget (EUR)</label><input type="number" id="budget" value="200"></div>
<div class="field"><label>Goedkeuring boven (EUR)</label><input type="number" id="threshold" value="50"></div>
</div>
<div class="field"><label>Jouw e-mail *</label><input type="email" id="owner-email" placeholder="jij@email.com"></div>
<button class="btn btn-primary" id="launch-btn" onclick="launchVenture()">🌱 Venture lanceren</button>
</div>
<div class="card" style="background:transparent;border-color:rgba(200,169,110,.1);cursor:pointer" onclick="useExample()">
<div class="card-title">Voorbeeld — klik om te gebruiken</div>
<div style="font-size:13px;color:var(--muted);line-height:1.7">"Zoek 10 Belgische accountantskantoren die nood hebben aan digitale tools en contacteer ze. Focus op kantoren met 5-20 medewerkers in Oost- en West-Vlaanderen."</div>
</div>
</div>
</div>
<div id="toast"></div>
<script>
const SERVER = '${origin}';
let selectedVenture = null;

async function checkHealth(){
const dot=document.getElementById('status-dot'),txt=document.getElementById('status-text');
try{const r=await fetch(SERVER+'/health',{signal:AbortSignal.timeout(5000)});
if(r.ok){dot.className='status-dot alive';txt.textContent='online'}else throw 0}
catch{dot.className='status-dot';txt.textContent='offline'}}

function switchTab(t){
document.querySelectorAll('.tab').forEach((el,i)=>{el.classList.toggle('active',['ventures','new'][i]===t)});
document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
document.getElementById('panel-'+t).classList.add('active');
if(t==='ventures')loadVentures()}

async function loadVentures(silent=false){
const list=document.getElementById('ventures-list'),icon=document.getElementById('refresh-icon');
if(!silent){icon.classList.add('spinning');list.innerHTML='<div class="loading">Laden...</div>'}
try{const r=await fetch(SERVER+'/ventures'),d=await r.json();renderVentures(d.ventures||[])}
catch{list.innerHTML='<div class="empty"><div class="empty-icon">⚠️</div><p>Kan server niet bereiken</p></div>'}
finally{icon.classList.remove('spinning')}}

function renderVentures(ventures){
const list=document.getElementById('ventures-list');
if(!ventures.length){list.innerHTML='<div class="empty"><div class="empty-icon">🌱</div><p>Nog geen ventures</p></div>';return}
list.innerHTML=ventures.map(v=>{
const pct=Math.min(100,Math.round((v.budget_spent/v.budget_total)*100));
return \`<div class="venture-card \${selectedVenture===v.id?'selected':''}" onclick="openDetail('\${v.id}')">
<div class="venture-header"><div><div class="venture-name">\${v.project_name||'Opstarten...'}</div>
<div class="loop-info"><span class="phase-badge">\${v.phase}</span><span>Loop #\${v.loop_count}</span></div></div>
<div class="venture-status status-\${v.status}">\${v.status.toUpperCase()}</div></div>
<div class="venture-intent">\${trunc(v.evolved_intent||v.original_intent,120)}</div>
<div class="venture-stats">
<div class="stat"><div class="stat-val">€\${v.revenue_total||0}</div><div class="stat-label">Omzet</div></div>
<div class="stat"><div class="stat-val">€\${(v.budget_total-v.budget_spent).toFixed(0)}</div><div class="stat-label">Budget</div></div>
<div class="stat"><div class="stat-val">\${v.loop_count}</div><div class="stat-label">Cycli</div></div>
</div>
<div class="budget-bar"><div class="budget-fill" style="width:\${pct}%"></div></div>
</div>\`}).join('')}

async function openDetail(id){
selectedVenture=id;
document.getElementById('list-view').style.display='none';
document.getElementById('detail-view').style.display='block';
document.getElementById('detail-content').innerHTML='<div class="loading">Laden...</div>';
try{const r=await fetch(SERVER+'/ventures/'+id),d=await r.json();renderDetail(d)}
catch{document.getElementById('detail-content').innerHTML='<div class="empty"><p>Fout bij laden</p></div>'}}

function closeDetail(){
selectedVenture=null;
document.getElementById('list-view').style.display='block';
document.getElementById('detail-view').style.display='none';
loadVentures()}

function renderDetail(data){
const v=data.venture,m=data.metrics||{},dec=data.recent_decisions||[],lea=data.recent_learnings||[],br=data.budget_remaining||0;
const pct=Math.min(100,Math.round(((v.budget_total-br)/v.budget_total)*100));
const isPaused=v.status==='paused';
document.getElementById('detail-content').innerHTML=\`
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;gap:10px">
<div><h2 style="font-size:20px;font-weight:800">\${v.project_name||'Opstarten...'}</h2>
<div class="loop-info" style="margin-top:4px"><span class="venture-status status-\${v.status}">\${v.status.toUpperCase()}</span><span class="phase-badge">\${v.phase}</span><span>Loop #\${v.loop_count}</span></div></div>
<button class="btn btn-sm btn-ghost" onclick="\${isPaused?'resumeV':'pauseV'}('\${v.id}')">\${isPaused?'▶ Hervatten':'⏸ Pauzeren'}</button>
</div>
<div class="detail-section"><div class="detail-title">Intentie</div>
<div style="font-size:14px;color:#aaa;line-height:1.7;background:#0a0a0a;padding:13px;border-radius:8px">\${v.evolved_intent||v.original_intent}</div></div>
<div class="detail-section"><div class="detail-title">Budget</div>
<div class="metrics-grid">
<div class="metric-item"><div class="metric-val">€\${br.toFixed(2)}</div><div class="metric-label">Resterend</div></div>
<div class="metric-item"><div class="metric-val">€\${v.revenue_total||0}</div><div class="metric-label">Omzet</div></div>
<div class="metric-item"><div class="metric-val">€\${v.budget_spent||0}</div><div class="metric-label">Uitgegeven</div></div>
<div class="metric-item"><div class="metric-val">€\${v.budget_total}</div><div class="metric-label">Totaal</div></div>
</div>
<div class="budget-bar" style="height:8px;margin-top:12px"><div class="budget-fill" style="width:\${pct}%"></div></div></div>
\${Object.keys(m).length?'<div class="detail-section"><div class="detail-title">Metrics</div><div class="metrics-grid">'+Object.entries(m).slice(0,6).map(([k,val])=>\`<div class="metric-item"><div class="metric-val">\${typeof val==='number'?val.toFixed(0):val}</div><div class="metric-label">\${k.replace(/_/g,' ')}</div></div>\`).join('')+'</div></div>':''}
<div class="detail-section"><div class="detail-title">Beslissingen (\${dec.length})</div>
\${dec.length?'<div class="scroll-list">'+dec.map(d=>\`<div class="decision-item \${d.success===true?'success':d.success===false?'fail':''}"><div class="decision-type">\${d.level.toUpperCase()} — \${d.action_type} \${d.success===true?'✓':d.success===false?'✗':'⏳'}</div><div class="decision-reasoning">\${trunc(d.reasoning,150)}</div>\${d.learnings?'<div class="decision-learnings">→ '+trunc(d.learnings,100)+'</div>':''}</div>\`).join('')+'</div>':'<div style="color:var(--muted);font-size:13px">Nog geen beslissingen</div>'}
</div>
<div class="detail-section"><div class="detail-title">Inzichten (\${lea.length})</div>
\${lea.length?'<div class="scroll-list">'+lea.map(l=>\`<div class="learning-item"><div class="learning-cat">\${l.category}</div>\${l.insight}</div>\`).join('')+'</div>':'<div style="color:var(--muted);font-size:13px">Nog geen inzichten</div>'}
</div>
<div class="detail-section"><div class="detail-title">Tijdlijn</div>
<div style="font-size:12px;font-family:'IBM Plex Mono',monospace;color:var(--muted);line-height:2.2">
<div>Aangemaakt: \${fmtDate(v.created_at)}</div>
<div>Laatste activiteit: \${fmtDate(v.last_active_at)}</div>
\${v.last_loop_at?'<div>Laatste loop: '+fmtDate(v.last_loop_at)+'</div>':''}
</div></div>\`}

async function pauseV(id){
try{await fetch(SERVER+'/ventures/'+id+'/pause',{method:'POST'});toast('Gepauzeerd','success');openDetail(id)}
catch{toast('Fout','error')}}

async function resumeV(id){
try{await fetch(SERVER+'/ventures/'+id+'/resume',{method:'POST'});toast('Hervat','success');openDetail(id)}
catch{toast('Fout','error')}}

async function launchVenture(){
const intent=document.getElementById('intent').value.trim();
const budget=parseFloat(document.getElementById('budget').value)||200;
const threshold=parseFloat(document.getElementById('threshold').value)||50;
const email=document.getElementById('owner-email').value.trim();
if(!intent){toast('Intentie verplicht','error');return}
if(!email){toast('E-mail verplicht','error');return}
const btn=document.getElementById('launch-btn');
btn.disabled=true;btn.textContent='⏳ Lanceren...';
try{const r=await fetch(SERVER+'/ventures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intent,budget,approval_threshold:threshold,owner_email:email})});
const d=await r.json();
if(d.success){toast('Venture gelanceerd!','success');document.getElementById('intent').value='';switchTab('ventures');setTimeout(loadVentures,2000)}
else toast(d.error||'Fout','error')}
catch{toast('Kan server niet bereiken','error')}
finally{btn.disabled=false;btn.textContent='🌱 Venture lanceren'}}

function useExample(){document.getElementById('intent').value='Zoek 10 Belgische accountantskantoren die nood hebben aan digitale tools en contacteer ze. Focus op kantoren met 5-20 medewerkers in Oost- en West-Vlaanderen.';switchTab('new')}
function trunc(s,n){if(!s)return '';return s.length>n?s.substring(0,n)+'...':s}
function fmtDate(iso){if(!iso)return '-';const d=new Date(iso);return d.toLocaleDateString('nl-BE')+' '+d.toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})}
function toast(msg,type='info'){const el=document.getElementById('toast');el.textContent=msg;el.className='show '+type;setTimeout(()=>{el.className=''},3000)}

checkHealth();loadVentures();
setInterval(()=>{if(document.getElementById('panel-ventures').classList.contains('active')){selectedVenture?openDetail(selectedVenture):loadVentures(true)}},30000);
</script>
</body>
</html>`
