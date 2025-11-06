(() => {
  // ─── tiny DOM helpers ────────────────────────────────────────────────────────
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const once = (el, ev, fn) => el && el.addEventListener(ev, fn, { once:true });

  // ─── config & supabase ───────────────────────────────────────────────────────
  const APP = window.APP || {};
  if (!APP.url || !APP.key) {
    alert('Missing config.js (APP.url / APP.key)');
    return;
  }
  const supabase = window.supabase?.createClient(APP.url, APP.key);

  // ─── session (no magic link) ────────────────────────────────────────────────
  const SKEY_ROLE = 'aiax.role';  // "owner" | "admin"
  const SKEY_UID  = 'aiax.uid';   // uuid
  const setSess = (role, uid) => {
    sessionStorage.setItem(SKEY_ROLE, role);
    sessionStorage.setItem(SKEY_UID, uid);
  };
  const getRole = () => sessionStorage.getItem(SKEY_ROLE);
  const getUid  = () => sessionStorage.getItem(SKEY_UID);
  const clearSess = () => { sessionStorage.removeItem(SKEY_ROLE); sessionStorage.removeItem(SKEY_UID); };

  const isOwner = (uuid) => (uuid||'').toLowerCase() === (APP.ownerId||'').toLowerCase();
  const isAdmin = (uuid) => (APP.admins||[]).map(s=>s.toLowerCase()).includes((uuid||'').toLowerCase());

  // ─── quick UI helpers ───────────────────────────────────────────────────────
  const toast = (msg) => {
    const t = $('.toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'), 1500);
  };
  const norm = (s) => (s || "").replace(/\s+/g, "").toLowerCase();
const isOwner = (uuid) => norm(uuid) === norm(APP.ownerId);
const isAdmin = (uuid) => (APP.admins || []).map(norm).includes(norm(uuid));

  const setLoading = (on) => {
    const L = $('.loading-overlay'); if (!L) return;
    L.classList.toggle('hidden', !on);
    L.style.pointerEvents = 'none';
  };
  const fillSelect = (sel, items) => {
    const el = $(sel); if (!el) return;
    el.innerHTML = '';
    for (const it of items) {
      let label, value;
      if (Array.isArray(it)) [label, value] = it;
      else if (typeof it === 'string') (label = value = it);
      else if (it && it.name) (label = value = it.name);
      else continue;
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label;
      el.appendChild(opt);
    }
  };
  const fmtDT = (d) => d ? new Date(d).toLocaleString() : '';

  // ─── options (products / account types / durations) ─────────────────────────
  async function loadProducts() {
    try {
      const { data, error } = await supabase.from('products').select('name').order('name');
      if (error) throw error;
      if (data?.length) return data.map(r => r.name);
    } catch {}
    return APP.PRODUCTS || [];
  }
  async function loadAccountTypes() {
    try {
      const { data, error } = await supabase.from('account_types').select('label').order('label');
      if (error) throw error;
      if (data?.length) return data.map(r => r.label);
    } catch {}
    return APP.ACCOUNT_TYPES || [];
  }
  async function loadDurations() {
    try {
      const { data, error } = await supabase.from('durations').select('label,code,seq').order('seq', { ascending:true });
      if (error) throw error;
      if (data?.length) return data.map(r => [r.label, r.code]);
    } catch {}
    return APP.DURATIONS || [];
  }

  async function primeOptions() {
    // show placeholders fast
    fillSelect('#productSelectOwner', [['Loading…','']]);
    fillSelect('#productSelectAdmin', [['Loading…','']]);
    fillSelect('#typeSelectOwner',   APP.ACCOUNT_TYPES || []);
    fillSelect('#typeSelectAdmin',   APP.ACCOUNT_TYPES || []);
    fillSelect('#durSelectOwner',    APP.DURATIONS || []);
    fillSelect('#durSelectAdmin',    APP.DURATIONS || []);

    // hydrate from DB if available
    const [prods, types, durs] = await Promise.all([
      loadProducts(), loadAccountTypes(), loadDurations()
    ]);

    if (prods.length) {
      fillSelect('#productSelectOwner', prods);
      fillSelect('#productSelectAdmin', prods);
    }
    if (types.length) {
      fillSelect('#typeSelectOwner', types);
      fillSelect('#typeSelectAdmin', types);
    }
    if (durs.length) {
      fillSelect('#durSelectOwner', durs);
      fillSelect('#durSelectAdmin', durs);
    }
  }

  // ─── OWNER: add stock ───────────────────────────────────────────────────────
  async function ownerAddStock() {
    const owner_uuid   = getUid();
    const product      = $('#productSelectOwner')?.value || '';
    const account_type = $('#typeSelectOwner')?.value || '';
    const duration_code= $('#durSelectOwner')?.value || '';
    const quantity     = parseInt($('#qtyOwner')?.value || '1', 10);
    const email        = $('#emailOwner')?.value.trim()   || null;
    const password     = $('#passOwner')?.value.trim()    || null;
    const profile_name = $('#profileOwner')?.value.trim() || null;
    const pin          = $('#pinOwner')?.value.trim()     || null;
    const notes        = $('#notesOwner')?.value.trim()   || null;

    if (!product)      return alert('Select a product');
    if (!account_type) return alert('Select account type');
    if (!duration_code)return alert('Select duration');
    if (!quantity || quantity < 1) return alert('Quantity must be at least 1');

    setLoading(true);
    const payload = {
      owner_uuid, product, account_type, duration_code,
      quantity, email, password, profile_name, pin, notes
    };
    const { error } = await supabase.from('stocks').insert([payload]);
    setLoading(false);

    if (error) { console.error(error); alert('Add stock failed'); return; }
    toast('Stock added');
    // reset form quickly (keep selects)
    $('#qtyOwner').value='1';
    ['emailOwner','passOwner','profileOwner','pinOwner','notesOwner'].forEach(id=>{ const i=$('#'+id); if(i) i.value=''; });

    await ownerRenderStocks();
  }

  // OWNER: stocks summary table (with Remove 1)
  async function ownerFetchStocksSummary() {
    // Prefer a summary view if you created one:
    try {
      const { data, error } = await supabase
        .from('stocks_summary')
        .select('product,account_type,duration_code,total_qty')
        .order('product');
      if (error) throw error;
      if (data?.length) return data;
    } catch {}

    // Fallback: compute from raw stocks (RLS must allow owner to see own rows)
    const { data, error } = await supabase
      .from('stocks')
      .select('product,account_type,duration_code,quantity,owner_uuid');
    if (error) { console.error(error); return []; }

    const mine = data.filter(r => r.owner_uuid?.toLowerCase() === getUid()?.toLowerCase());
    const map = new Map();
    for (const r of mine) {
      const k = `${r.product}|${r.account_type}|${r.duration_code}`;
      map.set(k, (map.get(k)||0) + (r.quantity||0));
    }
    return [...map.entries()].map(([k, qty])=>{
      const [product, account_type, duration_code] = k.split('|');
      return { product, account_type, duration_code, total_qty: qty };
    });
  }

  async function ownerRemoveOne(row) {
    // if you have RPC remove_one_stock(owner_uuid, p_product, p_type, p_duration) use it:
    try {
      const { error } = await supabase.rpc('remove_one_stock', {
        p_owner:   getUid(),
        p_product: row.product,
        p_type:    row.account_type,
        p_duration:row.duration_code
      });
      if (!error) return;
      // fallthrough to raw delete if RPC missing
    } catch {}

    // fallback: delete ONE row with qty>0 matching owner/product/type/duration
    const { error } = await supabase
      .from('stocks')
      .delete()
      .eq('owner_uuid', getUid())
      .eq('product', row.product)
      .eq('account_type', row.account_type)
      .eq('duration_code', row.duration_code)
      .gt('quantity', 0)
      .limit(1);
    if (error) { console.error(error); alert('Remove failed'); }
  }

  async function ownerRenderStocks() {
    const box = $('#ownerStocksTable'); if (!box) return;
    box.innerHTML = 'Loading…';

    const rows = await ownerFetchStocksSummary();
    if (!rows.length) { box.innerHTML = '<div class="muted">No stocks yet.</div>'; return; }

    box.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Product</th><th>Type</th><th>Duration</th><th>Qty</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${r.product}</td>
            <td>${r.account_type}</td>
            <td>${r.duration_code}</td>
            <td>${r.total_qty}</td>
            <td><button class="btn-outline rem1"
                data-row='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    `;
    $$('.rem1', box).forEach(b=>{
      b.addEventListener('click', async ()=>{
        const row = JSON.parse(decodeURIComponent(b.dataset.row||'%7B%7D'));
        if (!confirm(`Remove 1 from ${row.product} • ${row.account_type} • ${row.duration_code}?`)) return;
        setLoading(true);
        await ownerRemoveOne(row);
        setLoading(false);
        ownerRenderStocks();
      });
    });
  }

  // OWNER: records (owner sees everyone’s sales if RLS allows; otherwise add list_my_sales RPC)
  async function ownerRenderRecords() {
    const wrap = $('#ownerRecords'); if (!wrap) return;
    wrap.innerHTML = 'Loading…';
    // try RPC list_my_sales(p_owner) first
    let rows = [];
    try {
      const { data, error } = await supabase.rpc('list_my_sales', { p_owner: getUid() });
      if (error) throw error;
      rows = data || [];
    } catch {
      const { data, error } = await supabase
        .from('sales')
        .select('id,product,account_type,created_at,expires_at,price,buyer_link,admin_uuid')
        .order('id',{ascending:false}).limit(300);
      if (!error) rows = data||[];
    }

    if (!rows.length) { wrap.innerHTML = '<div class="muted">No records yet.</div>'; return; }

    wrap.innerHTML = `
      <div class="row between">
        <div class="muted">Total: ${rows.length}</div>
        <button id="btnExportCSV" class="btn-outline">Export CSV</button>
      </div>
      <table class="table small">
        <thead><tr>
          <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th>
          <th>Buyer link</th><th>Price</th><th>Got by</th>
        </tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr>
              <td>${r.id}</td>
              <td>${r.product}</td>
              <td>${r.account_type}</td>
              <td>${fmtDT(r.created_at)}</td>
              <td>${fmtDT(r.expires_at)}</td>
              <td>${r.buyer_link||''}</td>
              <td>${r.price ?? ''}</td>
              <td>${r.admin_uuid ? r.admin_uuid.slice(0,8) : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    $('#btnExportCSV')?.addEventListener('click', ()=>{
      if (!rows.length) return;
      const head = Object.keys(rows[0]);
      const esc = v => v==null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
      const csv = [head.join(','), ...rows.map(r=>head.map(k=>esc(r[k])).join(','))].join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href=url; a.download='owner_records.csv'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ─── ADMIN: available list / select options / get_account ───────────────────
  async function adminAvailable() {
    // if you created a secured view for admins, prefer it:
    try {
      const { data, error } = await supabase
        .from('stocks_available_for_admin')
        .select('product,account_type,duration_code,total_qty')
        .order('product');
      if (error) throw error;
      if (data?.length) return data;
    } catch {}

    // fallback: group from raw stocks with qty>0 (RLS must hide creds)
    const { data, error } = await supabase
      .from('stocks')
      .select('product,account_type,duration_code,quantity')
      .gt('quantity', 0);
    if (error) { console.error(error); return []; }

    const map = new Map();
    for (const r of data) {
      const k = `${r.product}|${r.account_type}|${r.duration_code}`;
      map.set(k, (map.get(k)||0) + (r.quantity||0));
    }
    return [...map.entries()].map(([k, qty])=>{
      const [product, account_type, duration_code] = k.split('|');
      return { product, account_type, duration_code, total_qty: qty };
    });
  }

  async function adminRenderAvailable() {
    const box = $('#adminAvailable'); if (!box) return;
    box.innerHTML = 'Fetching…';
    const rows = await adminAvailable();

    box.innerHTML = `
      <div class="row between">
        <h3>Available Stocks</h3>
        <button id="btnAdminRefresh" class="btn-outline">Refresh</button>
      </div>
      <table class="table">
        <thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr><td>${r.product}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
    $('#btnAdminRefresh')?.addEventListener('click', adminRefreshAll);
  }

  async function adminFillFormOptions() {
    const prodSel = $('#adminProductSelect');
    const typeSel = $('#adminTypeSelect');
    const durSel  = $('#adminDurSelect');
    if (!prodSel || !typeSel || !durSel) return;

    const avail = await adminAvailable();
    const uniq = (arr) => [...new Set(arr)];

    // products
    const products = uniq(avail.map(r=>r.product));
    fillSelect('#adminProductSelect', products.length ? products : [['No stock','']]);

    once(prodSel, 'change', ()=>{
      const p = prodSel.value;
      const sub = avail.filter(r=>r.product===p);
      fillSelect('#adminTypeSelect', uniq(sub.map(r=>r.account_type)));
      fillSelect('#adminDurSelect',  uniq(sub.map(r=>r.duration_code)));
    });
  }

  async function adminGetAccount() {
    const product  = $('#adminProductSelect')?.value;
    const type     = $('#adminTypeSelect')?.value;
    const duration = $('#adminDurSelect')?.value;
    if (!product || !type || !duration) return alert('Complete the selections first.');
    setLoading(true);
    const { data, error } = await supabase.rpc('get_account', {
      p_admin:    getUid(),
      p_product:  product,
      p_type:     type,
      p_duration: duration
    });
    setLoading(false);

    const out = $('#adminCreds');
    if (!out) return;

    if (error) {
      console.error(error);
      out.textContent = 'get_account failed.';
      return;
    }
    const r = (data && data[0]) || null;
    if (!r) { out.textContent = 'No matching stock.'; return; }

    out.innerHTML = `
      <div class="card">
        <div><b>Product:</b> ${product} • <b>Type:</b> ${type} • <b>Duration:</b> ${duration}</div>
        <div><b>Email:</b> ${r.email || '-'}</div>
        <div><b>Password:</b> ${r.password || '-'}</div>
        <div><b>Profile:</b> ${r.profile_name || '-'} &nbsp; <b>PIN:</b> ${r.pin || '-'}</div>
        <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div>
      </div>
    `;
    // reflect decremented qty + refresh admin records list
    await adminRefreshAll();
  }

  async function adminRenderMySales() {
    const wrap = $('#adminMySales'); if (!wrap) return;
    wrap.innerHTML = 'Loading…';
    try {
      const { data, error } = await supabase.rpc('list_my_sales', { p_admin: getUid() });
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) { wrap.innerHTML = '<div class="muted">No records yet.</div>'; return; }
      wrap.innerHTML = `
        <table class="table small">
          <thead><tr>
            <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${r.id}</td>
                <td>${r.product}</td>
                <td>${r.account_type}</td>
                <td>${fmtDT(r.created_at)}</td>
                <td>${fmtDT(r.expires_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error(e);
      wrap.textContent = 'Failed to load.';
    }
  }

  async function adminRefreshAll() {
    await adminRenderAvailable();
    await adminFillFormOptions();
    await adminRenderMySales();
  }
  
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
});
 function wireLogin() {
  const btnOwner = $("#btnLoginOwner");
  const btnAdmin = $("#btnLoginAdmin");

  const cardOwner = $("#ownerLoginCard");
  const cardAdmin = $("#adminLoginCard");

  const inputOwner = $("#ownerUuid");
  const inputAdmin = $("#adminUuid");

  // show input cards when clicked
  btnOwner?.addEventListener("click", () => {
    cardAdmin?.classList.add("hidden");
    cardOwner?.classList.remove("hidden");
    inputOwner?.focus();
  });

  btnAdmin?.addEventListener("click", () => {
    cardOwner?.classList.add("hidden");
    cardAdmin?.classList.remove("hidden");
    inputAdmin?.focus();
  });

  // Delegated handler so it still works if DOM is re-rendered
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#continueOwner, #continueAdmin");
    if (!t) return;
    e.preventDefault(); // stop form submit / page reload

    if (t.id === "continueOwner") {
      const id = (inputOwner?.value || "").trim();
      if (!isOwner(id)) return alert("UUID is not an Owner ID.");
      sessionStorage.setItem("role", "owner");
      sessionStorage.setItem("uid", id);
      showOwner();
      return;
    }

    if (t.id === "continueAdmin") {
      const id = (inputAdmin?.value || "").trim();
      if (!(isOwner(id) || isAdmin(id))) return alert("UUID is not an Admin ID.");
      sessionStorage.setItem("role", "admin");
      sessionStorage.setItem("uid", id);
      showAdmin();
    }
  });
}

  // top nav: go to Admin/Owner (owner only), Logout
  function wireTopNav() {
    $('#goToAdmin')?.addEventListener('click', ()=>{
      if (getRole()==='owner') { showAdmin(); adminRefreshAll(); }
    });
    $('#goToOwner')?.addEventListener('click', ()=>{
      if (getRole()==='owner') { showOwner(); ownerRenderStocks(); ownerRenderRecords(); }
    });
    $$('.btnLogout').forEach(b=>b.addEventListener('click', ()=>{
      clearSess(); showLogin();
    }));
  }

  // owner tabs
  function wireOwnerTabs() {
    const tabs = $$('.tab');
    tabs.forEach(t=>t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const target = t.dataset.target;
      $$('.tab-page').forEach(p=>p.classList.add('hidden'));
      $('#'+target)?.classList.remove('hidden');
    }));
  }

  // buttons (ensure type=button so forms don’t submit/reload)
  function ensureButtonTypes() {
    [
      '#btnLoginOwner','#btnLoginAdmin','#continueOwner','#continueAdmin',
      '#btnAddStock','#btnGetAccount','#btnAdminRefresh'
    ].forEach(sel => { const b=$(sel); if (b) b.type='button'; });
  }

  // wire owner Add Stock button
  function wireOwnerActions() {
    $('#btnAddStock')?.addEventListener('click', ownerAddStock);
  }
  // wire admin Get Account button
  function wireAdminActions() {
    $('#btnGetAccount')?.addEventListener('click', adminGetAccount);
  }

  // ─── boot ───────────────────────────────────────────────────────────────────
  async function boot() {
    setLoading(true);

    ensureButtonTypes();
    await primeOptions();

    wireLogin();
    wireTopNav();
    wireOwnerTabs();
    wireOwnerActions();
    wireAdminActions();

    const r = getRole(), u = getUid();
    if (r && u) {
      if (r==='owner') {
        showOwner();
        ownerRenderStocks();
        ownerRenderRecords();
      } else {
        showAdmin();
        adminRefreshAll();
      }
    } else {
      showLogin();
    }

    setLoading(false);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();