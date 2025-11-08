// app.js — fixed login overlay + bindings intact
window.onerror = (m,s,l,c,e) => { alert("JS error: "+m); console.error(m,s,l,c,e); };

(async function boot(){
  const L = document.querySelector('.loading-overlay');
  if (L) { L.classList.add('hidden'); L.style.display='none'; }

  // make sure buttons don’t auto-submit
  ["#btnLoginOwner","#btnLoginAdmin","#continueOwner","#continueAdmin"]
    .forEach(sel => { const el=document.querySelector(sel); if(el) el.type="button"; });

  // toggle login cards
  const btnOwner = document.querySelector("#btnLoginOwner");
  const btnAdmin = document.querySelector("#btnLoginAdmin");
  const cardOwner = document.querySelector("#ownerLoginCard");
  const cardAdmin = document.querySelector("#adminLoginCard");
  const inputOwner = document.querySelector("#ownerUuid");
  const inputAdmin = document.querySelector("#adminUuid");

  btnOwner?.addEventListener("click",()=>{
    cardAdmin?.classList.add("hidden");
    cardOwner?.classList.remove("hidden");
    inputOwner?.focus();
  });
  btnAdmin?.addEventListener("click",()=>{
    cardOwner?.classList.add("hidden");
    cardAdmin?.classList.remove("hidden");
    inputAdmin?.focus();
  });

  // Continue handlers
  const APP = window.APP || {};
  const supabase = (APP.url && APP.key) ? window.supabase.createClient(APP.url, APP.key) : null;
  const isOwner = uid => APP.ownerId && uid === APP.ownerId;
  const isAdmin = uid => Array.isArray(APP.admins) && APP.admins.includes(uid);

  const setSess = (r,u) => { sessionStorage.setItem("role",r); sessionStorage.setItem("uuid",u); };
  const getRole = () => sessionStorage.getItem("role");
  const clearSess = () => { sessionStorage.clear(); };

  document.querySelector("#continueOwner")?.addEventListener("click",()=>{
    const id=(inputOwner?.value||"").trim();
    if(!isOwner(id)) return alert("Invalid owner UUID");
    setSess("owner",id);
    alert("Logged in as Owner ✅");
  });

  document.querySelector("#continueAdmin")?.addEventListener("click",()=>{
    const id=(inputAdmin?.value||"").trim();
    if(!(isAdmin(id)||isOwner(id))) return alert("Invalid admin UUID");
    setSess("admin",id);
    alert("Logged in as Admin ✅");
  });

  // Safety hide overlay always
  if(L){ L.classList.add('hidden'); L.style.display='none'; }
})();