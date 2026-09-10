(() => {
  const model = { user: null, config: {}, ready: null, open: () => {}, require: () => true };
  window.RailGoAuth = model;
  if (LiveTrainAPI.isStatic) { model.ready = Promise.resolve(); return; }
  model.ready = Promise.all([
    LiveTrainAPI.request('/api/auth/me').then(data => { model.user = data.user; }).catch(() => {}),
    LiveTrainAPI.request('/api/auth/config').then(data => { model.config = data; }).catch(() => {}),
  ]);
  let phone = '', step = 0, resendAt = 0;
  const modal = document.createElement('div');
  modal.id = 'authModal'; modal.className = 'modal-backdrop'; modal.hidden = true;
  document.body.append(modal);
  const request = (path, body) => LiveTrainAPI.request(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function close() { modal.hidden = true; }
  function render() {
    const devNote = model.config.devOtp ? 'Development only: no SMS is sent. OTP: 123456.' : model.config.smsReady ? 'A verification code will be sent by SMS to your mobile.' : 'SMS sign-in setup is incomplete. Please contact the app owner.';
    const screens = [
      `<h2>Welcome Back</h2><p>Enter your mobile number to continue</p><form id="phoneForm"><div class="phone-row"><span>+91</span><input id="authPhone" aria-label="Mobile number" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[6-9][0-9]{9}" maxlength="10" required placeholder="Enter mobile number" value="${escapeHtml(phone)}"></div><button class="primary-button">Send OTP</button></form><p class="auth-note">${devNote}</p>`,
      `<h2>Verify OTP</h2><p>Enter the code for +91 ${escapeHtml(phone)}</p><form id="otpForm"><div class="otp-row">${Array.from({ length: 6 }, (_, i) => `<input aria-label="OTP digit ${i + 1}" inputmode="numeric" maxlength="1" pattern="[0-9]" required>`).join('')}</div><button class="primary-button">Verify & Continue</button></form><button class="auth-link" id="resendOtp">Resend OTP (60-second delay)</button><button class="auth-link" id="editPhone">Change number</button>`,
      `<h2>Login with Google</h2><p>Mobile verified. Complete your sign-in.</p><button class="google-button" id="googleLogin"><b>G</b> Continue with Google</button><p class="auth-note">${model.config.devGoogle ? 'DEVELOPMENT LOGIN: a demo Google profile will be used.' : 'Continue securely through Google.'}</p>`,
    ];
    modal.innerHTML = `<section class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="authHeading"><button class="modal-close" id="closeAuth" aria-label="Close login">×</button><h3 id="authHeading">RailGo</h3>${screens[step]}<p id="authError" role="alert" class="modal-error"></p></section>`;
    document.getElementById('closeAuth').onclick = close;
    if (step === 0 && !model.config.smsReady) document.querySelector('#phoneForm button').disabled = true;
    if (step === 2 && !model.config.googleReady) {
      document.getElementById('googleLogin').disabled = true;
      modal.querySelector('.auth-note').textContent = 'Google sign-in setup is incomplete. Please contact the app owner.';
    }
    const run = async (button, work) => { button.disabled = true; document.getElementById('authError').textContent = ''; try { await work(); } catch (error) { document.getElementById('authError').textContent = error.message; } finally { button.disabled = false; } };
    if (step === 0) document.getElementById('phoneForm').onsubmit = event => {
      event.preventDefault(); phone = document.getElementById('authPhone').value;
      run(event.submitter, async () => { await request('send-otp', { mobileNumber: phone }); resendAt = Date.now() + 60000; step = 1; render(); });
    };
    if (step === 1) {
      const inputs = [...modal.querySelectorAll('.otp-row input')];
      inputs.forEach((input, i) => {
        input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(-1); if (input.value) inputs[i + 1]?.focus(); };
        input.onkeydown = event => { if (event.key === 'Backspace' && !input.value) inputs[i - 1]?.focus(); };
        input.onpaste = event => { event.preventDefault(); const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); [...digits].forEach((digit, j) => { if (inputs[i + j]) inputs[i + j].value = digit; }); inputs[Math.min(i + digits.length, 5)].focus(); };
      });
      document.getElementById('otpForm').onsubmit = event => { event.preventDefault(); run(event.submitter, async () => { await request('verify-otp', { mobileNumber: phone, otp: inputs.map(i => i.value).join('') }); step = 2; render(); }); };
      document.getElementById('editPhone').onclick = () => { step = 0; render(); };
      document.getElementById('resendOtp').onclick = event => run(event.target, async () => {
        if (Date.now() < resendAt) throw new Error(`Wait ${Math.ceil((resendAt - Date.now()) / 1000)} seconds to resend.`);
        await request('send-otp', { mobileNumber: phone }); resendAt = Date.now() + 60000;
        document.getElementById('authError').textContent = 'New code requested.';
      });
    }
    if (step === 2) document.getElementById('googleLogin').onclick = event => { event.currentTarget.disabled = true; location.assign(LiveTrainAPI.apiUrl('/api/auth/google')); };
    modal.querySelector('input, .primary-button, .google-button')?.focus();
  }
  model.open = () => {
    if (model.user) {
      modal.innerHTML = `<section class="modal auth-modal" role="dialog" aria-modal="true"><h2>${escapeHtml(model.user.name)}</h2><p>+91 ${escapeHtml(model.user.mobileNumber)}</p><button id="logoutBtn" class="primary-button">Log out</button><button id="closeProfile" class="auth-link">Close</button><p id="profileError" role="alert"></p></section>`;
      document.getElementById('closeProfile').onclick = close;
      document.getElementById('logoutBtn').onclick = async event => {
        event.currentTarget.disabled = true;
        try { await request('logout', {}); closeLiveConnection(); location.assign('/login'); }
        catch (error) { document.getElementById('profileError').textContent = error.message; event.target.disabled = false; }
      };
    } else { step = model.config.mobileVerified ? 2 : 0; render(); }
    modal.hidden = false;
  };
  model.require = () => { if (model.user) return true; model.open(); return false; };
  window.addEventListener('railgo-auth-required', () => { if (model.user) { model.user = null; closeLiveConnection(); model.open(); } });
  modal.onclick = event => { if (event.target === modal) close(); };
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const nodes = [...modal.querySelectorAll('button:not(:disabled), input')], first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('DOMContentLoaded', async () => {
    await model.ready;
    document.getElementById('profileBtn').onclick = model.open;
    document.getElementById('mobileProfile').onclick = model.open;
    if (model.user) document.querySelector('.user-chip b').textContent = `Hi, ${model.user.name}`;
    if (location.pathname === '/login') {
      if (model.user) location.replace('/dashboard');
      else {
        model.open();
        const messages = {
          configuration: 'Google sign-in is not configured yet. Please contact the app owner.',
          mobile: 'Your mobile verification expired. Please verify your number again.',
          state: 'The sign-in session could not be verified. Please try Google again.',
          denied: 'Google sign-in was cancelled. You can try again.',
          account: 'Use the Google account already linked to your mobile number.',
          google: 'Google could not complete sign-in. Please try again.',
          host: 'Continue on this address and verify your mobile again to use Google securely.',
        };
        const code = new URLSearchParams(location.search).get('error');
        if (messages[code]) document.getElementById('authError').textContent = messages[code];
        if (code) history.replaceState(null, '', '/login');
      }
    }
  });
})();
