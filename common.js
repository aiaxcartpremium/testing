let supabaseClient = null;
function sb(){ if(!supabaseClient){ supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON); } return supabaseClient; }

function onAuthChange(cb){ sb().auth.onAuthStateChange((e,s)=>cb(s)); sb().auth.getSession().then(({data})=>cb(data.session)); }
async function logout(){ await sb().auth.signOut(); location.href='login.html'; }
async function requireSession(){
  const { data } = await sb().auth.getSession();
  if(!data.session){ location.href='login.html'; throw new Error('no session'); }
  return data.session;
}
async function getProfile(){
  const session = await requireSession();
  const { data, error } = await sb().from('profiles').select('id,role,full_name').eq('id', session.user.id).maybeSingle();
  if(error) console.error(error);
  return { user: session.user, profile: data || { role: 'admin' } };
}
function fillProductSelect(sel){
  sel.innerHTML = '';
  for(const [group, items] of Object.entries(window.PRODUCT_CATALOG)){
    const og = document.createElement('optgroup'); og.label = group;
    items.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; og.appendChild(o); });
    sel.appendChild(og);
  }
}
// plan helpers
function addPlan(baseIso, plan){
  const d = new Date(baseIso);
  if(plan==='7d') d.setDate(d.getDate()+7);
  else if(plan==='14d') d.setDate(d.getDate()+14);
  else if(plan.endsWith('m')) d.setMonth(d.getMonth()+parseInt(plan));
  return d.toISOString().slice(0,10);
}