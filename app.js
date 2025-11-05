/* =========================
   AiaxStock Management • app.js
   ========================= */

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- tiny DOM helpers ---------- */
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
const on  = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

/* ---------- storage for pseudo-login ---------- */
const SESSION_KEY = 'aiax.session'; // {role:'owner'|'admin', uuid:'...'}
function saveSession(s){ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{ return null; } }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

/* ---------- auth helpers (no magic link; we just set the role+uuid) ---------- */
async function requireRole(roles){
  const s = getSession();
  if(!s || !roles.includes(s.role)){ location.href = 'index.html'; throw new Error('not authorized'); }
  return s;
}
function currentUUID(){ const s = getSession(); return s?.uuid || null; }

/* ---------- formatting helpers ---------- */
function fmtDT(d){ if(!d) return ''; return new Date(d).toLocaleString(); }
function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function toCSV(rows){
  if(!rows?.length) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.map(csvEscape).join(',');
  const lines = rows.map(r=>cols.map(c=>csvEscape(r[c])).join(','));
  return [head, ...lines].join('\n');
}

/* ---------- durations + account types ---------- */
const ACCOUNT_TYPES = [
  'shared profile','solo profile','shared account','solo account',
  'invitation','head','edu'
];
const DURATIONS = [
  ['7 days','7d'],['14 days','14d'],
  ['1 month','1m'],['2 months','2m'],['3 months','3m'],['4 months','4m'],
  ['5 months','5m'],['6 months','6m'],['7 months','7m'],['8 months','8m'],
  ['9 months','9m'],['10 months','10m'],['11 months','11m'],['12 months','12m'],
  ['auto-renew','auto']
];

/* ---------- PRODUCTS ---------- */
async function fetchProducts(){
  // needs RLS policy: products_read (select to authenticated, anon)
  const { data, error } = await supabase.from('products').select('key,label').order('label');
  if(error){ console.error('products error', error); return []; }
  return data || [];
}
async function fillProductsSelect(selectEl){
  const rows = await fetchProducts();
  selectEl.innerHTML = `<option value="" disabled selected>Select product</option>` +
    rows.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
}

/* ---------- OWNER: Add Stock ---------- */
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
async function ownerAddStockSubmit(e){
  e.preventDefault();
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

  // Insert into stocks (owner-scoped). Your RLS should allow owner to insert.
  const payload = { product_key, account_type, duration_code, quantity, email, password, profile_name, pin, notes };
  const { error } = await supabase.from('stocks').insert([payload]);
  if(error){ console.error(error); return alert('Add stock failed'); }

  alert('Stock added');
  e.target.reset();
  fillStaticSelectsOwner();
  await fillProductsSelect(qs('#productSelect'));
  // refresh owner tabs if visible
  ownerRenderStocks();
}

/* ---------- OWNER: Stocks summary (with remove one) ---------- */
async function fetchStocksSummaryOwner(){
  // Try server view first (stocks_summary), else compute client side
  let rows=[], error=null;
  ({ data: rows, error } = await supabase.from('stocks_summary')
    .select('product_key,account_type,duration_code,total_qty').order('product_key'));

  if(error){
    // fallback: select all stocks (owner rows only via RLS) and group in JS
    const res = await supabase.from('stocks').select('product_key,account_type,duration_code,quantity');
    if(res.error){ console.error(res.error); return []; }
    const map = new Map();
    for(const r of res.data){
      const k = `${r.product_key}|${r.account_type}|${r.duration_code}`;
      map.set(k, (map.get(k)||0) + (r.quantity||0));
    }
    rows = [...map.entries()].map(([k,qty])=>{
      const [product_key,account_type,duration_code] = k.split('|');
      return { product_key, account_type, duration_code, total_qty: qty };
    });
  }
  return rows;
}
async function ownerRenderStocks(){
  const wrap = qs('#ownerStocksTable');
  if(!wrap) return;

  wrap.innerHTML = 'Loading…';
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
            <td><button class="btn-outline" data-rem='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  qsa('button[data-rem]').forEach(btn=>{
    on(btn,'click', async ()=>{
      const row = JSON.parse(decodeURIComponent(btn.dataset.rem));
      if(!confirm(`Remove 1 from ${row.product_key} • ${row.account_type} • ${row.duration_code}?`)) return;
      // Prefer an RPC that decrements safely
      const { error } = await supabase.rpc('remove_one_stock', {
        p_product: row.product_key,
        p_type: row.account_type,
        p_duration: row.duration_code
      });
      if(error){
        console.warn('RPC remove_one_stock missing, falling back to raw delete (may fail with RLS).', error);
        // fallback: try to delete one raw row with quantity>0
        const { error: delErr } = await supabase
          .from('stocks')
          .delete()
          .eq('product_key', row.product_key)
          .eq('account_type', row.account_type)
          .eq('duration_code', row.duration_code)
          .gt('quantity', 0)
          .limit(1);
        if(delErr){ console.error(delErr); return alert('Remove failed'); }
      }
      await ownerRenderStocks();
    });
  });
}

/* ---------- OWNER: Records (editable + Add days + CSV) ---------- */
async function ownerFetchRecords(){
  // owner can see all their sales via list_my_sales(owner_uuid) or direct select with RLS
  // We try RPC first:
  let rows=[], error=null;
  ({ data: rows, error } = await supabase.rpc('list_my_sales', { p_owner: currentUUID() }));
  if(error){
    const res = await supabase.from('sales').select('id,product_key,account_type,created_at,expires_at,buyer_link,price').order('id',{ascending:false}).limit(500);
    if(res.error){ console.error(res.error); return []; }
    rows = res.data;
  }
  return rows;
}
async function ownerRenderRecords(){
  const wrap = qs('#ownerRecords');
  if(!wrap) return;

  wrap.innerHTML = 'Loading…';
  const rows = await ownerFetchRecords();
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  if(!rows.length){ wrap.innerHTML = '<div class="muted">No records yet.</div>'; return; }

  wrap.innerHTML = `
    <div class="row between">
      <div class="muted">Total: ${rows.length}</div>
      <button id="btnExportCSV" class="btn-outline">Export CSV</button>
    </div>
    <table class="table small">
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
            <td><button class="btn-outline saveRow">Save</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  on(qs('#btnExportCSV'),'click', async ()=>{
    const csv = toCSV(rows);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'owner_records.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  qsa('button.saveRow', wrap).forEach(btn=>{
    on(btn,'click', async ()=>{
      const tr = btn.closest('tr');
      const id = Number(tr.dataset.id);
      const exp = qs('.expInput', tr).value ? new Date(qs('.expInput', tr).value).toISOString() : null;
      const buyer = qs('.buyerInput', tr).value || null;
      const price = qs('.priceInput', tr).value ? Number(qs('.priceInput', tr).value) : null;
      const addDays = Number(qs('.addDaysInput', tr).value||'0');

      let expires_at = exp;
      if(addDays>0){
        const base = exp ? new Date(exp) : new Date();
        base.setDate(base.getDate()+addDays);
        expires_at = base.toISOString();
      }

      const { error } = await supabase.from('sales').update({ buyer_link: buyer, price, expires_at }).eq('id', id);
      if(error){ console.error(error); return alert('Save failed'); }
      alert('Saved');
      ownerRenderRecords();
    });
  });
}

/* ---------- ADMIN: Available Stocks + Refresh ---------- */
async function adminFetchAvailable(){
  // Prefer a dedicated view (owner-safe) named public.stocks_available_for_admin
  let rows=[], error=null;
  ({data: rows, error} = await supabase.from('stocks_available_for_admin')
    .select('product_key,account_type,duration_code,total_qty').order('product_key'));
  if(error){
    // fallback to public.stocks_summary or direct stocks (depending on your RLS)
    ({data: rows, error} = await supabase.from('stocks_summary')
      .select('product_key,account_type,duration_code,total_qty').order('product_key'));
    if(error){ console.warn('No admin-safe view; falling back may fail with RLS.', error); rows = []; }
  }
  return rows;
}
async function adminRenderAvailable(){
  const box = qs('#adminAvailable');
  if(!box) return;

  box.innerHTML = 'Fetching…';
  const rows = await adminFetchAvailable();
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  box.innerHTML = `
    <div class="row between">
      <h3>Available Stocks</h3>
      <button id="btnAdminRefresh" class="btn-outline">Refresh</button>
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
async function adminRefreshAll(){
  await adminRenderAvailable();
  await adminFillFormOptions();
  await adminRenderMySales();
}

/* ---------- ADMIN: Get Account (filtered by in-stock) ---------- */
async function adminFillFormOptions(){
  // Only products/types that are currently in-stock
  const productSel = qs('#adminProductSelect');
  const typeSel    = qs('#adminTypeSelect');
  const durSel     = qs('#adminDurationSelect');
  if(!productSel || !typeSel || !durSel) return;

  const available = await adminFetchAvailable();

  // products
  const uniqProd = [...new Set(available.map(r=>r.product_key))];
  const products = await fetchProducts();
  const labelOf  = (key)=> products.find(p=>p.key===key)?.label || key;
  productSel.innerHTML = `<option value="" disabled selected>Select product</option>` +
    uniqProd.map(k=>`<option value="${k}">${labelOf(k)}</option>`).join('');

  // when product changes, types and durations shrink to what’s available for that product
  on(productSel,'change', ()=>{
    const p = productSel.value;
    const sub = available.filter(r=>r.product_key===p);

    const types = [...new Set(sub.map(r=>r.account_type))];
    typeSel.innerHTML = types.map(t=>`<option value="${t}">${t}</option>`).join('');

    const durs = [...new Set(sub.map(r=>r.duration_code))];
    durSel.innerHTML = durs.map(d=>`<option value="${d}">${d}</option>`).join('');
  }, { once:true }); // will re-bind on refresh
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
  // Expecting a single row with credentials + expiry
  const r = (data&&data[0]) || null;
  const out = qs('#adminCreds');
  if(out){
    if(!r){ out.textContent = 'No stock matched.'; }
    else {
      out.innerHTML = `
        <div class="card">
          <div><b>Email:</b> ${r.email||'-'}</div>
          <div><b>Password:</b> ${r.password||'-'}</div>
          <div><b>Profile:</b> ${r.profile_name||'-'} &nbsp; <b>PIN:</b> ${r.pin||'-'}</div>
          <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div>
        </div>
      `;
    }
  }
  await adminRefreshAll(); // decrement reflected
}

/* ---------- ADMIN: My Buyers Record ---------- */
async function adminRenderMySales(){
  const wrap = qs('#adminMySales');
  if(!wrap) return;
  const { data, error } = await supabase.rpc('list_my_sales', { p_admin: currentUUID() });
  if(error){ console.error(error); wrap.innerHTML='Failed to load.'; return; }
  const products = await fetchProducts();
  const labelOf = (key)=> products.find(p=>p.key===key)?.label || key;

  wrap.innerHTML = `
    <table class="table small">
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

/* ---------- Login page (inline inputs) ---------- */
function bootLogin(){
  const ownerIn = qs('#ownerUUIDInput');
  const adminIn = qs('#adminUUIDInput');
  const btnOwner = qs('#btnOwnerLogin');
  const btnAdmin = qs('#btnAdminLogin');

  on(btnOwner,'click', async ()=>{
    const uuid = ownerIn.value.trim();
    if(!uuid) return alert('Enter owner UUID');
    saveSession({ role:'owner', uuid });
    location.href = 'owner.html';
  });
  on(btnAdmin,'click', async ()=>{
    const uuid = adminIn.value.trim();
    if(!uuid) return alert('Enter admin UUID');
    saveSession({ role:'admin', uuid });
    location.href = 'admin.html';
  });
}

/* ---------- Owner page boot ---------- */
async function bootOwner(){
  await requireRole(['owner']); // only owner, but owner can still go to Admin via link
  // nav
  on(qs('#btnLogout'), 'click', ()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goAdmin'), 'click', ()=>{ location.href='admin.html'; });

  // Add Stock
  fillStaticSelectsOwner();
  await fillProductsSelect(qs('#productSelect'));
  on(qs('#addStockForm'), 'submit', ownerAddStockSubmit);

  // Tabs
  on(qs('#tabAdd'),    'click', ()=>showOwnerTab('add'));
  on(qs('#tabStocks'), 'click', ()=>showOwnerTab('stocks'));
  on(qs('#tabRecords'),'click', ()=>showOwnerTab('records'));

  showOwnerTab('add'); // default
  ownerRenderStocks();
  ownerRenderRecords();
}
function showOwnerTab(which){
  const panes = { add: qs('#paneAdd'), stocks: qs('#paneStocks'), records: qs('#paneRecords') };
  Object.values(panes).forEach(p=>p && (p.style.display='none'));
  panes[which] && (panes[which].style.display='block');

  qsa('.tab').forEach(t=>t.classList.remove('active'));
  const map = { add:'#tabAdd', stocks:'#tabStocks', records:'#tabRecords' };
  qs(map[which])?.classList.add('active');
}

/* ---------- Admin page boot ---------- */
async function bootAdmin(){
  await requireRole(['admin','owner']); // owner is allowed to view admin page per your last request? (If not, change to ['admin'])
  on(qs('#btnLogout'), 'click', ()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goOwner'),  'click', ()=>{ location.href='owner.html'; });

  await adminRenderAvailable();
  await adminFillFormOptions();
  await adminRenderMySales();

  on(qs('#btnGetAccount'),'click', adminGetAccount);
}

/* ---------- Router ---------- */
(function(){
  // detect page by body data-attr or existing elements
  if(qs('#loginPage'))  return bootLogin();
  if(qs('#ownerPage'))  return bootOwner();
  if(qs('#adminPage'))  return bootAdmin();
})();