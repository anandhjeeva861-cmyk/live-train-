const weatherCache = new Map();
const pending = new Map();

export async function getWeatherData(lat, lng) {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60_000) return { ...cached.data, cached: true };
  if (pending.has(key)) return pending.get(key);
  const task = fetchWeather(lat, lng, key);
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function fetchWeather(lat, lng, key) {

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=2`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Weather provider status ${response.status}`);
    const data = await response.json();
    if (!Number.isFinite(data.current?.temperature_2m)) throw new Error('Invalid weather data');
    if (weatherCache.size >= 500) weatherCache.delete(weatherCache.keys().next().value);
    weatherCache.set(key, { time: Date.now(), data });
    return data;
  } catch {
    const data = { current: null, hourly: {}, fallback: true, error: 'Weather temporarily unavailable' };
    if (weatherCache.size >= 500) weatherCache.delete(weatherCache.keys().next().value);
    weatherCache.set(key, { time: Date.now(), data });
    return data;
  }
}
