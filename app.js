/* =========================
   AiaxStock Management • app.js
   ========================= */

// ---- Supabase client
const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- tiny DOM helpers
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
const on  = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

// ---- pseudo-login in localStorage
const SESSION_KEY = 'aiax.session'; // {role:'owner'|'admin', uuid:'...'}
const saveSession   = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const getSession    = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } };
const clearSession  = () => localStorage.removeItem(SESSION_KEY);

async function requireRole(roles){
  const s = getSession();
  if(!s || !roles.includes(s.role)){ location.href = 'index.html'; throw new Error('not authorized'); }
  // extra guard: validate UUID vs config
  if(s.role === 'owner' && s.uuid !== OWNER_UUID){ clearSession(); location.href='index.html'; throw new Error('owner uuid mismatch'); }
  if(s.role === 'admin' && !ADMIN_UUIDS.includes(s.uuid)){ clearSession(); location.href='index.html'; throw new Error('admin uuid mismatch'); }
  return s;
}
const currentUUID = () => getSession()?.uuid || null;

// ---- misc helpers
const fmtDT = d => d ? new Date(d).toLocaleString() : '';
const csvEscape = v => v==null ? '' : ( /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v) );
function toCSV(rows){
  if(!rows?.length) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.map(csvEscape).join(',');
  const lines = rows.map(r=>cols.map(c=>csvEscape(r[c])).join(','));
  return [head, ...lines].join('\n');
}
// map duration code -> label
function durationLabel(code){
  if(!code) return '';
  if(code === 'auto') return 'auto-renew';
  if(/^\d+d$/.test(code)) return code.replace('d',' days');
  if(/^\d+m$/.test(code)) return code.replace('m',' months');
  return code;
}
// ---- durations & account types (including your extra choices)
const ACCOUNT_TYPES = [
  'shared profile','solo profile','shared account','solo account','invitation','head','edu'
];
const DURATIONS = [
  ['7 days','7d'],['14 days','14d'],
  ['1 month','1m'],['2 months','2m'],['3 months','3m'],['4 months','4m'],
  ['5 months','5m'],['6 months','6m'],['7 months','7m'],['8 months','8m'],
  ['9 months','9m'],['10 months','10m'],['11 months','11m'],['12 months','12m'],
  ['auto-renew','auto']
];

// ---- products
async function fetchProducts(){
  try{
    const { data, error } = await supabase.from('products').select('key,label').order('label');
    if(error) throw error;
    return data || [];
  }catch(e){ console.error('products error', e); return []; }
}
async function fillProductsSelect(selectEl){
  if(!selectEl) return;
  const rows = await fetchProducts();
  selectEl.innerHTML = `<option value="" disabled selected>Select product</option>` +
    rows.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
}

// ================= OWNER =================
function fillStaticSelectsOwner(){
  const typeSel = qs('#typeSelect');
  const durSel  = qs('#durationSelect');
  if(typeSel){
    typeSel.innerHTML = ACCOUNT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
  }
  if(durSel){
    durSel.innerHTML = DURATIONS.map(([l,v])=>`<option value="${v}">${l}</option>`).join('');
  }
}

// DROP-IN REPLACEMENT
async function ownerAddStockSubmit(e){
  e.preventDefault();

  const product_key   = qs('#productSelect')?.value;
  const account_type  = qs('#typeSelect')?.value;
  const duration_val  = qs('#durationSelect')?.value;   // e.g. '7d','1m','auto'
  const quantity      = parseInt(qs('#qtyInput')?.value || '1', 10);

  const email         = qs('#emailInput')?.value.trim() || null;
  const password      = qs('#passInput')?.value.trim() || null;
  const profile_name  = qs('#profileInput')?.value.trim() || null;
  const pin           = qs('#pinInput')?.value.trim() || null;
  const notes         = qs('#notesInput')?.value.trim() || null;

  if(!product_key)   return alert('Please select a product');
  if(!account_type)  return alert('Please select account type');
  if(!duration_val)  return alert('Please select duration');
  if(quantity < 1)   return alert('Quantity must be at least 1');

  // base fields
  const base = {
    product_key, account_type, quantity,
    email, password, profile_name, pin, notes,
    owner_id: currentUUID()
  };

  // Try 1: duration_choice
  let { error } = await supabase.from('stocks').insert([{
    ...base, duration_choice: duration_val
  }]);

  // If the column name is different, retry as duration_code
  if (error && /duration_choice/i.test(error.message || '')) {
    const res2 = await supabase.from('stocks').insert([{
      ...base, duration_code: duration_val
    }]);
    error = res2.error;
  }

  if (error) {
    console.error('add stock error:', error);
    return alert('Add stock failed: ' + (error.message || ''));
  }

  alert('Stock added');
  e.target.reset();
  fillStaticSelectsOwner();
  await fillProductsSelect(qs('#productSelect'));
  ownerRenderStocks();
}
async function fetchStocksSummaryOwner(){
  try{
    let { data, error } = await supabase.from('stocks_summary')
      .select('product_key,account_type,duration_code,total_qty').order('product_key');
    if(error) throw error;
    return data||[];
  }catch(err){
    // fallback: group client-side
    try{
      const res = await supabase.from('stocks').select('product_key,account_type,duration_code,quantity');
      if(res.error) throw res.error;
      const map = new Map();
      for(const r of res.data){
        const k = `${r.product_key}|${r.account_type}|${r.duration_code}`;
        map.set(k, (map.get(k)||0) + (r.quantity||0));
      }
      return [...map.entries()].map(([k,qty])=>{
        const [product_key,account_type,duration_code] = k.split('|');
        return { product_key, account_type, duration_code, total_qty: qty };
      });
    }catch(e){ console.error(e); return []; }
  }
}

async function ownerRenderStocks(){
  const wrap = qs('#ownerStocksTable');
  if(!wrap) return;

  wrap.textContent = 'Loading…';
  const rows = await fetchStocksSummaryOwner();
  if(!rows.length){ wrap.innerHTML = '<div class="muted">No stocks yet.</div>'; return; }

  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  wrap.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Product</th><th>Type</th><th>Duration</th><th>Qty</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${labelOf(r.product_key)}</td>
            <td>${r.account_type}</td>
            <td>${r.duration_code}</td>
            <td>${r.total_qty}</td>
            <td><button class="btn" style="padding:6px 10px" data-rem='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  qsa('button[data-rem]', wrap).forEach(btn=>{
    on(btn,'click', async ()=>{
      const row = JSON.parse(decodeURIComponent(btn.dataset.rem));
      if(!confirm(`Remove 1 from ${row.product_key} • ${row.account_type} • ${row.duration_code}?`)) return;
      // Preferred: server rpc remove_one_stock
      let { error } = await supabase.rpc('remove_one_stock', {
        p_product: row.product_key,
        p_type: row.account_type,
        p_duration: row.duration_code
      });
      if(error){
        // fallback delete (subject to RLS)
        const res = await supabase.from('stocks')
          .delete()
          .eq('product_key', row.product_key)
          .eq('account_type', row.account_type)
          .eq('duration_code', row.duration_code)
          .gt('quantity', 0)
          .limit(1);
        if(res.error){ console.error(res.error); return alert('Remove failed'); }
      }
      ownerRenderStocks();
    });
  });
}

async function ownerFetchRecords(){
  try{
    const { data, error } = await supabase.rpc('list_my_sales', { p_owner: currentUUID() });
    if(error) throw error;
    return data||[];
  }catch{
    const res = await supabase
  .from('sales')
  .select('id,product_key,account_type,created_at,expires_at,buyer_link,price,admin_id')
  .order('id',{ascending:false})
  .limit(500);
  }
}

async function ownerRenderRecords(){
  const wrap = qs('#ownerRecords');
  if(!wrap) return;

  wrap.textContent = 'Loading…';
  const rows = await ownerFetchRecords();
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  if(!rows.length){ wrap.innerHTML = '<div class="muted">No records yet.</div>'; return; }

  wrap.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="muted">Total: ${rows.length}</div>
      <button id="btnExportCSV" class="btn">Export CSV</button>
    </div>
    <table class="table">
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th><th>Add days</th><th>Save</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr data-id="${r.id}">
            <td>${r.id}</td>
            <td>${labelOf(r.product_key)}</td>
            <td>${r.account_type}</td>
            <td>${fmtDT(r.created_at)}</td>
            <td><input type="datetime-local" class="expInput" value="${r.expires_at? new Date(r.expires_at).toISOString().slice(0,16):''}"></td>
            <td><input type="text" class="buyerInput" value="${r.buyer_link||''}"></td>
            <td><input type="number" class="priceInput" step="0.01" value="${r.price??''}"></td>
            <td><input type="number" class="addDaysInput" min="1" placeholder="e.g. 7"></td>
            <td><button class="btn saveRow" style="padding:6px 10px">Save</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  on(qs('#btnExportCSV'),'click', ()=>{
    const csv = toCSV(rows);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'owner_records.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  qsa('button.saveRow', wrap).forEach(btn=>{
    on(btn,'click', async ()=>{
      const tr = btn.closest('tr');
      const id = Number(tr.dataset.id);
      const expVal = qs('.expInput', tr).value;
      const buyer = qs('.buyerInput', tr).value || null;
      const price = qs('.priceInput', tr).value ? Number(qs('.priceInput', tr).value) : null;
      const addDays = Number(qs('.addDaysInput', tr).value||'0');

      let expires_at = expVal ? new Date(expVal) : null;
      if(addDays>0){
        const base = expires_at ? new Date(expires_at) : new Date();
        base.setDate(base.getDate()+addDays);
        expires_at = base;
      }
      const payload = { buyer_link: buyer, price, expires_at: expires_at ? expires_at.toISOString() : null };
      const { error } = await supabase.from('sales').update(payload).eq('id', id);
      if(error){ console.error(error); return alert('Save failed'); }
      alert('Saved');
      ownerRenderRecords();
    });
  });
}

// ================= ADMIN =================
async function adminFetchAvailable(){
  try{
    let { data, error } = await supabase.from('stocks_available_for_admin')
      .select('product_key,account_type,duration_code,total_qty').order('product_key');
    if(error) throw error;
    return data||[];
  }catch{
    try{
      let { data, error } = await supabase.from('stocks_summary')
        .select('product_key,account_type,duration_code,total_qty').order('product_key');
      if(error) throw error;
      return data||[];
    }catch(e){ console.warn('admin available fetch failed', e); return []; }
  }
}

async function adminRenderAvailable(){
  const box = qs('#adminAvailable');
  if(!box) return;

  box.textContent = 'Fetching…';
  const rows = await adminFetchAvailable();
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  box.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Available Stocks</h3>
      <button id="btnAdminRefresh" class="btn">Refresh</button>
    </div>
    <table class="table">
      <thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>
        `).join('')}
      </tbody>
    </table>
  `;
  on(qs('#btnAdminRefresh'), 'click', adminRefreshAll);
}

async function adminFillFormOptions(){
  const productSel = qs('#adminProductSelect');
  const typeSel    = qs('#adminTypeSelect');
  const durSel     = qs('#adminDurationSelect');
  if(!productSel || !typeSel || !durSel) return;

  const available = await adminFetchAvailable();
  const uniqProd = [...new Set(available.map(r=>r.product_key))];
  const products = await fetchProducts();
  const labelOf  = (key)=> products.find(p=>p.key===key)?.label || key;

  productSel.innerHTML = `<option value="" disabled selected>Select product</option>` +
    uniqProd.map(k=>`<option value="${k}">${labelOf(k)}</option>`).join('');

  on(productSel,'change', ()=>{
    const p = productSel.value;
    const sub = available.filter(r=>r.product_key===p);

    const types = [...new Set(sub.map(r=>r.account_type))];
    typeSel.innerHTML = `<option value="" disabled selected>Select type</option>` +
      types.map(t=>`<option value="${t}">${t}</option>`).join('');

    const durs = [...new Set(sub.map(r=>r.duration_code))];
    durSel.innerHTML = `<option value="" disabled selected>Select duration</option>` +
      durs.map(d=>`<option value="${d}">${d}</option>`).join('');
  }, { once:true });
}

async function adminGetAccount(){
  const product_key  = qs('#adminProductSelect')?.value;
  const account_type = qs('#adminTypeSelect')?.value;
  const duration_code= qs('#adminDurationSelect')?.value;
  if(!product_key || !account_type || !duration_code) return alert('Complete the selections first.');

  const { data, error } = await supabase.rpc('get_account', {
    p_admin: currentUUID(),
    p_product: product_key,
    p_type: account_type,
    p_duration: duration_code
  });
  if(error){ console.error(error); return alert('get_account failed'); }

  const r = (data&&data[0]) || null;
  // ...after: const r = (data&&data[0]) || null;
const out = qs('#adminCreds');
const products = await fetchProducts();
const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

if(out){
  if(!r){ out.textContent = 'No stock matched.'; }
  else {
    out.innerHTML = `
      <div class="card">
        <div style="margin-bottom:6px;">
          <b>${labelOf(product_key)}</b> • ${account_type} • ${durationLabel(r.duration_code || duration_code)}
        </div>
        <div><b>Email:</b> ${r.email || '-'}</div>
        <div><b>Password:</b> ${r.password || '-'}</div>
        <div><b>Profile:</b> ${r.profile_name || '-'} &nbsp; <b>PIN:</b> ${r.pin || '-'}</div>
        <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div>
      </div>
    `;
  }
}
  adminRefreshAll(); // reflect stock decrement
}

async function adminRenderMySales(){
  const wrap = qs('#adminMySales');
  if(!wrap) return;
  const { data, error } = await supabase.rpc('list_my_sales', { p_admin: currentUUID() });
  if(error){ console.error(error); wrap.innerHTML='Failed to load.'; return; }
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  wrap.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th>
      </tr></thead>
      <tbody>
        ${data.map(r=>`
          <tr>
            <td>${r.id}</td>
            <td>${labelOf(r.product_key)}</td>
            <td>${r.account_type}</td>
            <td>${fmtDT(r.created_at)}</td>
            <td>${fmtDT(r.expires_at)}</td>
            <td>${r.buyer_link||''}</td>
            <td>${r.price??''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function adminRefreshAll(){
  await adminRenderAvailable();
  await adminFillFormOptions();
  await adminRenderMySales();
}

// ================= PUBLIC API for index.html =================
window.__APP__ = {
  loginWithUid(role, uuid){
    if(!uuid) return alert('UUID required');
    // hard validation vs config
    if(role === 'owner'){
      if(uuid !== OWNER_UUID) return alert('Invalid OWNER UUID');
    }else if(role === 'admin'){
      if(!ADMIN_UUIDS.includes(uuid)) return alert('Invalid ADMIN UUID');
    }else{
      return alert('Invalid role');
    }
    saveSession({ role, uuid });
    location.href = role === 'owner' ? 'owner.html' : 'admin.html';
  }
};

// ================= Router (after DOM ready) =================
document.addEventListener('DOMContentLoaded', ()=>{
  if(!supabase){ alert('Supabase not loaded'); return; }
  if(qs('#loginPage'))  {
    // show/hide forms
    on(qs('#btnOwner'), 'click', ()=>{
      qs('#formOwner').style.display='block';
      qs('#formAdmin').style.display='none';
      qs('#ownerUUID').focus();
    });
    on(qs('#btnAdmin'), 'click', ()=>{
      qs('#formAdmin').style.display='block';
      qs('#formOwner').style.display='none';
      qs('#adminUUID').focus();
    });
    // submit handlers
    on(qs('#formOwner'),'submit', (e)=>{
      e.preventDefault();
      window.__APP__.loginWithUid('owner', qs('#ownerUUID').value.trim());
    });
    on(qs('#formAdmin'),'submit', (e)=>{
      e.preventDefault();
      window.__APP__.loginWithUid('admin', qs('#adminUUID').value.trim());
    });
    return;
  }
  if(qs('#ownerPage'))  {
    requireRole(['owner']).then(()=>{
      on(qs('#btnLogout'), 'click', ()=>{ clearSession(); location.href='index.html'; });
      on(qs('#goAdmin'),  'click', ()=>{ location.href='admin.html'; });

      fillStaticSelectsOwner();
      fillProductsSelect(qs('#productSelect'));
      on(qs('#addStockForm'), 'submit', ownerAddStockSubmit);

      on(qs('#tabAdd'),     'click', ()=>showOwnerTab('add'));
      on(qs('#tabStocks'),  'click', ()=>showOwnerTab('stocks'));
      on(qs('#tabRecords'), 'click', ()=>showOwnerTab('records'));

      showOwnerTab('add');
      ownerRenderStocks();
      ownerRenderRecords();
    });
    return;
  }
  if(qs('#adminPage'))  {
    requireRole(['admin']).then(()=>{
      on(qs('#btnLogout'), 'click', ()=>{ clearSession(); location.href='index.html'; });
      on(qs('#goOwner'),  'click', ()=>{ location.href='owner.html'; });

      adminRefreshAll();
      on(qs('#btnGetAccount'),'click', adminGetAccount);
    });
  }
});

function showOwnerTab(which){
  const panes = { add: qs('#paneAdd'), stocks: qs('#paneStocks'), records: qs('#paneRecords') };
  Object.values(panes).forEach(p=>p && (p.style.display='none'));
  panes[which] && (panes[which].style.display='block');

  qsa('.tab').forEach(t=>t.classList.remove('active'));
  const map = { add:'#tabAdd', stocks:'#tabStocks', records:'#tabRecords' };
  qs(map[which])?.classList.add('active');
}