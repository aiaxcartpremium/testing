(async function(){
  // require auth + basic role check
  document.getElementById('logoutBtn').onclick = logout;
  const { profile } = await getProfile();
  if (profile.role !== 'admin' && profile.role !== 'owner') {
    alert('Admin only');
    location.href = 'login.html';
    return;
  }

  // helpers
  function el(id){ return document.getElementById(id); }
  function setCreds(text){ el('creds').textContent = text; }

  // populate product filter
  fillProductSelect(el('filterProduct'));

  // load counts from view
  async function loadCounts(){
    const product = el('filterProduct').value;
    const type = el('filterType').value;

    let q = sb().from('v_stock_counts').select('*').order('product_key');
    if (product) q = q.eq('product_key', product);
    if (type)    q = q.eq('account_type', type);

    const { data, error } = await q;
    if (error) { alert(error.message); return; }

    const tb = document.querySelector('#countTbl tbody');
    tb.innerHTML = '';
    (data || []).forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.product_key}</td>
        <td>${r.account_type}</td>
        <td>${r.available}</td>
        <td>${r.sold}</td>
        <td><button class="btn mini" data-p="${r.product_key}" data-t="${r.account_type}">List IDs</button></td>
      `;
      tb.appendChild(tr);
    });
  }

  el('refresh').onclick = loadCounts;
  await loadCounts();

  // quick peek: show up to 20 IDs (no credentials)
  document.querySelector('#countTbl').addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-p]');
    if (!btn) return;
    const p = btn.dataset.p;
    const t = btn.dataset.t;

    const { data, error } = await sb()
      .from('stocks')
      .select('id')
      .eq('status', 'available')
      .eq('product_key', p)
      .eq('account_type', t)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) { alert(error.message); return; }

    const list = (data || []).map(x => x.id).join('\n') || '(none)';
    alert(`Available IDs for ${p} / ${t} (first 20, oldest first):\n\n${list}\n\nCopy one ID to the Get form below.`);
  });

  // GET ACCOUNT: reveal creds + mark sold + log buyer & price
  document.getElementById('getForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const stockId     = el('stockId').value.trim();
    const buyerSocial = el('buyerSocial').value.trim() || null;
    const soldPrice   = parseFloat(el('soldPrice').value || '0');

    if (!stockId) { alert('Enter stock id'); return; }

    setCreds('Getting account…');

    const { data, error } = await sb().rpc('get_account', {
      p_stock_id: stockId,
      p_buyer_social: buyerSocial,
      p_sold_price: soldPrice
    });

    if (error) { setCreds(''); alert(error.message); return; }
    if (!data || !data.length) { setCreds(''); alert('No data returned'); return; }

    const c = data[0];
    // Show everything including profile + expiry
    setCreds(
`Product:   ${c.product_key}
Type:      ${c.account_type}
Email:     ${c.email || ''}
Password:  ${c.password || ''}
Profile:   ${c.profile || ''}
PIN:       ${c.pin || ''}
Expires:   ${c.expires_at || ''}`
    );

    // refresh counts because one item just moved to "sold"
    await loadCounts();
  });
})();