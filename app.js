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
// ---------- Owner: Add Stock (form + submit)
function wireOwnerAddStock() {
  const btn = document.getElementById("btnAddStock");
  if (!btn) return; // walang Add Stock button

  // form fields (IDs dapat tugma sa HTML mo)
  const $product = document.getElementById("productSelectOwner");
  const $type    = document.getElementById("typeSelectOwner");
  const $dur     = document.getElementById("durSelectOwner");
  const $qty     = document.getElementById("qtyOwner");
  const $email   = document.getElementById("emailOwner");
  const $pass    = document.getElementById("passOwner");
  const $profile = document.getElementById("profileOwner");
  const $pin     = document.getElementById("pinOwner");
  const $notes   = document.getElementById("notesOwner");

  let busy = false;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (busy) return;

    // basic validations
    const product       = ($product?.value || "").trim();
    const account_type  = ($type?.value || "").trim();
    const duration_code = ($dur?.value || "").trim();
    const qty           = parseInt(($qty?.value || "1"), 10);

    if (!product)       return toast("Pick a product");
    if (!account_type)  return toast("Pick account type");
    if (!duration_code) return toast("Pick duration");
    if (!qty || qty < 1) return toast("Quantity must be ≥ 1");
    if (!S.uid || S.role !== "owner") return alert("Owner session required.");

    const payload = {
      product,
      account_type,
      duration_code,
      qty,
      email:        ($email?.value || null) || null,
      password:     ($pass?.value || null) || null,
      profile_name: ($profile?.value || null) || null,
      pin:          ($pin?.value || null) || null,
      notes:        ($notes?.value || null) || null,
      owner_uid:    S.uid
    };

    try {
      busy = true;
      setLoading(true);

      // 1) Try RPC add_stock(payload)
      let rpcError = null;
      try {
        const { error } = await supabase.rpc("add_stock", payload);
        rpcError = error || null;
      } catch (e) {
        rpcError = e;
      }

      // 2) If walang RPC, direct insert sa 'stocks'
      if (rpcError) {
        const { error: e2 } = await supabase.from("stocks").insert([payload]);
        if (e2) throw e2;
      }

      toast("Stock added");

      // clear optional fields; keep product/type/duration
      if ($qty)     $qty.value = "1";
      if ($email)   $email.value = "";
      if ($pass)    $pass.value = "";
      if ($profile) $profile.value = "";
      if ($pin)     $pin.value = "";
      if ($notes)   $notes.value = "";

      // refresh table if meron kang refresh button
      document.getElementById("btnRefreshStocks")?.click();
    } catch (err) {
      console.error(err);
      alert("Add stock failed");
    } finally {
      setLoading(false);
      busy = false;
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