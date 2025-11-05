/* =========================
   AiaxStock Management • app.js
   ========================= */

const supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (()=>{ alert('App not loaded'); throw new Error('no supabase'); })();

/* ------------ tiny DOM helpers ------------- */
const qs  = (s,root=document)=>root.querySelector(s);
const qsa = (s,root=document)=>[...root.querySelectorAll(s)];
const on  = (el,ev,fn,o)=>el&&el.addEventListener(ev,fn,o);

/* ------------ session (no magic link) ------------- */
const SESSION_KEY = 'aiax.session'; // {role:'owner'|'admin', uuid:'...'}
const saveSession=s=>localStorage.setItem(SESSION_KEY,JSON.stringify(s));
const getSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}};
const clearSession=()=>localStorage.removeItem(SESSION_KEY);
const currentUUID = ()=> getSession()?.uuid || null;

/* ------------ guards ------------- */
async function requireRole(allowed){
  const s=getSession();
  if(!s || !allowed.includes(s.role)){ location.href='index.html'; throw new Error('forbidden'); }
  return s;
}
function isOwnerUUID(uuid){ return uuid===window.ID_OWNER; }
function isAdminUUID(uuid){ return window.ADMIN_IDS.includes(uuid); }

/* ------------ formatting ------------- */
const fmtDT = d => d? new Date(d).toLocaleString(): '';
const csvEscape = v => v==null? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
const toCSV = rows => !rows?.length? '' : [Object.keys(rows[0]).join(','), ...rows.map(r=>Object.keys(rows[0]).map(k=>csvEscape(r[k])).join(','))].join('\n');

/* ------------ static options ------------- */
const ACCOUNT_TYPES = ['shared profile','solo profile','shared account','solo account','invitation','head','edu'];
const DURATIONS = [['7 days','7d'],['14 days','14d'],['1 month','1m'],['2 months','2m'],['3 months','3m'],['4 months','4m'],['5 months','5m'],['6 months','6m'],['7 months','7m'],['8 months','8m'],['9 months','9m'],['10 months','10m'],['11 months','11m'],['12 months','12m'],['auto-renew','auto']];

/* ------------ products ------------- */
async function fetchProducts(){
  const {data,error}=await supabase.from('products').select('key,label').order('label');
  if(error){ console.error(error); return []; }
  return data||[];
}
async function fillProductsSelect(sel){
  const rows=await fetchProducts();
  sel.innerHTML = `<option value="" disabled selected>Select product</option>` + rows.map(r=>`<option value="${r.key}">${r.label}</option>`).join('');
}

/* ------------ Owner: Add Stock ------------- */
function ownerFillStatic(){
  const t=qs('#typeSelect'), d=qs('#durationSelect');
  if(t) t.innerHTML = ACCOUNT_TYPES.map(x=>`<option>${x}</option>`).join('');
  if(d) d.innerHTML = DURATIONS.map(([l,v])=>`<option value="${v}">${l}</option>`).join('');
}
async function ownerAddStockSubmit(e){
  e.preventDefault();
  const owner_uuid = currentUUID();
  const product_key  = qs('#productSelect')?.value;
  const account_type = qs('#typeSelect')?.value;
  const duration_code= qs('#durationSelect')?.value;
  const quantity     = Math.max(1, parseInt(qs('#qtyInput')?.value||'1',10));
  const email        = qs('#emailInput')?.value.trim() || null;
  const password     = qs('#passInput')?.value.trim() || null;
  const profile_name = qs('#profileInput')?.value.trim() || null;
  const pin          = qs('#pinInput')?.value.trim() || null;
  const notes        = qs('#notesInput')?.value.trim() || null;

  if(!product_key)  return alert('Select product');
  if(!account_type) return alert('Select account type');
  if(!duration_code)return alert('Select duration');

  const payload = { owner_id: owner_uuid, product_key, account_type, duration_code, quantity, email, password, profile_name, pin, notes };
  const { error } = await supabase.from('stocks').insert([payload]);
  if(error){ console.error(error); return alert(`Add stock failed`); }
  alert('Stock added');

  e.target.reset();
  await fillProductsSelect(qs('#productSelect'));
  ownerFillStatic();
  ownerRenderStocks();
}

/* ------------ Owner: Stocks summary + remove 1 ------------- */
async function fetchOwnerStocksSummary(){
  let res = await supabase.from('stocks_summary').select('product_key,account_type,duration_code,total_qty');
  if(res.error){ // fallback
    const all = await supabase.from('stocks').select('product_key,account_type,duration_code,quantity');
    if(all.error){ console.error(all.error); return []; }
    const m=new Map();
    for(const r of all.data){ const k=`${r.product_key}|${r.account_type}|${r.duration_code}`; m.set(k,(m.get(k)||0)+(r.quantity||0)); }
    return [...m.entries()].map(([k,q])=>{const [product_key,account_type,duration_code]=k.split('|'); return {product_key,account_type,duration_code,total_qty:q};});
  }
  return res.data||[];
}
async function ownerRenderStocks(){
  const box=qs('#ownerStocksTable'); if(!box) return;
  box.textContent='Loading…';
  const rows=await fetchOwnerStocksSummary();
  if(!rows.length){ box.innerHTML='<div class="muted">No stocks yet.</div>'; return; }
  const products=await fetchProducts();
  const labelOf=k=>products.find(p=>p.key===k)?.label||k;

  box.innerHTML = `
    <table class="table">
      <thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th><th></th></tr></thead>
      <tbody>
      ${rows.map(r=>`
        <tr>
          <td>${labelOf(r.product_key)}</td>
          <td>${r.account_type}</td>
          <td>${r.duration_code}</td>
          <td>${r.total_qty}</td>
          <td><button class="ghost rem" data-x='${encodeURIComponent(JSON.stringify(r))}'>Remove 1</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  qsa('button.rem',box).forEach(b=>on(b,'click',async ()=>{
    const row=JSON.parse(decodeURIComponent(b.dataset.x));
    const ok=confirm(`Remove 1 from ${row.product_key} • ${row.account_type} • ${row.duration_code}?`);
    if(!ok) return;
    const { error } = await supabase.rpc('remove_one_stock',{ p_product:row.product_key, p_type:row.account_type, p_duration:row.duration_code });
    if(error){ console.error(error); return alert('Remove failed'); }
    ownerRenderStocks();
  }));
}

/* ------------ Owner: Records (with admin who dropped) ------------- */
async function ownerFetchRecords(){
  let {data,error}=await supabase.rpc('list_my_sales',{ p_owner: currentUUID() });
  if(error){ // fallback read (if RLS allows)
    const res=await supabase.from('sales').select('id,product_key,account_type,created_at,expires_at,buyer_link,price,admin_id').order('id',{ascending:false}).limit(500);
    if(res.error){ console.error(res.error); return []; }
    data=res.data;
  }
  return data||[];
}
async function ownerRenderRecords(){
  const wrap=qs('#ownerRecords'); if(!wrap) return;
  wrap.textContent='Loading…';
  const rows=await ownerFetchRecords();
  const products=await fetchProducts();
  const labelOf=k=>products.find(p=>p.key===k)?.label||k;

  if(!rows.length){ wrap.innerHTML='<div class="muted">No records yet.</div>'; return; }

  wrap.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div class="muted">Total: ${rows.length}</div>
      <button id="btnExportCSV" class="ghost">Export CSV</button>
    </div>
    <table class="table small">
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th><th>Admin</th><th>Add days</th><th>Save</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`
          <tr data-id="${r.id}">
            <td>${r.id}</td>
            <td>${labelOf(r.product_key)}</td>
            <td>${r.account_type}</td>
            <td>${fmtDT(r.created_at)}</td>
            <td><input class="expInput" type="datetime-local" value="${r.expires_at? new Date(r.expires_at).toISOString().slice(0,16):''}"></td>
            <td><input class="buyerInput" type="text" value="${r.buyer_link||''}"></td>
            <td><input class="priceInput" type="number" step="0.01" value="${r.price??''}"></td>
            <td>${r.admin_id||''}</td>
            <td><input class="addDaysInput" type="number" min="1" placeholder="e.g. 7"></td>
            <td><button class="ghost saveRow">Save</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  on(qs('#btnExportCSV'),'click',()=>{
    const csv=toCSV(rows); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='owner_records.csv'; a.click(); URL.revokeObjectURL(url);
  });

  qsa('button.saveRow',wrap).forEach(btn=>on(btn,'click',async ()=>{
    const tr=btn.closest('tr'); const id=+tr.dataset.id;
    const expVal=qs('.expInput',tr).value; const buyer=qs('.buyerInput',tr).value||null; const priceVal=qs('.priceInput',tr).value;
    const addDays=+ (qs('.addDaysInput',tr).value||0);
    let expires_at = expVal? new Date(expVal): null;
    if(addDays>0){ const base=expires_at||new Date(); base.setDate(base.getDate()+addDays); expires_at=base; }
    const upd={ buyer_link:buyer, price: (priceVal===''? null : Number(priceVal)), expires_at: (expires_at? expires_at.toISOString(): null) };
    const { error } = await supabase.from('sales').update(upd).eq('id',id);
    if(error){ console.error(error); return alert('Save failed'); }
    alert('Saved'); ownerRenderRecords();
  }));
}

/* ------------ Admin: Available + refresh ------------- */
async function adminFetchAvailable(){
  let {data,error}=await supabase.from('stocks_available_for_admin').select('product_key,account_type,duration_code,total_qty').order('product_key');
  if(error){ // fallback view
    const r=await supabase.from('stocks_summary').select('product_key,account_type,duration_code,total_qty').order('product_key');
    if(r.error){ console.error(r.error); return []; }
    data=r.data;
  }
  return data||[];
}
async function adminRenderAvailable(){
  const box=qs('#adminAvailable'); if(!box) return;
  box.textContent='Fetching…';
  const rows=await adminFetchAvailable();
  const products=await fetchProducts(); const labelOf=k=>products.find(p=>p.key===k)?.label||k;

  box.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <h3>Available Stocks</h3>
      <button id="btnAdminRefresh" class="ghost">Refresh</button>
    </div>
    <table class="table">
      <thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${r.duration_code}</td><td>${r.total_qty}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  on(qs('#btnAdminRefresh'),'click',adminRefreshAll);
}
async function adminRefreshAll(){ await adminRenderAvailable(); await adminFillFormOptions(); await adminRenderMySales(); }

/* ------------ Admin: Form options filtered by in-stock ------------- */
async function adminFillFormOptions(){
  const p=qs('#adminProductSelect'), t=qs('#adminTypeSelect'), d=qs('#adminDurationSelect'); if(!p||!t||!d) return;
  const available=await adminFetchAvailable();
  const uniq = a=>[...new Set(a)];
  const products=await fetchProducts(); const labelOf=k=>products.find(x=>x.key===k)?.label||k;
  const prods=uniq(available.map(r=>r.product_key));
  p.innerHTML = `<option value="" disabled selected>Select product</option>` + prods.map(k=>`<option value="${k}">${labelOf(k)}</option>`).join('');
  on(p,'change',()=>{
    const sub=available.filter(r=>r.product_key===p.value);
    t.innerHTML = uniq(sub.map(r=>r.account_type)).map(v=>`<option>${v}</option>`).join('');
    d.innerHTML = uniq(sub.map(r=>r.duration_code)).map(v=>`<option>${v}</option>`).join('');
  },{once:true});
}

/* ------------ Admin: Get Account (reserves ONE) ------------- */
async function adminGetAccount(){
  const admin_uuid=currentUUID();
  const product_key=qs('#adminProductSelect')?.value;
  const account_type=qs('#adminTypeSelect')?.value;
  const duration_code=qs('#adminDurationSelect')?.value;
  if(!product_key||!account_type||!duration_code) return alert('Complete the selections.');

  const { data, error } = await supabase.rpc('get_account',{
    p_admin: admin_uuid,
    p_product: product_key,
    p_type: account_type,
    p_duration: duration_code
  });
  if(error){ console.error(error); return alert('get_account failed'); }
  const r=(data&&data[0])||null;
  const out=qs('#adminCreds');
  if(!r){ out.textContent='No matched stock.'; }
  else{
    out.innerHTML = `
      <div class="card">
        <b>${r.product_key}</b> • <i>${r.account_type}</i> • ${r.duration_code}
        <div><b>Email:</b> ${r.email||'-'}</div>
        <div><b>Password:</b> ${r.password||'-'}</div>
        <div><b>Profile:</b> ${r.profile_name||'-'} &nbsp; <b>PIN:</b> ${r.pin||'-'}</div>
        <div><b>Expires:</b> ${fmtDT(r.expires_at)}</div>
      </div>`;
  }
  await adminRefreshAll();
}

/* ------------ Admin: My sales ------------- */
async function adminRenderMySales(){
  const wrap=qs('#adminMySales'); if(!wrap) return;
  const {data,error}=await supabase.rpc('list_my_sales',{ p_admin: currentUUID() });
  if(error){ console.error(error); wrap.textContent='Failed to load.'; return; }
  const products=await fetchProducts(); const labelOf=k=>products.find(p=>p.key===k)?.label||k;

  wrap.innerHTML = `
    <table class="table small">
      <thead><tr><th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th><th>Buyer link</th><th>Price</th></tr></thead>
      <tbody>
        ${data.map(r=>`<tr><td>${r.id}</td><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td><td>${r.buyer_link||''}</td><td>${r.price??''}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

/* ------------ Login page boot ------------- */
function bootLogin(){
  const ownerForm=qs('#formOwner'), adminForm=qs('#formAdmin');
  const btnOwnerOpen=qs('#btnOwnerOpen'), btnAdminOpen=qs('#btnAdminOpen');
  on(btnOwnerOpen,'click',()=>{ ownerForm.style.display='block'; adminForm.style.display='none'; qs('#ownerUUID').focus(); });
  on(btnAdminOpen,'click',()=>{ adminForm.style.display='block'; ownerForm.style.display='none'; qs('#adminUUID').focus(); });

  on(ownerForm,'submit',e=>{
    e.preventDefault(); const uid=qs('#ownerUUID').value.trim();
    if(!uid) return alert('Enter owner UUID');
    if(!isOwnerUUID(uid)) return alert('Not a valid OWNER UUID.');
    saveSession({role:'owner',uuid:uid}); location.href='owner.html';
  });
  on(adminForm,'submit',e=>{
    e.preventDefault(); const uid=qs('#adminUUID').value.trim();
    if(!uid) return alert('Enter admin UUID');
    if(!isAdminUUID(uid)) return alert('Not a valid ADMIN UUID.');
    saveSession({role:'admin',uuid:uid}); location.href='admin.html';
  });
}

/* ------------ Owner page boot ------------- */
async function bootOwner(){
  const s=await requireRole(['owner']); // only owners
  on(qs('#btnLogout'),'click',()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goAdmin'),'click',()=>{ location.href='admin.html'; });

  ownerFillStatic();
  await fillProductsSelect(qs('#productSelect'));
  on(qs('#addStockForm'),'submit',ownerAddStockSubmit);

  on(qs('#tabAdd'),'click',()=>showOwnerTab('add'));
  on(qs('#tabStocks'),'click',()=>showOwnerTab('stocks'));
  on(qs('#tabRecords'),'click',()=>showOwnerTab('records'));

  showOwnerTab('add');
  ownerRenderStocks();
  ownerRenderRecords();
}
function showOwnerTab(which){
  const panes={add:'#paneAdd',stocks:'#paneStocks',records:'#paneRecords'};
  Object.values(panes).forEach(sel=>qs(sel).style.display='none');
  qs(panes[which]).style.display='block';
  qsa('.tab').forEach(t=>t.classList.remove('active'));
  qs('#tab'+which[0].toUpperCase()+which.slice(1)).classList.add('active');
}

/* ------------ Admin page boot ------------- */
async function bootAdmin(){
  const s=await requireRole(['admin','owner']); // owner can peek admin per your request
  on(qs('#btnLogout'),'click',()=>{ clearSession(); location.href='index.html'; });
  on(qs('#goOwner'),'click',()=>{ location.href='owner.html'; });

  await adminRenderAvailable();
  await adminFillFormOptions();
  await adminRenderMySales();
  on(qs('#btnGetAccount'),'click',adminGetAccount);
}

/* ------------ Router ------------- */
(function(){
  const page=document.body.dataset.page;
  if(page==='login')  return bootLogin();
  if(page==='owner')  return bootOwner();
  if(page==='admin')  return bootAdmin();
})();