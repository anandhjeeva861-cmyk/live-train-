(() => {
  const model = { user: null, ready: null };
  window.RailGoAuth = model;
  let challenge = null, busy = false, emailDraft = '', opening = 0, countdown = null, configured = true;
  const el = id => document.getElementById(id);
  const request = (path, body) => LiveTrainAPI.request('/api/auth/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const refreshProfile = () => {
    const label = document.querySelector('#profileBtn b');
    if (label) label.textContent = model.user ? model.user.email : 'Email login';
    const mobile = document.querySelector('#mobileProfile small');
    if (mobile) mobile.textContent = model.user ? 'Account' : 'Email login';
  };
  model.ready = LiveTrainAPI.isStatic ? Promise.resolve() : request('me').then(data => { model.user = data.user; refreshProfile(); }).catch(() => {});
  function error(message) { if (el('authError')) el('authError').textContent = message; }
  function render() {
    clearInterval(countdown);
    el('modalTitle').textContent = model.user ? 'Your account' : 'Sign in with email';
    el('bookingModal').hidden = false;
    if (model.user) {
      el('modalBody').innerHTML = '<p id="profileEmail"></p><p>Your bookings are linked to this email.</p><button class="primary-button" id="emailLogout">Sign out</button><p id="authError" role="alert"></p>';
      el('profileEmail').textContent = model.user.email;
      el('emailLogout').onclick = async () => { try { await request('logout', {}); location.assign('/login'); } catch (e) { error(e.message); } };
      return;
    }
    el('modalBody').innerHTML = `<p>Get a six-digit verification code in your inbox.</p><form id="emailLoginForm"><label class="field"><span>Email address</span><input id="authEmail" type="email" autocomplete="email" maxlength="254" required></label>${challenge ? '<label class="field" style="margin-top:12px"><span>Verification code</span><input id="authEmailCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p>The code expires in 10 minutes. Check your spam folder too.</p>' : ''}<button class="primary-button" id="authSubmit" style="margin-top:16px" type="submit">${challenge ? 'Verify & sign in' : 'Send code'}</button></form>${challenge ? '<p><button class="secondary-button" id="authResend">Resend code</button> <button class="secondary-button" id="authChange">Change email</button></p>' : ''}<p id="authError" class="form-error" role="alert" aria-live="polite"></p>`;
    el('authEmail').value = challenge?.email || emailDraft;
    el('authEmail').oninput = () => { emailDraft = el('authEmail').value; };
    if (challenge) el('authEmail').readOnly = true;
    const form = el('emailLoginForm');
    const isCurrent = () => !el('bookingModal').hidden && el('emailLoginForm') === form;
    const act = async verify => {
      if (busy || LiveTrainAPI.isStatic || !configured) return;
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
          if (isCurrent()) { render(); el('authEmailCode').focus(); }
        }
      } catch (e) { if (isCurrent()) error(e.message); }
      finally { busy = false; updateCountdown(); }
    };
    el('emailLoginForm').onsubmit = event => { event.preventDefault(); act(Boolean(challenge)); };
    if (challenge) {
      const expiry = document.createElement('p'); expiry.id = 'authExpiry'; expiry.className = 'catalog-note';
      el('authEmailCode').closest('label').after(expiry);
      countdown = setInterval(updateCountdown, 1000);
      el('authResend').onclick = () => {
        if (Date.now() < new Date(challenge.retryAt).getTime()) { error('Please wait 60 seconds before requesting another code.'); return; }
        act(false);
      };
      el('authChange').onclick = () => { if (!busy) { challenge = null; render(); } };
    }
    updateCountdown();
    if (LiveTrainAPI.isStatic) {
      el('authSubmit').disabled = true;
      error('Email sign-in is unavailable on this preview until the site owner connects the login service. No code has been sent.');
    }
  }
  function updateCountdown() {
    if (!el('authSubmit') || el('bookingModal').hidden) { clearInterval(countdown); return; }
    const remaining = challenge ? Math.max(0, Math.ceil((new Date(challenge.expiresAt) - Date.now()) / 1000)) : 0;
    el('authSubmit').disabled = busy || LiveTrainAPI.isStatic || !configured || Boolean(challenge && !remaining);
    if (el('authExpiry')) el('authExpiry').textContent = remaining ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Code expired. Request a new code below.';
    if (el('authResend')) {
      const retry = Math.max(0, Math.ceil((new Date(challenge.retryAt) - Date.now()) / 1000));
      el('authResend').disabled = busy || retry > 0 || !configured;
      el('authResend').textContent = retry ? `Resend in ${retry}s` : 'Resend code';
      el('authChange').disabled = busy;
    }
  }
  model.open = async () => {
    if (busy) return;
    const attempt = ++opening;
    render();
    if (model.user || LiveTrainAPI.isStatic || busy) return;
    el('authSubmit').disabled = true;
    const form = el('emailLoginForm');
    try {
      const config = await request('config');
      if (attempt !== opening || el('bookingModal').hidden || el('emailLoginForm') !== form) return;
      configured = config.configured;
      challenge = config.pending;
      render();
      if (!config.configured) { el('authSubmit').disabled = true; error('Email sign-in is not available yet. Please contact the site owner.'); }
    } catch (e) {
      if (attempt !== opening || el('bookingModal').hidden || el('emailLoginForm') !== form) return;
      error(e.message);
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'secondary-button'; retry.textContent = 'Retry connection';
      retry.onclick = model.open;
      el('authError').after(retry);
    }
  };
  model.require = () => { if (LiveTrainAPI.isStatic || model.user) return true; model.open(); return false; };
  window.addEventListener('railgo-auth-required', () => { model.user = null; refreshProfile(); closeLiveConnection(); model.open(); });
  document.addEventListener('DOMContentLoaded', () => {
    el('profileBtn').onclick = model.open;
    el('mobileProfile').onclick = model.open;
    refreshProfile();
    model.ready.then(() => { if (/\/login\/?$/.test(location.pathname) || location.hash === '#login') model.open(); });
    window.addEventListener('hashchange', () => { if (location.hash === '#login') model.open(); });
  });
})();
