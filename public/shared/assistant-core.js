import { stations, trains, touristSpots } from './catalog.js';

const intents = ['search', 'track', 'weather', 'tourism', 'bookings', 'help', 'chat'];
const stationAliases = {
  MAS: ['chennai', 'madras', 'சென்னை'], SBC: ['bangalore', 'bengaluru', 'bangaluru', 'பெங்களூர்', 'பெங்களூரு', 'பெங்களூருக்கு'],
  CBE: ['coimbatore', 'kovai', 'கோயம்புத்தூர்', 'கோவை'], MYS: ['mysore', 'mysuru', 'மைசூர்', 'மைசூரு'],
  MDU: ['madurai', 'மதுரை'], UAM: ['ooty', 'udhagamandalam', 'ஊட்டி'], KPD: ['katpadi', 'vellore', 'காட்பாடி', 'வேலூர்'],
  JTJ: ['jolarpettai', 'ஜோலார்பேட்டை'], SA: ['salem', 'சேலம்'], TPJ: ['trichy', 'tiruchirappalli', 'திருச்சி'],
  MTP: ['mettupalayam', 'மேட்டுப்பாளையம்'], ONR: ['coonoor', 'குன்னூர்']
};
const nullableString = { type: ['string', 'null'] };
export const intentSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: intents }, from: nullableString, to: nullableString,
    date: nullableString, passengers: { type: ['integer', 'null'] },
    trainNumber: nullableString, type: { type: ['string', 'null'], enum: ['normal', 'tourism', 'all', null] },
    reply: { type: 'string' }
  }, required: ['intent', 'from', 'to', 'date', 'passengers', 'trainNumber', 'type', 'reply']
};

export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(date, days) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function knownStation(code) { return stations.find(s => s.code === code); }
export function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date; }

export function parseCommand(message, today = indiaDate()) {
  const text = message.toLowerCase();
  const hits = Object.entries(stationAliases).map(([code, aliases]) => {
    const positions = [...aliases, code.toLowerCase()].map(alias => {
      // English words/codes need boundaries; Tamil suffixes such as சென்னையிலிருந்து are allowed.
      const match = text.match(new RegExp(/[\u0B80-\u0BFF]/.test(alias) ? alias : `\\b${alias}\\b`, 'u'));
      return match ? match.index : -1;
    }).filter(i => i >= 0);
    return { code, index: positions.length ? Math.min(...positions) : -1 };
  }).filter(s => s.index >= 0).sort((a, b) => a.index - b.index);
  const result = { intent: 'chat', from: null, to: null, date: null, passengers: null, trainNumber: null, type: null, reply: '' };
  if (/weather|temperature|\brain\b|வானிலை|மழை|வெப்பநிலை|mazhai|veppam/.test(text)) result.intent = 'weather';
  else if (/tourist(?!\s+train)|places|spots|visit|சுற்றுலா இட|பார்க்க|suththi|sightseeing/.test(text)) result.intent = 'tourism';
  else if (/my bookings?|my tickets?|booking history|என்.*(டிக்கெட்|முன்பதிவு)|en(noda)? (bookings|tickets)/.test(text)) result.intent = 'bookings';
  else if (/track|speed|where.*train|next (stop|station)|eta|எங்கே|எங்க இருக்கு|வேகம்|அடுத்த நிலையம்|எப்போது|eppo|enga.*(train|iruk)|train.*enga/.test(text)) result.intent = 'track';
  else if (/search|find|book|trains?|ticket|ரயில்|ரெயில்|டிக்கெட்|தேடு|பயண|போக|poganum|venum/.test(text) || hits.length >= 2 || /tomorrow|today|நாளை|இன்று|naalai|naalaikku/.test(text)) result.intent = 'search';
  else if (/help|உதவி|எப்படி|enna.*pannu/.test(text)) result.intent = 'help';
  if (hits.length >= 2) {
    // Handle both "from Chennai to Bangalore" and "to Bangalore from Chennai".
    const fromPrefix = /\bfrom\s*$/.test(text.slice(0, hits[1].index));
    result.from = hits[fromPrefix ? 1 : 0].code; result.to = hits[fromPrefix ? 0 : 1].code;
  } else if (hits.length === 1) {
    const before = text.slice(0, hits[0].index);
    const after = text.slice(hits[0].index);
    if (/\bfrom\s*$/.test(before) || /இருந்து|லிருந்து/.test(after)) result.from = hits[0].code;
    else result.to = hits[0].code;
  }
  if (result.intent === 'search') {
    for (const [field, pattern] of [['from', /\bfrom\s+([a-z][a-z ]*?)(?=\s+to\b|\s+tomorrow\b|\s+today\b|\s+on\b|$)/], ['to', /\bto\s+([a-z][a-z ]*?)(?=\s+from\b|\s+tomorrow\b|\s+today\b|\s+on\b|$)/]]) {
      const part = text.match(pattern);
      if (part && !/^(book|find|search|travel|go)\b/.test(part[1])) {
        const station = Object.entries(stationAliases).find(([code, aliases]) => [...aliases, code.toLowerCase()].some(a => new RegExp(`\\b${a}\\b`).test(part[1])));
        result[field] = station ? station[0] : 'unsupported';
      }
    }
    const tamilTo = text.split(/முதல்|இருந்து/)[1];
    if (tamilTo && !Object.values(stationAliases).flat().some(a => tamilTo.includes(a))) result.to = 'unsupported';
  }
  if (['weather', 'tourism'].includes(result.intent) && !hits.length) {
    const place = text.match(/\b(?:in|near|at|for)\s+([a-z]+)/)?.[1];
    const beforeWeather = text.match(/^([a-z]+)\s+(?:weather|temperature|tourist spots)/)?.[1];
    const word = place || beforeWeather;
    if (word && !['the', 'my', 'your', 'current', 'destination', 'today', 'tomorrow', 'nearby', 'show', 'what', 'check'].includes(word)) result.to = 'unsupported';
  }
  if (/day after tomorrow|நாளை மறுநாள்|naalai marunaal/.test(text)) result.date = addDays(today, 2);
  else if (/tomorrow|நாளை|naalai|naalaikku/.test(text)) result.date = addDays(today, 1);
  else if (/today|இன்று|innaikku|indru/.test(text)) result.date = today;
  else if (/yesterday|நேற்று|nethu/.test(text)) result.date = addDays(today, -1);
  else result.date = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || null;
  if (!result.date && /\b(?:next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(text)) result.date = 'unsupported';
  const passengers = text.match(/(\d+)\s*(passengers?|people|persons?|பேர்|பயணிகள்|peru)/);
  if (passengers) result.passengers = Number(passengers[1]);
  if (!passengers) {
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ஒரு: 1, இரண்டு: 2, மூன்று: 3, நான்கு: 4, ஐந்து: 5, ஆறு: 6 };
    for (const [word, count] of Object.entries(words)) if (new RegExp(`${word}\\s*(passengers?|people|persons?|பேர்|பயணிகள்|peru)`).test(text)) result.passengers = count;
  }
  result.type = /tourism|tourist train|சுற்றுலா ரயில்/.test(text) ? 'tourism' : /normal|regular|சாதாரண/.test(text) ? 'normal' : null;
  result.trainNumber = message.match(/\b(?:TR\d{3}|\d{5}|\d{10})\b/i)?.[0]?.toUpperCase() || null;
  const namedTrain = trains.find(t => text.includes(t.id) || text.includes(t.name.toLowerCase()));
  if (namedTrain) result.trainNumber = namedTrain.number;
  if (result.trainNumber && result.intent === 'chat') result.intent = 'track';
  return result;
}

export function validateIntent(value) {
  if (!value || !intents.includes(value.intent) || typeof value.reply !== 'string' || value.reply.length > 2000) return false;
  for (const field of ['from', 'to', 'date', 'trainNumber']) if (value[field] !== null && (typeof value[field] !== 'string' || value[field].length > 80)) return false;
  if (value.passengers !== null && !Number.isInteger(value.passengers)) return false;
  return [null, 'normal', 'tourism', 'all'].includes(value.type);
}

export function createAssistant({ getLiveState, getWeatherData, resolveIntent = null }) {
  return async function answer({ message, language = 'en-IN', context = {}, history = [] }) {
    const ta = language === 'ta-IN';
    const say = (en, tamil) => ta ? tamil : en;
    let plan = parseCommand(message), mode = 'commands', notice = null;
    if (resolveIntent) {
      try { plan = await resolveIntent({ message, language, context, history }); mode = 'ai'; }
      catch { notice = say('AI is temporarily unavailable. Using basic commands.', 'AI தற்போது கிடைக்கவில்லை. அடிப்படை கட்டளைகள் பயன்படுத்தப்படுகின்றன.'); }
    }
    const result = (reply, action = null) => ({ reply, action, mode, notice, language });
    if (/\b(cancel|pay|refund|confirm booking|purchase)\b|ரத்து|பணம் செலுத்த|கட்டணம் செலுத்த|உறுதி செய்/i.test(message)) return result(say('I can help find trains and show your tickets. Complete bookings yourself in the seat selection screen; payments, cancellations and refunds are not available in this demo.', 'ரயில்களைத் தேடவும் டிக்கெட்டுகளைப் பார்க்கவும் உதவுவேன். இருக்கை தேர்வு திரையில் முன்பதிவை நீங்களே முடிக்கலாம். இந்த டெமோவில் பணம் செலுத்துதல், ரத்து, பணத்தைத் திரும்பப் பெறுதல் கிடையாது.'));
    if (plan.intent === 'search') {
      const from = plan.from || context.from, to = plan.to || context.to;
      if (!knownStation(from) || !knownStation(to)) return result(say('Which stations? Try “Chennai to Bangalore tomorrow”. Available cities include Chennai, Bengaluru, Coimbatore, Mysuru, Madurai and Ooty.', 'எந்த நிலையங்கள்? “சென்னை முதல் பெங்களூரு நாளை ரயில்” என்று கேளுங்கள். சென்னை, பெங்களூரு, கோவை, மைசூர், மதுரை, ஊட்டி போன்ற நகரங்கள் உள்ளன.'));
      // An explicit unknown destination must never be replaced with the current form route in command mode.
      if (mode === 'commands' && /\b(from|to)\s+[a-z]/i.test(message) && !plan.from && !plan.to) return result(say('I could not identify those stations. Please use a supported city or select the stations in the search form.', 'நிலையங்களை அடையாளம் காண முடியவில்லை. தேடல் படிவத்தில் நிலையங்களைத் தேர்ந்தெடுக்கவும்.'));
      if (from === to) return result(say('Choose different departure and arrival stations.', 'புறப்படும் நிலையமும் சேரும் நிலையமும் வேறாக இருக்க வேண்டும்.'));
      const date = plan.date || context.date || addDays(indiaDate(), 1);
      if (!validDate(date) || date < indiaDate()) return result(say('Please choose today or a future date in YYYY-MM-DD format.', 'இன்று அல்லது எதிர்கால தேதியை YYYY-MM-DD வடிவில் தேர்ந்தெடுக்கவும்.'));
      const passengers = plan.passengers ?? context.passengers ?? 1;
      if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) return result(say('Choose between 1 and 6 passengers.', '1 முதல் 6 பயணிகள் வரை தேர்ந்தெடுக்கவும்.'));
      const type = plan.type || context.type || 'normal';
      const matches = trains.filter(t => t.from.code === from && t.to.code === to && (type === 'all' || t.type === type));
      const summary = matches.slice(0, 3).map(t => `${t.number} ${t.name}, ${t.departure}, ₹${Math.min(...Object.values(t.fare))}`).join('; ');
      return result(say(matches.length ? `Found ${matches.length} demo trains from ${knownStation(from).city} to ${knownStation(to).city} for ${date}. ${summary}. Fares shown are starting prices per passenger; review and book below.` : 'No exact demo trains match that route and train type. Try another route or train type.', matches.length ? `${date} அன்று ${knownStation(from).city} முதல் ${knownStation(to).city} வரை ${matches.length} டெமோ ரயில்கள் உள்ளன. ${summary}. இவை ஒரு பயணிக்கான தொடக்கக் கட்டணங்கள். கீழே பார்த்து முன்பதிவு செய்யலாம்.` : 'இந்த வழித்தடம் மற்றும் ரயில் வகைக்கு டெமோ ரயில்கள் இல்லை. வேறு வழித்தடம் அல்லது வகையைத் தேர்ந்தெடுக்கவும்.'), { kind: 'search', from, to, date, passengers, type });
    }
    if (plan.intent === 'track') {
      // PNR lookup stays in the existing client/server flow and is not sent as booking history to AI.
      if (plan.trainNumber && /^\d{10}$/.test(plan.trainNumber)) return result(say('Use the tracking lookup to check this demo PNR.', 'இந்த டெமோ PNR-ஐ கண்காணிப்பு தேடலில் சரிபார்க்கலாம்.'), { kind: 'pnr', pnr: plan.trainNumber });
      const train = plan.trainNumber ? trains.find(t => t.number.toUpperCase() === plan.trainNumber.toUpperCase()) : trains.find(t => t.id === context.trainId);
      if (!train) return result(say('Tell me a supported train number, for example “Track 12639”.', 'ரயில் எண்ணைக் கூறுங்கள். உதாரணம்: “12639 ரயில் எங்கே?”'));
      const live = getLiveState(train);
      return result(say(`${train.name} is travelling at ${live.speedKmph} kilometres per hour. Next station: ${live.nextStation}. Estimated destination arrival in ${live.etaMinutes} minutes. This is simulated tracking.`, `${train.name} மணிக்கு ${live.speedKmph} கிலோமீட்டர் வேகத்தில் செல்கிறது. அடுத்த நிலையம் ${live.nextStation}. சேரும் நிலையத்தை அடைய சுமார் ${live.etaMinutes} நிமிடங்கள். இது டெமோ கண்காணிப்பு.`), { kind: 'track', trainId: train.id });
    }
    if (plan.intent === 'weather') {
      const station = knownStation(plan.to || plan.from || context.to);
      if (!station) return result(say('Which supported city would you like the weather for?', 'எந்த நகரத்தின் வானிலை வேண்டும்?'));
      const weather = await getWeatherData(station.lat, station.lng);
      if (weather.fallback || !Number.isFinite(weather.current?.temperature_2m)) return result(say(`Live weather for ${station.city} is unavailable. The weather panel may show sample data; please check again later.`, `${station.city} நேரடி வானிலை தற்போது கிடைக்கவில்லை. வானிலை பகுதியில் மாதிரி தரவு இருக்கலாம். பிறகு முயற்சிக்கவும்.`));
      const c = weather.current;
      return result(say(`The current weather reading for ${station.city} is ${Math.round(c.temperature_2m)} degrees Celsius, feels like ${Math.round(c.apparent_temperature)} degrees, with wind at ${Math.round(c.wind_speed_10m)} kilometres per hour.`, `${station.city} தற்போதைய வெப்பநிலை ${Math.round(c.temperature_2m)} டிகிரி செல்சியஸ். உணரும் வெப்பநிலை ${Math.round(c.apparent_temperature)} டிகிரி. காற்றின் வேகம் மணிக்கு ${Math.round(c.wind_speed_10m)} கிலோமீட்டர்.`));
    }
    if (plan.intent === 'tourism') {
      const station = knownStation(plan.to || plan.from || context.to);
      if (!station) return result(say('Which destination would you like to explore?', 'எந்த நகரத்தின் சுற்றுலா இடங்களைப் பார்க்க விரும்புகிறீர்கள்?'));
      const spots = touristSpots.filter(s => s.city === station.city).slice(0, 3);
      return result(say(spots.length ? `Near ${station.city}: ${spots.map(s => `${s.name}, ${s.distanceKm} kilometres from the station`).join('; ')}. Distances are approximate.` : `No curated tourist spots are available for ${station.city} yet.`, spots.length ? `${station.city} அருகில்: ${spots.map(s => `${s.name}, நிலையத்திலிருந்து ${s.distanceKm} கிலோமீட்டர்`).join('; ')}. இவை தோராயமான தூரங்கள்.` : `${station.city} சுற்றுலா இடங்கள் இன்னும் சேர்க்கப்படவில்லை.`), { kind: 'tourism', to: station.code });
    }
    if (plan.intent === 'bookings') return result(say('You can view your saved demo tickets in My Bookings.', 'உங்கள் சேமித்த டெமோ டிக்கெட்டுகளை My Bookings பகுதியில் பார்க்கலாம்.'), { kind: 'navigate', target: 'bookings' });
    if (mode === 'ai' && plan.intent === 'chat' && plan.reply.trim()) return result(plan.reply);
    return result(say('I can search trains, track a train, check destination weather and find tourist spots. Try “Chennai to Bangalore tomorrow”, “Track 12639”, or “Show my bookings”. Basic command mode is active; free-form AI chat requires the server AI connection.', 'ரயில் தேடல், கண்காணிப்பு, வானிலை, சுற்றுலா இடங்கள் பற்றி உதவுவேன். “சென்னை முதல் பெங்களூரு நாளை ரயில்”, “12639 ரயில் எங்கே”, “என் டிக்கெட்டுகள்” என்று கேளுங்கள். அடிப்படை கட்டளை முறை இயங்குகிறது. பொதுவான AI உரையாடலுக்கு சர்வர் AI இணைப்பு தேவை.'));
  };
}

