/* app.js — AiaxStock (full) */
(() => {
  // ── Tiny DOM helpers ───────────────────────────────────────────
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const once = (el, ev, fn) => el && el.addEventListener(ev, fn, { once:true });

  // ── Config & Supabase ──────────────────────────────────────────
  const APP = window.APP || {};
  if (!APP.url || !APP.key) { alert('Missing config.js'); return; }
  const supabase = window.supabase?.createClient(APP.url, APP.key);

  // ── Session (no magic link) ────────────────────────────────────
  const SKEY_ROLE = 'aiax.role';
  const SKEY_UID  = 'aiax.uid';
  const setSess = (role, uid) => { sessionStorage.setItem(SKEY_ROLE, role); sessionStorage.setItem(SKEY_UID, uid); };
  const getRole = () => sessionStorage.getItem(SKEY_ROLE);
  const getUid  = () => sessionStorage.getItem(SKEY_UID);
  const clearSess = () => { sessionStorage.removeItem(SKEY_ROLE); sessionStorage.removeItem(SKEY_UID); };

  // Normalized ID checks (single definitions only)
  const norm = (s) => (s || "").replace(/\s+/g, "").toLowerCase();
  const isOwner = (uuid) => norm(uuid) === norm(APP.ownerId);
  const isAdmin = (uuid) => (APP.admins || []).map(norm).includes(norm(uuid));

  // ── UI helpers ─────────────────────────────────────────────────
  const toast = (msg) => { const t=$('.toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500); };
  const setLoading = (on) => { const L=$('.loading-overlay'); if(!L) return; L.classList.toggle('hidden', !on); L.style.pointerEvents='none'; };
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

  // ── Options (products/types/durations) ─────────────────────────
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
    // fast placeholders
    fillSelect('#productSelectOwner', [['Loading…','']]);
    fillSelect('#productSelectAdmin', [['Loading…','']]);
    fillSelect('#typeSelectOwner',   APP.ACCOUNT_TYPES || []);
    fillSelect('#typeSelectAdmin',   APP.ACCOUNT_TYPES || []);
    fillSelect('#durSelectOwner',    APP.DURATIONS || []);
    fillSelect('#durSelectAdmin',    APP.DURATIONS || []);

    // hydrate from DB if available
    const [prods, types, durs] = await Promise.all([loadProducts(), loadAccountTypes(), loadDurations()]);
    if (prods.length) { fillSelect('#productSelectOwner', prods); fillSelect('#productSelectAdmin', prods); }
    if (types.length) { fillSelect('#typeSelectOwner', types);   fillSelect('#typeSelectAdmin', types); }
    if (durs.length)  { fillSelect('#durSelectOwner', durs);     fillSelect('#durSelectAdmin', durs); }
  }

  // ── OWNER: Add stock ───────────────────────────────────────────
  async function ownerAddStock() {
    const owner_uuid   = getUid();
    const product      = $('#productSelectOwner')?.value || '';
    const account_type = $('#typeSelectOwner')?.value || '';
    const duration_code= $('#durSelectOwner')?.value || '';
    const quantity     = parseInt($('#oaQty')?.value || '1', 10);
    const email        = $('#oaEmail')?.value.trim()   || null;
    const password     = $('#oaPass')?.value.trim()    || null;
    const profile_name = $('#oaProfile')?.value.trim() || null;
    const pin          = $('#oaPin')?.value.trim()     || null;
    const notes        = $('#oaNotes')?.value.trim()   || null;

    if (!product)       return alert('Select a product');
    if (!account_type)  return alert('Select account type');
    if (!duration_code) return alert('Select duration');
    if (!quantity || quantity < 1) return alert('Quantity must be at least 1');

    setLoading(true);
    const payload = { owner_uuid, product, account_type, duration_code, quantity, email, password, profile_name, pin, notes };
    const { error } = await supabase.from('stocks').insert([payload]);
    setLoading(false);

    if (error) { console.error(error); alert('Add stock failed'); return; }
    toast('Stock added');
    $('#oaQty').value='1';
    ['oaEmail','oaPass','oaProfile','oaPin','oaNotes'].forEach(id=>{ const i=$('#'+id); if(i) i.value=''; });
    await ownerRenderStocks();
  }

  // OWNER: list/summary
  async function ownerFetchStocksSummary() {
    try {
      const { data, error } = await supabase
        .from('stocks_summary') // optional materialized view
        .select('product,account_type,duration_code,total_qty')
        .order('product');
      if (error) throw error;
      if (data?.length) return data;
    } catch {}

    const { data, error } = await supabase
      .from('stocks')
      .select('product,account_type,duration_code,quantity,owner_uuid');
    if (error) { console.error(error); return []; }

    const mine = data.filter(r => norm(r.owner_uuid) === norm(getUid()));
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
    try {
      const { error } = await supabase.rpc('remove_one_stock', {
        p_owner:   getUid(),
        p_product: row.product,
        p_type:    row.account_type,
        p_duration:row.duration_code
      });
      if (!error) return;
    } catch {}
    // fallback: delete 1 row (if you keep 1 row per unit)
    const { error } = await supabase
      .from('stocks')
      .delete()
      .eq('owner_uuid', getUid())
      .eq('product', row.product)
      .eq('account_type', row.account_type)
      .eq('duration_code', row.duration_code)
      .gt('quantity', 0)
      .limit(1);
    if (error) console.error(error);
  }

  async function ownerRenderStocks() {
    const table = $('#ownerStocksTable'); if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

    const rows = await ownerFetchStocksSummary();
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted">No stocks yet.</td></tr>`; return; }

    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.product}</td>
        <td>${r.account_type}</td>
        <td>${r.duration_code}</td>
        <td>${r.total_qty}</td>
        <td><button class="btn btn-ghost rem1" data-row='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
      </tr>
    `).join('');

    $$('.rem1', tbody).forEach(b=>{
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

  // OWNER: records
  async function ownerRenderRecords() {
    const table = $('#ownerRecordsTable'); if (!table) return;
    const tbody = table.querySelector('tbody'); if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="9">Loading…</td></tr>`;

    let rows = [];
    try {
      const { data, error } = await supabase.rpc('list_my_sales', { p_owner: getUid() });
      if (error) throw error; rows = data || [];
    } catch {
      const { data, error } = await supabase
        .from('sales')
        .select('id,product,account_type,created_at,expires_at,admin_uuid,warranty,voided')
        .order('id',{ascending:false}).limit(300);
      if (!error) rows = data || [];
    }

    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9" class="muted">No records yet.</td></tr>`; return; }

    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.id}</td>
        <td>${r.product}</td>
        <td>${r.account_type}</td>
        <td>${fmtDT(r.created_at)}</td>
        <td>${fmtDT(r.expires_at)}</td>
        <td>${r.admin_uuid ? r.admin_uuid.slice(0,8) : ''}</td>
        <td>${r.warranty ? '✅' : ''}</td>
        <td>${r.voided ? '❌' : ''}</td>
        <td></td>
      </tr>
    `).join('');
  }

  // ── ADMIN: available + form options + get_account ─────────────
  async function adminAvailable() {
    try {
      const { data, error } = await supabase
        .from('stocks_available_for_admin')
        .select('product,account_type,duration_code,total_qty')
        .order('product');
      if (error) throw error;
      if (data?.length) return data;
    } catch {}

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
    const tbody = $('#adminStocksBody'); if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4">Fetching…</td></tr>`;
    const rows = await adminAvailable();
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4" class="muted">No data yet</td></tr>`; return; }
    tbody.innerHTML = rows.map(r=>`
      <tr><td>${r.product}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>
    `).join('');
  }

  async function adminFillFormOptions() {
    const prodSel = '#productSelectAdmin';
    const typeSel = '#typeSelectAdmin';
    const durSel  = '#durSelectAdmin';

    const avail = await adminAvailable();
    if (!avail.length) { fillSelect(prodSel, [['No stock','']]); fillSelect(typeSel, []); fillSelect(durSel, []); return; }

    const uniq = (arr) => [...new Set(arr)];
    const products = uniq(avail.map(r=>r.product));
    fillSelect(prodSel, products);

    // cascade on change
    const ps = $(prodSel);
    const setSub = () => {
      const p = ps.value;
      const sub = avail.filter(r=>r.product===p);
      fillSelect(typeSel, uniq(sub.map(r=>r.account_type)));
      fillSelect(durSel,  uniq(sub.map(r=>r.duration_code)));
    };
    setSub();
    once(ps, 'change', setSub);
  }

  async function adminGetAccount() {
    const product  = $('#productSelectAdmin')?.value;
    const type     = $('#typeSelectAdmin')?.value;
    const duration = $('#durSelectAdmin')?.value;
    if (!product || !type || !duration) return alert('Complete the selections first.');

    setLoading(true);
    const { data, error } = await supabase.rpc('get_account', {
      p_admin:    getUid(),
      p_product:  product,
      p_type:     type,
      p_duration: duration
    });
    setLoading(false);

    const out = $('#adminCreds'); if (!out) return;
    if (error) { console.error(error); out.textContent='get_account failed.'; return; }

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
    await adminRefreshAll();
  }

  async function adminRenderMySales() {
    const table = $('#adminRecordsTable'); if (!table) return;
    const tbody = table.querySelector('tbody'); if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    try {
      const { data, error } = await supabase.rpc('list_my_sales', { p_admin: getUid() });
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted">No records yet.</td></tr>`; return; }
      tbody.innerHTML = rows.map(r=>`
        <tr>
          <td>${r.id}</td>
          <td>${r.product}</td>
          <td>${r.account_type}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td>${fmtDT(r.expires_at)}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="5">Failed to load.</td></tr>`;
    }
  }

  async function adminRefreshAll() {
    await adminRenderAvailable();
    await adminFillFormOptions();
    await adminRenderMySales();
  }

  // ── Login wiring (delegated) ───────────────────────────────────
  function wireLogin() {
    const btnOwner = $("#btnLoginOwner");
    const btnAdmin = $("#btnLoginAdmin");
    const cardOwner = $("#ownerLoginCard");
    const cardAdmin = $("#adminLoginCard");
    const inputOwner = $("#ownerUuid");
    const inputAdmin = $("#adminUuid");

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

    document.addEventListener("click", (e) => {
      const t = e.target.closest("#continueOwner, #continueAdmin");
      if (!t) return;
      e.preventDefault();

      if (t.id === "continueOwner") {
        const id = (inputOwner?.value || "").trim();
        if (!isOwner(id)) return alert("UUID is not an Owner ID.");
        setSess('owner', id);
        showOwner();
        ownerRenderStocks();
        ownerRenderRecords();
        return;
      }
      if (t.id === "continueAdmin") {
        const id = (inputAdmin?.value || "").trim();
        if (!(isOwner(id) || isAdmin(id))) return alert("UUID is not an Admin ID.");
        setSess('admin', id);
        showAdmin();
        adminRefreshAll();
      }
    });
  }

  // ── Top nav / tabs / buttons ───────────────────────────────────
  function wireTopNav() {
    $('#goToAdmin')?.addEventListener('click', ()=>{ if (getRole()==='owner') { showAdmin(); adminRefreshAll(); }});
    $('#goToOwner')?.addEventListener('click', ()=>{ if (getRole()==='owner') { showOwner(); ownerRenderStocks(); ownerRenderRecords(); }});
    $$('.btnLogout').forEach(b=>b.addEventListener('click', ()=>{ clearSess(); showLogin(); }));
  }
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
  function ensureButtonTypes() {
    ['#btnLoginOwner','#btnLoginAdmin','#continueOwner','#continueAdmin',
     '#oaAddBtn','#getAccountBtn','#btnAdminRefresh'
    ].forEach(sel => { const b=$(sel); if (b) b.type='button'; });
  }
  function wireOwnerActions() { $('#oaAddBtn')?.addEventListener('click', ownerAddStock); }
  function wireAdminActions() { $('#getAccountBtn')?.addEventListener('click', adminGetAccount); }

  // ── Views ──────────────────────────────────────────────────────
  function showLogin() { $("#viewLogin")?.classList.remove("hidden"); $("#viewOwner")?.classList.add("hidden"); $("#viewAdmin")?.classList.add("hidden"); $("#ownerLoginCard")?.classList.add("hidden"); $("#adminLoginCard")?.classList.add("hidden"); }
  function showOwner() { $("#viewLogin")?.classList.add("hidden"); $("#viewAdmin")?.classList.add("hidden"); $("#viewOwner")?.classList.remove("hidden"); }
  function showAdmin() { $("#viewLogin")?.classList.add("hidden"); $("#viewOwner")?.classList.add("hidden"); $("#viewAdmin")?.classList.remove("hidden"); }

  // ── Boot ───────────────────────────────────────────────────────
  async function boot() {
    setLoading(true);
    ensureButtonTypes();
    await primeOptions();
    wireLogin(); wireTopNav(); wireOwnerTabs(); wireOwnerActions(); wireAdminActions();

    const r = getRole(), u = getUid();
    if (r && u) {
      if (r==='owner') { showOwner(); ownerRenderStocks(); ownerRenderRecords(); }
      else            { showAdmin(); adminRefreshAll(); }
    } else {
      showLogin();
    }
    setLoading(false);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();