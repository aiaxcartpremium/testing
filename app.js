<script type="module">
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(window.SB_URL, window.SB_ANON);
window.sb = sb; // quick access in console

// storage helpers
const S = {
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)); },
  get(k){ try{return JSON.parse(localStorage.getItem(k));}catch{return null} },
  del(k){ localStorage.removeItem(k) }
};

export function loginAs(role){
  const label = role==='owner' ? 'Owner UUID' : 'Admin UUID';
  const def = role==='owner' ? window.ID_OWNER : window.ID_ADMIN1;
  const uid = prompt(`${label}:`, def);
  if(!uid) return;

  S.set('role', role);
  S.set('uid', uid);

  if(role==='owner') location.href = 'owner.html';
  else location.href = 'admin.html';
}

export function logout(){
  S.del('role'); S.del('uid');
  location.href = 'index.html';
}

export function assertRole(allowed){
  const role = S.get('role');
  const uid  = S.get('uid');
  if(!role || !uid || (allowed && !allowed.includes(role))){
    logout(); return null;
  }
  return {role, uid};
}

// ---------- Products & Summary ----------
export async function fetchProducts(){
  const {data, error} = await sb.from('products').select('key,label').order('label');
  if(error){ console.error(error); return []; }
  return data;
}

export async function fetchStockSummary(){
  const {data, error} = await sb.from('stock_summary').select('*');
  if(error){ console.error(error); return []; }
  return data;
}

// ---------- Owner actions ----------
export async function addStockBulk({owner, product, type, qty, email, password, profile, pin, duration}){
  const { data, error } = await sb.rpc('add_stock_bulk', {
    p_owner: owner,
    p_product: product,
    p_account_type: type,
    p_qty: qty,
    p_email: email || null,
    p_password: password || null,
    p_profile: profile || null,
    p_pin: pin || null,
    p_duration: duration || null
  });
  if(error) throw error;
  return data;
}

export async function listOwnerSales(owner){
  // owner sees ALL sales (created by any admin) tied to them
  const { data, error } = await sb.from('sales')
   .select('id,product_key,account_type,created_at,expires_at,buyer_link,price,admin_id')
   .eq('owner_id', owner).order('id', {ascending:false}).limit(200);
  if(error) throw error;
  return data || [];
}

export async function deleteStock(owner, stockId){
  const { error } = await sb.rpc('delete_stock', { p_owner: owner, p_stock_id: stockId });
  if(error) throw error;
}

// ---------- Admin actions ----------
export async function listMySales(admin){
  const { data, error } = await sb.from('sales')
   .select('id,product_key,account_type,created_at,expires_at,buyer_link,price')
   .eq('admin_id', admin).order('id',{ascending:false}).limit(200);
  if(error) throw error;
  return data || [];
}

export async function getAccount({admin, product, type, duration}){
  // your existing RPC name/shape; adjust param names if yours differ
  const { data, error } = await sb.rpc('get_account', {
    p_admin: admin,
    p_product: product,
    p_type: type,
    p_duration: duration  // e.g., '7days','1m','auto-renew'
  });
  if(error) throw error;
  return data; // expected: one row with creds + expires_at
}

// expose to inline handlers
window.__APP__ = { loginAs, logout, assertRole,
  fetchProducts, fetchStockSummary,
  addStockBulk, listOwnerSales, deleteStock,
  listMySales, getAccount
};
</script>