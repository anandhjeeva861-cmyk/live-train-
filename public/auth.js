(() => {
  const model = { user: null, ready: null };
  window.RailGoAuth = model;
  let challenge = null, busy = false;
  const el = id => document.getElementById(id);
  const request = (path, body) => LiveTrainAPI.request('/api/auth/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const refreshProfile = () => { const label = document.querySelector('#profileBtn b'); if (label) label.textContent = model.user ? model.user.email : 'Sign in'; };
  model.ready = LiveTrainAPI.isStatic ? Promise.resolve() : request('me').then(data => { model.user = data.user; refreshProfile(); }).catch(() => {});
  function error(message) { if (el('authError')) el('authError').textContent = message; }
  function render() {
    el('modalTitle').textContent = model.user ? 'Your account' : 'Sign in with email';
    el('bookingModal').hidden = false;
    if (LiveTrainAPI.isStatic) {
      el('modalBody').innerHTML = '<p>This preview saves demo bookings on this device. Email sign-in is available on the connected RailGo service.</p>';
      return;
    }
    if (model.user) {
      el('modalBody').innerHTML = '<p id="profileEmail"></p><p>Your bookings are linked to this email.</p><button class="primary-button" id="emailLogout">Sign out</button><p id="authError" role="alert"></p>';
      el('profileEmail').textContent = model.user.email;
      el('emailLogout').onclick = async () => { try { await request('logout', {}); location.assign('/login'); } catch (e) { error(e.message); } };
      return;
    }
    el('modalBody').innerHTML = `<p>Get a six-digit verification code in your inbox.</p><form id="emailLoginForm"><label class="field"><span>Email address</span><input id="authEmail" type="email" autocomplete="email" maxlength="254" required></label>${challenge ? '<label class="field" style="margin-top:12px"><span>Verification code</span><input id="authEmailCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p>The code expires in 10 minutes. Check your spam folder too.</p>' : ''}<button class="primary-button" id="authSubmit" style="margin-top:16px" type="submit">${challenge ? 'Verify & sign in' : 'Send code'}</button></form>${challenge ? '<p><button class="secondary-button" id="authResend">Resend code</button> <button class="secondary-button" id="authChange">Change email</button></p>' : ''}<p id="authError" class="form-error" role="alert" aria-live="polite"></p>`;
    if (challenge) { el('authEmail').value = challenge.email; el('authEmail').readOnly = true; }
    const act = async verify => {
      if (busy) return;
      busy = true;
      el('authSubmit').disabled = true;
      error('');
      try {
        const email = el('authEmail').value.trim().toLowerCase();
        if (verify) {
          const data = await request('email/verify', { email, code: el('authEmailCode').value.trim() });
          model.user = data.user;
          location.assign(location.pathname === '/login' ? '/dashboard' : location.href);
        } else {
          const data = await request('email/send', { email });
          challenge = data;
          render();
          el('authEmailCode').focus();
        }
      } catch (e) { error(e.message); }
      finally { busy = false; if (el('authSubmit')) el('authSubmit').disabled = false; }
    };
    el('emailLoginForm').onsubmit = event => { event.preventDefault(); act(Boolean(challenge)); };
    if (challenge) {
      el('authResend').onclick = () => {
        if (Date.now() < new Date(challenge.retryAt).getTime()) { error('Please wait 60 seconds before requesting another code.'); return; }
        act(false);
      };
      el('authChange').onclick = () => { if (!busy) { challenge = null; render(); } };
    }
  }
  model.open = async () => {
    render();
    if (model.user || LiveTrainAPI.isStatic || busy) return;
    el('authSubmit').disabled = true;
    try {
      const config = await request('config');
      if (el('bookingModal').hidden || !el('authSubmit')) return;
      challenge = config.pending;
      render();
      if (!config.configured) { el('authSubmit').disabled = true; error('Email sign-in is not available yet. Please contact the site owner.'); }
    } catch (e) { error(e.message); }
  };
  model.require = () => { if (LiveTrainAPI.isStatic || model.user) return true; model.open(); return false; };
  window.addEventListener('railgo-auth-required', () => { model.user = null; refreshProfile(); closeLiveConnection(); model.open(); });
  document.addEventListener('DOMContentLoaded', () => {
    el('profileBtn').onclick = model.open;
    el('mobileProfile').onclick = model.open;
    refreshProfile();
    model.ready.then(() => { if (location.pathname === '/login') model.open(); });
  });
})();
