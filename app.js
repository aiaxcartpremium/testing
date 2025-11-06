(() => {
  let supabase, whoAmI = null; // user role + ID memory

  // Shortcuts
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const toast = (msg, ms = 1600) => {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), ms);
  };

  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');

  // Init Supabase
  function initSupabase() {
    const { url, key } = window.APP || {};
    if (!url || !key) {
      toast('Missing Supabase config');
      return;
    }
    supabase = window.supabase.createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  // -------- LOGIN BINDINGS -------- //
  function bindLogin() {
    $('#btnChooseOwner')?.addEventListener('click', () => {
      $('#ownerBlock').classList.remove('hidden');
      $('#adminBlock').classList.add('hidden');
      $('#ownerInput').focus();
    });

    $('#btnChooseAdmin')?.addEventListener('click', () => {
      $('#adminBlock').classList.remove('hidden');
      $('#ownerBlock').classList.add('hidden');
      $('#adminInput').focus();
    });

    $('#btnOwnerGo')?.addEventListener('click', () => {
      const id = ($('#ownerInput').value || '').trim().toLowerCase();
      if (id !== (window.APP.ownerId || '').toLowerCase())
        return alert('UUID is not an Owner ID.');
      whoAmI = { role: 'owner', id };
      sessionStorage.setItem('role', 'owner');
      sessionStorage.setItem('id', id);
      enterOwner();
    });

    $('#btnAdminGo')?.addEventListener('click', () => {
      const id = ($('#adminInput').value || '').trim().toLowerCase();
      const ok = (window.APP.admins || [])
        .map((x) => x.toLowerCase())
        .includes(id);
      if (!ok) return alert('UUID is not an Admin ID.');
      whoAmI = { role: 'admin', id };
      sessionStorage.setItem('role', 'admin');
      sessionStorage.setItem('id', id);
      enterAdmin();
    });
  }

  function restoreSession() {
    const role = sessionStorage.getItem('role');
    const id = sessionStorage.getItem('id');
    if (role && id) {
      whoAmI = { role, id };
      if (role === 'owner') enterOwner();
      else enterAdmin();
    }
  }

  // -------- OWNER PANEL -------- //
  async function enterOwner() {
    hide('#login');
    show('#ownerPanel');
    hide('#adminPanel');

    $('#logoutOwner').onclick = doLogout;
    $('#goAdmin').onclick = () => enterAdmin();

    $$('.tabs').forEach((t) => t.addEventListener('click', switchTab));
    $('#oaAddBtn').onclick = addStock;

    await loadSelects();
    await refreshOwnerStocks();
    await refreshOwnerRecords();
  }

  // -------- ADMIN PANEL -------- //
  async function enterAdmin() {
    hide('#login');
    hide('#ownerPanel');
    show('#adminPanel');
    $('#logoutAdmin').onclick = doLogout;
    $('#goOwner').onclick = () => enterOwner();
    await loadSelects(); // share same select list
    toast('Logged in as Admin');
  }

  function doLogout() {
    sessionStorage.clear();
    whoAmI = null;
    show('#login');
    hide('#ownerPanel');
    hide('#adminPanel');
    $('#ownerBlock').classList.add('hidden');
    $('#adminBlock').classList.add('hidden');
    $('#ownerInput').value = '';
    $('#adminInput').value = '';
  }

  // -------- TABS -------- //
  function switchTab(evt) {
    const btn = evt.target.closest('.tab');
    if (!btn) return;
    const name = btn.dataset.tab;
    $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    ['ownerAdd', 'ownerStocks', 'ownerRecords'].forEach((id) => {
      const el = $('#' + id);
      if (el) el.classList.toggle('hidden', id !== name);
    });
  }

  // -------- SELECT LOADER -------- //
  async function loadSelects() {
    await loadProductOptions();

    const typeSel = $('#oaType');
    const durSel = $('#oaDuration');

    fillSelect(
      typeSel,
      (window.APP.ACCOUNT_TYPES || []).map((t) => [t, t])
    );
    fillSelect(durSel, window.APP.DURATIONS || []);
  }

  async function loadProductOptions() {
    const prodSel1 = $('#oaProduct');
    const prodSel2 = $('#getProduct');
    const allProdSelects = [prodSel1, prodSel2].filter(Boolean);

    allProdSelects.forEach((s) => {
      s.innerHTML = '<option>Loading...</option>';
    });

    let options = [];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000); // 4s timeout
      const { data, error } = await supabase
        .from('product_options')
        .select('product')
        .order('product', { ascending: true })
        .abortSignal(ctrl.signal);
      clearTimeout(timer);

      if (error) console.warn('product_options error:', error);
      if (data && data.length) options = data.map((r) => r.product);
    } catch (e) {
      console.warn('product_options timeout/fail:', e);
    }

    if (!options.length && Array.isArray(window.APP.PRODUCTS)) {
      options = [...window.APP.PRODUCTS].sort((a, b) =>
        a.localeCompare(b)
      );
    }

    allProdSelects.forEach((sel) => fillSelect(sel, options.map((o) => [o, o])));
  }

  function fillSelect(sel, pairs) {
    if (!sel) return;
    sel.innerHTML = '';
    for (const pair of pairs) {
      const [label, value] = Array.isArray(pair) ? pair : [pair, pair];
      const opt = document.createElement('option');
      opt.textContent = label;
      opt.value = value;
      sel.appendChild(opt);
    }
  }

  // -------- OWNER ACTIONS -------- //
  async function addStock() {
    try {
      const payload = {
        product: $('#oaProduct').value,
        account_type: $('#oaType').value,
        duration_code: $('#oaDuration').value,
        qty: Math.max(1, parseInt($('#oaQty').value || '1', 10)),
        email: $('#oaEmail').value || null,
        password: $('#oaPass').value || null,
        profile_name: $('#oaProfile').value || null,
        pin: $('#oaPin').value || null,
        notes: $('#oaNotes').value || null,
        owner_id: window.APP.ownerId,
      };

      const { error } = await supabase.rpc('add_stock_bulk', payload);
      if (error) throw error;

      toast('Stock added!');
      $('#oaQty').value = '1';
      await refreshOwnerStocks();
    } catch (e) {
      console.error(e);
      alert('Add stock failed — check console / Supabase.');
    }
  }

  async function refreshOwnerStocks() {
    const tbody = $('#ownerStocksTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    try {
      const { data, error } = await supabase
        .from('stocks_summary')
        .select('*')
        .order('product');
      if (error) throw error;

      (data || []).forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.product || ''}</td>
          <td>${row.account_type || ''}</td>
          <td>${row.duration_label || row.duration_code || ''}</td>
          <td>${row.qty || 0}</td>
          <td>
            <button class="btn btn-secondary btn-sm" disabled>Edit</button>
            <button class="btn btn-ghost btn-sm" disabled>Remove</button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('refreshOwnerStocks:', e);
    }
  }

  async function refreshOwnerRecords() {
    const tbody = $('#ownerRecordsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(
          'id,product,account_type,created_at,expires_at,admin_id,warranty,voided'
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      (data || []).forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.id}</td>
          <td>${r.product || ''}</td>
          <td>${r.account_type || ''}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td>${fmtDT(r.expires_at)}</td>
          <td>${r.admin_id || '-'}</td>
          <td>${r.warranty ? '✓' : ''}</td>
          <td>${r.voided ? '✓' : ''}</td>
          <td><button class="btn btn-secondary btn-sm" disabled>Edit</button></td>`;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('refreshOwnerRecords:', e);
    }
  }

  const fmtDT = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleString();
  };

  // -------- STARTUP -------- //
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      initSupabase();
      bindLogin();
      restoreSession();
    } catch (e) {
      console.error('App startup failed:', e);
      toast('App failed to start.');
    }
  });
})();