(async function(){
  const { data } = await sb().auth.getSession();
  const ses = data.session;
  const authed = document.getElementById('authed');
  const anon = document.getElementById('anon');
  const emailSpan = document.getElementById('email');
  const roleSpan = document.getElementById('role');

  if(ses){
    const prof = await getProfile();
    emailSpan.textContent = ses.user.email;
    roleSpan.textContent = prof.profile?.role || 'admin';
    authed.classList.remove('hide'); anon.classList.add('hide');
  }else{
    authed.classList.add('hide'); anon.classList.remove('hide');
  }

  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    const { error } = await sb().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname.replace('login.html','index.html') }
    });
    document.getElementById('hint').textContent = error ? error.message : 'Check your inbox for the magic link.';
  });
})();