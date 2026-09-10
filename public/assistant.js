(() => {
  const micIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
  const sparkle = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8ZM20 2v4m-2-2h4"/></svg>';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button class="assistant-launcher" id="assistantLaunch" aria-controls="railgoAssistant" aria-expanded="false">${micIcon}<span>Ask Live Train</span><i>AI</i></button>
    <section class="voice-assistant" id="railgoAssistant" role="dialog" aria-labelledby="assistantTitle" hidden>
      <header class="assistant-header"><span class="assistant-avatar">${sparkle}</span><div><h2 id="assistantTitle">Live Train Assistant</h2><span id="assistantMode">Connecting…</span></div><button id="assistantClose" aria-label="Close assistant">×</button></header>
      <div class="assistant-toolbar"><label for="assistantLanguage">Speak in</label><select id="assistantLanguage"><option value="en-IN">English</option><option value="ta-IN">தமிழ்</option></select><button id="assistantVoice" aria-pressed="true">Voice on</button><button id="assistantClear" title="Clear this conversation">Clear</button></div>
      <div class="assistant-messages" id="assistantMessages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div>
      <div class="assistant-suggestions" id="assistantSuggestions"></div>
      <div class="assistant-status" id="assistantStatus" role="status">Tap the microphone or type a message.</div>
      <form id="assistantForm" class="assistant-composer"><label class="sr-only" for="assistantInput">Message to Live Train assistant</label><textarea id="assistantInput" rows="2" maxlength="800" placeholder="Ask about your journey…"></textarea><div class="assistant-composer-actions"><button type="button" id="assistantMic" aria-label="Start microphone" aria-pressed="false">${micIcon}</button><span id="assistantMicLabel">Tap to speak</span><button type="button" id="assistantStop" hidden>Stop</button><button type="submit" id="assistantSend" aria-label="Send message">Send ↗</button></div></form>
      <p class="assistant-privacy">Mic runs only when you tap. Your browser may process audio online. In AI mode, messages go to OpenAI. Train data is a demo.</p>
    </section>`;
  document.body.append(wrapper);
  const el = id => document.getElementById(id);
  const panel = el('railgoAssistant'), input = el('assistantInput'), messages = el('assistantMessages');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let language = 'en-IN', voiceEnabled = true, recognition = null, listening = false, busy = false;
  let request = null, revision = 0, utterance = null, history = [], origin = null;
  const translate = (en, ta) => language === 'ta-IN' ? ta : en;
  const status = text => { el('assistantStatus').textContent = text; };
  function setBusy(value) {
    busy = value; el('assistantSend').disabled = value; el('assistantMic').disabled = value || !Recognition || !window.isSecureContext;
    el('assistantStop').hidden = !value && !utterance;
    panel.setAttribute('aria-busy', String(value));
  }
  function stopSpeaking() {
    utterance = null; window.speechSynthesis?.cancel(); el('assistantStop').hidden = !busy;
  }
  function speak(text, selectedLanguage = language) {
    stopSpeaking();
    if (!voiceEnabled || !window.speechSynthesis || panel.hidden) return;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === selectedLanguage.toLowerCase()) || voices.find(v => v.lang.startsWith(selectedLanguage.slice(0, 2)));
    if (selectedLanguage === 'ta-IN' && !voice) { status('தமிழ் குரல் இந்த சாதனத்தில் இல்லை. பதிலைப் படிக்கலாம்; English தேர்வு செய்தால் ஆங்கிலத்தில் பேசும்.'); return; }
    const line = new SpeechSynthesisUtterance(text.replace(/₹/g, selectedLanguage === 'ta-IN' ? ' ரூபாய் ' : ' rupees '));
    line.lang = selectedLanguage; line.rate = 0.97; if (voice) line.voice = voice;
    utterance = line; el('assistantStop').hidden = false;
    line.onend = () => { if (utterance === line) { utterance = null; el('assistantStop').hidden = !busy; } };
    line.onerror = event => { if (utterance !== line) return; utterance = null; el('assistantStop').hidden = !busy; if (event.error !== 'canceled' && event.error !== 'interrupted') status(translate('Audio could not play. You can read the reply or try its Listen button.', 'குரல் பதிலை இயக்க முடியவில்லை. பதிலைப் படிக்கலாம்.')); };
    try { speechSynthesis.speak(line); }
    catch { utterance = null; el('assistantStop').hidden = !busy; status(translate('Audio could not start. Your reply is available above.', 'குரல் பதிலைத் தொடங்க முடியவில்லை. மேலே பதிலைப் படிக்கலாம்.')); }
  }
  function addMessage(role, text, target = null, spokenLanguage = language) {
    const item = document.createElement('article'); item.className = `assistant-message ${role}`;
    const label = document.createElement('small'); label.textContent = role === 'user' ? translate('YOU', 'நீங்கள்') : 'LIVE TRAIN';
    const content = document.createElement('p'); content.textContent = text; item.append(label, content);
    if (role === 'assistant') {
      const actions = document.createElement('div'); actions.className = 'assistant-message-actions';
      if (window.speechSynthesis) { const replay = document.createElement('button'); replay.textContent = translate('Listen', 'கேளுங்கள்'); replay.onclick = () => { if (!voiceEnabled) { voiceEnabled = true; updateVoiceButton(); } stopListening(); speak(text, spokenLanguage); }; actions.append(replay); }
      if (target) { const view = document.createElement('button'); view.textContent = translate('View in Live Train ↗', 'Live Train-வில் பார்க்க ↗'); view.onclick = () => { close(); scrollToId(target); }; actions.append(view); }
      item.append(actions);
    }
    messages.append(item);
    while (messages.children.length > 40) messages.firstElementChild.remove();
    messages.scrollTop = messages.scrollHeight;
  }
  function welcome() {
    addMessage('assistant', translate('Hi! I’m your travel companion. Tell me where you want to go, or ask about a train, the weather or your tickets.', 'வணக்கம்! உங்கள் பயண உதவியாளர் நான். எங்கு செல்ல வேண்டும்? ரயில், வானிலை, சுற்றுலா இடங்கள் அல்லது உங்கள் டிக்கெட்டுகள் பற்றி கேளுங்கள்.'));
    const samples = language === 'ta-IN' ? ['சென்னை முதல் பெங்களூரு நாளை ரயில்', '12639 ரயில் எங்கே?', 'பெங்களூரு வானிலை', 'என் டிக்கெட்டுகள்'] : ['Chennai to Bangalore tomorrow', 'Track 12639', 'Weather in Bengaluru', 'Show my bookings'];
    el('assistantSuggestions').replaceChildren(...samples.map(text => { const button = document.createElement('button'); button.textContent = text; button.onclick = () => { input.value = text; submit(); }; return button; }));
  }
  async function refreshMode() {
    try { const data = await LiveTrainAPI.request('/api/assistant/status'); el('assistantMode').textContent = data.mode === 'ai' ? 'AI connected · Tamil & English' : 'Basic commands · Tamil & English'; }
    catch { el('assistantMode').textContent = 'Assistant server unavailable'; status('Restart the Live Train server to connect the assistant.'); }
  }
  function open() {
    origin = document.activeElement; panel.hidden = false; el('assistantLaunch').hidden = true; el('assistantLaunch').setAttribute('aria-expanded', 'true');
    if (!messages.children.length) welcome();
    if (!Recognition) status(translate('Voice input is unavailable in this browser. You can type your message.', 'இந்த உலாவியில் குரல் உள்ளீடு இல்லை. உங்கள் கேள்வியைத் தட்டச்சு செய்யலாம்.'));
    else if (!window.isSecureContext) status(translate('Microphone needs HTTPS or localhost. Text chat is available.', 'மைக்ரோஃபோனுக்கு HTTPS அல்லது localhost தேவை. தட்டச்சு செய்யலாம்.'));
    setBusy(busy); refreshMode(); input.focus();
  }
  function stopListening() {
    if (recognition) { const previous = recognition; recognition = null; previous.abort(); }
    listening = false; el('assistantMic').classList.remove('listening'); el('assistantMic').setAttribute('aria-pressed', 'false'); el('assistantMic').setAttribute('aria-label', 'Start microphone'); el('assistantMicLabel').textContent = translate('Tap to speak', 'பேசத் தொடங்கு');
  }
  function cancelPending() { revision++; request?.abort(); request = null; setBusy(false); stopListening(); stopSpeaking(); }
  function close() { cancelPending(); panel.hidden = true; el('assistantLaunch').hidden = false; el('assistantLaunch').setAttribute('aria-expanded', 'false'); (origin?.isConnected ? origin : el('assistantLaunch')).focus(); }

  async function applyAction(action, currentRevision) {
    if (!action) return null;
    if (action.kind === 'search') {
      if (!state.stations.some(s => s.code === action.from) || !state.stations.some(s => s.code === action.to) || !['normal', 'tourism', 'all'].includes(action.type) || !/^\d{4}-\d{2}-\d{2}$/.test(action.date) || !Number.isInteger(action.passengers) || action.passengers < 1 || action.passengers > 6) throw new Error('Invalid search response. Please try again.');
      el('fromStation').value = action.from; el('toStation').value = action.to; el('journeyDate').value = action.date; el('passengers').value = String(action.passengers); el('travelClass').value = ''; setType(action.type);
      await searchTrains(); if (el('searchError').textContent) throw new Error(el('searchError').textContent); return 'results';
    }
    if (action.kind === 'track') {
      const train = await fetchJson(`/api/trains/${encodeURIComponent(action.trainId)}`);
      if (revision !== currentRevision) return null;
      await selectTrackingTrain(train); return 'tracking';
    }
    if (action.kind === 'pnr' && /^\d{10}$/.test(action.pnr)) {
      const booking = await fetchJson(`/api/bookings/pnr/${action.pnr}`);
      const train = await fetchJson(`/api/trains/${encodeURIComponent(booking.trainId)}`);
      if (revision !== currentRevision) return null;
      await selectTrackingTrain(train); return 'tracking';
    }
    if (action.kind === 'tourism' && state.stations.some(s => s.code === action.to)) { el('toStation').value = action.to; await loadSpots(); return 'tourism'; }
    if (action.kind === 'navigate' && action.target === 'bookings') { await loadBookings(); return 'bookings'; }
    throw new Error('That action is not supported. Please use the normal Live Train controls.');
  }
  async function submit() {
    const text = input.value.trim(); if (!text || busy) return;
    if (text.length > 800) { status('Please keep your message under 800 characters.'); return; }
    stopListening(); stopSpeaking();
    const currentRevision = ++revision, selectedLanguage = language;
    addMessage('user', text); input.value = ''; setBusy(true); status(translate('Finding the best answer for your journey…', 'உங்கள் பயணத்திற்கான பதிலைத் தேடுகிறேன்…'));
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const answer = await LiveTrainAPI.request('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: text, language: selectedLanguage, history: history.slice(-6), context: { from: el('fromStation').value, to: el('toStation').value, date: el('journeyDate').value, passengers: Number(el('passengers').value), type: state.type, trainId: state.selectedTrain?.id } }) });
      if (revision !== currentRevision) return;
      if (typeof answer.reply !== 'string' || !answer.reply.trim()) throw new Error('No reply was received. Please try again.');
      const target = await applyAction(answer.action, currentRevision); if (revision !== currentRevision) return;
      history.push({ role: 'user', content: text }, { role: 'assistant', content: answer.reply }); history = history.slice(-6);
      el('assistantMode').textContent = answer.mode === 'ai' ? 'AI connected · Tamil & English' : 'Basic commands · Tamil & English';
      addMessage('assistant', answer.reply, target, selectedLanguage);
      status(answer.notice || translate('Ready for your next question.', 'அடுத்த கேள்வியைக் கேளுங்கள்.'));
      speak(answer.reply, selectedLanguage);
    } catch (error) {
      if (revision !== currentRevision) return;
      const text = error.name === 'AbortError' ? translate('The request took too long. Please try again.', 'பதில் பெற நேரமாகிறது. மீண்டும் முயற்சிக்கவும்.') : error.message;
      addMessage('assistant', text); status(translate('Could not complete that request. Try again.', 'கோரிக்கையை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'));
    } finally { clearTimeout(timeout); if (revision === currentRevision) { request = null; setBusy(false); } }
  }
  function startListening() {
    if (busy || !Recognition || !window.isSecureContext) return;
    if (recognition) { recognition.stop(); return; }
    stopSpeaking();
    const session = new Recognition(); recognition = session; session.lang = language; session.interimResults = true; session.continuous = false;
    let submitted = false, failed = false;
    session.onstart = () => { if (recognition !== session) return; listening = true; el('assistantMic').classList.add('listening'); el('assistantMic').setAttribute('aria-pressed', 'true'); el('assistantMic').setAttribute('aria-label', 'Stop microphone'); el('assistantMicLabel').textContent = translate('Listening…', 'கேட்கிறேன்…'); status(translate('Listening. Speak now; tap the mic again to finish.', 'கேட்கிறேன். இப்போது பேசுங்கள். முடிக்க மைக்ரோஃபோனை அழுத்தவும்.')); };
    session.onresult = event => {
      if (recognition !== session || panel.hidden || submitted) return;
      let transcript = '', final = false;
      for (let i = 0; i < event.results.length; i++) { transcript += event.results[i][0].transcript; final ||= event.results[i].isFinal; }
      input.value = transcript.slice(0, 800);
      if (final && input.value.trim()) { submitted = true; submit(); }
    };
    session.onerror = event => {
      if (recognition !== session) return;
      failed = true;
      const errors = {
        'not-allowed': translate('Microphone permission was denied. Allow it in your browser site settings, or type below.', 'மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது. உலாவி அமைப்பில் அனுமதிக்கவும் அல்லது தட்டச்சு செய்யவும்.'),
        'service-not-allowed': translate('Voice service is unavailable. Please type your question.', 'குரல் சேவை கிடைக்கவில்லை. தட்டச்சு செய்யவும்.'),
        'no-speech': translate('No speech heard. Tap the microphone and try again.', 'குரல் கேட்கவில்லை. மீண்டும் முயற்சிக்கவும்.'),
        'audio-capture': translate('No microphone found. Connect a microphone or type below.', 'மைக்ரோஃபோன் இல்லை. இணைக்கவும் அல்லது தட்டச்சு செய்யவும்.'),
        network: translate('Speech recognition could not connect. Check your internet or type below.', 'குரல் சேவை இணையத்துடன் இணையவில்லை. இணையத்தைச் சரிபார்க்கவும் அல்லது தட்டச்சு செய்யவும்.'),
        'language-not-supported': translate('This speech language is unavailable. Choose another language or type.', 'இந்த மொழியில் குரல் உள்ளீடு கிடைக்கவில்லை. வேறு மொழியைத் தேர்ந்தெடுக்கவும் அல்லது தட்டச்சு செய்யவும்.')
      };
      status(errors[event.error] || translate('Voice input stopped. You can try again or type.', 'குரல் உள்ளீடு நிறுத்தப்பட்டது. மீண்டும் முயற்சிக்கலாம் அல்லது தட்டச்சு செய்யலாம்.'));
    };
    session.onend = () => { if (recognition !== session) return; recognition = null; listening = false; stopListening(); if (!submitted && !failed) status(translate('Microphone stopped. Tap to try again, or send the text below.', 'மைக்ரோஃபோன் நிறுத்தப்பட்டது. மீண்டும் முயற்சிக்கவும் அல்லது கீழே உள்ள உரையை அனுப்பவும்.')); };
    try { session.start(); } catch { recognition = null; stopListening(); status(translate('Microphone could not start. Please try again or type.', 'மைக்ரோஃபோனைத் தொடங்க முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது தட்டச்சு செய்யவும்.')); }
  }
  function updateVoiceButton() { el('assistantVoice').textContent = voiceEnabled ? 'Voice on' : 'Voice off'; el('assistantVoice').setAttribute('aria-pressed', String(voiceEnabled)); }
  el('assistantLaunch').onclick = open; el('assistantClose').onclick = close;
  el('assistantForm').onsubmit = event => { event.preventDefault(); submit(); };
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); } };
  el('assistantMic').onclick = startListening;
  el('assistantStop').onclick = () => { cancelPending(); status(translate('Stopped. Ready when you are.', 'நிறுத்தப்பட்டது. மீண்டும் கேட்கலாம்.')); };
  el('assistantVoice').onclick = () => { voiceEnabled = !voiceEnabled; if (!voiceEnabled) stopSpeaking(); updateVoiceButton(); };
  el('assistantClear').onclick = () => { cancelPending(); history = []; messages.replaceChildren(); input.value = ''; welcome(); status(translate('Conversation cleared.', 'உரையாடல் அழிக்கப்பட்டது.')); };
  el('assistantLanguage').onchange = () => { cancelPending(); language = el('assistantLanguage').value; el('assistantSuggestions').replaceChildren(); welcome(); status(translate('English selected. Tap the mic or type.', 'தமிழ் தேர்வு செய்யப்பட்டது. பேசவும் அல்லது தட்டச்சு செய்யவும்.')); };
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopListening(); stopSpeaking(); } });
  window.addEventListener('pagehide', cancelPending);
  if (window.ResizeObserver) new ResizeObserver(() => { if (!panel.hidden) messages.scrollTop = messages.scrollHeight; }).observe(messages);
  setBusy(false);
})();
