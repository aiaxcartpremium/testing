/* ===========================================================
   AiaxStock Management — FULL SAFE BUILD (v2025-11-06c)
   Works with: index.html, owner.html, admin.html
   =========================================================== */

let sb=null;
try{
  if(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
    sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  }
}catch(e){console.warn("Supabase init failed",e);}

// --- helpers ---
const $=(s,root=document)=>root.querySelector(s);
const on=(el,ev,fn)=>el&&el.addEventListener(ev,fn);
const SESSION_KEY='aiax.session';
const saveS=s=>localStorage.setItem(SESSION_KEY,JSON.stringify(s));
const getS=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}};
const clearS=()=>localStorage.removeItem(SESSION_KEY);
const fmt=d=>d?new Date(d).toLocaleString():''

// --- static dropdown data ---
const TYPES=['shared account','shared profile','solo account','solo profile','invitation','edu','head'];
const DURS=[['7 days','7d'],['14 days','14d'],['1 month','1m'],['2 months','2m'],['3 months','3m'],
['4 months','4m'],['5 months','5m'],['6 months','6m'],['7 months','7m'],['8 months','8m'],['9 months','9m'],
['10 months','10m'],['11 months','11m'],['12 months','12m'],['auto-renew','auto']];

// --- window API for old login pages ---
window.__APP__=window.__APP__||{};
window.__APP__.loginWithUid=(role,uuid)=>{
  if(!role||!uuid)return alert("Missing UUID");
  saveS({role,uuid});
  location.href=role==='admin'?'admin.html':'owner.html';
};

// --- role guard ---
async function requireRole(list){
  const s=getS();
  if(!s||!list.includes(s.role)){location.href='index.html?v=20251106c';throw'noauth';}
  return s;
}

// --- LOGIN PAGE ---
function bootLogin(){
  const owner=$('#btnOwnerLogin'),admin=$('#btnAdminLogin');
  on(owner,'click',()=>{
    const id=$('#ownerUUIDInput').value.trim();
    if(!id)return alert('Enter owner UUID');
    saveS({role:'owner',uuid:id});
    location.href='owner.html';
  });
  on(admin,'click',()=>{
    const id=$('#adminUUIDInput').value.trim();
    if(!id)return alert('Enter admin UUID');
    saveS({role:'admin',uuid:id});
    location.href='admin.html';
  });
}

// --- OWNER PAGE ---
function fillStaticOwner(){
  const tSel=$('#typeSelect'),dSel=$('#durationSelect');
  if(tSel)tSel.innerHTML=TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(dSel)dSel.innerHTML=DURS.map(([l,v])=>`<option value="${v}">${l}</option>`).join('');
}

async function fillProducts(sel){
  if(!sb){sel.innerHTML='<option>offline</option>';return;}
  const {data,error}=await sb.from('products').select('key,label').order('label');
  if(error){sel.innerHTML='<option>failed</option>';return;}
  sel.innerHTML='<option value="" disabled selected>Select product</option>'+
    data.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
}

async function addStock(e){
  e.preventDefault();
  const s=getS(); if(!s)return alert('Session missing');
  if(!sb)return alert('No backend');
  const p=$('#productSelect').value,t=$('#typeSelect').value,d=$('#durationSelect').value;
  const q=parseInt($('#qtyInput').value||'1',10);
  if(!p||!t||!d)return alert('Fill all fields');
  const body={
    product_key:p,account_type:t,duration_code:d,quantity:q,
    email:$('#emailInput').value||null,password:$('#passInput').value||null,
    profile_name:$('#profileInput').value||null,pin:$('#pinInput').value||null,
    notes:$('#notesInput').value||null
  };
  const {error}=await sb.from('stocks').insert([body]);
  if(error)return alert('Add stock failed');
  alert('Stock added!');
  e.target.reset();
  loadOwnerTables();
}

async function loadOwnerTables(){
  const table=$('#ownerStocksTable');
  if(!table)return;
  if(!sb){table.textContent='offline';return;}
  const {data,error}=await sb.from('stocks').select('product_key,account_type,duration_code,quantity');
  if(error){table.textContent='Error';return;}
  if(!data.length){table.textContent='No data';return;}
  const map={};
  data.forEach(r=>{
    const k=[r.product_key,r.account_type,r.duration_code].join('|');
    map[k]=(map[k]||0)+(r.quantity||0);
  });
  const rows=Object.entries(map).map(([k,v])=>{
    const [p,t,d]=k.split('|');return `<tr><td>${p}</td><td>${t}</td><td>${d}</td><td>${v}</td></tr>`;
  }).join('');
  table.innerHTML=`<table><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr>${rows}</table>`;
}

async function bootOwner(){
  await requireRole(['owner']);
  on($('#btnLogout'),'click',()=>{clearS();location.href='index.html';});
  on($('#goAdmin'),'click',()=>location.href='admin.html');
  fillStaticOwner();
  await fillProducts($('#productSelect'));
  on($('#addStockForm'),'submit',addStock);
  loadOwnerTables();
}

// --- ADMIN PAGE ---
async function bootAdmin(){
  await requireRole(['admin']);
  on($('#btnLogout'),'click',()=>{clearS();location.href='index.html';});
  on($('#goOwner'),'click',()=>location.href='owner.html');
  if(!sb)return;
  const table=$('#adminAvailable');
  const {data,error}=await sb.from('stocks').select('product_key,account_type,duration_code,quantity');
  if(error){table.textContent='Error';return;}
  if(!data.length){table.textContent='No data';return;}
  const map={};
  data.forEach(r=>{
    const k=[r.product_key,r.account_type,r.duration_code].join('|');
    map[k]=(map[k]||0)+(r.quantity||0);
  });
  table.innerHTML='<h3>Available Stocks</h3><table><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr>'+
    Object.entries(map).map(([k,v])=>{
      const [p,t,d]=k.split('|');
      return `<tr><td>${p}</td><td>${t}</td><td>${d}</td><td>${v}</td></tr>`;
    }).join('')+'</table>';
}

// --- ROUTER auto-detect ---
(function(){
  const path=(location.pathname||'').toLowerCase();
  if(path.endsWith('owner.html'))return bootOwner();
  if(path.endsWith('admin.html'))return bootAdmin();
  if(path.endsWith('index.html')||path.endsWith('/'))return bootLogin();

  // element fallback
  if($('#addStockForm')||$('#productSelect'))return bootOwner();
  if($('#adminAvailable'))return bootAdmin();
  if($('#btnOwnerLogin'))return bootLogin();
})();