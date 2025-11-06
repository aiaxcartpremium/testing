(() => {
  const { createClient } = supabase;
  const APP = window.APP;

  // --- Supabase client
  const sb = createClient(APP.url, APP.key);

  // --- State
  const S = {
    role: null,         // "owner" | "admin"
    uid: null,          // current user's UUID
    products: [],       // [{name: 'Netflix'}, ...]
  };

  // ========== helpers ==========
  const $ = (q) => document.querySelector(q);
  const $all = (q) => [...document.querySelectorAll(q)];
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');
  const toast = (msg, ms=1600) => {
    const t = $('#toast');
    t.textContent = msg;
    show(t);
    setTimeout(()=>hide(t), ms);
  };
  const setOverlay = (on) => {
    const ov = $('#overlay');
    on ? show(ov) : hide(ov);
  };

  // Persist session
  const saveSession = () => localStorage.setItem('aiax_session', JSON.stringify({role:S.role, uid:S.uid}));
  const loadSession = () => {
    try {
      const raw = localStorage.getItem('aiax_session');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.uid || !data.role) return null;
      return data;
    } catch { return null; }
  };
  const clearSession = () => localStorage.removeItem('aiax_session');

  // ========== Login UI ==========
  const bindLogin = () => {
    $('#btn-owner').addEventListener('click', () => {
      hide($('#admin-box'));
      show($('#owner-box'));
      $('#owner-uuid').focus();
    });

    $('#btn-admin').addEventListener('click', () => {
      hide($('#owner-box'));
      show($('#admin-box'));
      $('#admin-uuid').focus();
    });

    $('#owner-continue').addEventListener('click', () => {
      const id = ($('#owner-uuid').value||'').trim().toLowerCase();
      if (id !== (APP.ownerId||'').toLowerCase()) {
        alert('UUID is not an Owner ID.');
        return;
      }
      S.role = 'owner';
      S.uid = id;
      saveSession();
      route('owner');
    });

    $('#admin-continue').addEventListener('click', () => {
      const id = ($('#admin-uuid').value||'').trim().toLowerCase();
      const ok = (APP.admins||[]).map(x=>x.toLowerCase()).includes(id);
      if (!ok) {
        alert('UUID is not an Admin ID.');
        return;
      }
      S.role = 'admin';
      S.uid = id;
      saveSession();
      route('admin');
    });
  };

  // ========== Routing ==========
  const route = (dest) => {
    // owner can access admin via link; admin cannot access owner unless owner ID
    hide($('#screen-login'));
    hide($('#screen-owner'));
    hide($('#screen-admin'));

    if (dest === 'owner') {
      show($('#screen-owner'));
      initOwner();
    } else if (dest === 'admin') {
      show($('#screen-admin'));
      initAdmin();
    } else {
      show($('#screen-login'));
    }
  };

  // ========== Tabs (Owner) ==========
  const bindTabs = () => {
    $all('.tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $all('.tabs .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const id = btn.dataset.tab;
        ['owner-add','owner-stocks','owner-records'].forEach(sec => {
          const el = document.getElementById(sec);
          (sec === id) ? show(el) : hide(el);
        });
      });
    });
  };

  // ========== Select Populators ==========
  const fillSelect = (sel, items, getLabel = v => v, getValue = v => v) => {
    sel.innerHTML = '';
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.textContent = getLabel(it);
      opt.value = getValue(it);
      sel.appendChild(opt);
    });
  };
async function loadProductOptions() {
  const sel = document.querySelector('#add-product, #get-product');
  if (!sel) return;

  let options = [];
  try {
    // try DB first (view product_options)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000); // avoid infinite spinner
    const { data, error } = await supabase
      .from('product_options')
      .select('product')
      .order('product', { ascending: true })
      .abortSignal(ctrl.signal);

    clearTimeout(timer);

    if (error) console.warn('product_options error:', error);
    if (data && data.length) {
      options = data.map(r => r.product);
    }
  } catch (e) {
    console.warn('product_options timeout/fail:', e);
  }

  // fallback to static list if DB failed/empty
  if (!options.length && Array.isArray(window.APP.PRODUCTS)) {
    options = [...window.APP.PRODUCTS].sort((a,b)=>a.localeCompare(b));
  }

  // populate select
  sel.innerHTML = '';
  for (const name of options) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

  const populateOwnerSelects = () => {
    fillSelect($('#o-type'), APP.ACCOUNT_TYPES);
    fillSelect($('#o-duration'), APP.DURATIONS, d => d[0], d => d[1]);
    if (S.products.length) {
      fillSelect($('#o-product'), S.products, p=>p.name, p=>p.name);
    } else {
      fillSelect($('#o-product'), ['Loading…']);
    }
  };

  const populateAdminSelects = () => {
    fillSelect($('#a-type'), APP.ACCOUNT_TYPES);
    fillSelect($('#a-duration'), APP.DURATIONS, d => d[0], d => d[1]);
    if (S.products.length) {
      fillSelect($('#a-product'), S.products, p=>p.name, p=>p.name);
    } else {
      fillSelect($('#a-product'), ['Loading…']);
    }
  };

  // ========== Owner Panel ==========
  const initOwner = async () => {
    bindTabs();
    $('#link-admin').addEventListener('click', () => route('admin'));
    $('#btn-logout-o').addEventListener('click', () => { clearSession(); route('login'); });

    populateOwnerSelects();
    setOverlay(true);
    await loadProducts();
    populateOwnerSelects();
    setOverlay(false);

    // Add stock (simple pass-through; robust mutations come in next batch)
    $('#o-add-stock').onclick = async () => {
      const payload = {
        owner_id: S.uid,
        product: $('#o-product').value,
        account_type: $('#o-type').value,
        duration_code: $('#o-duration').value,
        qty: Math.max(1, parseInt($('#o-qty').value || '1', 10)),
        email: ($('#o-email').value||null),
        password: ($('#o-pass').value||null),
        profile_name: ($('#o-profile').value||null),
        pin: ($('#o-pin').value||null),
        notes: ($('#o-notes').value||null)
      };

      setOverlay(true);
      // Expecting a Postgres RPC (preferred) else insert to 'stocks' as fallback
      let res;
      try {
        res = await sb.rpc('add_stock', payload); // if you created such RPC
        if (res.error) throw res.error;
      } catch {
        // fallback: insert to 'stocks' table; adjust columns to your schema
        const { error } = await sb.from('stocks').insert([{
          owner_id: payload.owner_id,
          product: payload.product,
          account_type: payload.account_type,
          duration_code: payload.duration_code,
          qty: payload.qty,
          email: payload.email,
          password: payload.password,
          profile_name: payload.profile_name,
          pin: payload.pin,
          notes: payload.notes
        }]);
        if (error) {
          setOverlay(false);
          alert('Add stock failed');
          return;
        }
      }
      setOverlay(false);
      toast('Stock added');
      $('#o-qty').value = '1';
      $('#o-email').value = '';
      $('#o-pass').value = '';
      $('#o-profile').value = '';
      $('#o-pin').value = '';
      $('#o-notes').value = '';
      await refreshOwnerStocks();
    };

    $('#o-refresh').onclick = refreshOwnerStocks;
    await refreshOwnerStocks();
    await refreshOwnerRecords();
  };

  const refreshOwnerStocks = async () => {
    setOverlay(true);
    const tbody = $('#o-stocks-table tbody');
    tbody.innerHTML = '';
    // Prefer your view 'stocks_summary' scoped by owner_id (if exists)
    let rows = [];
    try {
      const { data, error } = await sb
        .from('stocks_summary')
        .select('product,account_type,duration_code,qty')
        .eq('owner_id', S.uid)
        .order('product', {ascending:true});
      if (!error && data) rows = data;
    } catch {}
    // fallback: group stocks
    if (!rows.length) {
      const { data } = await sb
        .from('stocks')
        .select('product,account_type,duration_code,qty')
        .eq('owner_id', S.uid);
      rows.push(...(data||[]));
    }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.product||''}</td><td>${r.account_type||''}</td><td>${r.duration_code||''}</td><td>${r.qty||0}</td>`;
      tbody.appendChild(tr);
    });
    setOverlay(false);
  };

  const refreshOwnerRecords = async () => {
    const tbody = $('#o-records-table tbody');
    tbody.innerHTML = '';
    try {
      const { data } = await sb
        .from('sales')
        .select('id,product,account_type,created_at,expires_at')
        .eq('owner_id', S.uid)
        .order('created_at', {ascending:false})
        .limit(50);
      (data||[]).forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.product}</td><td>${r.account_type}</td><td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td>`;
        tbody.appendChild(tr);
      });
    } catch {}
  };

  // ========== Admin Panel ==========
  const initAdmin = async () => {
    $('#link-owner').addEventListener('click', () => route('owner'));
    $('#btn-logout-a').addEventListener('click', () => { clearSession(); route('login'); });

    populateAdminSelects();
    setOverlay(true);
    await loadProducts();
    populateAdminSelects();
    setOverlay(false);

    $('#a-refresh').onclick = refreshAdminStocks;
    await refreshAdminStocks();

    $('#a-get').onclick = async () => {
      setOverlay(true);
      // Call your RPC get_account(owner_id?, product, type, duration) if available
      let got;
      try {
        const { data, error } = await sb.rpc('get_account', {
          owner_id: null, // scope decided inside RPC
          product: $('#a-product').value,
          account_type: $('#a-type').value,
          duration_code: $('#a-duration').value
        });
        if (error) throw error;
        got = data && data[0];
      } catch {
        setOverlay(false);
        alert('get_account failed');
        return;
      }
      setOverlay(false);
      if (!got) { toast('No account available'); return; }

      // Render details
      const box = $('#a-details');
      box.innerHTML = `
        <div><b>Order id:</b> ${got.id ?? '-'}</div>
        <div><b>Product name:</b> ${got.product ?? '-'}</div>
        <div><b>Account type:</b> ${got.account_type ?? '-'}</div>
        <div><b>Duration:</b> ${got.duration_label ?? got.duration_code ?? '-'}</div>
        <div><b>Expiration:</b> ${fmtDT(got.expires_at)}</div>
        <hr/>
        <div><b>Email:</b> ${got.email ?? '-'}</div>
        <div><b>Password:</b> ${got.password ?? '-'}</div>
        <div><b>Profile:</b> ${got.profile_name ?? '-'}</div>
        <div><b>PIN:</b> ${got.pin ?? '-'}</div>
        <div><b>Taken by:</b> ${got.taken_by_name ?? 'Admin'}</div>
      `;
      show(box);

      // Update records table quickly
      await refreshAdminRecords();
    };

    await refreshAdminRecords();
  };

  const refreshAdminStocks = async () => {
    const tbody = $('#a-stocks tbody'); tbody.innerHTML = '';
    try {
      const { data } = await sb.from('stocks_summary').select('product,account_type,duration_code,qty').gt('qty',0).order('product');
      (data||[]).forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.product}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.qty}</td>`;
        tbody.appendChild(tr);
      });
    } catch {}
  };

  const refreshAdminRecords = async () => {
    const tbody = $('#a-records tbody'); tbody.innerHTML='';
    try {
      const { data } = await sb.from('sales').select('id,product,account_type,created_at,expires_at').eq('admin_id', S.uid).order('created_at',{ascending:false}).limit(50);
      (data||[]).forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.id}</td><td>${r.product}</td><td>${r.account_type}</td><td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td>`;
        tbody.appendChild(tr);
      });
    } catch {}
  };

  // ========== utils ==========
  const fmtDT = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleString();
  };

  // ========== boot ==========
  const boot = async () => {
    bindLogin();

    // restore session if present
    const s = loadSession();
    if (s) {
      S.role = s.role; S.uid = s.uid;
      route(s.role);
      return;
    }
    route('login');
  };

  // expose route('login') for logout flow
  window.route = route;
  // go
  document.addEventListener('DOMContentLoaded', boot);
})();