/* app.js — AiaxStock (v2025-11-07, “synced schema”) */
(() => {
  // ── tiny DOM helpers
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // ── runtime helpers
  const norm = s => (s||"").replace(/\s+/g,"").toLowerCase();
  const toast = (msg) => { const t=$(".toast"); if(!t) return; t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1500); };
  const setLoading = (on) => { const L=$(".loading-overlay"); if(!L) return; L.classList.toggle("hidden", !on); L.style.pointerEvents="none"; };
  const fmtDT = (d) => d ? new Date(d).toLocaleString() : "";

  // ── session (simple)
  const SKEY_ROLE = "aiax.role";
  const SKEY_UID  = "aiax.uid";
  const setSess   = (role, uid) => { sessionStorage.setItem(SKEY_ROLE, role); sessionStorage.setItem(SKEY_UID, uid); };
  const getRole   = () => sessionStorage.getItem(SKEY_ROLE);
  const getUid    = () => sessionStorage.getItem(SKEY_UID);
  const clearSess = () => { sessionStorage.removeItem(SKEY_ROLE); sessionStorage.removeItem(SKEY_UID); };

  // convert duration code to ms (months≈30d except 12m=365d)
  const durMs = (code) => {
    if (!code) return 0;
    if (/^\d+d$/.test(code)) return parseInt(code,10)*86400000;
    if (/^\d+m$/.test(code)) { const m=parseInt(code,10); return (m===12?365:30*m)*86400000; }
    return 0;
  };

  // ── boot (wait until config.js is present)
  async function boot(){
    const APP = window.APP || {};
    if (!APP.url || !APP.key) { alert("Missing config.js"); return; }
    const supabase = window.supabase.createClient(APP.url, APP.key);
    const isOwner = uid => norm(uid) === norm(APP.ownerId);
    const isAdmin = uid => (APP.admins||[]).map(norm).includes(norm(uid));

    // ---------- OPTIONS (products, types, durations)
    const fillSelect = (sel, items) => {
      const el=$(sel); if(!el) return;
      el.innerHTML="";
      (items||[]).forEach(it=>{
        let label,value;
        if (Array.isArray(it)) [label,value]=it;
        else if (typeof it==="string") label=value=it;
        else if (it && it.label!=null && it.key!=null) { label=it.label; value=it.key; }
        else return;
        const o=document.createElement("option"); o.value=value; o.textContent=label; el.appendChild(o);
      });
    };

    async function loadProducts() {
      try {
        const {data,error} = await supabase.from("products").select("key,label").order("label");
        if (error) throw error;
        if (data?.length) return data.map(r=>[r.label, r.key]); // UI label, value=key
      } catch {}
      return (APP.PRODUCTS||[]).map(x => Array.isArray(x)?x:[x,x]);
    }
    async function loadAccountTypes() {
      try { const {data,error} = await supabase.from("account_types").select("label").order("label"); if(error) throw error; if(data?.length) return data.map(r=>r.label); } catch {}
      return APP.ACCOUNT_TYPES || [];
    }
    async function loadDurations() {
      try { const {data,error} = await supabase.from("durations").select("label,code,seq").order("seq",{ascending:true}); if(error) throw error; if(data?.length) return data.map(r=>[r.label,r.code]); } catch {}
      return APP.DURATIONS || [];
    }
    async function primeOptions(){
      fillSelect("#productSelectOwner",[["Loading…",""]]);
      fillSelect("#productSelectAdmin",[["Loading…",""]]);
      fillSelect("#typeSelectOwner", APP.ACCOUNT_TYPES || []);
      fillSelect("#typeSelectAdmin", APP.ACCOUNT_TYPES || []);
      fillSelect("#durSelectOwner", APP.DURATIONS || []);
      fillSelect("#durSelectAdmin", APP.DURATIONS || []);

      const [prods,types,durs]=await Promise.all([loadProducts(),loadAccountTypes(),loadDurations()]);
      if(prods.length){ fillSelect("#productSelectOwner",prods); fillSelect("#productSelectAdmin",prods); }
      if(types.length){ fillSelect("#typeSelectOwner",types); fillSelect("#typeSelectAdmin",types); }
      if(durs.length){ fillSelect("#durSelectOwner",durs); fillSelect("#durSelectAdmin",durs); }
    }

    // ---------- OWNER: add stock (matches public.stocks columns)
    async function ownerAddStock() {
      const owner_id     = getUid();                          // uuid
      const product      = $('#productSelectOwner')?.value||''; // TEXT (key)
      const account_type = $('#typeSelectOwner')?.value||'';    // TEXT
      const duration_code= $('#durSelectOwner')?.value||'';     // TEXT
      const quantity     = parseInt($('#oaQty')?.value||'1',10);

      const email        = ($('#oaEmail')?.value||'').trim();
      const password     = ($('#oaPass')?.value||'').trim();
      const profile_name = ($('#oaProfile')?.value||'').trim();
      const pin          = ($('#oaPin')?.value||'').trim();
      const notes        = ($('#oaNotes')?.value||'').trim();

      // NOTE: IDs fixed to match your HTML
      const premiumed_at_raw = ($('#oaPremiumedAt')?.value||'').trim();
      const auto_expire_raw  = ($('#oaAutoExpireDays')?.value||'').trim();

      if (!product)       return alert('Select a product');
      if (!account_type)  return alert('Select account type');
      if (!duration_code) return alert('Select duration');
      if (!quantity || quantity < 1) return alert('Quantity must be at least 1');

      const payload = { owner_id, product, account_type, duration_code, quantity };

      // only set optional fields if they exist to avoid schema errors
      if (email)        payload.email = email;
      if (password)     payload.password = password;
      if (profile_name) payload.profile_name = profile_name;
      if (pin)          payload.pin = pin;
      if (notes)        payload.notes = notes;
      if (premiumed_at_raw) {
        const d = new Date(premiumed_at_raw);
        if (!isNaN(d)) payload.premiumed_at = d.toISOString();
      }
      if (auto_expire_raw && !isNaN(parseInt(auto_expire_raw,10))) {
        payload.auto_expire_days = parseInt(auto_expire_raw,10);
      }

      setLoading(true);
      const { error } = await supabase.from('stocks').insert([payload]);
      setLoading(false);

      if (error) { console.error(error); alert('Add stock failed: ' + (error.message||'unknown')); return; }

      toast('Stock added');
      $('#oaQty').value = '1';
      ['oaEmail','oaPass','oaProfile','oaPin','oaNotes','oaPremiumedAt','oaAutoExpireDays'].forEach(id => { const el = $('#'+id); if (el) el.value = ''; });
      await ownerRenderStocks();
    }

    // ---------- OWNER: list / edit / archive
    function ownerStocksSelect(showArchived){
      return supabase.from("stocks")
        .select("id,product,account_type,duration_code,quantity,premiumed_at,created_at,auto_expire_days,archived,owner_id")
        .eq("owner_id", getUid())
        .eq("archived", !!showArchived);
    }
    async function ownerRenderStocks(){
      const tbody = $("#ownerStocksTable tbody"); if(!tbody) return;
      const showArchived = $("#chkShowArchived")?.checked || false;

      tbody.innerHTML = `<tr><td colspan="10">Loading…</td></tr>`;
      const { data, error } = await ownerStocksSelect(showArchived).order("created_at", {ascending:false});
      if(error){ console.error(error); tbody.innerHTML = `<tr><td colspan="10">Failed to load.</td></tr>`; return; }
      if(!data?.length){ tbody.innerHTML = `<tr><td colspan="10" class="muted">No stocks${showArchived?" (archived)":""}.</td></tr>`; return; }

      tbody.innerHTML = data.map(r=>`
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td>${r.product}</td>
          <td>${r.account_type}</td>
          <td>${r.duration_code}</td>
          <td>${r.quantity}</td>
          <td>${fmtDT(r.premiumed_at)}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td>${r.auto_expire_days ?? ""}</td>
          <td>${r.archived ? "yes" : ""}</td>
          <td>
            <button class="btn-outline btnEdit">Edit</button>
            <button class="btn-outline btnRemove">Remove</button>
            ${r.archived ? `<button class="btn-outline btnUnarchive">Unarchive</button>` : `<button class="btn-outline btnArchive">Archive</button>`}
          </td>
        </tr>
      `).join("");

      // actions
      $$(".btnRemove", tbody).forEach(b=>b.addEventListener("click", async ()=>{
        const id = b.closest("tr").dataset.id;
        if(!confirm(`Delete stock #${id}?`)) return;
        setLoading(true);
        const { error } = await supabase.from("stocks").delete().eq("id", id);
        setLoading(false);
        if(error){ alert("Remove failed"); console.error(error); return; }
        ownerRenderStocks();
      }));

      $$(".btnEdit", tbody).forEach(b=>b.addEventListener("click", async ()=>{
        const tr = b.closest("tr"); const id = tr.dataset.id;
        const cur = {
          quantity: parseInt(tr.children[4].textContent||"0",10),
          premiumed_at: tr.children[5].textContent,
          auto_expire_days: tr.children[7].textContent
        };
        const quantity = parseInt(prompt("Quantity:", cur.quantity) ?? cur.quantity, 10);
        const premiumed_at_str = prompt("Premiumed at (yyyy-mm-dd hh:mm, blank to clear):", cur.premiumed_at||"") || "";
        const auto_days_str = prompt("Auto-archive if unsold (days, blank to clear):", cur.auto_expire_days||"") || "";
        const premiumed_at = premiumed_at_str ? new Date(premiumed_at_str).toISOString() : null;
        const auto_expire_days = auto_days_str ? parseInt(auto_days_str,10) : null;

        setLoading(true);
        const { error } = await supabase.from("stocks")
          .update({ quantity, premiumed_at, auto_expire_days })
          .eq("id", id);
        setLoading(false);
        if(error){ alert("Edit failed"); console.error(error); return; }
        ownerRenderStocks();
      }));

      $$(".btnArchive", tbody).forEach(b=>b.addEventListener("click", async ()=>{
        const id = b.closest("tr").dataset.id;
        const { error } = await supabase.from("stocks").update({ archived:true }).eq("id", id);
        if(error){ alert("Archive failed"); console.error(error); return; }
        ownerRenderStocks();
      }));
      $$(".btnUnarchive", tbody).forEach(b=>b.addEventListener("click", async ()=>{
        const id = b.closest("tr").dataset.id;
        const { error } = await supabase.from("stocks").update({ archived:false }).eq("id", id);
        if(error){ alert("Unarchive failed"); console.error(error); return; }
        ownerRenderStocks();
      }));
    }

    // purge: archive unsold whose age>auto_expire_days
    async function ownerPurgeExpired(){
      const { data, error } = await supabase
        .from("stocks")
        .select("id,created_at,auto_expire_days,quantity,archived,owner_id")
        .eq("owner_id", getUid())
        .eq("archived", false)
        .gt("auto_expire_days", 0);
      if(error){ console.error(error); return; }
      const now = Date.now();
      const toArchive = (data||[]).filter(r => r.quantity>0 && r.auto_expire_days && (now - new Date(r.created_at).getTime()) > r.auto_expire_days*86400000).map(r=>r.id);
      if(!toArchive.length){ toast("Nothing to archive"); return; }
      const { error:err2 } = await supabase.from("stocks").update({ archived:true }).in("id", toArchive);
      if(err2){ console.error(err2); alert("Auto-archive failed"); return; }
      toast(`Archived ${toArchive.length}`);
      ownerRenderStocks();
    }

    // ---------- OWNER: sales records
    async function ownerRenderRecords(){
      const tbody = $("#ownerRecordsTable tbody"); if(!tbody) return;
      tbody.innerHTML = `<tr><td colspan="8">Loading…</td></tr>`;
      let rows = [];
      try { const {data,error}=await supabase.rpc("list_my_sales",{ p_owner:getUid() }); if(error) throw error; rows=data||[]; }
      catch {
        const {data}=await supabase.from("sales").select("id,product,account_type,created_at,expires_at,price,buyer_link,admin_uuid,owner_uuid").eq("owner_uuid",getUid()).order("id",{ascending:false}).limit(300);
        rows=data||[];
      }
      if(!rows.length){ tbody.innerHTML = `<tr><td colspan="8" class="muted">No records yet.</td></tr>`; return; }
      tbody.innerHTML = rows.map(r=>`
        <tr>
          <td>${r.id}</td>
          <td>${r.product}</td>
          <td>${r.account_type}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td>${fmtDT(r.expires_at)}</td>
          <td>${r.admin_uuid ? r.admin_uuid.slice(0,8) : ""}</td>
          <td>${r.buyer_link||""}</td>
          <td>${r.price ?? ""}</td>
        </tr>
      `).join("");

      $("#btnExportCSV")?.addEventListener("click", ()=>{
        if(!rows.length) return;
        const head = Object.keys(rows[0]);
        const esc = v => v==null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
        const csv = [head.join(","), ...rows.map(r=>head.map(k=>esc(r[k])).join(","))].join("\n");
        const blob = new Blob([csv], {type:"text/csv"}); const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url; a.download="owner_records.csv"; a.click();
        URL.revokeObjectURL(url);
      }, { once:true });
    }

    // ---------- ADMIN
    async function adminAvailable(){
      try{
        const {data,error} = await supabase.from("stocks_available_for_admin").select("product,account_type,duration_code,total_qty").order("product");
        if(error) throw error; if(data?.length) return data;
      } catch{}
      const {data,error} = await supabase.from("stocks").select("product,account_type,duration_code,quantity,archived").gt("quantity",0).eq("archived",false);
      if(error){ console.error(error); return []; }
      const map=new Map(); for(const r of data){ const k=`${r.product}|${r.account_type}|${r.duration_code}`; map.set(k,(map.get(k)||0)+(r.quantity||0)); }
      return [...map.entries()].map(([k,qty])=>{ const [product,account_type,duration_code]=k.split("|"); return {product,account_type,duration_code,total_qty:qty};});
    }
    async function adminRenderAvailable(){
      const body=$("#adminStocksBody"); if(!body) return;
      body.innerHTML = `<tr><td colspan="4">Fetching…</td></tr>`;
      const rows = await adminAvailable();
      body.innerHTML = rows.length ? rows.map(r=>`<tr><td>${r.product}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">No data yet</td></tr>`;
    }
    async function adminFillFormOptions(){
      const prodSel=$("#productSelectAdmin"), typeSel=$("#typeSelectAdmin"), durSel=$("#durSelectAdmin");
      if(!prodSel||!typeSel||!durSel) return;
      const avail=await adminAvailable(); const uniq=a=>[...new Set(a)];
      const products=uniq(avail.map(r=>r.product));
      prodSel.innerHTML = "";
      products.forEach(p=>{ const o=document.createElement("option"); o.value=p; o.textContent=p; prodSel.appendChild(o); });
      function refresh(){ const p=prodSel.value; const sub=avail.filter(r=>r.product===p); typeSel.innerHTML=""; durSel.innerHTML=""; uniq(sub.map(r=>r.account_type)).forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;typeSel.appendChild(o);}); uniq(sub.map(r=>r.duration_code)).forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;durSel.appendChild(o);}); }
      if(products.length){ prodSel.value=products[0]; refresh(); }
      prodSel.addEventListener("change", refresh);
    }
    async function adminGetAccount(){
      const product=$("#productSelectAdmin")?.value, type=$("#typeSelectAdmin")?.value, duration=$("#durSelectAdmin")?.value;
      if(!product||!type||!duration) return alert("Complete the selections first.");
      const admin_uuid=getUid(); if(!admin_uuid) return alert("Session missing. Please re-login.");

      setLoading(true);
      let data=null, error=null;
      try{ const res = await supabase.rpc("get_account",{ p_admin:admin_uuid, p_product:product, p_type:type, p_duration:duration }); data=res.data; error=res.error; }catch(e){ error=e; }
      setLoading(false);

      if(error || !data?.length){
        // fallback: oldest unarchived with qty>0
        const { data:rows, error:e2 } = await supabase.from("stocks").select("*").eq("product",product).eq("account_type",type).eq("duration_code",duration).eq("archived",false).gt("quantity",0).order("created_at",{ascending:true}).limit(1);
        if(e2){ console.error(e2); return alert("get_account failed."); }
        const row = rows?.[0];
        if(!row){ const out=$("#adminCreds"); if(out) out.textContent="No matching stock."; return; }

        // decrement
        const { error:e3 } = await supabase.from("stocks").update({ quantity: (row.quantity||1)-1 }).eq("id", row.id).gt("quantity",0);
        if(e3){ console.error(e3); return alert("get_account failed (decrement)."); }

        // create a minimal sales record
        const now = new Date();
        const expires_at = new Date(now.getTime() + durMs(duration)).toISOString();
        await supabase.from("sales").insert([{
          product, account_type:type, created_at: now.toISOString(), expires_at,
          admin_uuid, owner_uuid: row.owner_id, buyer_link: null, price: null
        }]);

        const out = $("#adminCreds");
        if(out){
          out.innerHTML = `
            <div class="card">
              <div><b>Product:</b> ${product} • <b>Type:</b> ${type} • <b>Duration:</b> ${duration}</div>
              <div><b>Email:</b> ${row.email || "-"}</div>
              <div><b>Password:</b> ${row.password || "-"}</div>
              <div><b>Profile:</b> ${row.profile_name || "-"} &nbsp; <b>PIN:</b> ${row.pin || "-"}</div>
            </div>
          `;
        }
      } else {
        const r = data[0];
        const out=$("#adminCreds");
        if(out){
          out.innerHTML = `
            <div class="card">
              <div><b>Product:</b> ${product} • <b>Type:</b> ${type} • <b>Duration:</b> ${duration}</div>
              <div><b>Email:</b> ${r.email || "-"}</div>
              <div><b>Password:</b> ${r.password || "-"}</div>
              <div><b>Profile:</b> ${r.profile_name || "-"} &nbsp; <b>PIN:</b> ${r.pin || "-"}</div>
              <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div>
            </div>
          `;
        }
      }

      await adminRefreshAll();
    }
    async function adminRenderMySales(){
      const tbody=$("#adminRecordsTable tbody"); if(!tbody) return;
      tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
      try{
        const {data,error}=await supabase.rpc("list_my_sales",{ p_admin:getUid() });
        if(error) throw error;
        const rows=data||[];
        tbody.innerHTML = rows.length? rows.map(r=>`<tr><td>${r.id}</td><td>${r.product}</td><td>${r.account_type}</td><td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">No records yet.</td></tr>`;
      }catch(e){ console.error(e); tbody.innerHTML = `<tr><td colspan="5">Failed to load.</td></tr>`; }
    }
    async function adminRefreshAll(){ await adminRenderAvailable(); await adminFillFormOptions(); await adminRenderMySales(); }

    // ---------- UI wiring
    function showLogin(){ $("#viewLogin")?.classList.remove("hidden"); $("#viewOwner")?.classList.add("hidden"); $("#viewAdmin")?.classList.add("hidden"); $("#ownerLoginCard")?.classList.add("hidden"); $("#adminLoginCard")?.classList.add("hidden"); }
    function showOwner(){ $("#viewLogin")?.classList.add("hidden"); $("#viewAdmin")?.classList.add("hidden"); $("#viewOwner")?.classList.remove("hidden"); }
    function showAdmin(){ $("#viewLogin")?.classList.add("hidden"); $("#viewOwner")?.classList.add("hidden"); $("#viewAdmin")?.classList.remove("hidden"); }

    // ensure button type=button
    ["#btnLoginOwner","#btnLoginAdmin","#continueOwner","#continueAdmin","#oaAddBtn","#getAccountBtn","#btnOwnerRefresh","#btnOwnerPurge"].forEach(s=>{const b=$(s); if(b) b.type="button";});

    // login
    const btnOwner=$("#btnLoginOwner"), btnAdmin=$("#btnLoginAdmin");
    const cardOwner=$("#ownerLoginCard"), cardAdmin=$("#adminLoginCard");
    const inputOwner=$("#ownerUuid"), inputAdmin=$("#adminUuid");

    btnOwner?.addEventListener("click",()=>{ cardAdmin?.classList.add("hidden"); cardOwner?.classList.remove("hidden"); inputOwner?.focus(); });
    btnAdmin?.addEventListener("click",()=>{ cardOwner?.classList.add("hidden"); cardAdmin?.classList.remove("hidden"); inputAdmin?.focus(); });

    document.addEventListener("click",(e)=>{
      const t=e.target.closest("#continueOwner,#continueAdmin"); if(!t) return; e.preventDefault();
      if(t.id==="continueOwner"){ const id=(inputOwner?.value||"").trim(); if(!isOwner(id)) return alert("UUID is not an Owner ID."); setSess("owner", id); showOwner(); ownerRenderStocks(); ownerRenderRecords(); }
      else { const id=(inputAdmin?.value||"").trim(); if(!(isOwner(id)||isAdmin(id))) return alert("UUID is not an Admin ID."); setSess("admin", id); showAdmin(); adminRefreshAll(); }
    });

    // top nav + owner tabs
    $("#goToAdmin")?.addEventListener("click", ()=>{ if(getRole()){ showAdmin(); adminRefreshAll(); }});
    $("#goToOwner")?.addEventListener("click", ()=>{ if(getRole()){ showOwner(); ownerRenderStocks(); ownerRenderRecords(); }});
    $$(".btnLogout").forEach(b=>b.addEventListener("click", ()=>{ clearSess(); showLogin(); }));
    const tabs=$$(".tab"); tabs.forEach(t=>t.addEventListener("click",()=>{ tabs.forEach(x=>x.classList.remove("active")); t.classList.add("active"); const target=t.dataset.target; $$(".tab-page").forEach(p=>p.classList.add("hidden")); $("#"+target)?.classList.remove("hidden"); }));
    $("#btnOwnerRefresh")?.addEventListener("click", ownerRenderStocks);
    $("#btnOwnerPurge")?.addEventListener("click", ownerPurgeExpired);
    $("#chkShowArchived")?.addEventListener("change", ownerRenderStocks);
    $("#oaAddBtn")?.addEventListener("click", ownerAddStock);
    $("#getAccountBtn")?.addEventListener("click", adminGetAccount);

    // auto-view based on session
    const r=getRole(), u=getUid();
    if(r && u){
      if(r==="owner"){ showOwner(); ownerRenderStocks(); ownerRenderRecords(); }
      else { showAdmin(); adminRefreshAll(); }
    } else showLogin();

    // prime options finally
    await primeOptions();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();