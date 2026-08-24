import { SkyKey } from './theme';
import { seeded, dateKey } from './utils';

export interface WeatherCondition {
  code: number;
  label: string;
  short: string;
  icon: string; // Ionicons name (day)
  iconNight: string;
  sky: SkyKey;
  skyNight: SkyKey;
  outdoorScore: number; // 0-100 how good for outdoor activity
}

/** WMO weather interpretation codes -> our design system */
const WMO: Record<number, WeatherCondition> = {
  0: { code: 0, label: 'Clear sky', short: 'Clear', icon: 'sunny', iconNight: 'moon', sky: 'clear-day', skyNight: 'clear-night', outdoorScore: 100 },
  1: { code: 1, label: 'Mainly clear', short: 'Mostly clear', icon: 'partly-sunny', iconNight: 'cloudy-night', sky: 'clear-day', skyNight: 'clear-night', outdoorScore: 94 },
  2: { code: 2, label: 'Partly cloudy', short: 'Partly cloudy', icon: 'partly-sunny', iconNight: 'cloudy-night', sky: 'partly-day', skyNight: 'partly-night', outdoorScore: 85 },
  3: { code: 3, label: 'Overcast', short: 'Overcast', icon: 'cloudy', iconNight: 'cloudy', sky: 'cloudy', skyNight: 'cloudy', outdoorScore: 68 },
  45: { code: 45, label: 'Fog', short: 'Fog', icon: 'cloud-outline', iconNight: 'cloud-outline', sky: 'fog', skyNight: 'fog', outdoorScore: 42 },
  48: { code: 48, label: 'Rime fog', short: 'Freezing fog', icon: 'cloud-outline', iconNight: 'cloud-outline', sky: 'fog', skyNight: 'fog', outdoorScore: 32 },
  51: { code: 51, label: 'Light drizzle', short: 'Drizzle', icon: 'rainy-outline', iconNight: 'rainy-outline', sky: 'drizzle', skyNight: 'drizzle', outdoorScore: 48 },
  53: { code: 53, label: 'Drizzle', short: 'Drizzle', icon: 'rainy-outline', iconNight: 'rainy-outline', sky: 'drizzle', skyNight: 'drizzle', outdoorScore: 42 },
  55: { code: 55, label: 'Dense drizzle', short: 'Heavy drizzle', icon: 'rainy', iconNight: 'rainy', sky: 'drizzle', skyNight: 'drizzle', outdoorScore: 34 },
  56: { code: 56, label: 'Freezing drizzle', short: 'Icy drizzle', icon: 'rainy', iconNight: 'rainy', sky: 'drizzle', skyNight: 'drizzle', outdoorScore: 24 },
  57: { code: 57, label: 'Freezing drizzle', short: 'Icy drizzle', icon: 'rainy', iconNight: 'rainy', sky: 'drizzle', skyNight: 'drizzle', outdoorScore: 20 },
  61: { code: 61, label: 'Light rain', short: 'Light rain', icon: 'rainy-outline', iconNight: 'rainy-outline', sky: 'rain', skyNight: 'rain', outdoorScore: 44 },
  63: { code: 63, label: 'Rain', short: 'Rain', icon: 'rainy', iconNight: 'rainy', sky: 'rain', skyNight: 'rain', outdoorScore: 28 },
  65: { code: 65, label: 'Heavy rain', short: 'Heavy rain', icon: 'rainy', iconNight: 'rainy', sky: 'rain', skyNight: 'rain', outdoorScore: 12 },
  66: { code: 66, label: 'Freezing rain', short: 'Freezing rain', icon: 'rainy', iconNight: 'rainy', sky: 'rain', skyNight: 'rain', outdoorScore: 10 },
  67: { code: 67, label: 'Freezing rain', short: 'Freezing rain', icon: 'rainy', iconNight: 'rainy', sky: 'rain', skyNight: 'rain', outdoorScore: 8 },
  71: { code: 71, label: 'Light snow', short: 'Light snow', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 46 },
  73: { code: 73, label: 'Snow', short: 'Snow', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 32 },
  75: { code: 75, label: 'Heavy snow', short: 'Heavy snow', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 14 },
  77: { code: 77, label: 'Snow grains', short: 'Snow grains', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 38 },
  80: { code: 80, label: 'Rain showers', short: 'Showers', icon: 'rainy-outline', iconNight: 'rainy-outline', sky: 'rain', skyNight: 'rain', outdoorScore: 40 },
  81: { code: 81, label: 'Rain showers', short: 'Showers', icon: 'rainy', iconNight: 'rainy', sky: 'rain', skyNight: 'rain', outdoorScore: 26 },
  82: { code: 82, label: 'Violent showers', short: 'Downpour', icon: 'thunderstorm', iconNight: 'thunderstorm', sky: 'rain', skyNight: 'rain', outdoorScore: 8 },
  85: { code: 85, label: 'Snow showers', short: 'Snow showers', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 30 },
  86: { code: 86, label: 'Heavy snow showers', short: 'Snow showers', icon: 'snow', iconNight: 'snow', sky: 'snow', skyNight: 'snow', outdoorScore: 12 },
  95: { code: 95, label: 'Thunderstorm', short: 'Storms', icon: 'thunderstorm', iconNight: 'thunderstorm', sky: 'thunder', skyNight: 'thunder', outdoorScore: 6 },
  96: { code: 96, label: 'Storm with hail', short: 'Hailstorm', icon: 'thunderstorm', iconNight: 'thunderstorm', sky: 'thunder', skyNight: 'thunder', outdoorScore: 3 },
  99: { code: 99, label: 'Severe hailstorm', short: 'Hailstorm', icon: 'thunderstorm', iconNight: 'thunderstorm', sky: 'thunder', skyNight: 'thunder', outdoorScore: 2 },
};

export function condition(code: number): WeatherCondition {
  return WMO[code] ?? WMO[3];
}

export function skyFor(code: number, isDay: boolean, hourOffsetFromSunrise?: number): SkyKey {
  const c = condition(code);
  const clearish = code <= 2;
  if (clearish && hourOffsetFromSunrise !== undefined) {
    if (hourOffsetFromSunrise >= -0.6 && hourOffsetFromSunrise <= 1.1) return 'sunrise';
  }
  return isDay ? c.sky : c.skyNight;
}

export interface HourPoint {
  time: number; // epoch ms
  temp: number; // celsius
  code: number;
  pop: number; // precipitation probability %
  uv: number;
  wind: number;
  isDay: boolean;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  time: number;
  code: number;
  max: number;
  min: number;
  sunrise: number;
  sunset: number;
  pop: number;
  uvMax: number;
  windMax: number;
  precipSum: number;
}

export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  code: number;
  isDay: boolean;
  humidity: number;
  pressure: number;
  wind: number;
  windDir: number;
  uv: number;
  precip: number;
  cloud: number;
  visibility: number;
  time: number;
}

export interface WeatherBundle {
  current: CurrentWeather;
  hourly: HourPoint[];
  daily: DayPoint[];
  timezone: string;
  fetchedAt: number;
  source: 'live' | 'offline';
}

export interface Place {
  id: string;
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lon: number;
  timezone?: string;
}

export const DEFAULT_PLACES: Place[] = [
  { id: 'sf', name: 'San Francisco', region: 'California', country: 'United States', countryCode: 'US', lat: 37.7749, lon: -122.4194 },
  { id: 'nyc', name: 'New York', region: 'New York', country: 'United States', countryCode: 'US', lat: 40.7128, lon: -74.006 },
  { id: 'ldn', name: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', lat: 51.5072, lon: -0.1276 },
  { id: 'tky', name: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6762, lon: 139.6503 },
  { id: 'blr', name: 'Bengaluru', region: 'Karnataka', country: 'India', countryCode: 'IN', lat: 12.9716, lon: 77.5946 },
  { id: 'syd', name: 'Sydney', region: 'NSW', country: 'Australia', countryCode: 'AU', lat: -33.8688, lon: 151.2093 },
  { id: 'ber', name: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.52, lon: 13.405 },
  { id: 'dxb', name: 'Dubai', country: 'UAE', countryCode: 'AE', lat: 25.2048, lon: 55.2708 },
];

/* ---------------------------- unit helpers ---------------------------- */

export type TempUnit = 'C' | 'F';
export type WindUnit = 'kmh' | 'mph' | 'ms';

export function toTemp(c: number, unit: TempUnit) {
  return unit === 'F' ? c * 9 / 5 + 32 : c;
}
export function fmtTemp(c: number, unit: TempUnit, withDeg = true) {
  const v = Math.round(toTemp(c, unit));
  return withDeg ? `${v}\u00B0` : `${v}`;
}
export function fmtWind(kmh: number, unit: WindUnit) {
  if (unit === 'mph') return `${Math.round(kmh * 0.621371)} mph`;
  if (unit === 'ms') return `${(kmh / 3.6).toFixed(1)} m/s`;
  return `${Math.round(kmh)} km/h`;
}
export function windCompass(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
export function uvLabel(uv: number) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}
export function aqiFromWeather(w: CurrentWeather) {
  // Derived comfort index (not a real AQI feed) - stable pseudo value
  const base = 28 + (w.cloud / 100) * 22 + Math.max(0, 12 - w.wind) * 2.4;
  return Math.round(Math.min(160, Math.max(12, base)));
}
export function aqiLabel(v: number) {
  if (v <= 50) return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy (sensitive)';
  return 'Unhealthy';
}

/* ---------------------------- data fetching ---------------------------- */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}

export async function fetchWeather(place: Place): Promise<WeatherBundle> {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,uv_index,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '10',
  });
  const { signal, cancel } = withTimeout(9000);
  try {
    const res = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal });
    cancel();
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j: any = await res.json();
    return normalize(j, place);
  } catch (e) {
    cancel();
    return synthesize(place);
  }
}

function normalize(j: any, place: Place): WeatherBundle {
  const cur = j.current ?? {};
  const hourly: HourPoint[] = [];
  const H = j.hourly ?? {};
  const times: string[] = H.time ?? [];
  for (let i = 0; i < times.length; i++) {
    hourly.push({
      time: new Date(times[i]).getTime(),
      temp: H.temperature_2m?.[i] ?? 0,
      code: H.weather_code?.[i] ?? 0,
      pop: H.precipitation_probability?.[i] ?? 0,
      uv: H.uv_index?.[i] ?? 0,
      wind: H.wind_speed_10m?.[i] ?? 0,
      isDay: (H.is_day?.[i] ?? 1) === 1,
    });
  }
  const daily: DayPoint[] = [];
  const D = j.daily ?? {};
  const dTimes: string[] = D.time ?? [];
  for (let i = 0; i < dTimes.length; i++) {
    daily.push({
      date: dTimes[i],
      time: new Date(`${dTimes[i]}T12:00:00`).getTime(),
      code: D.weather_code?.[i] ?? 0,
      max: D.temperature_2m_max?.[i] ?? 0,
      min: D.temperature_2m_min?.[i] ?? 0,
      sunrise: new Date(D.sunrise?.[i] ?? `${dTimes[i]}T06:30:00`).getTime(),
      sunset: new Date(D.sunset?.[i] ?? `${dTimes[i]}T18:30:00`).getTime(),
      pop: D.precipitation_probability_max?.[i] ?? 0,
      uvMax: D.uv_index_max?.[i] ?? 0,
      windMax: D.wind_speed_10m_max?.[i] ?? 0,
      precipSum: D.precipitation_sum?.[i] ?? 0,
    });
  }
  const current: CurrentWeather = {
    temp: cur.temperature_2m ?? hourly[0]?.temp ?? 18,
    feelsLike: cur.apparent_temperature ?? cur.temperature_2m ?? 18,
    code: cur.weather_code ?? 0,
    isDay: (cur.is_day ?? 1) === 1,
    humidity: cur.relative_humidity_2m ?? 55,
    pressure: cur.pressure_msl ?? 1013,
    wind: cur.wind_speed_10m ?? 8,
    windDir: cur.wind_direction_10m ?? 180,
    uv: hourly.find((h) => h.time >= Date.now())?.uv ?? 3,
    precip: cur.precipitation ?? 0,
    cloud: cur.cloud_cover ?? 30,
    visibility: Math.max(1, 20 - (cur.cloud_cover ?? 30) / 12),
    time: Date.now(),
  };
  return {
    current,
    hourly,
    daily,
    timezone: j.timezone ?? 'auto',
    fetchedAt: Date.now(),
    source: 'live',
  };
}

/** Deterministic offline model so the app is always fully usable. */
export function synthesize(place: Place): WeatherBundle {
  const now = new Date();
  const seedBase = Math.abs(place.lat * 100 + place.lon * 37) + now.getFullYear();
  const latFactor = 1 - Math.min(1, Math.abs(place.lat) / 70);
  const seasonal = Math.cos(((now.getMonth() + 1) / 12) * Math.PI * 2) * (place.lat >= 0 ? -1 : 1);
  const baseTemp = 6 + latFactor * 22 + seasonal * 6;

  const codePool = [0, 1, 2, 3, 45, 61, 63, 80, 95, 71];
  const pickCode = (d: number) => {
    const r = seeded(seedBase + d * 7.13);
    const idx = Math.floor(r * codePool.length);
    const c = codePool[idx];
    if (c === 71 && baseTemp > 6) return 61;
    return c;
  };

  const hourly: HourPoint[] = [];
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() - now.getHours()); // start of today
  for (let i = 0; i < 240; i++) {
    const t = new Date(start.getTime() + i * 3600_000);
    const hour = t.getHours();
    const dayIdx = Math.floor(i / 24);
    const diurnal = -Math.cos(((hour - 3) / 24) * Math.PI * 2) * 5.2;
    const noise = (seeded(seedBase + i * 1.77) - 0.5) * 2.1;
    const code = pickCode(dayIdx);
    const isDay = hour >= 6 && hour < 19;
    hourly.push({
      time: t.getTime(),
      temp: +(baseTemp + diurnal + noise).toFixed(1),
      code: hour % 5 === 0 ? code : code,
      pop: Math.round(Math.max(0, Math.min(95, (code >= 51 ? 55 : 8) + (seeded(seedBase + i * 3.1) - 0.5) * 40))),
      uv: isDay ? Math.max(0, +(Math.sin(((hour - 6) / 13) * Math.PI) * (2 + latFactor * 8)).toFixed(1)) : 0,
      wind: +(6 + seeded(seedBase + i * 0.91) * 16).toFixed(1),
      isDay,
    });
  }

  const daily: DayPoint[] = [];
  for (let d = 0; d < 10; d++) {
    const dayHours = hourly.slice(d * 24, d * 24 + 24);
    if (!dayHours.length) break;
    const date = new Date(dayHours[0].time);
    const temps = dayHours.map((h) => h.temp);
    const code = pickCode(d);
    const sr = new Date(date); sr.setHours(6, Math.round(seeded(seedBase + d) * 40), 0, 0);
    const ss = new Date(date); ss.setHours(18, Math.round(seeded(seedBase + d * 2) * 50), 0, 0);
    daily.push({
      date: dateKey(date),
      time: date.getTime() + 12 * 3600_000,
      code,
      max: +Math.max(...temps).toFixed(1),
      min: +Math.min(...temps).toFixed(1),
      sunrise: sr.getTime(),
      sunset: ss.getTime(),
      pop: Math.max(...dayHours.map((h) => h.pop)),
      uvMax: +Math.max(...dayHours.map((h) => h.uv)).toFixed(1),
      windMax: +Math.max(...dayHours.map((h) => h.wind)).toFixed(1),
      precipSum: code >= 51 ? +(seeded(seedBase + d * 5) * 9).toFixed(1) : 0,
    });
  }

  const nowHour = hourly.find((h) => h.time >= now.getTime() - 3600_000) ?? hourly[0];
  const current: CurrentWeather = {
    temp: nowHour.temp,
    feelsLike: +(nowHour.temp - 1 + seeded(seedBase) * 2).toFixed(1),
    code: nowHour.code,
    isDay: nowHour.isDay,
    humidity: Math.round(45 + seeded(seedBase * 1.3) * 40),
    pressure: Math.round(1002 + seeded(seedBase * 1.7) * 22),
    wind: nowHour.wind,
    windDir: Math.round(seeded(seedBase * 2.1) * 360),
    uv: nowHour.uv,
    precip: nowHour.pop > 60 ? +(seeded(seedBase * 3) * 2).toFixed(1) : 0,
    cloud: Math.round(condition(nowHour.code).outdoorScore > 80 ? seeded(seedBase * 4) * 25 : 55 + seeded(seedBase * 5) * 40),
    visibility: 10,
    time: now.getTime(),
  };

  return { current, hourly, daily, timezone: 'local', fetchedAt: Date.now(), source: 'offline' };
}

/* ---------------------------- geocoding ---------------------------- */

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { signal, cancel } = withTimeout(8000);
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`,
      { signal }
    );
    cancel();
    const j: any = await res.json();
    const list: Place[] = (j.results ?? []).map((r: any) => ({
      id: `geo_${r.id}`,
      name: r.name,
      region: r.admin1,
      country: r.country,
      countryCode: r.country_code,
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
    }));
    return list;
  } catch {
    cancel();
    const lower = q.toLowerCase();
    return DEFAULT_PLACES.filter((p) => p.name.toLowerCase().includes(lower));
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  const { signal, cancel } = withTimeout(7000);
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${lat}&longitude=${lon}&count=1`,
      { signal }
    );
    cancel();
    const j: any = await res.json();
    const r = j?.results?.[0];
    if (r) {
      return { id: `geo_${r.id}`, name: r.name, region: r.admin1, country: r.country, countryCode: r.country_code, lat, lon };
    }
  } catch {
    cancel();
  }
  // Nearest known city fallback
  let best = DEFAULT_PLACES[0];
  let bestD = Infinity;
  for (const p of DEFAULT_PLACES) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return { ...best, id: 'current', lat, lon, name: bestD < 4 ? best.name : 'Current location' };
}

/* ---------------------------- derived insights ---------------------------- */

export function hoursForDay(bundle: WeatherBundle, key: string): HourPoint[] {
  return bundle.hourly.filter((h) => dateKey(h.time) === key);
}

export function nextHours(bundle: WeatherBundle, count = 24): HourPoint[] {
  const now = Date.now() - 1800_000;
  return bundle.hourly.filter((h) => h.time >= now).slice(0, count);
}

export function bestOutdoorWindow(bundle: WeatherBundle, dayKey: string): { start: number; end: number; score: number } | null {
  const hrs = hoursForDay(bundle, dayKey).filter((h) => {
    const d = new Date(h.time);
    return d.getHours() >= 6 && d.getHours() <= 21 && h.time > Date.now() - 3600_000;
  });
  if (hrs.length < 2) return null;
  let best: { start: number; end: number; score: number } | null = null;
  for (let i = 0; i < hrs.length - 1; i++) {
    const win = hrs.slice(i, i + 2);
    const score =
      win.reduce((acc, h) => {
        const c = condition(h.code).outdoorScore;
        const tempPenalty = Math.max(0, Math.abs(h.temp - 21) - 6) * 3;
        const popPenalty = h.pop * 0.55;
        const windPenalty = Math.max(0, h.wind - 24) * 1.6;
        return acc + Math.max(0, c - tempPenalty - popPenalty - windPenalty);
      }, 0) / win.length;
    if (!best || score > best.score) best = { start: win[0].time, end: win[win.length - 1].time + 3600_000, score: Math.round(score) };
  }
  return best;
}

export function rainWindow(bundle: WeatherBundle): { start: number; end: number; peak: number } | null {
  const upcoming = nextHours(bundle, 18).filter((h) => h.pop >= 45 || condition(h.code).outdoorScore < 45);
  if (!upcoming.length) return null;
  const start = upcoming[0].time;
  let end = start + 3600_000;
  for (const h of upcoming) {
    if (h.time - end <= 3600_000 * 2) end = h.time + 3600_000;
  }
  return { start, end, peak: Math.max(...upcoming.map((h) => h.pop)) };
}
