<script>
/* ===== simple auth using fixed UUIDs ===== */
const FIXED = {
  owner:  '8cd15b4b-0755-4843-a8d5-2652fa408fe5',
  admin1: '4e63c32b-cc75-48de-b111-e8a977d868a2',
  admin2: '20851a7b-ef92-41a1-80d1-d2a6081396d5',
};

function setSession(role, user_id){
  localStorage.setItem('role', role);
  localStorage.setItem('user_id', user_id);
}

function getSession(){
  return { role: localStorage.getItem('role'), user_id: localStorage.getItem('user_id') };
}

function logout(){
  localStorage.removeItem('role');
  localStorage.removeItem('user_id');
  location.href = './';
}

function requireRole(allowed){
  const s = getSession();
  if (!s.role || !allowed.includes(s.role)) {
    location.href = './';
    return;
  }
}

/* render top nav where needed */
function renderNav(targetId){
  const s = getSession();
  const el = document.getElementById(targetId);
  if(!el) return;

  const links = [];
  links.push(`<a href="./owner.html">Owner</a>`);
  links.push(`<a href="./admin.html">Admin</a>`);
  const right = `<button class="btn btn-outline" onclick="logout()">Logout</button>`;

  el.innerHTML = `
    <div class="nav">
      <div style="display:flex;gap:10px;align-items:center;">
        <span class="badge">Logged in as ${s.role ?? 'guest'}</span>
        ${links.join(' ')}
      </div>
      ${s.role ? right : ''}
    </div>
  `;
}
</script>