const weatherCache = new Map();

export async function getWeatherData(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60_000) return { ...cached.data, cached: true };

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=2`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Weather provider status ${response.status}`);
    const data = await response.json();
    weatherCache.set(key, { time: Date.now(), data });
    return data;
  } catch {
    return {
      current: { temperature_2m: 29, apparent_temperature: 31, weather_code: 2, wind_speed_10m: 13 },
      hourly: {
        temperature_2m: [29, 29, 28, 28, 27, 27],
        weather_code: [2, 2, 3, 61, 61, 3],
        precipitation_probability: [16, 18, 25, 42, 38, 22]
      },
      fallback: true
    };
  }
}

