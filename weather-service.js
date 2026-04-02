const { loadEnv } = require('./env');

loadEnv();

function getWeatherConfig() {
  const latitude = process.env.WEATHER_LATITUDE;
  const longitude = process.env.WEATHER_LONGITUDE;

  if (!latitude || !longitude) {
    return null;
  }

  return {
    latitude,
    longitude,
    timezone: process.env.WEATHER_TIMEZONE || 'auto'
  };
}

async function fetchDailyWeather(now = new Date()) {
  const config = getWeatherConfig();
  if (!config) {
    return null;
  }

  const params = new URLSearchParams({
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max'
    ].join(',')
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.daily || !payload.daily.time || payload.daily.time.length === 0) {
    return null;
  }

  const targetDate = now.toLocaleDateString('en-CA', {
    timeZone: payload.timezone || undefined
  });
  const dayIndex = payload.daily.time.findIndex(day => day === targetDate);
  const index = dayIndex >= 0 ? dayIndex : 0;

  return {
    summary: describeWeatherCode(payload.daily.weather_code[index]),
    highTempF: celsiusToFahrenheit(payload.daily.temperature_2m_max[index]),
    lowTempF: celsiusToFahrenheit(payload.daily.temperature_2m_min[index]),
    precipitationChance: payload.daily.precipitation_probability_max[index] ?? null
  };
}

function celsiusToFahrenheit(value) {
  if (typeof value !== 'number') {
    return null;
  }
  return Math.round((value * 9) / 5 + 32);
}

function describeWeatherCode(code) {
  const labels = {
    0: 'Clear skies',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Heavy drizzle',
    56: 'Light freezing drizzle',
    57: 'Heavy freezing drizzle',
    61: 'Light rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light rain showers',
    81: 'Moderate rain showers',
    82: 'Heavy rain showers',
    85: 'Light snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorms',
    96: 'Thunderstorms with light hail',
    99: 'Thunderstorms with heavy hail'
  };

  return labels[code] || 'Weather unavailable';
}

module.exports = {
  fetchDailyWeather
};
