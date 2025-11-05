<!-- app.js -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const { createClient } = supabase;
  const supa = createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);

  // simple local “auth” (choose role + fixed uuid)
  function setUser(role, id){
    localStorage.setItem('user', JSON.stringify({role, id}));
  }
  function getUser(){
    try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; }
  }
  function requireRole(roles, redirect="login.html"){
    const u = getUser();
    if(!u || !roles.includes(u.role)) { window.location.href = redirect; }
    return u;
  }
  function logout(){
    localStorage.removeItem('user');
    window.location.href = "login.html";
  }

  // load product options
  async function loadProducts(selectEl){
    const { data, error } = await supa.from('products').select('key,label,category').order('category').order('label');
    if(error){ console.error(error); return; }
    selectEl.innerHTML = "";
    data.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = `${p.label} • ${p.category}`;
      selectEl.appendChild(opt);
    });
  }

  // load stock summary for current owner
  async function loadStockSummary(tbody){
    const owner = window.APP_CONFIG.ownerId;
    const { data, error } = await supa.from('stock_summary')
      .select('product_key, product_label, account_type, total_qty')
      .eq('owner_id', owner)
      .order('product_label').order('account_type');
    if(error){ console.error(error); return; }
    tbody.innerHTML = "";
    data.forEach(row=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.product_label||row.product_key}</td>
        <td>${row.account_type}</td>
        <td style="text-align:right">${row.total_qty}</td>
      `;
      tbody.appendChild(tr);
    });
    return data; // handy for admin page (to render action buttons)
  }

  // durations
  const DURATIONS = [
    {d:7,label:'7 days'},{d:14,label:'14 days'},
    {d:30,label:'1 month'},{d:60,label:'2 months'},{d:90,label:'3 months'},
    {d:120,label:'4 months'},{d:150,label:'5 months'},{d:180,label:'6 months'},
    {d:210,label:'7 months'},{d:240,label:'8 months'},{d:270,label:'9 months'},
    {d:300,label:'10 months'},{d:330,label:'11 months'},{d:360,label:'12 months'},
  ];
  function fillDuration(selectEl){
    selectEl.innerHTML = "";
    DURATIONS.forEach(x=>{
      const opt = document.createElement('option');
      opt.value = x.d;
      opt.textContent = x.label;
      selectEl.appendChild(opt);
    });
  }

  // owner add stock
  async function ownerAddStock(form){
    const u = requireRole(['owner']);
    const f = new FormData(form);
    const payload = {
      owner_id: window.APP_CONFIG.ownerId,
      product_key: f.get('product_key'),
      account_type: f.get('account_type'),
      duration_days: parseInt(f.get('duration_days')||'0',10),
      quantity: parseInt(f.get('quantity')||'1',10),
      email: f.get('email')||null,
      password: f.get('password')||null,
      profile_name: f.get('profile_name')||null,
      pin: f.get('pin')||null,
      notes: f.get('notes')||null
    };
    const { data, error } = await supa.from('stocks').insert(payload).select().single();
    if(error){ alert(error.message); console.error(error); return; }
    alert('Stock added.');
    form.reset();
  }

  // admin get account (decrement + sale insert)
  async function adminGetAccount(args){
    const u = requireRole(['admin']);
    const { product_key, account_type, duration_days } = args;
    const { data, error } = await supa.rpc('get_account', {
      p_owner_id: window.APP_CONFIG.ownerId,
      p_product_key: product_key,
      p_account_type: account_type,
      p_duration_days: duration_days,
      p_admin_id: u.id
    });
    if(error){ alert(error.message); console.error(error); return null; }
    return data && data[0];
  }

  // save / update buyer record info (owner or admin)
  async function upsertBuyerInfo(saleId, buyerSocial, price){
    const { data, error } = await supa.from('sales')
      .update({ buyer_social: buyerSocial||null, price: price?Number(price):null })
      .eq('id', saleId)
      .select().single();
    if(error){ alert(error.message); console.error(error); return null; }
    return data;
  }

  // list sales (filters optional)
  async function listSales(tbody, filters={}){
    let q = supa.from('sales')
      .select('id, created_at, product_key, account_type, duration_days, expires_at, admin_id, buyer_social, price')
      .eq('owner_id', window.APP_CONFIG.ownerId)
      .order('created_at', { ascending:false })
      .limit(200);
    if(filters.product_key) q = q.eq('product_key', filters.product_key);
    if(filters.account_type) q = q.eq('account_type', filters.account_type);
    const { data, error } = await q;
    if(error){ console.error(error); return; }
    tbody.innerHTML = "";
    data.forEach(row=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.product_key}</td>
        <td>${row.account_type}</td>
        <td>${row.duration_days}d</td>
        <td>${new Date(row.created_at).toLocaleString()}</td>
        <td>${row.expires_at ? new Date(row.expires_at).toLocaleDateString() : ''}</td>
        <td>${row.admin_id?.slice(0,8) ?? ''}</td>
        <td>${row.buyer_social ?? ''}</td>
        <td style="text-align:right">${row.price ?? ''}</td>
        <td><button data-id="${row.id}" class="btn-xs edit">edit</button></td>
      `;
      tbody.appendChild(tr);
    });
  }
</script>