/* =========================
   AiaxStock Management • app.js
   ========================= */

// ---- config contract (edit in config.js) ----
// window.APP_CFG = {
//   SUPABASE_URL: '...',
//   SUPABASE_ANON_KEY: '...',
//   OWNER_UUIDS: ['owner-uuid-1', 'owner-uuid-2'],
//   ADMIN_UUIDS: ['admin-uuid-1', 'admin-uuid-2']
// };

if (!window.APP_CFG) window.APP_CFG = {};
const { SUPABASE_URL, SUPABASE_ANON_KEY, OWNER_UUIDS = [], ADMIN_UUIDS = [] } = window.APP_CFG;

// Supabase client (via global script or esm.sh if you prefer)
const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----- tiny DOM helpers -----
const qs  = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> [...r.querySelectorAll(s)];
const on  = (el,ev,fn,opts)=> el && el.addEventListener(ev,fn,opts);

// ----- session helpers -----
const SESSION_KEY = 'aiax.session'; // { role:'owner'|'admin', uuid:'...' }
const saveSession = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const getSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } };
const clearSession= () => localStorage.removeItem(SESSION_KEY);
const currentUUID = () => getSession()?.uuid || null;

// ----- role checks -----
function assertRole(role, uuid) {
  if (role === 'owner' && !OWNER_UUIDS.includes(uuid)) throw new Error('UUID not allowed as Owner');
  if (role === 'admin' && !ADMIN_UUIDS.includes(uuid)) throw new Error('UUID not allowed as Admin');
}
function canGoAdmin() {
  const s = getSession();
  return s && (s.role === 'admin' || s.role === 'owner'); // owner is allowed to see Admin
}

// ----- UI helpers -----
function fmtDT(d){ return d ? new Date(d).toLocaleString() : ''; }
function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function toCSV(rows){ if(!rows?.length) return ''; const cols=Object.keys(rows[0]); return [cols.join(','), ...rows.map(r=>cols.map(c=>csvEscape(r[c])).join(','))].join('\n'); }

// ----- static lists -----
const ACCOUNT_TYPES = ['shared profile','solo profile','shared account','solo account','invitation','head','edu'];
const DURATIONS = [['7 days','7d'],['14 days','14d'],['1 month','1m'],['2 months','2m'],['3 months','3m'],['4 months','4m'],['5 months','5m'],['6 months','6m'],['7 months','7m'],['8 months','8m'],['9 months','9m'],['10 months','10m'],['11 months','11m'],['12 months','12m'],['auto-renew','auto']];

// ----- products -----
async function fetchProducts(){
  if(!supabase) return [];
  const { data, error } = await supabase.from('products').select('key,label').order('label');
  if(error){ console.error('products error', error); return []; }
  return data || [];
}
async function fillProductsSelect(sel){
  const rows = await fetchProducts();
  sel.innerHTML = `<option value="" disabled selected>Loading...</option>`;
  const opts = rows.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
  sel.innerHTML = `<option value="" disabled selected>Select product</option>${opts}`;
}

// ----- owner page -----
function fillStaticSelectsOwner(){
  const typeSel = qs('#typeSelect');
  const durSel  = qs('#durationSelect');
  if(typeSel) typeSel.innerHTML = ACCOUNT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(durSel)  durSel.innerHTML  = DURATIONS.map(([l,v])=>`<option value="${v}">${l}</option>`).join('');
}
async function ownerAddStockSubmit(e){
  e.preventDefault();
  if(!supabase) return alert('Supabase not ready');

  const product_key  = qs('#productSelect')?.value;
  const account_type = qs('#typeSelect')?.value;
  const duration_code= qs('#durationSelect')?.value;
  const quantity     = parseInt(qs('#qtyInput')?.value||'1',10);
  const email        = qs('#emailInput')?.value.trim() || null;
  const password     = qs('#passInput')?.value.trim() || null;
  const profile_name = qs('#profileInput')?.value.trim() || null;
  const pin          = qs('#pinInput')?.value.trim() || null;
  const notes        = qs('#notesInput')?.value.trim() || null;

  if(!product_key) return alert('Please select a product');
  if(!account_type) return alert('Please select account type');
  if(!duration_code) return alert('Please select duration');
  if(quantity<1) return alert('Quantity must be at least 1');

  // RLS requires owner_id defaulting to auth.uid() or similar; if you use UUID-as-text, add a trigger/RPC.
  const payload = { product_key, account_type, duration_code, quantity, email, password, profile_name, pin, notes };
  const { error } = await supabase.from('stocks').insert([payload]);
  if(error){ console.error(error); return alert('Add stock failed'); }

  alert('Stock added');
  e.target.reset();
  fillStaticSelectsOwner();
  await fillProductsSelect(qs('#productSelect'));
  ownerRenderStocks();
}

async function fetchStocksSummaryOwner(){
  if(!supabase) return [];
  let { data, error } = await supabase.from('stocks_summary').select('product_key,account_type,duration_code,total_qty').order('product_key');
  if(error){
    // fallback compute
    const all = await supabase.from('stocks').select('product_key,account_type,duration_code,quantity');
    if(all.error){ console.error(all.error); return []; }
    const map = new Map();
    for(const r of all.data){
      const k = `${r.product_key}|${r.account_type}|${r.duration_code}`;
      map.set(k,(map.get(k)||0)+(r.quantity||0));
    }
    data = [...map.entries()].map(([k,qty])=>{ const [product_key,account_type,duration_code]=k.split('|'); return { product_key,account_type,duration_code,total_qty:qty };});
  }
  return data || [];
}
async function ownerRenderStocks(){
  const wrap = qs('#ownerStocksTable'); if(!wrap) return;
  wrap.innerHTML='Loading…';
  const rows = await fetchStocksSummaryOwner();
  if(!rows.length){ wrap.innerHTML = '<div class="muted">No stocks yet.</div>'; return; }
  const products = await fetchProducts(); const labelOf = k => products.find(p=>p.key===k)?.label || k;

  wrap.innerHTML = `
    <table class="table">
      <thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th><th></th></tr></thead>
      <tbody>
      ${rows.map(r=>`<tr>
        <td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td>
        <td><button class="btn-outline" data-rem='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
      </tr>`).join('')}
      </tbody>
    </table>`;
  qsa('button[data-rem]',wrap).forEach(btn=>{
    on(btn,'click', async ()=>{
      const row = JSON.parse(decodeURIComponent(btn.dataset.rem));
      const { error } = await supabase.rpc('remove_one_stock',{ p_product:row.product_key, p_type:row.account_type, p_duration:row.duration_code });
      if(error){ console.error(error); return alert('Remove failed'); }
      ownerRenderStocks();
    });
  });
}

async function ownerFetchRecords(){
  if(!supabase) return [];
  let { data, error } = await supabase.rpc('list_my_sales',{ p_owner: currentUUID(), p_admin: null });
  if(error){
    const res = await supabase.from('sales').select('id,product_key,account_type,created_at,expires_at,buyer_link,price,admin_id').order('id',{ascending:false}).limit(500);
    if(res.error){ console.error(res.error); return []; }
    data = res.data;
  }
  return data || [];
}
async function ownerRenderRecords(){
  const wrap = qs('#ownerRecords'); if(!wrap) return;
  wrap.innerHTML='Loading…';
  const rows = await ownerFetchRecords();
  if(!rows.length){ wrap.innerHTML = '<div class="muted">No records yet.</div>'; return; }
  const products = await fetchProducts(); const labelOf = k => products.find(p=>p.key===k)?.label || k;

  wrap.innerHTML = `
    <div class="row between">
      <div class="muted">Total: ${rows.length}</div>
      <button id="btnExportCSV" class="btn-outline">Export CSV</button>
    </div>
    <table class="table small">
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th><th>Admin</th><th>Add days</th><th>Save</th>
      </tr></thead>
      <tbody>
      ${rows.map(r=>`
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td>${labelOf(r.product_key)}</td>
          <td>${r.account_type}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td><input type="datetime-local" class="expInput" value="${r.expires_at?new Date(r.expires_at).toISOString().slice(0,16):''}"></td>
          <td><input type="text" class="buyerInput" value="${r.buyer_link||''}"></td>
          <td><input type="number" class="priceInput" step="0.01" value="${r.price??''}"></td>
          <td>${r.admin_id||''}</td>
          <td><input type="number" class="addDaysInput" min="1" placeholder="e.g. 7"></td>
          <td><button class="btn-outline saveRow">Save</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  on(qs('#btnExportCSV'),'click',()=>{
    const csv = toCSV(rows);
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='owner_records.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  qsa('button.saveRow',wrap).forEach(btn=>{
    on(btn,'click', async ()=>{
      const tr = btn.closest('tr'), id=Number(tr.dataset.id);
      const exp = qs('.expInput',tr).value ? new Date(qs('.expInput',tr).value).toISOString() : null;
      const buyer = qs('.buyerInput',tr).value || null;
      const price = qs('.priceInput',tr).value ? Number(qs('.priceInput',tr).value) : null;
      const addDays = Number(qs('.addDaysInput',tr).value||'0');
      let expires_at = exp; if(addDays>0){ const base=exp?new Date(exp):new Date(); base.setDate(base.getDate()+addDays); expires_at=base.toISOString(); }
      const { error } = await supabase.from('sales').update({ buyer_link:buyer, price, expires_at }).eq('id', id);
      if(error){ console.error(error); return alert('Save failed'); }
      ownerRenderRecords();
    });
  });
}

// ----- admin page -----
async function adminFetchAvailable(){
  if(!supabase) return [];
  let { data, error } = await supabase.from('stocks_available_for_admin').select('product_key,account_type,duration_code,total_qty').order('product_key');
  if(error){
    ({ data, error } = await supabase.from('stocks_summary').select('product_key,account_type,duration_code,total_qty').order('product_key'));
    if(error){ console.warn('no view', error); data = []; }
  }
  return data || [];
}
async function adminRenderAvailable(){
  const box = qs('#adminAvailable'); if(!box) return;
  box.innerHTML='Fetching…';
  const rows = await adminFetchAvailable();
  const products = await fetchProducts(); const labelOf = k => products.find(p=>p.key===k)?.label || k;
  box.innerHTML = `
    <div class="row between"><h3>Available Stocks</h3><button id="btnAdminRefresh" class="btn-outline">Refresh</button></div>
    <table class="table"><thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>`).join('')}</tbody></table>`;
  on(qs('#btnAdminRefresh'),'click',adminRefreshAll);
}
async function adminFillFormOptions(){
  const productSel=qs('#adminProductSelect'), typeSel=qs('#adminTypeSelect'), durSel=qs('#adminDurationSelect');
  if(!productSel||!typeSel||!durSel) return;
  const available = await adminFetchAvailable();
  const uniqProd = [...new Set(available.map(r=>r.product_key))];
  const products = await fetchProducts(); const labelOf = k=>products.find(p=>p.key===k)?.label||k;
  productSel.innerHTML = `<option value="" disabled selected>Select product</option>` + uniqProd.map(k=>`<option value="${k}">${labelOf(k)}</option>`).join('');
  on(productSel,'change', ()=>{
    const p = productSel.value, sub = available.filter(r=>r.product_key===p);
    const types=[...new Set(sub.map(r=>r.account_type))]; typeSel.innerHTML=types.map(t=>`<option value="${t}">${t}</option>`).join('');
    const durs=[...new Set(sub.map(r=>r.duration_code))]; durSel.innerHTML=durs.map(d=>`<option value="${d}">${d}</option>`).join('');
  }, { once:true });
}
async function adminGetAccount(){
  const product_key=qs('#adminProductSelect')?.value, account_type=qs('#adminTypeSelect')?.value, duration_code=qs('#adminDurationSelect')?.value;
  if(!product_key||!account_type||!duration_code) return alert('Complete the selections first.');
  const { data, error } = await supabase.rpc('get_account',{ p_admin: currentUUID(), p_product: product_key, p_type: account_type, p_duration: duration_code });
  if(error){ console.error(error); return alert('get_account failed'); }
  const r = (data && data[0]) || null;
  const out = qs('#adminCreds');
  if(out){
    if(!r) out.textContent='No stock matched.';
    else out.innerHTML = `<div class="card">
      <div><b>Product:</b> ${product_key} • <b>Type:</b> ${account_type} • <b>Duration:</b> ${duration_code}</div>
      <div><b>Email:</b> ${r.email||'-'}</div>
      <div><b>Password:</b> ${r.password||'-'}</div>
      <div><b>Profile:</b> ${r.profile_name||'-'} &nbsp; <b>PIN:</b> ${r.pin||'-'}</div>
      <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div></div>`;
  }
  await adminRefreshAll();
}
async function adminRenderMySales(){
  const wrap = qs('#adminMySales'); if(!wrap) return;
  const { data, error } = await supabase.rpc('list_my_sales',{ p_owner: null, p_admin: currentUUID() });
  if(error){ console.error(error); wrap.innerHTML='Failed to load.'; return; }
  const products = await fetchProducts(); const labelOf = k => products.find(p=>p.key===k)?.label||k;
  wrap.innerHTML = `<table class="table small"><thead><tr>
    <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th></tr></thead>
    <tbody>${data.map(r=>`<tr><td>${r.id}</td><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td><td>${r.buyer_link||''}</td><td>${r.price??''}</td></tr>`).join('')}</tbody></table>`;
}
async function adminRefreshAll(){ await adminRenderAvailable(); await adminFillFormOptions(); await adminRenderMySales(); }

// ----- login handlers exposed to index.html -----
function loginOwner(uuid){
  try { assertRole('owner', uuid); saveSession({ role:'owner', uuid }); location.href='owner.html'; }
  catch(e){ alert(e.message||'Not allowed as Owner'); }
}
function loginAdmin(uuid){
  try { assertRole('admin', uuid); saveSession({ role:'admin', uuid }); location.href='admin.html'; }
  catch(e){ alert(e.message||'Not allowed as Admin'); }
}

// ----- boot per-page -----
async function requireRole(roles){
  const s=getSession(); if(!s || !roles.includes(s.role)){ location.href='index.html'; throw new Error('not authorized'); }
  return s;
}
async function bootOwner(){
  await requireRole(['owner']); // Owner page
  on(qs('#btnLogout'),'click',()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goAdmin'),'click',()=>{ if(canGoAdmin()) location.href='admin.html'; });
  fillStaticSelectsOwner();
  await fillProductsSelect(qs('#productSelect'));
  on(qs('#addStockForm'),'submit',ownerAddStockSubmit);
  on(qs('#tabAdd'),'click',()=>showOwnerTab('add'));
  on(qs('#tabStocks'),'click',()=>showOwnerTab('stocks'));
  on(qs('#tabRecords'),'click',()=>showOwnerTab('records'));
  showOwnerTab('add'); ownerRenderStocks(); ownerRenderRecords();
}
function showOwnerTab(which){
  const panes={add:qs('#paneAdd'),stocks:qs('#paneStocks'),records:qs('#paneRecords')};
  Object.values(panes).forEach(p=>p&&(p.style.display='none')); panes[which]&&(panes[which].style.display='block');
  qsa('.tab').forEach(t=>t.classList.remove('active')); ({add:'#tabAdd',stocks:'#tabStocks',records:'#tabRecords'})[which] && qs(({add:'#tabAdd',stocks:'#tabStocks',records:'#tabRecords'})[which]).classList.add('active');
}
async function bootAdmin(){
  await requireRole(['admin','owner']); // owner can view Admin
  on(qs('#btnLogout'),'click',()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goOwner'),'click',()=>{ location.href='owner.html'; });
  await adminRenderAvailable(); await adminFillFormOptions(); await adminRenderMySales();
  on(qs('#btnGetAccount'),'click',adminGetAccount);
}

// router by marker elements on each page
(function(){
  window.__APP__ = { loginOwner, loginAdmin }; // expose for index.html
  if (qs('#ownerPage')) bootOwner();
  if (qs('#adminPage')) bootAdmin();
})();