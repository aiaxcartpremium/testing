<script>
  // auth.js
  const supa = supabase.createClient(APP.url, APP.key);

  function loginAs(role) {
    const uid = prompt(`Enter ${role} UUID:`);
    if (!uid) return;
    if (role === 'owner' && uid !== APP.ownerId) return alert('Invalid owner UUID');
    if (role === 'admin' && !APP.admins.includes(uid)) return alert('Invalid admin UUID');
    localStorage.setItem('role', role);
    localStorage.setItem('uid', uid);
    window.location.href = role === 'owner' ? 'owner.html' : 'admin.html';
  }

  function currentSession() {
    const role = localStorage.getItem('role');
    const uid  = localStorage.getItem('uid');
    return role && uid ? { role, uid } : null;
  }

  function requireRole(roles) {
    const s = currentSession();
    if (!s || !roles.includes(s.role)) {
      localStorage.clear();
      window.location.href = 'index.html';
      return null;
    }
    return s;
  }

  function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
  }
</script>