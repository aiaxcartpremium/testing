import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPA_URL, SUPA_ANON_KEY } from "./config.js";

export const supa = createClient(SUPA_URL, SUPA_ANON_KEY);

// tiny session using localStorage
export const setRole = (role, uid) => { localStorage.role = role; localStorage.uid = uid; };
export const getRole = () => localStorage.role;
export const getUID  = () => localStorage.uid;
export const logout  = () => { localStorage.clear(); location.href = "./index.html"; };

export const fmt = d => d ? new Date(d).toLocaleString() : "";

export function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return alert(msg);
  el.textContent = msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),1500);
}

// products (for Owner add-stock dropdown)
export async function fetchProducts(){
  const { data, error } = await supa.from("products").select("key,label").order("label");
  if(error) throw error; return data || [];
}

// summarize available stocks for Admin page
export async function fetchAvailableSummary(){
  const { data, error } = await supa.from("stocks")
    .select("product_key,account_type,quantity")
  if(error) throw error;
  const map = new Map();
  for(const r of (data||[])){
    const k = `${r.product_key}|${r.account_type}`;
    map.set(k, (map.get(k)||0) + (r.quantity||0));
  }
  return Array.from(map.entries())
         .map(([k,qty])=>({ product_key:k.split("|")[0], account_type:k.split("|")[1], qty }))
         .filter(x=>x.qty>0);
}

// stocks (Owner)
export async function addStock(row){ const { error } = await supa.from("stocks").insert(row); if(error) throw error; }
export async function listStocks(){
  const { data, error } = await supa.from("stocks")
    .select("id,product_key,account_type,quantity,duration_days,auto_renew,email,profile_name,pin,expires_at,created_at")
    .order("id",{ascending:false});
  if(error) throw error; return data || [];
}
export async function deleteStock(id){ const { error } = await supa.from("stocks").delete().eq("id", id); if(error) throw error; }

// sales (Owner/Admin)
export async function fetchAllSales(){
  const { data, error } = await supa.from("sales")
    .select("id, product_key, account_type, email, password, profile_name, pin, buyer_link, price, created_at, expires_at, admin_id")
    .order("id",{ascending:false});
  if(error) throw error; return data || [];
}
export async function updateSale(id, patch){ const { error } = await supa.from("sales").update(patch).eq("id", id); if(error) throw error; }
export async function addDaysToSale(id, days){ const { error } = await supa.rpc("add_days_to_sale",{ p_id:id, p_days:days }); if(error) throw error; }
export async function listMySales(adminId){ const { data, error } = await supa.rpc("list_my_sales",{ p_admin:adminId }); if(error) throw error; return data||[]; }
export async function rpcGetAccount(payload){ const { data, error } = await supa.rpc("get_account", payload); if(error) throw error; return data && data[0]; }

// CSV util
export function toCSV(rows){
  if(!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
}