export const DAY_MS = 86400000;

export function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD key */
export function dateKey(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_MINI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function weekdayName(d: Date, short = false) {
  return short ? WEEKDAY_MINI[d.getDay()] : WEEKDAYS[d.getDay()];
}

export function monthName(d: Date, short = false) {
  return short ? MONTH_SHORT[d.getMonth()] : MONTHS[d.getMonth()];
}

export function formatDateLong(d: Date) {
  return `${weekdayName(d)}, ${monthName(d, true)} ${d.getDate()}`;
}

export function formatDateMedium(d: Date) {
  return `${weekdayName(d, true)} ${d.getDate()} ${monthName(d, true)}`;
}

export function formatTime(d: Date | string | number, use24h = false) {
  const date = d instanceof Date ? d : new Date(d);
  let h = date.getHours();
  const m = date.getMinutes();
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${suffix}`;
}

export function formatHourShort(d: Date, use24h = false) {
  const h = d.getHours();
  if (use24h) return `${pad(h)}`;
  const hh = h % 12 || 12;
  return `${hh}${h >= 12 ? 'p' : 'a'}`;
}

export function minutesToLabel(min: number, use24h = false) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${pad(m)} ${suffix}`;
}

export function relativeDay(d: Date) {
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diff = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekdayName(d);
  if (diff < -1 && diff > -7) return `Last ${weekdayName(d)}`;
  return formatDateMedium(d);
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Deterministic pseudo random in [0,1) from a numeric seed */
export function seeded(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(n: number, one: string, many?: string) {
  return n === 1 ? one : many ?? `${one}s`;
}
