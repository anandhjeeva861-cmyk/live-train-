(() => {
  const model = { user: null, ready: null };
  window.RailGoAuth = model;
  const emptyDraft = () => ({ firstName: '', dateOfBirth: '', mobileNumber: '', email: '' });
  let draft = emptyDraft(), challenge = null, busy = false, checking = false, configured = false, editing = false, opening = 0, countdown;
  const el = id => document.getElementById(id);
  const request = (path, body) => LiveTrainAPI.request('/api/auth/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const error = message => { if (el('authError')) el('authError').textContent = message; };
  const fromUser = user => ({ firstName: user.firstName || user.name || '', dateOfBirth: user.dateOfBirth || '', mobileNumber: user.mobileNumber || '', email: user.email || '' });
  const refreshProfile = () => {
    const label = document.querySelector('#profileBtn b');
    if (label) label.textContent = model.user ? model.user.firstName || model.user.name : 'Profile';
    const mobile = document.querySelector('#mobileProfile small');
    if (mobile) mobile.textContent = 'Profile';
  };
  model.ready = LiveTrainAPI.isStatic ? Promise.resolve() : request('me').then(data => { model.user = data.user; refreshProfile(); }).catch(() => {});
  function captureDraft() {
    if (el('authFirstName')) draft = { firstName: el('authFirstName').value, dateOfBirth: el('authBirthDate').value, mobileNumber: el('authMobile').value, email: el('authEmail').value };
  }
  function closeProfile() { el('bookingModal').hidden = true; }
  function renderAccount() {
    el('modalTitle').textContent = 'Your profile';
    el('modalBody').innerHTML = '<p class="profile-verified">Email verified</p><dl class="profile-details"><div><dt>First name</dt><dd id="profileName"></dd></div><div><dt>Date of birth</dt><dd id="profileBirthDate"></dd></div><div><dt>Mobile number</dt><dd id="profileMobile"></dd></div><div><dt>Gmail / email address</dt><dd id="profileEmail"></dd></div></dl><p class="catalog-note">The mobile number is a contact detail. Verification was completed through email.</p><div class="profile-actions"><button class="primary-button" id="profileDone">Done</button><button class="secondary-button" id="profileEdit">Edit details</button><button class="secondary-button" id="emailLogout">Sign out</button></div><p id="authError" class="form-error" role="alert"></p>';
    el('profileName').textContent = model.user.firstName || model.user.name;
    el('profileBirthDate').textContent = model.user.dateOfBirth ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(model.user.dateOfBirth + 'T00:00:00Z')) : 'Not added yet';
    el('profileMobile').textContent = model.user.mobileNumber ? '+91 ' + model.user.mobileNumber : 'Not added yet';
    el('profileEmail').textContent = model.user.email;
    el('profileDone').onclick = closeProfile;
    el('profileEdit').textContent = model.user.profileComplete ? 'Edit details' : 'Complete profile';
    el('profileEdit').onclick = () => { if (busy) return; editing = true; draft = fromUser(model.user); model.open(); };
    el('emailLogout').onclick = async () => {
      if (busy) return;
      busy = true; el('emailLogout').disabled = true; el('profileEdit').disabled = true;
      try {
        await request('logout', {});
        model.user = null; challenge = null; draft = emptyDraft(); editing = false;
        window.closeLiveConnection?.(); refreshProfile();
        window.dispatchEvent(new Event('railgo-profile-updated'));
        busy = false; await model.open();
      } catch (e) { error(e.message); }
      finally { busy = false; if (el('emailLogout')) { el('emailLogout').disabled = false; el('profileEdit').disabled = false; } }
    };
  }
  function render() {
    clearInterval(countdown);
    el('bookingModal').hidden = false;
    if (model.user && !editing) { renderAccount(); return; }
    el('modalTitle').textContent = challenge ? 'Verify your email' : editing ? (model.user.profileComplete ? 'Edit your profile' : 'Complete your profile') : 'Create your profile';
    el('modalBody').innerHTML = challenge
      ? '<p>Enter the six-digit OTP sent to <strong id="authRecipient"></strong>.</p><form id="emailLoginForm" class="profile-form"><label class="field"><span>Email verification code</span><input id="authEmailCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p id="authExpiry" class="catalog-note" aria-live="off"></p><button class="primary-button" id="authSubmit" type="submit">Verify &amp; save profile</button></form><p class="catalog-note">Check your inbox and Spam folder. Only the latest OTP works.</p><div class="profile-actions"><button class="secondary-button" id="authResend">Resend OTP</button><button class="secondary-button" id="authChange">Change details</button></div><p id="authError" class="form-error" role="alert" aria-live="polite"></p>'
      : '<p>Add your details, then verify your Gmail / email address with an OTP.</p><form id="emailLoginForm" class="profile-form"><label class="field"><span>First name</span><input id="authFirstName" name="firstName" autocomplete="given-name" maxlength="80" required></label><label class="field"><span>Date of birth</span><input id="authBirthDate" name="dateOfBirth" type="date" autocomplete="bday" min="1900-01-01" required></label><label class="field"><span>Mobile number</span><input id="authMobile" name="mobileNumber" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" placeholder="10-digit Indian mobile number" pattern="[+0-9 ]{10,16}" required aria-describedby="authMobileHelp"></label><small id="authMobileHelp" class="catalog-note">India (+91). Your OTP will be sent to email.</small><label class="field"><span>Gmail / email address</span><input id="authEmail" name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary-button" id="authSubmit" type="submit">Send email OTP</button></form><p id="authError" class="form-error" role="alert" aria-live="polite"></p>';
    if (challenge) {
      el('authRecipient').textContent = challenge.email;
      countdown = setInterval(updateCountdown, 1000);
    } else {
      el('authFirstName').value = draft.firstName;
      el('authBirthDate').value = draft.dateOfBirth;
      el('authBirthDate').max = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      el('authMobile').value = draft.mobileNumber;
      el('authEmail').value = draft.email;
      if (editing && model.user) el('authEmail').readOnly = true;
      el('emailLoginForm').addEventListener('input', captureDraft);
    }
    const form = el('emailLoginForm');
    const isCurrent = () => !el('bookingModal').hidden && el('emailLoginForm') === form;
    const act = async verify => {
      if (busy || checking || LiveTrainAPI.isStatic || !configured) return;
      captureDraft();
      busy = true; updateCountdown(); error('');
      try {
        if (verify) {
          const data = await request('email/verify', { email: challenge.email, code: el('authEmailCode').value.trim() });
          model.user = data.user; editing = false; challenge = null; draft = fromUser(data.user);
          refreshProfile(); window.dispatchEvent(new Event('railgo-profile-updated'));
          if (isCurrent()) render();
        } else {
          const profile = challenge?.profile || { firstName: draft.firstName.trim(), dateOfBirth: draft.dateOfBirth, mobileNumber: draft.mobileNumber };
          const email = challenge?.email || draft.email.trim().toLowerCase();
          challenge = await request('email/send', { email, profile });
          draft = { ...challenge.profile, email: challenge.email };
          if (isCurrent()) { render(); el('authEmailCode').focus(); }
        }
      } catch (e) { if (isCurrent()) error(e.message); }
      finally { busy = false; updateCountdown(); }
    };
    form.onsubmit = event => { event.preventDefault(); if (form.reportValidity()) act(Boolean(challenge)); };
    if (challenge) {
      el('authResend').onclick = () => { if (Date.now() >= new Date(challenge.retryAt).getTime()) act(false); };
      el('authChange').onclick = async () => {
        if (busy || checking) return;
        busy = true; updateCountdown();
        try { await request('email/cancel', {}); challenge = null; if (isCurrent()) render(); }
        catch (e) { if (isCurrent()) error(e.message); }
        finally { busy = false; updateCountdown(); }
      };
    } else if (editing) {
      const cancel = document.createElement('button'); cancel.className = 'secondary-button'; cancel.type = 'button'; cancel.id = 'profileCancel'; cancel.textContent = 'Cancel changes';
      cancel.onclick = () => { if (!busy) { editing = false; render(); } };
      el('authError').after(cancel);
    }
    updateCountdown();
    if (LiveTrainAPI.isStatic) error('Email verification is unavailable on this preview until the site owner connects the email service. No code has been sent.');
    else if (!configured && !checking) showSetupError();
  }
  function showSetupError() {
    error('Email verification is not available yet. The site owner needs to connect an email sender. No code has been sent.');
    if (['localhost', '127.0.0.1'].includes(location.hostname) && !el('authSetupLink')) {
      const link = document.createElement('a'); link.id = 'authSetupLink'; link.className = 'secondary-button'; link.href = 'http://127.0.0.1:4180/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Set up Gmail sender';
      el('authError').after(link);
    }
  }
  function updateCountdown() {
    if (!el('authSubmit') || el('bookingModal').hidden) { clearInterval(countdown); return; }
    const remaining = challenge ? Math.max(0, Math.ceil((new Date(challenge.expiresAt) - Date.now()) / 1000)) : 0;
    el('authSubmit').disabled = busy || checking || LiveTrainAPI.isStatic || !configured || Boolean(challenge && !remaining);
    el('authSubmit').textContent = busy ? (challenge ? 'Please wait…' : 'Sending OTP…') : checking ? 'Checking email service…' : challenge ? 'Verify & save profile' : 'Send email OTP';
    if (el('authExpiry')) el('authExpiry').textContent = remaining ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Code expired. Request a new OTP below.';
    if (el('authResend')) {
      const retry = Math.max(0, Math.ceil((new Date(challenge.retryAt) - Date.now()) / 1000));
      el('authResend').disabled = busy || checking || retry > 0 || !configured;
      el('authResend').textContent = retry ? `Resend in ${retry}s` : 'Resend OTP';
      el('authChange').disabled = busy || checking;
    }
    if (el('profileCancel')) el('profileCancel').disabled = busy || checking;
    for (const field of document.querySelectorAll('#emailLoginForm input')) field.disabled = busy;
  }
  model.open = async () => {
    if (busy) return;
    const attempt = ++opening;
    await model.ready;
    if (attempt !== opening) return;
    if (model.user && !model.user.profileComplete && !editing) { editing = true; draft = fromUser(model.user); }
    captureDraft();
    checking = !LiveTrainAPI.isStatic && (!model.user || editing);
    render();
    if (!checking) return;
    const form = el('emailLoginForm');
    try {
      const config = await request('config');
      if (attempt !== opening || el('bookingModal').hidden || el('emailLoginForm') !== form) return;
      captureDraft(); configured = config.configured; challenge = config.pending;
      if (challenge) draft = { ...challenge.profile, email: challenge.email };
      checking = false; render();
    } catch (e) {
      if (attempt !== opening || el('bookingModal').hidden || el('emailLoginForm') !== form) return;
      configured = false; error(e.message);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-button'; retry.textContent = 'Retry connection'; retry.onclick = model.open; el('authError').after(retry);
    } finally { if (attempt === opening) { checking = false; updateCountdown(); } }
  };
  model.require = () => { if (LiveTrainAPI.isStatic || model.user) return true; model.open(); return false; };
  window.addEventListener('railgo-auth-required', () => { model.user = null; editing = false; refreshProfile(); window.closeLiveConnection?.(); model.open(); });
  document.addEventListener('DOMContentLoaded', () => {
    el('profileBtn').onclick = model.open; el('mobileProfile').onclick = model.open; refreshProfile();
    const requestedProfile = () => /\/(?:login|profile)\/?$/.test(location.pathname) || ['#login', '#profile'].includes(location.hash);
    model.ready.then(() => { if (requestedProfile()) model.open(); });
    window.addEventListener('hashchange', () => { if (requestedProfile()) model.open(); });
  });
})();
