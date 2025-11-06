(() => {
  // -------- Shortcuts & Globals
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Guard: config present?
  const APP = window.APP || {};
  if (!APP.url || !APP.key) {
    alert("App not loaded: missing config.js");
    return;
  }

  // Supabase client
  const supabase = window.supabase?.createClient(APP.url, APP.key);

  // UI state (kept simple)
  const S = {
    role: null,     // "owner" | "admin"
    uid: null,      // typed uuid
    products: [],   // [{name:'Netflix'}] or strings
    accountTypes: [],
    durations: [],  // [['1 month','1m'], ...]
    ready: false
  };

  // ---------- Helpers
  const toast = (msg) => {
    const t = $(".toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1600);
  };

  const setLoading = (on) => {
    const L = $(".loading-overlay");
    if (!L) return;
    L.classList.toggle("hidden", !on);
    // Make sure it NEVER blocks clicks
    L.style.pointerEvents = "none";
  };

  const fillSelect = (sel, items) => {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = "";
    for (const it of items) {
      let label, value;
      if (Array.isArray(it)) [label, value] = it;
      else if (typeof it === "string") (label = value = it);
      else if (it && it.name) (label = value = it.name);
      else continue;

      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      el.appendChild(opt);
    }
  };

  const isOwner = (uuid) =>
    (uuid || "").toLowerCase() === (APP.ownerId || "").toLowerCase();

  const isAdmin = (uuid) =>
    (APP.admins || []).map(a => a.toLowerCase())
      .includes((uuid || "").toLowerCase());

  // ---------- Data fetch with fallbacks
  async function loadProducts() {
    // Try DB first
    try {
      if (!supabase) throw new Error("no supabase");
      const { data, error } = await supabase.from("products")
        .select("name").order("name");
      if (error) throw error;
      if (data?.length) return data.map(r => r.name);
    } catch (e) {
      // fallback to config
      if (APP.PRODUCTS?.length) return APP.PRODUCTS;
    }
    return [];
  }

  async function loadAccountTypes() {
    try {
      if (!supabase) throw new Error("no supabase");
      const { data, error } = await supabase.from("account_types")
        .select("label").order("label");
      if (error) throw error;
      if (data?.length) return data.map(r => r.label);
    } catch (e) {
      if (APP.ACCOUNT_TYPES?.length) return APP.ACCOUNT_TYPES;
    }
    return [];
  }

  async function loadDurations() {
    try {
      if (!supabase) throw new Error("no supabase");
      const { data, error } = await supabase.from("durations")
        .select("label, code").order("seq", { ascending: true });
      if (error) throw error;
      if (data?.length) return data.map(r => [r.label, r.code]);
    } catch (e) {
      if (APP.DURATIONS?.length) return APP.DURATIONS;
    }
    return [];
  }

  async function primeOptions() {
    // Populate selects quickly with fallbacks, then replace when DB returns
    // 1) immediate placeholders
    fillSelect("#productSelectOwner", [["Loading…", ""]]);
    fillSelect("#productSelectAdmin", [["Loading…", ""]]);

    fillSelect("#typeSelectOwner", APP.ACCOUNT_TYPES || []);
    fillSelect("#typeSelectAdmin", APP.ACCOUNT_TYPES || []);

    fillSelect("#durSelectOwner", APP.DURATIONS || []);
    fillSelect("#durSelectAdmin", APP.DURATIONS || []);

    // 2) fetch real data
    const [prods, types, durs] = await Promise.all([
      loadProducts(), loadAccountTypes(), loadDurations()
    ]);

    if (prods.length) {
      S.products = prods;
      fillSelect("#productSelectOwner", prods);
      fillSelect("#productSelectAdmin", prods);
    }
    if (types.length) {
      S.accountTypes = types;
      fillSelect("#typeSelectOwner", types);
      fillSelect("#typeSelectAdmin", types);
    }
    if (durs.length) {
      S.durations = durs;
      fillSelect("#durSelectOwner", durs);
      fillSelect("#durSelectAdmin", durs);
    }
  }

  // ---------- Login wiring
  function wireLogin() {
    // Buttons
    const btnOwner = $("#btnLoginOwner");
    const btnAdmin = $("#btnLoginAdmin");

    const cardOwner = $("#ownerLoginCard");
    const cardAdmin = $("#adminLoginCard");

    const inputOwner = $("#ownerUuid");
    const inputAdmin = $("#adminUuid");

    const goOwner = $("#continueOwner");
    const goAdmin = $("#continueAdmin");

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

    goOwner?.addEventListener("click", () => {
      const id = (inputOwner?.value || "").trim();
      if (!isOwner(id)) {
        alert("UUID is not an Owner ID.");
        return;
      }
      S.role = "owner";
      S.uid = id;
      sessionStorage.setItem("role", S.role);
      sessionStorage.setItem("uid", S.uid);
      showOwner();
    });

    goAdmin?.addEventListener("click", () => {
      const id = (inputAdmin?.value || "").trim();
      // Owner can access Admin too; Admin must be whitelisted
      if (!(isOwner(id) || isAdmin(id))) {
        alert("UUID is not an Admin ID.");
        return;
      }
      S.role = "admin";
      S.uid = id;
      sessionStorage.setItem("role", S.role);
      sessionStorage.setItem("uid", S.uid);
      showAdmin();
    });
  }

  // ---------- Top nav (Go to Admin / Go to Owner / Logout)
  function wireTopNav() {
    $("#goToAdmin")?.addEventListener("click", () => {
      // Only owners can jump; admins stay admin
      if (S.role === "owner") showAdmin();
    });
    $("#goToOwner")?.addEventListener("click", () => {
      // Owner always allowed, admin cannot
      if (S.role === "owner") showOwner();
    });
    $$(".btnLogout").forEach(b => b.addEventListener("click", () => {
      S.role = null; S.uid = null;
      sessionStorage.removeItem("role");
      sessionStorage.removeItem("uid");
      showLogin();
    }));
  }

  // ---------- Tabs (Owner page buttons)
  function wireOwnerTabs() {
    const tabs = $$(".tab");
    tabs.forEach(t => t.addEventListener("click", () => {
      tabs.forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      const target = t.dataset.target;
      $$(".tab-page").forEach(p => p.classList.add("hidden"));
      $(`#${target}`)?.classList.remove("hidden");
    }));
  }

  // ---------- Views
  function showLogin() {
    $("#viewLogin")?.classList.remove("hidden");
    $("#viewOwner")?.classList.add("hidden");
    $("#viewAdmin")?.classList.add("hidden");

    // Reset login cards to collapsed
    $("#ownerLoginCard")?.classList.add("hidden");
    $("#adminLoginCard")?.classList.add("hidden");
  }

  function showOwner() {
    $("#viewLogin")?.classList.add("hidden");
    $("#viewAdmin")?.classList.add("hidden");
    $("#viewOwner")?.classList.remove("hidden");

    // default tab
    const firstTab = $(".tab");
    if (firstTab && !firstTab.classList.contains("active")) {
      firstTab.click();
    }
  }

  function showAdmin() {
    $("#viewLogin")?.classList.add("hidden");
    $("#viewOwner")?.classList.add("hidden");
    $("#viewAdmin")?.classList.remove("hidden");
  }
  // ---------- Stock cache + helpers (Admin filtering)
  let STOCK_CACHE = []; // [{product, account_type, duration_code, qty}]

  async function fetchStockSummary() {
    // Prefer a view named 'stock_summary' if you created one
    try {
      const { data, error } = await supabase
        .from('stock_summary')
        .select('product,account_type,duration_code,qty')
        .gte('qty', 1);
      if (error) throw error;
      if (data) return data;
    } catch (_) {}

    // Fallback: read raw rows from 'stocks' and aggregate on the client
    try {
      const { data, error } = await supabase
        .from('stocks')
        .select('product,account_type,duration_code,qty');
      if (error) throw error;

      const m = new Map();
      for (const r of (data || [])) {
        const key = `${r.product}||${r.account_type}||${r.duration_code}`;
        const prev = m.get(key) || 0;
        const add = Number(r.qty ?? 0);
        m.set(key, prev + add);
      }
      const rows = [];
      m.forEach((qty, key) => {
        if (qty > 0) {
          const [product, account_type, duration_code] = key.split('||');
          rows.push({ product, account_type, duration_code, qty });
        }
      });
      return rows;
    } catch (e) {
      console.error(e);
      toast('Failed to load stocks');
      return [];
    }
  }

  function renderAdminStockTable() {
    const tbody = document.querySelector('#adminStockBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!STOCK_CACHE.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No data yet';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const r of STOCK_CACHE) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.product}</td>
        <td>${r.account_type}</td>
        <td>${r.duration_code}</td>
        <td>${r.qty}</td>`;
      tbody.appendChild(tr);
    }
  }

  function filterAdminSelectorsFromStock() {
    const prodSel = document.querySelector('#productSelectAdmin');
    const typeSel = document.querySelector('#typeSelectAdmin');
    const durSel  = document.querySelector('#durSelectAdmin');
    if (!prodSel || !typeSel || !durSel) return;

    // Build sets based on current stock
    const products = [...new Set(STOCK_CACHE.map(r => r.product))].sort();
    fillSelect('#productSelectAdmin', products);

    const applyTypeAndDur = () => {
      const p = prodSel.value;
      const types = [...new Set(
        STOCK_CACHE.filter(r => r.product === p).map(r => r.account_type)
      )].sort();
      fillSelect('#typeSelectAdmin', types);

      const t = typeSel.value;
      const durs = STOCK_CACHE
        .filter(r => r.product === p && r.account_type === t)
        .map(r => r.duration_code);
      // Match to UI labels if you have a mapping; otherwise show codes as labels
      const mapped = (S.durations.length ? 
        S.durations.filter(([label, code]) => durs.includes(code)) :
        durs.map(code => [code, code])
      );
      fillSelect('#durSelectAdmin', mapped);
    };

    prodSel.onchange = applyTypeAndDur;
    typeSel.onchange = applyTypeAndDur;
    applyTypeAndDur();
  }

  async function refreshAdminArea() {
    STOCK_CACHE = await fetchStockSummary();
    renderAdminStockTable();
    filterAdminSelectorsFromStock();
  }

  // ---------- Owner: Add Stock
  function wireOwnerAddStock() {
    const btn = document.querySelector('#btnAddStock');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const product = (document.querySelector('#productSelectOwner')?.value || '').trim();
      const account_type = (document.querySelector('#typeSelectOwner')?.value || '').trim();
      const duration_code = (document.querySelector('#durSelectOwner')?.value || '').trim();
      const qty = Number(document.querySelector('#qtyInputOwner')?.value || '0');

      const email = document.querySelector('#emailInputOwner')?.value || null;
      const password = document.querySelector('#passInputOwner')?.value || null;
      const profile_name = document.querySelector('#profileInputOwner')?.value || null;
      const pin = document.querySelector('#pinInputOwner')?.value || null;
      const notes = document.querySelector('#notesInputOwner')?.value || null;

      if (!product || !account_type || !duration_code || !qty || qty < 1) {
        toast('Fill product, type, duration, and quantity ≥ 1');
        return;
      }

      setLoading(true);
      try {
        // Try RPC first if you have one in SQL
        let ok = false;
        try {
          const { data, error } = await supabase.rpc('add_stock', {
            p_product: product,
            p_type: account_type,
            p_duration_code: duration_code,
            p_qty: qty,
            p_email: email,
            p_password: password,
            p_profile: profile_name,
            p_pin: pin,
            p_notes: notes,
            p_owner: S.uid
          });
          if (error) throw error;
          ok = true;
        } catch (e) {
          // Fallback: direct insert into 'stocks'
          const { error } = await supabase.from('stocks').insert([{
            product,
            account_type,
            duration_code,
            qty,
            email,
            password,
            profile_name,
            pin,
            notes,
            created_by: S.uid
          }]);
          if (error) throw error;
          ok = true;
        }

        if (ok) {
          toast('Stock added');
          // Clear only quantity & credentials; keep selectors
          document.querySelector('#qtyInputOwner').value = '1';
          ['#emailInputOwner','#passInputOwner','#profileInputOwner','#pinInputOwner','#notesInputOwner']
            .forEach(sel => { const el = document.querySelector(sel); if (el) el.value = ''; });
          await refreshAdminArea();
        }
      } catch (err) {
        console.error(err);
        alert('Add stock failed:\n' + (err?.message || err));
      } finally {
        setLoading(false);
      }
    });
  }

  // ---------- Admin: Get Account
  function wireAdminGetAccount() {
    const btn = document.querySelector('#btnGetAccount');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const product = (document.querySelector('#productSelectAdmin')?.value || '').trim();
      const account_type = (document.querySelector('#typeSelectAdmin')?.value || '').trim();
      const duration_code = (document.querySelector('#durSelectAdmin')?.value || '').trim();
      if (!product || !account_type || !duration_code) {
        toast('Pick product, type and duration'); return;
      }

      // Block if not available in cache
      const found = STOCK_CACHE.find(r =>
        r.product === product && r.account_type === account_type && r.duration_code === duration_code && r.qty > 0
      );
      if (!found) { toast('Out of stock'); return; }

      setLoading(true);
      try {
        // Prefer a secure RPC that returns the account + records the sale
        let done = false;
        try {
          const { data, error } = await supabase.rpc('get_account_and_record_sale', {
            p_product: product,
            p_type: account_type,
            p_duration_code: duration_code,
            p_admin: S.uid
          });
          if (error) throw error;
          // You can render the returned details if your RPC returns them
          done = true;
        } catch (e) {
          // Fallback: naive client-side decrement of one matching row
          // 1) fetch a row with qty>0
          const { data, error } = await supabase
            .from('stocks')
            .select('id,qty')
            .eq('product', product)
            .eq('account_type', account_type)
            .eq('duration_code', duration_code)
            .gt('qty', 0)
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('No stock row to decrement');

          const newQty = (Number(data.qty) || 0) - 1;
          const { error: upErr } = await supabase
            .from('stocks')
            .update({ qty: newQty })
            .eq('id', data.id);
          if (upErr) throw upErr;

          // Optional: write a record
          await supabase.from('records').insert([{
            product, account_type, duration_code,
            admin_id: S.uid
          }]);

          done = true;
        }

        if (done) {
          toast('Account released');
          await refreshAdminArea();
        }
      } catch (err) {
        console.error(err);
        alert('Get Account failed:\n' + (err?.message || err));
      } finally {
        setLoading(false);
      }
    });
  }
  // ---------- Boot
  async function boot() {
    setLoading(true);

    // Never let the loading overlay block clicks
    const overlay = $(".loading-overlay");
    if (overlay) overlay.style.pointerEvents = "none";

    // Populate selects quickly then hydrate
    await primeOptions();

    // Restore session role if present
    const savedRole = sessionStorage.getItem("role");
    const savedUid = sessionStorage.getItem("uid");

    if (savedRole && savedUid) {
      S.role = savedRole;
      S.uid = savedUid;
      if (S.role === "owner") showOwner();
      else showAdmin();
    } else {
      showLogin();
    }

    // Wire UI
    // Wire UI
wireLogin();
wireTopNav();
wireOwnerTabs();
wireOwnerAddStock(); // <-- ADD THIS LINE

    setLoading(false);
    S.ready = true;
  }

  // Start
  window.addEventListener("DOMContentLoaded", boot);
})();