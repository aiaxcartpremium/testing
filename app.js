
(() => {
  // ===== helpers =====
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // Show *any* JS error as an alert (so we can see it on mobile)
  window.onerror = (msg, src, line) => alert(`JS error: ${msg}\n${src||''}:${line||''}`);

  // Read config (guard)
  const APP = window.APP || {};
  if (!APP.url || !APP.key) {
    // still allow login/UI even if DB is down
    console.warn('Missing Supabase config — login UI will still work.');
  }

  // ===== role checks (owner can access admin; admin must be whitelisted) =====
  const isOwner = (id) =>
    (id||'').toLowerCase() === (APP.ownerId||'').toLowerCase();

  const isAdmin = (id) =>
    (APP.admins||[]).map(a=>a.toLowerCase()).includes((id||'').toLowerCase());

  // ===== views =====
  function showLogin(){
    $("#viewLogin")?.classList.remove("hidden");
    $("#viewOwner")?.classList.add("hidden");
    $("#viewAdmin")?.classList.add("hidden");
    $("#ownerLoginCard")?.classList.add("hidden");
    $("#adminLoginCard")?.classList.add("hidden");
  }
  function showOwner(){
    $("#viewLogin")?.classList.add("hidden");
    $("#viewAdmin")?.classList.add("hidden");
    $("#viewOwner")?.classList.remove("hidden");
    // default tab
    const first = $(".tab");
    if (first && !first.classList.contains("active")) first.click();
  }
  function showAdmin(){
    $("#viewLogin")?.classList.add("hidden");
    $("#viewOwner")?.classList.add("hidden");
    $("#viewAdmin")?.classList.remove("hidden");
  }

  // Make sure critical buttons are true "button" (not submit)
  function ensureButtonTypes(){
    ['#btnLoginOwner','#btnLoginAdmin','#continueOwner','#continueAdmin',
     '#btnAddStock','#btnGetAccount'
    ].forEach(sel=>{
      const b = $(sel);
      if (b) b.setAttribute('type','button');
    });
  }

  // ===== wire login =====
  function wireLogin(){
    const btnOwner   = $("#btnLoginOwner");
    const btnAdmin   = $("#btnLoginAdmin");
    const cardOwner  = $("#ownerLoginCard");
    const cardAdmin  = $("#adminLoginCard");
    const inputOwner = $("#ownerUuid");
    const inputAdmin = $("#adminUuid");
    const goOwner    = $("#continueOwner");
    const goAdmin    = $("#continueAdmin");

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

    goOwner?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = (inputOwner?.value||'').trim();
      if (!isOwner(id)) { alert("UUID is not an Owner ID."); return; }
      sessionStorage.setItem("role","owner");
      sessionStorage.setItem("uid", id);
      showOwner();
    });

    goAdmin?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = (inputAdmin?.value||'').trim();
      if (!(isOwner(id) || isAdmin(id))) { alert("UUID is not an Admin ID."); return; }
      sessionStorage.setItem("role","admin");
      sessionStorage.setItem("uid", id);
      showAdmin();
    });

    // Delegated backup (in case HTML gets re-rendered)
    document.addEventListener("click",(e)=>{
      const t = e.target?.closest?.("#continueOwner");
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      const id = (inputOwner?.value||'').trim();
      if (!isOwner(id)) { alert("UUID is not an Owner ID."); return; }
      sessionStorage.setItem("role","owner");
      sessionStorage.setItem("uid", id);
      showOwner();
    });
    document.addEventListener("click",(e)=>{
      const t = e.target?.closest?.("#continueAdmin");
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      const id = (inputAdmin?.value||'').trim();
      if (!(isOwner(id) || isAdmin(id))) { alert("UUID is not an Admin ID."); return; }
      sessionStorage.setItem("role","admin");
      sessionStorage.setItem("uid", id);
      showAdmin();
    });
  }

  // ===== top nav & tabs =====
  function wireTopNav(){
    $("#goToAdmin")?.addEventListener("click", ()=> {
      if (sessionStorage.getItem("role")==="owner") showAdmin();
    });
    $("#goToOwner")?.addEventListener("click", ()=> {
      if (sessionStorage.getItem("role")==="owner") showOwner();
    });
    $$(".btnLogout").forEach(b=>b.addEventListener("click", ()=>{
      sessionStorage.removeItem("role");
      sessionStorage.removeItem("uid");
      showLogin();
    }));
  }

  function wireOwnerTabs(){
    const tabs = $$(".tab");
    tabs.forEach(t=>t.addEventListener("click",()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const target = t.dataset.target;
      $$(".tab-page").forEach(p=>p.classList.add("hidden"));
      document.getElementById(target)?.classList.remove("hidden");
    }));
  }

  // ===== boot =====
  function boot(){
    ensureButtonTypes();
    wireLogin();
    wireTopNav();
    wireOwnerTabs();

    // Restore session, if any
    const r = sessionStorage.getItem("role");
    (r === "owner") ? showOwner() : (r === "admin" ? showAdmin() : showLogin());
  }

  document.addEventListener("DOMContentLoaded", boot);
})();