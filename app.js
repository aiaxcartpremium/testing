/* app.js — AiaxStock (v2025-11-07.1 “admin categories + owner records”) */
(() => {
  // ── tiny DOM helpers
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // ── runtime helpers
  const norm = s => (s||"").replace(/\s+/g,"").toLowerCase();
  const toast = (msg) => { const t=$(".toast"); if(!t) return; t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1500); };
  const setLoading = (on) => { const L=$(".loading-overlay"); if(!L) return; L.classList.toggle("hidden", !on); L.style.pointerEvents="none"; };
  const fmtDT = (d) => d ? new Date(d).toLocaleString() : "";
  const addDays = (date, days) => new Date(date.getTime() + (days||0)*86400000);

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

  // ── boot
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
        const { data, error } = await supabase
          .from("products")
          .select("key,label,category")
          .order("label");
        if (error) throw error;
        if (data?.length) return data; // [{key,label,category}]
      } catch {}
      // fallback from APP.PRODUCTS -> default category 'Entertainment'
      return (APP.PRODUCTS || []).map(x =>
        typeof x === "string" ? { key: x.toLowerCase(), label: x, category: "Entertainment" } : x
      );
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
      const [prods, types, durs] = await Promise.all([loadProducts(), loadAccountTypes(), loadDurations()]);
ALL_PRODUCTS = prods;       // <— save
buildCatBar();              // <— create the chips
  
      // owner defaults
      fillSelect("#productSelectOwner",[["Loading…",""]]);
      fillSelect("#typeSelectOwner", APP.ACCOUNT_TYPES || []);
      fillSelect("#durSelectOwner",  APP.DURATIONS || []);

      // admin defaults
      fillSelect("#catSelectAdmin",   [["Loading…",""]]);
      fillSelect("#productSelectAdmin",[["Loading…",""]]);
      fillSelect("#typeSelectAdmin",  []);
      fillSelect("#durSelectAdmin",   []);

      const [prods,types,durs] = await Promise.all([
        loadProducts(), loadAccountTypes(), loadDurations()
      ]);

      // owner selects (product list label shown, value=key)
      if (prods.length) fillSelect("#productSelectOwner", prods.map(r=>[r.label, r.key]));
      if (types.length) fillSelect("#typeSelectOwner", types);
      if (durs.length)  fillSelect("#durSelectOwner",  durs);

      // admin category -> product -> type/dur cascade
      const catSel = $("#catSelectAdmin");
      const prodSel = $("#productSelectAdmin");
      const typeSel = $("#typeSelectAdmin");
      const durSel  = $("#durSelectAdmin");

      const cats = [...new Set(prods.map(r => r.category || "Uncategorized"))];

      if (!catSel) { // safety if HTML changed
        fillSelect("#productSelectAdmin", prods.map(r=>[r.label,r.key]));
        prodSel?.addEventListener("change", refreshTypeDur);
        refreshTypeDur();
        return;
      }

      fillSelect("#catSelectAdmin", cats.length ? cats : [["(none)",""]]);

      function refreshProducts(){
        const c = catSel.value;
        const list = prods.filter(r => (r.category||"Uncategorized") === c);
        fillSelect("#productSelectAdmin", list.map(r=>[r.label,r.key]));
        refreshTypeDur();
      }
      function refreshTypeDur(){
        const pkey = prodSel?.value;
        adminAvailable().then(av => {
          const sub = av.filter(r=>r.product===pkey);
          const uniq = a => [...new Set(a)];
          fillSelect("#typeSelectAdmin", uniq(sub.map(r=>r.account_type)));
          fillSelect("#durSelectAdmin",  uniq(sub.map(r=>r.duration_code)));
        });
      }
      catSel.addEventListener("change", refreshProducts);
      prodSel?.addEventListener("change", refreshTypeDur);

      if (cats.length){ catSel.value = cats[0]; refreshProducts(); }
    }

    // ---------- OWNER: add stock
    async function ownerAddStock() {
      const owner_id      = getUid();
      const product       = $('#productSelectOwner')?.value||'';
      const account_type  = $('#typeSelectOwner')?.value||'';
      const duration_code = $('#durSelectOwner')?.value||'';
      const quantity      = parseInt($('#oaQty')?.value||'1',10);

      const email        = ($('#oaEmail')?.value||'').trim();
      const password     = ($('#oaPass')?.value||'').trim();
      const profile_name = ($('#oaProfile')?.value||'').trim();
      const pin          = ($('#oaPin')?.value||'').trim();
      const notes        = ($('#oaNotes')?.value||'').trim();
      const premiumed_at_raw = ($('#oaPremiumedAt')?.value||'').trim();
      const auto_expire_raw  = ($('#oaAutoExpireDays')?.value||'').trim();

      if (!product)       return alert('Select a product');
      if (!account_type)  return alert('Select account type');
      if (!duration_code) return alert('Select duration');
      if (!quantity || quantity < 1) return alert('Quantity must be at least 1');

      const payload = { owner_id, product, account_type, duration_code, quantity };
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

    // ---------- OWNER: quick “Add Record”
    async function ownerAddRecord(){
  const product = $("#recProduct")?.value.trim();
  const account_type = $("#recType")?.value.trim();
  const expires_in_ui = $("#recExpires")?.value.trim(); // optional direct datetime
  const buyer_link = $("#recBuyer")?.value.trim() || null;
  const priceStr   = $("#recPrice")?.value.trim() || "";
  const withWarranty = $("#recWarranty")?.checked || false;
  const extraDays = parseInt($("#recExtraDays")?.value || "0", 10) || 0;

  if(!product || !account_type){
    return alert("Product and Account type are required.");
  }

  setLoading(true);

  // 1) try to find matching stock to decrement (any duration with qty>0; prefer oldest)
  const { data:rows, error:errFind } = await supabase
    .from("stocks")
    .select("*")
    .eq("owner_id", getUid())
    .eq("product", product)
    .eq("account_type", account_type)
    .eq("archived", false)
    .gt("quantity", 0)
    .order("created_at", {ascending:true})
    .limit(1);

  if(errFind){ setLoading(false); return alert("Lookup failed"); }

  let duration_code = null, decOk = false, expiresBase;

  if(rows?.length){
    const s = rows[0];
    duration_code = s.duration_code;
    // decrement
    const { error:decErr } = await supabase
      .from("stocks")
      .update({ quantity: (s.quantity||1) - 1 })
      .eq("id", s.id)
      .gt("quantity", 0);
    decOk = !decErr;
  }

  const now = new Date();
  // if user provided exact expires, use that; else compute from duration (if any)
  if(expires_in_ui){
    expiresBase = new Date(expires_in_ui);
  }else if(duration_code){
    const ms = durMs(duration_code);
    expiresBase = new Date(now.getTime() + ms);
  }else{
    // default no duration → same day
    expiresBase = now;
  }
  if(withWarranty && extraDays>0) expiresBase = addDays(expiresBase, extraDays);

  const price = priceStr === "" ? null : Number(priceStr);

  const { error:insErr } = await supabase.from("sales").insert([{
    product,
    account_type,
    created_at: now.toISOString(),
    expires_at: expiresBase.toISOString(),
    admin_uuid: getUid(),   // owner performed the hand-out
    owner_uuid: getUid(),
    buyer_link,
    price,
    warranty_days: withWarranty ? extraDays : 0
  }]);

  setLoading(false);

  if(insErr){ console.error(insErr); return alert("Insert failed"); }

  toast(decOk ? "Record added (stock decremented)" : "Record added (no matching stock to decrement)");
  // clear quick form
  ["recBuyer","recPrice","recExtraDays"].forEach(id=>{ const el=$("#"+id); if(el) el.value=""; });
  $("#recWarranty")?.checked=false;
  ownerRenderRecords();
}

    // ---------- OWNER: sales records list/edit/delete
    async function ownerRenderRecords(){
      const tbody = $("#ownerRecordsTable tbody"); if(!tbody) return;
      tbody.innerHTML = `<tr><td colspan="9">Loading…</td></tr>`;
      let rows = [];
      try {
        const {data,error}=await supabase
          .from("sales")
          .select("id,product,account_type,created_at,expires_at,price,buyer_link,admin_uuid,owner_uuid,warranty_days")
          .eq("owner_uuid",getUid())
          .order("id",{ascending:false}).limit(500);
        if(error) throw error;
        rows = data||[];
      } catch(e){
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="9">Failed to load.</td></tr>`;
        return;
      }

      if(!rows.length){
        tbody.innerHTML = `<tr><td colspan="9" class="muted">No records yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(r=>`
        <tr data-id="${r.id}">
          <td>${r.id}</td>
          <td>${r.product ?? ""}</td>
          <td>${r.account_type ?? ""}</td>
          <td>${fmtDT(r.created_at)}</td>
          <td>${fmtDT(r.expires_at)}</td>
          <td>${r.admin_uuid ? r.admin_uuid.slice(0,8) : ""}</td>
          <td>${r.buyer_link || ""}</td>
          <td>${r.price ?? ""}</td>
          <td>
            <button class="btn-outline btnRecEdit">Edit</button>
            <button class="btn-outline btnRecDel">Delete</button>
          </td>
        </tr>
      `).join("");

      // wire: edit
      $$(".btnRecEdit", tbody).forEach(btn=>{
        btn.addEventListener("click", async ()=>{
          const tr = btn.closest("tr"); const id = tr.dataset.id;
          const cur = {
            product      : tr.children[1].textContent.trim(),
            type         : tr.children[2].textContent.trim(),
            expires_at   : tr.children[4].textContent.trim(),
            buyer_link   : tr.children[6].textContent.trim(),
            price        : tr.children[7].textContent.trim()
          };
          const product = prompt("Product:", cur.product) ?? cur.product;
          const type    = prompt("Account type:", cur.type) ?? cur.type;
          const buyer   = prompt("Buyer link (blank to clear):", cur.buyer_link) || null;
          const priceIn = prompt("Price (blank to clear):", cur.price) || "";
          const price   = priceIn ? Number(priceIn) : null;

          // warranty extend on edit
          const addDaysStr = prompt("Add warranty days (0 to keep):", "0") || "0";
          const extraDays  = parseInt(addDaysStr,10) || 0;
          let expires = cur.expires_at ? new Date(cur.expires_at) : new Date();
          if(extraDays>0) expires = addDays(expires, extraDays);

          setLoading(true);
          const { error } = await supabase.from("sales")
            .update({ product, account_type: type, buyer_link: buyer, price, expires_at: expires.toISOString() })
            .eq("id", id)
            .eq("owner_uuid", getUid());
          setLoading(false);

          if(error){ console.error(error); return alert("Update failed"); }
          toast("Record updated");
          ownerRenderRecords();
        });
      });

      // wire: delete
      $$(".btnRecDel", tbody).forEach(btn=>{
        btn.addEventListener("click", async ()=>{
          const tr = btn.closest("tr"); const id = tr.dataset.id;
          if(!confirm(`Delete record #${id}?`)) return;
          setLoading(true);
          const { error } = await supabase.from("sales").delete().eq("id", id).eq("owner_uuid", getUid());
          setLoading(false);
          if(error){ console.error(error); return alert("Delete failed"); }
          ownerRenderRecords();
        });
      });

      // CSV export
      $("#btnExportCSV")?.addEventListener("click", ()=>{
        if(!rows.length) return;
        const head = Object.keys(rows[0]);
        const esc = v => v==null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
        const csv = [head.join(","), ...rows.map(r=>head.map(k=>esc(r[k])).join(","))].join("\n");
        const blob = new Blob([csv], {type:"text/csv"});
        const url  = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "owner_records.csv"; a.click();
        URL.revokeObjectURL(url);
      }, { once:true });
    }

    // ---------- ADMIN
    async function adminAvailable(){
      try{
        const {data,error} = await supabase
          .from("stocks_available_for_admin")
          .select("product,account_type,duration_code,total_qty")
          .order("product");
        if(error) throw error;
        if(data?.length) return data;
      } catch{}
      // fallback: aggregate directly from stocks
      const {data,error} = await supabase
        .from("stocks")
        .select("product,account_type,duration_code,quantity,archived")
        .gt("quantity",0)
        .eq("archived",false);
      if(error){ console.error(error); return []; }
      const map=new Map();
      for(const r of data){
        const k=`${r.product}|${r.account_type}|${r.duration_code}`;
        map.set(k,(map.get(k)||0)+(r.quantity||0));
      }
      return [...map.entries()].map(([k,qty])=>{
        const [product,account_type,duration_code]=k.split("|");
        return {product,account_type,duration_code,total_qty:qty};
      });
    }
    let ALL_PRODUCTS = [];     // from loadProducts()
let ADMIN_AVAIL   = [];    // from adminAvailable()
let CUR_CAT = null;

function buildCatBar(){
  const bar = $("#catBar"); if(!bar || !ALL_PRODUCTS.length) return;
  const cats = [...new Set(ALL_PRODUCTS.map(p => p.category || "Uncategorized"))];
  bar.innerHTML = ["All", ...cats].map(c => `<button class="chip" data-cat="${c}">${c}</button>`).join("");
  bar.addEventListener("click", e=>{
    const b = e.target.closest(".chip"); if(!b) return;
    CUR_CAT = b.dataset.cat === "All" ? null : b.dataset.cat;
    $$("#catBar .chip").forEach(x=>x.classList.toggle("active", x===b));
    adminRenderAvailable();     // re-render table with filter
    adminFillFormOptions();     // refill 3 selects with filter
  });
  // default select = All
  $$("#catBar .chip")[0]?.classList.add("active");
}

function filterAvailByCat(rows){
  if(!CUR_CAT) return rows;
  const keys = new Set(ALL_PRODUCTS.filter(p=> (p.category||"Uncategorized")===CUR_CAT).map(p=>p.key));
  return rows.filter(r => keys.has(r.product));
}

    async function adminRenderAvailable(){
      const body=$("#adminStocksBody"); if(!body) return;
      body.innerHTML = `<tr><td colspan="4">Fetching…</td></tr>`;
      const rows = filterAvailByCat(await adminAvailable());
      body.innerHTML = rows.length
        ? rows.map(r=>`<tr><td>${r.product}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>`).join("")
        : `<tr><td colspan="4" class="muted">No data yet</td></tr>`;
    }

    async function adminFillFormOptions(){
      const prodSel=$("#productSelectAdmin"), typeSel=$("#typeSelectAdmin"), durSel=$("#durSelectAdmin");
      if(!prodSel||!typeSel||!durSel) return;
      const avail = filterAvailByCat(await adminAvailable());
      const products=uniq(avail.map(r=>r.product));
      prodSel.innerHTML = "";
      products.forEach(p=>{ const o=document.createElement("option"); o.value=p; o.textContent=p; prodSel.appendChild(o); });
      function refresh(){
        const p=prodSel.value; const sub=avail.filter(r=>r.product===p);
        typeSel.innerHTML=""; durSel.innerHTML="";
        uniq(sub.map(r=>r.account_type)).forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;typeSel.appendChild(o);});
        uniq(sub.map(r=>r.duration_code)).forEach(v=>{const o=document.createElement("option");o.value=o.textContent=v;durSel.appendChild(o);});
      }
      if(products.length){ prodSel.value=products[0]; refresh(); }
      prodSel.addEventListener("change", refresh);
    }

    async function adminGetAccount(){
      const product=$("#productSelectAdmin")?.value,
            type=$("#typeSelectAdmin")?.value,
            duration=$("#durSelectAdmin")?.value;
      if(!product||!type||!duration) return alert("Complete the selections first.");
      const admin_uuid=getUid(); if(!admin_uuid) return alert("Session missing. Please re-login.");

      setLoading(true);
      let res = await supabase.rpc("get_account_v2", {
  p_admin: admin_uuid,
  p_product: product,
  p_type: type,
  p_duration: duration
});

      if(res.error) return alert("get_account failed: " + res.error.message);
      const data = res.data || [];
      if(!data.length){ $("#adminCreds").textContent = "No matching stock."; return; }

      const r = data[0];
      $("#adminCreds").innerHTML = `
        <div class="card">
          <div><b>Product:</b> ${product} • <b>Type:</b> ${type} • <b>Duration:</b> ${duration}</div>
          <div><b>Email:</b> ${r.email || "-"}</div>
          <div><b>Password:</b> ${r.password || "-"}</div>
          <div><b>Profile:</b> ${r.profile_name || "-"} &nbsp; <b>PIN:</b> ${r.pin || "-"}</div>
          <div><b>Expires:</b> ${r.expires_at ? new Date(r.expires_at).toLocaleString() : "-"}</div>
        </div>`;
      await adminRefreshAll();
    }

    async function adminRenderMySales(){
      const tbody=$("#adminRecordsTable tbody"); if(!tbody) return;
      tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;
      try{
        const {data,error}=await supabase.rpc("list_my_sales",{ p_admin:getUid() });
        if(error) throw error;
        const rows=data||[];
        if(!rows.length){ tbody.innerHTML = `<tr><td colspan="6" class="muted">No records yet.</td></tr>`; return; }
        tbody.innerHTML = rows.map(r=>`
          <tr data-id="${r.id}">
            <td>${r.id}</td>
            <td>${r.product ?? ""}</td>
            <td>${r.account_type ?? ""}</td>
            <td>${fmtDT(r.created_at)}</td>
            <td>${fmtDT(r.expires_at)}</td>
            <td>
              <button class="btn-outline btnEditRec">Edit</button>
            </td>
          </tr>`).join("");

        $$(".btnEditRec", tbody).forEach(b=>b.addEventListener("click", async ()=>{
          const id = b.closest("tr").dataset.id;
          const buyer_link = prompt("Buyer link (leave blank to clear):", "") || null;
          const priceStr   = prompt("Price (number, leave blank to clear):", "") || "";
          const price = priceStr === "" ? null : Number(priceStr);
          const { error } = await supabase.from("sales").update({ buyer_link, price }).eq("id", id);
          if(error){ alert("Update failed"); console.error(error); return; }
          adminRenderMySales();
        }));
      }catch(e){
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="6">Failed to load.</td></tr>`;
      }
    }

    async function adminRefreshAll(){
      await adminRenderAvailable();
      await adminFillFormOptions();
      await adminRenderMySales();
    }

    // ---------- UI wiring + routing
    function showOwner(){
      if(getRole()!=="owner"){ alert("Owners only."); return; }
      $("#viewLogin")?.classList.add("hidden");
      $("#viewAdmin")?.classList.add("hidden");
      $("#viewOwner")?.classList.remove("hidden");
      $("#goToOwner")?.classList.add("hidden");                 // hide "go to owner" when already owner
      $("#goToAdmin")?.classList.toggle("hidden", getRole()!=="owner");
    }
    function showAdmin(){
      $("#viewLogin")?.classList.add("hidden");
      $("#viewOwner")?.classList.add("hidden");
      $("#viewAdmin")?.classList.remove("hidden");
      $("#goToOwner")?.classList.toggle("hidden", getRole()!=="owner"); // only owner can see this
      $("#goToAdmin")?.classList.add("hidden");
    }
    function showLogin(){
      $("#viewLogin")?.classList.remove("hidden");
      $("#viewOwner")?.classList.add("hidden");
      $("#viewAdmin")?.classList.add("hidden");
    }

    // ensure button type=button (avoid form submit refresh)
    ["#btnLoginOwner","#btnLoginAdmin","#continueOwner","#continueAdmin",
     "#oaAddBtn","#getAccountBtn","#btnOwnerRefresh","#btnOwnerPurge",
     "#btnAddRecord","#btnExportCSV"].forEach(s=>{const b=$(s); if(b) b.type="button";});

    // login
    const btnOwner=$("#btnLoginOwner"), btnAdmin=$("#btnLoginAdmin");
    const cardOwner=$("#ownerLoginCard"), cardAdmin=$("#adminLoginCard");
    const inputOwner=$("#ownerUuid"), inputAdmin=$("#adminUuid");

    btnOwner?.addEventListener("click",()=>{ cardAdmin?.classList.add("hidden"); cardOwner?.classList.remove("hidden"); inputOwner?.focus(); });
    btnAdmin?.addEventListener("click",()=>{ cardOwner?.classList.add("hidden"); cardAdmin?.classList.remove("hidden"); inputAdmin?.focus(); });

    document.addEventListener("click",(e)=>{
      const t=e.target.closest("#continueOwner,#continueAdmin"); if(!t) return; e.preventDefault();
      if(t.id==="continueOwner"){
        const id=(inputOwner?.value||"").trim();
        if(!isOwner(id)) return alert("UUID is not an Owner ID.");
        setSess("owner", id); showOwner(); ownerRenderStocks(); ownerRenderRecords();
      }else{
        const id=(inputAdmin?.value||"").trim();
        if(!(isOwner(id)||isAdmin(id))) return alert("UUID is not an Admin ID.");
        setSess("admin", id); showAdmin(); adminRefreshAll();
      }
    });

    // top nav + owner tabs
    $("#goToAdmin")?.addEventListener("click", ()=>{ if(getRole()){ showAdmin(); adminRefreshAll(); }});
    $("#goToOwner")?.addEventListener("click", ()=>{ if(getRole()==="owner"){ showOwner(); ownerRenderStocks(); ownerRenderRecords(); }});
    $$(".btnLogout").forEach(b=>b.addEventListener("click", ()=>{ clearSess(); showLogin(); }));

    const tabs=$$(".tab");
    tabs.forEach(t=>t.addEventListener("click",()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const target=t.dataset.target;
      $$(".tab-page").forEach(p=>p.classList.add("hidden"));
      $("#"+target)?.classList.remove("hidden");
    }));

    $("#btnOwnerRefresh")?.addEventListener("click", ownerRenderStocks);
    $("#btnOwnerPurge")?.addEventListener("click", ownerPurgeExpired);
    $("#chkShowArchived")?.addEventListener("change", ownerRenderStocks);
    $("#oaAddBtn")?.addEventListener("click", ownerAddStock);
    $("#btnAddRecord")?.addEventListener("click", ownerAddRecord);
    $("#getAccountBtn")?.addEventListener("click", adminGetAccount);

    // auto-view based on session
    const r=getRole(), u=getUid();
    if(r && u){
      if(r==="owner"){ showOwner(); ownerRenderStocks(); ownerRenderRecords(); }
      else { showAdmin(); adminRefreshAll(); }
    } else {
      showLogin();
    }

    // prime options finally
    await primeOptions();
    }

  document.addEventListener("DOMContentLoaded", boot);
})();