(async function(){
  document.getElementById('logoutBtn').onclick = logout;
  const { profile } = await getProfile();
  if(profile.role !== 'owner'){ alert('Owner only'); location.href='admin.html'; return; }

  fillProductSelect(document.getElementById('product_key'));
  fillProductSelect(document.getElementById('filterProduct'));

  // Add stocks (bulk)
  document.getElementById('addForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const product_key = document.getElementById('product_key').value;
    const account_type = document.getElementById('account_type').value;
    const plan = document.getElementById('plan').value;
    const qty = Math.max(1, parseInt(document.getElementById('qty').value||'1'));
    const email = document.getElementById('email').value || null;
    const password = document.getElementById('password').value || null;
    const pin = document.getElementById('pin').value || null;
    const notes = document.getElementById('notes').value || null;
    const today = new Date().toISOString().slice(0,10);
    const expires_at = addPlan(today, plan);

    const rows = Array.from({length: qty}).map(()=>({product_key, account_type, email, password, pin, notes, status:'available', expires_at}));
    const { error } = await sb().from('stocks').insert(rows);
    if(error) return alert(error.message);
    alert(`Added ${qty} stock(s).`);
  });

  // Buyer Records with pagination
  let page=1, pageSize=10, lastCount=0;
  async function loadBuyer(){
    const product = document.getElementById('filterProduct').value;
    const social = document.getElementById('filterSocial').value;
    let q = sb().from('account_records')
      .select('created_at,product_key,buyer_social,sold_price,created_by',{count:'exact'})
      .order('created_at',{ascending:false})
      .range((page-1)*pageSize, page*pageSize-1);
    if(product) q = q.eq('product_key', product);
    if(social) q = q.ilike('buyer_social', `%${social}%`);
    const { data, error, count } = await q;
    if(error) return alert(error.message);
    lastCount = count || 0;
    const tb = document.querySelector('#buyerTbl tbody'); tb.innerHTML='';
    (data||[]).forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${new Date(r.created_at).toLocaleString()}</td><td>${r.product_key}</td><td>${r.buyer_social||''}</td><td>${r.sold_price??0}</td><td>${r.created_by.slice(0,8)}</td>`;
      tb.appendChild(tr);
    });
    document.getElementById('buyerPage').textContent = `Page ${page} / ${Math.max(1, Math.ceil(lastCount/pageSize))}`;
  }
  document.getElementById('searchBuyer').onclick = ()=>{ page=1; loadBuyer(); };
  document.getElementById('prevBuyer').onclick = ()=>{ if(page>1){page--;loadBuyer();}};
  document.getElementById('nextBuyer').onclick = ()=>{ if(page*pageSize<lastCount){page++;loadBuyer();}};
  loadBuyer();

  // Recent admin logs (subset)
  async function loadAdminRaw(){
    const { data, error } = await sb().from('account_records')
      .select('created_at,product_key,stock_id,created_by')
      .order('created_at',{ascending:false}).limit(20);
    if(error) return;
    const tb = document.querySelector('#adminTbl tbody'); tb.innerHTML='';
    (data||[]).forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString()}</td><td>${r.product_key}</td><td>${r.stock_id||''}</td><td>${r.created_by.slice(0,8)}</td>`;
      tb.appendChild(tr);
    });
  }
  loadAdminRaw();
})();