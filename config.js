// ===== Supabase credentials =====
window.SUPABASE_URL = 'https://qddjhayaqkdcxqgdriav.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkZGpoYXlhcWtkY3hxZ2RyaWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyODEzMzUsImV4cCI6MjA3Nzg1NzMzNX0.Z_w3O9z6ZdZKt1TS3p4e6YYeUl1XHlCohLAatbA7g2U';

// ===== Role whitelists (lowercase UUIDs) =====
window.OWNER_IDS = [
  '8cd15b4b-0755-4843-a8d5-2652fa408fe5'
];

window.ADMIN_IDS = [
  '4e63c32b-cc75-48de-b111-e8a977d868a2',
  '20851a7b-ef92-41a1-80d1-d2a6081396d5'
];

// Quick-fill defaults used by the login page "Use default" buttons
window.ID_OWNER  = window.OWNER_IDS[0] || '';
window.ID_ADMIN1 = window.ADMIN_IDS[0] || '';
window.ID_ADMIN2 = window.ADMIN_IDS[1] || '';

// ===== Static options shown in selects =====
window.ACCOUNT_TYPES = [
  'shared profile','solo profile','shared account','solo account','invitation','head','edu'
];

// UI label -> code (these codes are what we save in DB: '7d','1m','8m', etc.)
window.DURATIONS = [
  ['7 days','7d'], ['14 days','14d'],
  ['1 month','1m'], ['2 months','2m'], ['3 months','3m'], ['4 months','4m'],
  ['5 months','5m'], ['6 months','6m'], ['7 months','7m'], ['8 months','8m'],
  ['9 months','9m'], ['10 months','10m'], ['11 months','11m'], ['12 months','12m'],
  ['auto-renew','auto']
];