// app.js (ESM)
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// -------------- small helpers
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const fmtDT = d => d ? new Date(d).toLocaleString() : '';
const durLabel = code => (window.DURATIONS.find(([l,v])=>v===code)||[])[0] || code;

// -------------- session
const SESSION_KEY = 'aiax.session'; // {role:'owner'|'admin', uuid}
const setSession = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } };
const clearSession = () => localStorage.removeItem(SESSION_KEY);

// -------------- security gates
function ensureRole(allowed){
  const s=getSession();
  if(!s || !allowed.includes(s.role)){ location.href='index.html'; throw new Error('blocked'); }
  return s;
}

// -------------- PRODUCTS
async function fetchProducts(){
  const { data, error } = await sb.from('products').select('key,label').order('label');
  if(error) { console.error(error); return []; }
  return data||[];
}
async function fillProductSelect(sel){
  const prods=await fetchProducts();
  sel.innerHTML = `<option value="" disabled selected>Select product</option>`+
    prods.map(p=>`<option value="${p.key}">${p.label}</option>`).join('');
}

// -------------- LOGIN
async function login(role, uuid){
  uuid = uuid.trim().toLowerCase();
  if(!uuid) return alert('Please enter UUID');

  if(role==='owner'){
    if(!window.OWNER_IDS.map(x=>x.toLowerCase()).includes(uuid))
      return alert('UUID is not an Owner ID.');
  } else {
    if(!window.ADMIN_IDS.map(x=>x.toLowerCase()).includes(uuid))
      return alert('UUID is not an Admin ID.');
  }
  setSession({role, uuid});
  location.href = role==='owner' ? 'owner.html' : 'admin.html';
}

// expose for index.html
window.APP = { login };

// -------------- OWNER PAGE
async function bootOwner(){
  const s = ensureRole(['owner']); // admin cannot open owner page
  $('#btnLogout').onclick = ()=>{ clearSession(); location.href='index.html'; };
  $('#goAdmin').onclick   = ()=>{ location.href='admin.html'; }; // owner allowed to view admin

  // Fill selects
  (function fillStatics(){
    const tSel = $('#typeSelect');
    const dSel = $('#durationSelect');
    tSel.innerHTML = window.ACCOUNT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('');
    dSel.innerHTML = window.DURATIONS.map(([l,v])=>`<option value="${v}">${l}</option>`).join('');
  })();
  await fillProductSelect($('#productSelect'));

  // Tabs
  const show=(id)=>['paneAdd','paneStocks','paneRecords'].forEach(pid=>{
    $('#'+pid).style.display = (pid===id)?'block':'none'
  });
  $$('.tab').forEach(t=>t.onclick=()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    show(t.id==='tabAdd'?'paneAdd':t.id==='tabStocks'?'paneStocks':'paneRecords');
  });
  show('paneAdd');

  // Add stock
  $('#addStockForm').onsubmit = async (e)=>{
    e.preventDefault();
    const payload = {
      owner_id: s.uuid,
      product_key: $('#productSelect').value,
      account_type: $('#typeSelect').value,
      duration_code: $('#durationSelect').value,
      quantity: Math.max(1, parseInt($('#qtyInput').value||'1',10)),
      email: $('#emailInput').value||null,
      password: $('#passInput').value||null,
      profile_name: $('#profileInput').value||null,
      pin: $('#pinInput').value||null,
      notes: $('#notesInput').value||null
    };
    if(!payload.product_key||!payload.account_type||!payload.duration_code) return alert('Complete Product/Type/Duration');

    const { error } = await sb.from('stocks').insert(payload);
    if(error){ console.error(error); return alert('Add stock failed'); }
    e.target.reset();
    await ownerRenderStocks();
  };

  await ownerRenderStocks();
  await ownerRenderRecords();
}

async function ownerRenderStocks(){
  const box = $('#ownerStocksTable');
  box.textContent='Loading…';
  const { data, error } = await sb.from('stocks')
    .select('id,product_key,account_type,duration_code,quantity,email,password,profile_name,pin,notes,created_at')
    .order('id',{ascending:false}).limit(500);
  if(error){ console.error(error); box.textContent='Failed to load.'; return; }
  const prods = await fetchProducts();
  const labelOf = k=>prods.find(p=>p.key===k)?.label||k;

  if(!data.length){ box.innerHTML='<div class="muted">No stock yet.</div>'; return; }

  box.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th>
        <th>Creds</th><th>Notes</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.map(r=>`
          <tr data-id="${r.id}">
            <td>${r.id}</td>
            <td>${labelOf(r.product_key)}</td>
            <td>${r.account_type}</td>
            <td>${durLabel(r.duration_code)}</td>
            <td><input type="number" min="0" value="${r.quantity||0}" class="q"/></td>
            <td style="min-width:220px">
              <input placeholder="email" value="${r.email||''}" class="e"/>
              <input placeholder="password" value="${r.password||''}" class="p"/>
              <input placeholder="profile" value="${r.profile_name||''}" class="n"/>
              <input placeholder="pin" value="${r.pin||''}" class="pin"/>
            </td>
            <td><input value="${r.notes||''}" class="notes"/></td>
            <td>
              <button class="btn-outline save">Save</button>
              <button class="btn-outline del">Remove</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  // bind actions
  $$('#ownerStocksTable .save').forEach(b=>b.onclick=async()=>{
    const tr = b.closest('tr');
    const id = +tr.dataset.id;
    const patch = {
      quantity: Math.max(0, parseInt($('.q',tr).value||'0',10)),
      email: $('.e',tr).value||null,
      password: $('.p',tr).value||null,
      profile_name: $('.n',tr).value||null,
      pin: $('.pin',tr).value||null,
      notes: $('.notes',tr).value||null
    };
    const { error } = await sb.from('stocks').update(patch).eq('id',id);
    if(error){ console.error(error); return alert('Save failed'); }
    alert('Saved');
  });
  $$('#ownerStocksTable .del').forEach(b=>b.onclick=async()=>{
    const tr = b.closest('tr'); const id = +tr.dataset.id;
    if(!confirm('Delete this stock row?')) return;
    const { error } = await sb.from('stocks').delete().eq('id',id);
    if(error){ console.error(error); return alert('Delete failed'); }
    tr.remove();
  });
}

async function ownerFetchRecords(){
  const s = getSession();
  // Owner sees all their sales (RLS handles it)
  const { data, error } = await sb.from('sales')
    .select('id,product_key,account_type,duration_code,created_at,expires_at,buyer_link,price,warranty,voided,admin_id,email,password,profile_name,pin')
    .order('id',{ascending:false}).limit(500);
  if(error){ console.error(error); return []; }
  return data||[];
}

async function ownerRenderRecords(){
  const box = $('#ownerRecords');
  box.textContent='Loading…';
  const rows = await ownerFetchRecords();
  const prods = await fetchProducts();
  const labelOf = k=>prods.find(p=>p.key===k)?.label||k;

  if(!rows.length){ box.innerHTML='<div class="muted">No records.</div>'; return; }

  box.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th>
        <th>Expiration (+days → new)</th><th>Buyer link</th><th>Price</th>
        <th>Warranty</th><th>Voided</th><th>Who got</th><th>Save</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>{
          const who = r.admin_id ? `Admin ${r.admin_id}` : 'Owner';
          const expVal = r.expires_at ? new Date(r.expires_at).toISOString().slice(0,16) : '';
          return `
            <tr data-id="${r.id}">
              <td>${r.id}</td>
              <td>${labelOf(r.product_key)}</td>
              <td>${r.account_type}</td>
              <td>${fmtDT(r.created_at)}</td>
              <td>
                <div style="display:flex;gap:6px">
                  <input type="datetime-local" class="exp" value="${expVal}"/>
                  <input type="number" class="add" placeholder="+days" min="1" style="width:90px"/>
                  <span class="muted newexp"></span>
                </div>
              </td>
              <td><input class="buyer" value="${r.buyer_link||''}"/></td>
              <td><input class="price" type="number" step="0.01" value="${r.price??''}"/></td>
              <td><input type="checkbox" class="warr" ${r.warranty?'checked':''}></td>
              <td><input type="checkbox" class="void" ${r.voided?'checked':''}></td>
              <td>${who}</td>
              <td><button class="btn-outline save">Save</button></td>
            </tr>`; }).join('')}
      </tbody>
    </table>
  `;

  // live compute new exp
  $$('#ownerRecords tbody tr').forEach(tr=>{
    const expEl = $('.exp',tr), addEl=$('.add',tr), out=$('.newexp',tr);
    function recompute(){
      if(!addEl.value) { out.textContent=''; return; }
      const base = expEl.value ? new Date(expEl.value) : new Date();
      base.setDate(base.getDate()+Number(addEl.value));
      out.textContent = '→ '+ base.toLocaleString();
    }
    expEl.oninput=recompute; addEl.oninput=recompute;
  });

  // save row
  $$('#ownerRecords .save').forEach(btn=>btn.onclick=async()=>{
    const tr=btn.closest('tr'); const id=+tr.dataset.id;
    let exp = $('.exp',tr).value ? new Date($('.exp',tr).value) : null;
    const add = Number($('.add',tr).value||'0');
    if(add>0){ const base = exp||new Date(); base.setDate(base.getDate()+add); exp = base; }
    const patch = {
      buyer_link: $('.buyer',tr).value||null,
      price: $('.price',tr).value?Number($('.price',tr).value):null,
      expires_at: exp?exp.toISOString():null,
      warranty: $('.warr',tr).checked,
      voided: $('.void',tr).checked
    };
    const { error } = await sb.from('sales').update(patch).eq('id',id);
    if(error){ console.error(error); return alert('Save failed'); }
    alert('Saved');
    ownerRenderRecords();
  });
}

// -------------- ADMIN PAGE
async function bootAdmin(){
  const s=ensureRole(['admin','owner']); // owner may open admin page
  $('#btnLogout').onclick = ()=>{ clearSession(); location.href='index.html'; };
  $('#goOwner').onclick   = ()=>{ if(getSession()?.role==='owner') location.href='owner.html'; else alert('Admins cannot open Owner panel.'); };

  await adminRefresh();
  $('#btnAdminRefresh').onclick = adminRefresh;
  $('#btnGetAccount').onclick   = adminGetAccount;
}

async function adminRefresh(){
  const avail = await adminFetchAvailable();
  const prods = await fetchProducts();
  const labelOf = k=>prods.find(p=>p.key===k)?.label||k;

  // table
  const box=$('#adminAvailable');
  if(!avail.length){ box.innerHTML='<div class="muted">No stock.</div>'; }
  else {
    box.innerHTML = `
      <table><thead><tr><th>Product</th><th>Type</th><th>Duration</th><th>Qty</th></tr></thead>
      <tbody>${avail.map(r=>`<tr><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td><td>${durLabel(r.duration_code)}</td><td>${r.total_qty}</td></tr>`).join('')}</tbody></table>`;
  }

  // selects only from available
  const pSel=$('#adminProductSelect'), tSel=$('#adminTypeSelect'), dSel=$('#adminDurationSelect');
  const uniqP = [...new Set(avail.map(r=>r.product_key))];
  pSel.innerHTML = `<option value="" disabled selected>Select product</option>`+
    uniqP.map(k=>`<option value="${k}">${labelOf(k)}</option>`).join('');
  pSel.onchange = ()=>{
    const sub = avail.filter(r=>r.product_key===pSel.value);
    const types = [...new Set(sub.map(r=>r.account_type))];
    const durs  = [...new Set(sub.map(r=>r.duration_code))];
    tSel.innerHTML = types.map(t=>`<option value="${t}">${t}</option>`).join('');
    dSel.innerHTML = durs.map(d=>`<option value="${d}">${durLabel(d)}</option>`).join('');
  };
}

async function adminFetchAvailable(){
  // prefer view 'stocks_summary'
  const { data, error } = await sb.from('stocks_summary')
    .select('product_key,account_type,duration_code,total_qty')
    .gte('total_qty',1)
    .order('product_key');
  if(error){ console.error(error); return []; }
  return data||[];
}

async function adminGetAccount(){
  const s = getSession();
  const product  = $('#adminProductSelect').value;
  const type     = $('#adminTypeSelect').value;
  const duration = $('#adminDurationSelect').value;
  if(!product||!type||!duration) return alert('Complete the selections first.');

  // role is needed so backend knows if requester is admin or owner
  const { data, error } = await sb.rpc('get_account_v2', {
    p_requester: s.uuid,
    p_role: s.role,
    p_product: product,
    p_type: type,
    p_duration: duration
  });
  if(error){ console.error(error); return alert('get_account failed'); }

  const r = (data&&data[0])||null;
  const out = $('#adminCreds');
  if(!r){ out.textContent='No stock matched.'; return; }

  // pretty detail block
  out.innerHTML = `
    <div><b>Order id:</b> ${r.order_id}</div>
    <div><b>Product name:</b> ${r.product_label}</div>
    <div><b>Account type:</b> ${r.account_type}</div>
    <div><b>Duration:</b> ${durLabel(r.duration_code)}</div>
    <div style="margin-top:6px"><b>Expiration:</b> ${fmtDT(r.expires_at)}</div>
    <hr/>
    <div><b>Email:</b> ${r.email||'-'}</div>
    <div><b>Password:</b> ${r.password||'-'}</div>
    <div><b>Profile:</b> ${r.profile_name||'-'} &nbsp; <b>PIN:</b> ${r.pin||'-'}</div>
    <div style="margin-top:6px"><b>Got by:</b> ${r.got_by}</div>
  `;
  // refresh tables
  await adminRefresh();
  await adminRenderMySales();
}

async function adminRenderMySales(){
  const s=getSession();
  const { data, error } = await sb.from('sales')
    .select('id,product_key,account_type,duration_code,created_at,expires_at,buyer_link,price,warranty,voided')
    .eq('admin_id', s.role==='admin'?s.uuid:'00000000-0000-0000-0000-000000000000')
    .order('id',{ascending:false});
  if(error){ console.error(error); $('#adminMySales').textContent='Failed.'; return; }
  const prods = await fetchProducts();
  const labelOf = k=>prods.find(p=>p.key===k)?.label||k;
  $('#adminMySales').innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Product</th><th>Type</th><th>Created</th><th>Expires</th>
        <th>Buyer</th><th>Price</th><th>Warranty</th><th>Voided</th>
      </tr></thead>
      <tbody>
        ${data.map(r=>`
          <tr>
            <td>${r.id}</td><td>${labelOf(r.product_key)}</td><td>${r.account_type}</td>
            <td>${fmtDT(r.created_at)}</td><td>${fmtDT(r.expires_at)}</td>
            <td>${r.buyer_link||''}</td><td>${r.price??''}</td>
            <td>${r.warranty?'✓':''}</td><td>${r.voided?'✓':''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// -------- boot router
document.addEventListener('DOMContentLoaded', ()=>{
  if($('#ownerPage')) bootOwner();
  if($('#adminPage')) bootAdmin();
});