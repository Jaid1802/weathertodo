import { CalEvent, ChatMessage, CleverAction, IntegrationState, Reminder, Settings, Task } from './types';
import {
  CurrentWeather, Place, WeatherBundle, bestOutdoorWindow, condition, fmtTemp, fmtWind,
  hoursForDay, nextHours, rainWindow, uvLabel, aqiFromWeather, aqiLabel,
} from './weather';
import { dateKey, minutesToLabel, formatTime, pluralize, uid } from './utils';
import { askBackendAi, DEFAULT_BACKEND_URL } from './api';

function apiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export type SuggestionTone = 'positive' | 'caution' | 'critical' | 'info' | 'focus';

export interface SuggestionAction {
  label: string;
  kind: 'tasks' | 'calendar' | 'weather' | 'reminders' | 'addTask' | 'moveEvent';
  payload?: any;
}

export interface Suggestion {
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: SuggestionTone;
  confidence: number; // 0-1
  action?: SuggestionAction;
  tag: string;
}

export interface PlanContext {
  place: Place;
  weather: WeatherBundle;
  events: CalEvent[]; // today's, sorted
  allEvents?: CalEvent[];
  tasks: Task[]; // today's + overdue, undone first
  allTasks: Task[];
  reminders?: Reminder[];
  integrations?: IntegrationState;
  settings: Settings;
  userName: string;
  now: Date;
}

export type { CleverAction };
export type ScheduleAction = CleverAction;

const TONE_ORDER: Record<SuggestionTone, number> = { critical: 0, caution: 1, focus: 2, positive: 3, info: 4 };

function sortEvents(events: CalEvent[]) {
  return [...events].sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.startMinutes - b.startMinutes);
}

/** Find contiguous free gaps (in minutes-of-day) between events during waking hours. */
export function freeGaps(events: CalEvent[], from = 8 * 60, to = 21 * 60) {
  const busy = sortEvents(events.filter((e) => !e.allDay)).map((e) => [e.startMinutes, e.endMinutes] as [number, number]);
  const gaps: { start: number; end: number }[] = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s > cursor) gaps.push({ start: cursor, end: Math.min(s, to) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < to) gaps.push({ start: cursor, end: to });
  return gaps.filter((g) => g.end - g.start >= 30);
}

export function dayLoad(events: CalEvent[]) {
  return events.filter((e) => !e.allDay).reduce((a, e) => a + (e.endMinutes - e.startMinutes), 0);
}

export function comfortScore(c: CurrentWeather) {
  const tempPart = 100 - Math.min(60, Math.abs(c.temp - 21) * 4.2);
  const windPart = 100 - Math.min(40, Math.max(0, c.wind - 12) * 2.6);
  const condPart = condition(c.code).outdoorScore;
  const humidPart = 100 - Math.min(30, Math.abs(c.humidity - 50) * 0.7);
  return Math.round(Math.max(0, Math.min(100, tempPart * 0.34 + windPart * 0.16 + condPart * 0.35 + humidPart * 0.15)));
}

/* ------------------------------------------------------------------ */
/* Suggestion engine                                                    */
/* ------------------------------------------------------------------ */

export function generateSuggestions(ctx: PlanContext): Suggestion[] {
  const { weather, events, tasks, settings, now } = ctx;
  const cur = weather.current;
  const unit = settings.tempUnit;
  const todayKey = dateKey(now);
  const out: Suggestion[] = [];
  const sorted = sortEvents(events);
  const upcoming = sorted.filter((e) => !e.allDay && e.endMinutes > now.getHours() * 60 + now.getMinutes());
  const outdoorEvents = upcoming.filter((e) => e.isOutdoor);
  const rain = rainWindow(weather);
  const window = bestOutdoorWindow(weather, todayKey);
  const openTasks = tasks.filter((t) => !t.done);
  const outdoorTasks = openTasks.filter((t) => t.context === 'outdoor' || /run|jog|walk|bike|cycle|hike|grocer|commute/i.test(t.title));
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < todayKey);
  const gaps = freeGaps(sorted);
  const biggestGap = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const hrs = nextHours(weather, 12);
  const maxUv = Math.max(cur.uv, ...hrs.map((h) => h.uv));

  /* 1. Rain vs outdoor commitments -------------------------------- */
  if (rain && outdoorEvents.length) {
    const clash = outdoorEvents.find((e) => {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const evStart = start.getTime() + e.startMinutes * 60000;
      const evEnd = start.getTime() + e.endMinutes * 60000;
      return evStart < rain.end && evEnd > rain.start;
    }) || outdoorEvents[0];

    const rainTimeStr = formatTime(rain.start, settings.use24h);
    const meetingTimeStr = minutesToLabel(clash.startMinutes, settings.use24h);
    out.push({
      id: uid('sg'),
      icon: 'umbrella',
      title: `Rain crashing \u201C${clash.title}\u201D`,
      body: `Your outdoor \u201C${clash.title}\u201D is at ${meetingTimeStr}. Rain says it's joining too around ${rainTimeStr} \u2014 uninvited, obviously. ☔ Move it earlier or take it indoors?`,
      tone: 'critical',
      confidence: 0.94,
      tag: 'Weather \u00D7 Calendar',
      action: { label: 'Open calendar', kind: 'calendar' },
    });
  }

  /* 2. Rain vs Commute / Meeting ------------------------------------ */
  if (rain && upcoming.length && !out.some((s) => s.tag.includes('Calendar'))) {
    const nextMeeting = upcoming[0];
    const rainTimeStr = formatTime(rain.start, settings.use24h);
    out.push({
      id: uid('sg'),
      icon: 'car',
      title: `Rain incoming before \u201C${nextMeeting.title}\u201D`,
      body: `Rain expected around ${rainTimeStr}, right before \u201C${nextMeeting.title}\u201D. Because of course the clouds have beef with your commute. 🚗 Leave 15 minutes early so Future You isn't stressing in traffic.`,
      tone: 'caution',
      confidence: 0.89,
      tag: 'Weather \u00D7 Commute',
      action: { label: 'Open calendar', kind: 'calendar' },
    });
  }

  /* 3. Rain incoming generally ------------------------------------ */
  if (rain && !out.length) {
    const rainTimeStr = formatTime(rain.start, settings.use24h);
    out.push({
      id: uid('sg'),
      icon: 'rainy',
      title: `Rain arriving around ${rainTimeStr}`,
      body: `Rain is rolling in around ${rainTimeStr} (peak ${rain.peak}%). If you have outdoor plans, wrap them up beforehand so you don't get soaked. ☔ Pack an umbrella today.`,
      tone: 'caution',
      confidence: 0.85,
      tag: 'Weather',
      action: { label: 'See forecast', kind: 'weather' },
    });
  }

  /* 4. Outdoor task (e.g. run) x High UV -------------------------- */
  const runOrOutdoorTask = outdoorTasks.find((t) => /run|jog|walk|bike|outdoor/i.test(t.title));
  if (runOrOutdoorTask && maxUv >= 6) {
    out.push({
      id: uid('sg'),
      icon: 'sunny',
      title: `High UV during \u201C${runOrOutdoorTask.title}\u201D`,
      body: `Midday UV is peaking at index ${Math.round(maxUv)}. The sun is choosing violence during peak hours. ☀️ Shift \u201C${runOrOutdoorTask.title}\u201D to morning or evening so you don't get roasted.`,
      tone: 'caution',
      confidence: 0.91,
      tag: 'Weather \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 5. Best outdoor window x outdoor tasks ------------------------ */
  if (window && outdoorTasks.length && window.score > 55 && !out.some((s) => s.tag.includes('Tasks'))) {
    out.push({
      id: uid('sg'),
      icon: 'walk',
      title: `Best outdoor window: ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}`,
      body: `Prime outdoor window between ${formatTime(window.start, settings.use24h)} and ${formatTime(window.end, settings.use24h)} (score ${window.score}/100). Your unfinished \u201C${outdoorTasks[0].title}\u201D task is staring at you right now. 👟 Take this as your sign.`,
      tone: 'positive',
      confidence: 0.88,
      tag: 'Weather \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 6. UV warning -------------------------------------------------- */
  if (maxUv >= 6 && cur.isDay && !out.some((s) => s.title.includes('UV'))) {
    out.push({
      id: uid('sg'),
      icon: 'sunny',
      title: `High UV today \u2014 index ${Math.round(maxUv)}`,
      body: `UV index hits ${Math.round(maxUv)} midday. The sun has zero chill today. 🧴 Grab SPF 30+ and find some shade between 11 AM and 3 PM.`,
      tone: 'caution',
      confidence: 0.83,
      tag: 'Weather',
      action: { label: 'Add reminder', kind: 'reminders' },
    });
  }

  /* 7. Blank page / Clear day ------------------------------------- */
  if (!sorted.length && openTasks.length <= 2) {
    out.push({
      id: uid('sg'),
      icon: 'document-text-outline',
      title: 'Suspiciously empty calendar',
      body: `Your calendar is suspiciously empty today. 👀 Either you've mastered work-life balance... or you forgot something. Add an anchor task or check off your backlog.`,
      tone: 'info',
      confidence: 0.75,
      tag: 'Planning',
      action: { label: 'Add a task', kind: 'addTask' },
    });
  }

  /* 8. Overdue backlog -------------------------------------------- */
  if (overdue.length) {
    out.push({
      id: uid('sg'),
      icon: 'alert-circle',
      title: `${overdue.length} overdue ${pluralize(overdue.length, 'task')}`,
      body: `\u201C${overdue[0].title}\u201D has been waiting since ${overdue[0].dueDate}. At this point, it basically lives here. 🫠 You've got ${biggestGap ? `an ${minutesToLabel(biggestGap.start, settings.use24h)} gap` : 'some room'} today \u2014 knock it out and let's end the drama.`,
      tone: 'caution',
      confidence: 0.9,
      tag: 'Tasks',
      action: { label: 'Triage now', kind: 'tasks' },
    });
  }

  /* 9. Too many tasks ---------------------------------------------- */
  if (openTasks.length >= 6 && !out.some((s) => s.title.includes('overdue'))) {
    out.push({
      id: uid('sg'),
      icon: 'layers',
      title: `${openTasks.length} tasks on your plate`,
      body: `You've got ${openTasks.length} tasks lined up today. Ambitious. Slightly terrifying. 😌 Let's knock out the quick ones first so you build quick momentum.`,
      tone: 'focus',
      confidence: 0.86,
      tag: 'Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 10. Free time / Big gap ---------------------------------------- */
  if (biggestGap && (biggestGap.end - biggestGap.start) >= 90 && openTasks.length > 0 && !out.some((s) => s.tag.includes('Calendar \u00D7 Tasks'))) {
    const gapHours = Math.round((biggestGap.end - biggestGap.start) / 60);
    out.push({
      id: uid('sg'),
      icon: 'hourglass',
      title: `${gapHours}h open gap at ${minutesToLabel(biggestGap.start, settings.use24h)}`,
      body: `You've got a ${gapHours}-hour gap starting at ${minutesToLabel(biggestGap.start, settings.use24h)}. That's enough time to knock out \u201C${openTasks[0].title}\u201D before Future You starts complaining. 😌 Want to lock it in?`,
      tone: 'positive',
      confidence: 0.82,
      tag: 'Calendar \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 11. Temperature extremes ---------------------------------------- */
  if (cur.temp <= 4) {
    out.push({
      id: uid('sg'),
      icon: 'snow',
      title: `Freezing start \u2014 feels like ${fmtTemp(cur.feelsLike, unit)}`,
      body: `Feels like ${fmtTemp(cur.feelsLike, unit)} with wind biting at ${fmtWind(cur.wind, settings.windUnit)}. It's freezing out there. 🧣 Bundle up properly and warm the car early before heading out.`,
      tone: 'info',
      confidence: 0.78,
      tag: 'Weather',
    });
  } else if (cur.temp >= 31) {
    out.push({
      id: uid('sg'),
      icon: 'thermometer',
      title: `Heat advisory \u2014 ${fmtTemp(cur.temp, unit)} outside`,
      body: `It's ${fmtTemp(cur.temp, unit)} outside (feels like ${fmtTemp(cur.feelsLike, unit)}). Total oven mode. ☀️ Shift outdoor efforts to the evening and keep a giant water bottle glued to your hand.`,
      tone: 'caution',
      confidence: 0.84,
      tag: 'Weather',
    });
  }

  /* 12. Wind ---------------------------------------------------------- */
  if (cur.wind >= 32) {
    out.push({
      id: uid('sg'),
      icon: 'flag',
      title: `Strong wind \u2014 ${fmtWind(cur.wind, settings.windUnit)}`,
      body: `Gusts hitting ${fmtWind(cur.wind, settings.windUnit)} today. The wind has decided to test your hair and everything on your balcony. 💨 Secure loose items and skip outdoor cycling.`,
      tone: 'caution',
      confidence: 0.76,
      tag: 'Weather',
    });
  }

  /* 13. Packed schedule ---------------------------------------------- */
  const load = dayLoad(sorted);
  if (load >= 300) {
    out.push({
      id: uid('sg'),
      icon: 'timer',
      title: `${Math.round(load / 60 * 10) / 10}h of meetings today`,
      body: `You've got ${Math.round(load / 60 * 10) / 10} hours of meetings today. Your calendar has apparently chosen violence. 🫠 Let's protect your ${gaps.reduce((a, g) => a + (g.end - g.start), 0)}-minute gap for important tasks before you burn out.`,
      tone: 'caution',
      confidence: 0.81,
      tag: 'Calendar',
      action: { label: 'Review day', kind: 'calendar' },
    });
  } else if (load === 0 && openTasks.length > 0) {
    out.push({
      id: uid('sg'),
      icon: 'sparkles',
      title: 'Zero meetings \u2014 focus mode',
      body: `Zero meetings on your calendar today. Beautiful. 😌 That gives you uninterrupted focus to knock out \u201C${openTasks[0]?.title || 'your tasks'}\u201D before Future You starts complaining.`,
      tone: 'positive',
      confidence: 0.79,
      tag: 'Calendar \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 14. Golden hour ---------------------------------------------------- */
  const today = weather.daily.find((d) => d.date === todayKey);
  if (today && cur.isDay) {
    const minsToSunset = (today.sunset - now.getTime()) / 60000;
    if (minsToSunset > 30 && minsToSunset < 110 && condition(cur.code).outdoorScore > 60) {
      out.push({
        id: uid('sg'),
        icon: 'partly-sunny',
        title: `Golden hour in ${Math.round(minsToSunset - 40)} min`,
        body: `Golden hour kicks off around ${formatTime(today.sunset - 40 * 60000, settings.use24h)}. Step away from your screen for 15 minutes. 🌅 It's the ultimate free sanity reset between tasks.`,
        tone: 'positive',
        confidence: 0.72,
        tag: 'Weather',
      });
    }
  }

  /* 15. Air quality ------------------------------------------------------ */
  const aqi = aqiFromWeather(cur);
  if (aqi > 100) {
    out.push({
      id: uid('sg'),
      icon: 'cloud',
      title: `Air quality ${aqiLabel(aqi)} (${aqi})`,
      body: `Air quality index is ${aqi} (${aqiLabel(aqi)}). The air is not in a giving mood today. 😷 Move cardio indoors and keep windows shut this afternoon.`,
      tone: 'caution',
      confidence: 0.7,
      tag: 'Weather \u00D7 Health',
    });
  }

  /* 16. Momentum / Tasks completed --------------------------------------- */
  const doneToday = ctx.allTasks.filter((t) => t.done && t.completedAt && dateKey(t.completedAt) === todayKey);
  if (doneToday.length >= 2) {
    out.push({
      id: uid('sg'),
      icon: 'trending-up',
      title: `${doneToday.length} done already ✨`,
      body: `Look at you clearing ${doneToday.length} tasks like you actually planned this. 😌 ${openTasks.length ? `Knock out \u201C${openTasks[0].title}\u201D next and you're officially ahead of the chaos.` : 'Your entire task list is clean. Enjoy the victory.'}`,
      tone: 'positive',
      confidence: 0.68,
      tag: 'Tasks',
      action: { label: 'Keep going', kind: 'tasks' },
    });
  }

  /* 17. Nothing planned --------------------------------------------------- */
  if (!sorted.length && !openTasks.length && !out.some((s) => s.title.includes('Suspiciously empty') || s.title.includes('blank page'))) {
    out.push({
      id: uid('sg'),
      icon: 'add-circle',
      title: 'Suspiciously empty calendar',
      body: `Your calendar is suspiciously empty today. 👀 Either you've mastered work-life balance... or you forgot something. Want me to check your tasks?`,
      tone: 'info',
      confidence: 0.6,
      tag: 'Planning',
      action: { label: 'Add a task', kind: 'addTask' },
    });
  }

  const unique: Suggestion[] = [];
  const seenKeys = new Set<string>();
  for (const s of out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.confidence - a.confidence)) {
    const key = `${s.title.trim()}|${s.body.trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      unique.push(s);
    }
  }

  return unique.slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Briefing                                                            */
/* ------------------------------------------------------------------ */

export function generateBriefing(ctx: PlanContext): string {
  const { weather, events, tasks, settings, place, userName, now } = ctx;
  const cur = weather.current;
  const c = condition(cur.code);
  const today = weather.daily.find((d) => d.date === dateKey(now));
  const sorted = sortEvents(events.filter((e) => !e.allDay));
  const open = tasks.filter((t) => !t.done);
  const rain = rainWindow(weather);
  const window = bestOutdoorWindow(weather, dateKey(now));
  const gaps = freeGaps(sorted);
  const lines: string[] = [];

  lines.push(
    `Good day, ${userName.split(' ')[0]}! 🌤️ It's ${fmtTemp(cur.temp, settings.tempUnit)} and ${c.label.toLowerCase()} in ${place.name}${today ? `, heading to a high of ${fmtTemp(today.max, settings.tempUnit)}` : ''}.`
  );

  if (sorted.length) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    lines.push(
      `You have ${sorted.length} ${pluralize(sorted.length, 'event')} scheduled: ${sorted.slice(0, 3).map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}`).join(', ')}.`
    );
  } else {
    lines.push('Your calendar is completely open today!');
  }

  if (open.length) {
    const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high');
    lines.push(
      `You have ${open.length} pending ${pluralize(open.length, 'task')}${urgent.length ? ` (${urgent.length} high priority \u2014 starting with "${urgent[0].title}")` : ''}.`
    );
  } else {
    lines.push('Your task list is clear.');
  }

  if (rain) {
    lines.push(`Rain is expected starting around ${formatTime(rain.start, settings.use24h)} (peak ${rain.peak}%).`);
  } else if (window) {
    lines.push(`Your cleanest outdoor window is ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}.`);
  }

  if (gaps.length) {
    const g = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    lines.push(`Biggest free block: ${minutesToLabel(g.start, settings.use24h)}\u2013${minutesToLabel(g.end, settings.use24h)}.`);
  }

  return lines.join(' ');
}

/* ------------------------------------------------------------------ */
/* Query-Driven Clever Engine & Conversational Intelligence            */
/* ------------------------------------------------------------------ */

export const STARTER_PROMPTS = [
  'What should I wear?',
  'What should I do first?',
  'When should I go outside?',
  'Do I need an umbrella?',
  'How should I plan my day?',
  'Where are my free hours?',
];

interface TemporalInfo {
  dateKey: string;
  label: string;
  dayOffset: number;
  timeFilter?: { startMin: number; endMin: number; label: string };
}

export function parseTemporalQuery(query: string, now: Date): TemporalInfo {
  const q = query.toLowerCase();
  const todayK = dateKey(now);

  let timeFilter: TemporalInfo['timeFilter'];
  if (q.includes('morning')) timeFilter = { startMin: 6 * 60, endMin: 12 * 60, label: 'morning' };
  else if (q.includes('afternoon')) timeFilter = { startMin: 12 * 60, endMin: 17 * 60, label: 'afternoon' };
  else if (q.includes('evening') || q.includes('tonight')) timeFilter = { startMin: 17 * 60, endMin: 22 * 60, label: 'evening' };

  if (q.includes('day after tomorrow')) {
    const d = new Date(now.getTime() + 2 * 86400000);
    return { dateKey: dateKey(d), label: 'day after tomorrow', dayOffset: 2, timeFilter };
  }
  if (q.includes('tomorrow')) {
    const d = new Date(now.getTime() + 86400000);
    return { dateKey: dateKey(d), label: 'tomorrow', dayOffset: 1, timeFilter };
  }
  if (q.includes('yesterday')) {
    const d = new Date(now.getTime() - 86400000);
    return { dateKey: dateKey(d), label: 'yesterday', dayOffset: -1, timeFilter };
  }

  // Weekdays
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < 7; i++) {
    if (q.includes(days[i])) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now.getTime() + diff * 86400000);
      const cap = days[i].charAt(0).toUpperCase() + days[i].slice(1);
      return { dateKey: dateKey(d), label: `on ${cap}`, dayOffset: diff, timeFilter };
    }
  }

  return { dateKey: todayK, label: 'today', dayOffset: 0, timeFilter };
}

const MEDICAL_TERMS = [
  'doctor', 'dr', 'dr.', 'dentist', 'dental', 'physician', 'hospital', 'clinic',
  'medical', 'checkup', 'check-up', 'therapy', 'health', 'pediatric', 'surgeon',
  'cardio', 'dermatolog', 'orthoped', 'optometrist', 'eye doctor', 'appointment'
];

export function findMatchingEvents(
  events: CalEvent[],
  query: string,
  targetDateKey: string
): { matches: CalEvent[]; isSpecificQuery: boolean; topic: string } {
  const q = query.toLowerCase();
  const dateEvents = events.filter((e) => e.date === targetDateKey);

  // 1. Check medical / doctor query
  const isDoctorQuery = MEDICAL_TERMS.some((term) => {
    const re = new RegExp(`\\b${term}\\b`, 'i');
    return re.test(q);
  });

  if (isDoctorQuery) {
    // Avoid false positive e.g. "doctor who marathon"
    const matches = dateEvents.filter((e) => {
      const title = (e.title || '').toLowerCase();
      const loc = (e.location || '').toLowerCase();
      const text = `${title} ${loc}`;
      if (text.includes('doctor who')) return false;
      return MEDICAL_TERMS.some((term) => text.includes(term));
    });
    return { matches, isSpecificQuery: true, topic: 'doctor appointment' };
  }

  // 2. Check meeting query
  const isMeetingQuery = /\b(meeting|sync|standup|1:1|call|interview|review|presentation|demo)\b/i.test(q);
  if (isMeetingQuery) {
    const matches = dateEvents.filter((e) =>
      /\b(meeting|sync|standup|1:1|call|interview|review|presentation|demo)\b/i.test(`${e.title} ${e.location || ''}`)
    );
    return { matches, isSpecificQuery: true, topic: 'meeting' };
  }

  // 3. Specific word extraction (words >= 4 chars)
  const words = q.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) =>
    w.length >= 4 && !['there', 'tomorrow', 'today', 'have', 'schedule', 'calendar', 'what', 'when', 'will', 'about', 'with', 'from', 'this'].includes(w)
  );

  if (words.length > 0) {
    const matches = dateEvents.filter((e) => {
      const text = `${e.title} ${e.location || ''}`.toLowerCase();
      return words.some((w) => text.includes(w));
    });
    if (matches.length > 0) {
      return { matches, isSpecificQuery: true, topic: words[0] };
    }
  }

  return { matches: dateEvents, isSpecificQuery: false, topic: 'event' };
}

export function localAnswer(
  question: string,
  ctx: PlanContext,
  history: ChatMessage[] = []
): { text: string; chips: string[]; action?: CleverAction } {
  const q = question.toLowerCase().trim();
  const { weather, events = [], allEvents = [], tasks = [], allTasks = [], settings, place, now, integrations } = ctx;
  const poolEvents = allEvents.length > 0 ? allEvents : events;
  const poolTasks = allTasks.length > 0 ? allTasks : tasks;
  const todayK = dateKey(now);
  const temporal = parseTemporalQuery(question, now);
  const has = (...k: string[]) => k.some((x) => q.includes(x));
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Natural Language Task Creation: e.g. "Add a task to call the doctor tomorrow"
  const addTaskMatch = question.match(/(?:add\s+(?:a\s+)?task(?:\s+to)?\s+["“']?([^"”']+)["”']?|add\s+["“']([^"”']+)["”']\s+to\s+(?:my\s+)?tasks?)/i);
  if (addTaskMatch) {
    const taskTitle = (addTaskMatch[1] || addTaskMatch[2] || '').trim();
    if (taskTitle) {
      const isOutdoor = /outdoor|walk|run|bike|grocer|shop|car|mow|yard/i.test(taskTitle);
      return {
        text: `Got it! I've prepared a task for "${taskTitle}". Ready to add it?`,
        chips: ["What's on my calendar tomorrow?", 'What should I prioritize today?'],
        action: {
          kind: 'addTask',
          task: {
            title: taskTitle,
            priority: 'normal',
            context: isOutdoor ? 'outdoor' : 'anywhere',
            dueDate: temporal.dateKey,
          },
        },
      };
    }
  }

  // 2. Natural Language Reminder Creation: e.g. "Remind me tomorrow at 8 AM to take vitamins"
  const reminderMatch = question.match(/remind\s+me(?:\s+(?:tomorrow|today))?(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\s+to\s+(.+)/i);
  if (reminderMatch) {
    const timeStr = reminderMatch[1];
    const reminderTitle = reminderMatch[2]?.replace(/[.!?]+$/, '').trim();
    let mins = 9 * 60;
    if (timeStr) {
      const isPm = /pm/i.test(timeStr);
      const isAm = /am/i.test(timeStr);
      const cleanNum = timeStr.replace(/[^\d:]/g, '');
      const parts = cleanNum.split(':');
      let hr = parseInt(parts[0], 10) || 9;
      const m = parseInt(parts[1], 10) || 0;
      if (isPm && hr < 12) hr += 12;
      if (isAm && hr === 12) hr = 0;
      mins = hr * 60 + m;
    }
    return {
      text: `Sure! I can remind you ${temporal.label} ${timeStr ? `at ${timeStr}` : ''} to "${reminderTitle}". Want me to set it?`,
      chips: ["What's on my calendar tomorrow?", 'Will it rain tomorrow?'],
      action: {
        kind: 'addReminder',
        reminder: {
          title: reminderTitle,
          date: temporal.dateKey,
          minutes: mins,
          trigger: 'time',
          repeat: 'none',
        },
      },
    };
  }

  // 3. Destructive Action Confirmation
  if (has('delete', 'remove', 'cancel') && has('meeting', 'event', 'calendar', 'task', 'reminder', 'appointment')) {
    const isEvent = has('meeting', 'event', 'calendar', 'appointment');
    const isTask = has('task');
    return {
      text: `I can delete that ${isEvent ? 'calendar event' : isTask ? 'task' : 'item'}. Are you sure you want me to proceed?`,
      chips: ['Yes, delete it', 'No, keep it', "What's on my calendar tomorrow?"],
      action: {
        kind: 'confirmAction',
        description: `Delete ${isEvent ? 'calendar event' : isTask ? 'task' : 'item'}`,
      },
    };
  }

  // 4. Conversational Follow-Up Questions (using history)
  if (history.length > 0) {
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    const lastAssText = (lastAssistant?.text || '').toLowerCase();
    const lastUserText = (lastUser?.text || '').toLowerCase();

    // "What about tomorrow?" / "Tomorrow?" / "How about tomorrow?"
    if (q === 'what about tomorrow' || q === 'what about tomorrow?' || q === 'tomorrow?' || q === 'how about tomorrow' || q === 'how about tomorrow?') {
      const tmrDay = weather.daily[1] || weather.daily[0];
      // Check if previous discussion was about outdoor / going outside
      if (lastUserText.includes('outside') || lastUserText.includes('walk') || lastUserText.includes('run') || lastAssText.includes('outdoor')) {
        const tmrK = dateKey(new Date(now.getTime() + 86400000));
        const win = bestOutdoorWindow(weather, tmrK);
        if (win) {
          return {
            text: `Tomorrow, the best outdoor window is between ${formatTime(win.start, settings.use24h)} and ${formatTime(win.end, settings.use24h)} (comfort score ${win.score}/100). 🌤️`,
            chips: ["What's on my calendar tomorrow?", 'Will it rain tomorrow?'],
          };
        }
        return {
          text: `Tomorrow looks ${condition(tmrDay.code).label.toLowerCase()} with temperatures around ${fmtTemp(tmrDay.max, settings.tempUnit)}. Late afternoon will be comfortable for outdoor activities!`,
          chips: ["What's on my calendar tomorrow?", 'Will it rain tomorrow?'],
        };
      }
      // Check if previous discussion was weather / rain
      if (lastUserText.includes('rain') || lastUserText.includes('weather') || lastUserText.includes('umbrella')) {
        return {
          text: `Tomorrow's forecast in ${place.name} is ${condition(tmrDay.code).label.toLowerCase()}, highs of ${fmtTemp(tmrDay.max, settings.tempUnit)} and lows of ${fmtTemp(tmrDay.min, settings.tempUnit)} with a ${tmrDay.pop}% chance of rain. ☁️`,
          chips: ["Do I need an umbrella tomorrow?", "What's on my calendar tomorrow?"],
        };
      }
      // Check if previous discussion was calendar / schedule
      const tmrK = dateKey(new Date(now.getTime() + 86400000));
      const tmrEvents = poolEvents.filter((e) => e.date === tmrK);
      if (tmrEvents.length > 0) {
        return {
          text: `Tomorrow you have ${tmrEvents.length} ${pluralize(tmrEvents.length, 'event')}: ${tmrEvents.map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}`).join(', ')}. 📅`,
          chips: ['Will it rain tomorrow?', 'Where are my free hours?'],
        };
      } else {
        return {
          text: `Your calendar is completely open tomorrow! 🎉`,
          chips: ['What should I work on next?', 'When should I go outside?'],
        };
      }
    }

    // "Where?" or "Where is it?"
    if (q === 'where' || q === 'where?' || q === 'where is it' || q === 'where is it?') {
      const matchDoc = poolEvents.find((e) =>
        MEDICAL_TERMS.some((term) => e.title.toLowerCase().includes(term) || (e.location && e.location.toLowerCase().includes(term)))
      );
      if (matchDoc && matchDoc.location) {
        return {
          text: `It's at ${matchDoc.location}. 📍`,
          chips: ['What time is it?', 'What about the weather then?'],
        };
      }
      return {
        text: `The location isn't specified in the calendar event details.`,
        chips: ['What time is it?', "What's on my calendar tomorrow?"],
      };
    }

    // "When?" or "What time?"
    if (q === 'when' || q === 'when?' || q === 'what time' || q === 'what time?' || q === 'when is it?') {
      const todayEvents = poolEvents.filter((e) => e.date === todayK && !e.allDay);
      const upcoming = todayEvents.filter((e) => e.endMinutes > currentMinutes);
      const target = upcoming[0] || todayEvents[0];
      if (target) {
        return {
          text: `"${target.title}" is at ${minutesToLabel(target.startMinutes, settings.use24h)}${target.location ? ` at ${target.location}` : ''}. ⏰`,
          chips: ['Where is it?', 'What about the weather then?'],
        };
      }
    }
  }

  // 5. Casual Greetings & Personality
  if (/^(hey clever|hi clever|hello clever|hey|hi|hello|good morning|good afternoon|good evening|yo|sup)\b/i.test(q)) {
    return {
      text: `Hey! 👋 What's on the agenda today?`,
      chips: ["What's my next meeting?", 'What should I wear?', 'Help me plan today'],
    };
  }

  // 6. Capabilities / Help Query
  if (has('what can you do', 'what do you do', 'who are you', 'how can you help', 'what are your capabilities') || q === 'help') {
    return {
      text: `I'm Clever, your personal planning assistant! I'm integrated with your weather, calendar, and tasks to answer natural questions about what to wear, when to go outside, your meetings, task priorities, and travel timing. 🌤️`,
      chips: ["What's my next meeting?", 'What should I wear?', 'Where are my free hours?'],
    };
  }

  // 7. Ambiguous Destination / Departure Query (e.g. "When should I leave?")
  if ((q === 'when should i leave' || q === 'when should i leave?' || q === 'what time should i leave') && !has('city', 'home', 'meeting', 'work')) {
    return {
      text: `Where are you heading, and what time do you need to arrive?`,
      chips: ['I want to travel out of the city', 'When should I leave home for my meeting?'],
    };
  }

  // 8. Travel Timing & Departure Reasoning (e.g. "I want to travel out of the city when should I leave home")
  if (has('travel out of the city', 'out of the city', 'leave home for my meeting', 'leave for my meeting', 'when should i leave home')) {
    const todayEvents = poolEvents.filter((e) => e.date === todayK && !e.allDay);
    const firstMeeting = todayEvents.sort((a, b) => a.startMinutes - b.startMinutes)[0];

    if (firstMeeting && firstMeeting.startMinutes >= 9 * 60) {
      const suggestedHour = '7:30 AM';
      return {
        text: `If you're heading out of the city today, I'd aim to leave around ${suggestedHour}. You've got a clear window before your first event ("${firstMeeting.title}" at ${minutesToLabel(firstMeeting.startMinutes, settings.use24h)}), and the weather is expected to be more comfortable then. 🚗`,
        chips: ["What's my next meeting?", 'Will it rain today?'],
      };
    } else if (firstMeeting) {
      return {
        text: `You have "${firstMeeting.title}" at ${minutesToLabel(firstMeeting.startMinutes, settings.use24h)}. If you're traveling out of the city, I'd recommend leaving right after that wraps up, or early morning around 7:00 AM before traffic builds.`,
        chips: ["What's my next meeting?", 'Where are my free hours?'],
      };
    }

    return {
      text: `If you're heading out of the city today, I'd suggest leaving around 7:30 AM. You have no scheduled morning conflicts, and the morning weather in ${place.name} is comfortable for driving. 🚗`,
      chips: ['Will it rain today?', 'What should I wear?'],
    };
  }

  // 9. Next Meeting Query (e.g. "What's my next meeting?", "When is my next meeting?")
  if (has('next meeting', 'next event', 'next appointment', 'what do i have next', 'what is next on my calendar')) {
    const todayEvents = poolEvents
      .filter((e) => e.date === todayK && !e.allDay)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const upcoming = todayEvents.filter((e) => e.endMinutes > currentMinutes);
    const next = upcoming[0];

    if (next) {
      return {
        text: `Your next meeting is ${next.title} at ${minutesToLabel(next.startMinutes, settings.use24h)}${next.location ? ` at ${next.location}` : ''}.`,
        chips: ['Where are my free hours?', 'What should I prioritize today?'],
      };
    }

    if (todayEvents.length > 0) {
      return {
        text: `You've completed all scheduled meetings for today! 🎉 You're all clear for the rest of the day.`,
        chips: ['What should I work on next?', 'When should I go outside?'],
      };
    }

    return {
      text: `You don't have any meetings scheduled on your calendar today.`,
      chips: ['What tasks do I have today?', 'When should I go outside?'],
    };
  }

  // 10. Specific Calendar Inquiries (doctor, dentist, meetings, 5 PM check, free afternoon, schedule)
  const isCalendarQuery = has(
    'appointment', 'doctor', 'dr', 'dr.', 'dentist', 'clinic', 'hospital', 'meeting', 'calendar', 'schedule',
    'what do i have', 'do i have', 'have tomorrow', 'have today', 'plans tomorrow', 'plans today', 'my agenda', 'events'
  );
  if (isCalendarQuery || has('am i free', 'free this afternoon', 'anything at 5', 'free at')) {
    const targetDateKey = temporal.dateKey;
    const dateEvents = poolEvents.filter((e) => e.date === targetDateKey && !e.allDay);

    // Specific time check: e.g. "Do I have anything at 5 PM?"
    const timeMatch = q.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (has('anything at', 'free at') && timeMatch) {
      let hr = parseInt(timeMatch[1], 10);
      const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3];
      if (ampm === 'pm' && hr < 12) hr += 12;
      if (ampm === 'am' && hr === 12) hr = 0;
      const queryMin = hr * 60 + min;

      const conflicting = dateEvents.find((e) => queryMin >= e.startMinutes && queryMin < e.endMinutes);
      if (conflicting) {
        return {
          text: `You have "${conflicting.title}" scheduled from ${minutesToLabel(conflicting.startMinutes, settings.use24h)} to ${minutesToLabel(conflicting.endMinutes, settings.use24h)}.`,
          chips: ['Where are my free hours?', "What's my next meeting?"],
        };
      }
      return {
        text: `You're completely free at ${minutesToLabel(queryMin, settings.use24h)} ${temporal.label}! No events overlap that time.`,
        chips: ['Where are my free hours?', "What's my next meeting?"],
      };
    }

    // Afternoon check: "Am I free this afternoon?"
    if (has('afternoon')) {
      const afternoonEvents = dateEvents.filter((e) => e.endMinutes > 12 * 60 && e.startMinutes < 17 * 60);
      if (afternoonEvents.length > 0) {
        const desc = afternoonEvents.map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}`).join(', ');
        return {
          text: `You have ${desc} this afternoon.`,
          chips: ['Where are my free hours?', "What's my next meeting?"],
        };
      }
      return {
        text: `Yes, your afternoon is wide open! No events scheduled between 12:00 PM and 5:00 PM. ✨`,
        chips: ['Where are my free hours?', 'What should I prioritize today?'],
      };
    }

    // Specific doctor / medical search
    const searchRes = findMatchingEvents(poolEvents, question, targetDateKey);
    if (searchRes.isSpecificQuery) {
      if (searchRes.matches.length > 0) {
        const ev = searchRes.matches[0];
        const timeStr = ev.allDay ? 'all day' : `at ${minutesToLabel(ev.startMinutes, settings.use24h)}`;
        const locStr = ev.location ? ` at ${ev.location}` : '';
        const icon = searchRes.topic.includes('doctor') ? '🩺' : '📅';
        return {
          text: `Yep — you have a ${ev.title} ${temporal.label} ${timeStr}${locStr}. ${icon}`,
          chips: ['Where is it?', `What's the weather ${temporal.label}?`],
        };
      }

      const otherEvents = poolEvents.filter((e) => e.date === targetDateKey);
      let reply = `I don't see any ${searchRes.topic}s on your calendar ${temporal.label}.`;
      if (otherEvents.length > 0) {
        reply += ` You do have "${otherEvents[0].title}" at ${minutesToLabel(otherEvents[0].startMinutes, settings.use24h)}, though.`;
      }
      return {
        text: reply,
        chips: [`What's on my calendar ${temporal.label}?`, `Will it rain ${temporal.label}?`],
      };
    }

    // General schedule inquiry
    if (dateEvents.length > 0) {
      const list = dateEvents
        .slice(0, 4)
        .map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}${e.location ? ` (${e.location})` : ''}`)
        .join(', ');
      return {
        text: `Here's your schedule ${temporal.label}: ${list}. 📅`,
        chips: ['Where are my free hours?', 'What should I prioritize today?'],
      };
    } else {
      return {
        text: `Your calendar is completely open ${temporal.label} — no events scheduled! 🎉`,
        chips: [`Will it rain ${temporal.label}?`, 'When should I go outside?'],
      };
    }
  }

  // 11. Umbrella & Rain Inquiries (e.g. "Do I need an umbrella?", "Will it rain?")
  if (has('umbrella', 'rain', 'raining', 'shower', 'downpour', 'storm', 'thunderstorm')) {
    const targetDay = weather.daily[temporal.dayOffset >= 0 && temporal.dayOffset < weather.daily.length ? temporal.dayOffset : 0] || weather.daily[0];
    const rain = rainWindow(weather);

    if (temporal.dayOffset === 0 && (rain || targetDay?.pop > 35)) {
      const peakTime = rain ? formatTime(rain.start, settings.use24h) : 'later today';
      const peakPop = rain ? rain.peak : targetDay.pop;
      return {
        text: `Probably. Rain chances increase around ${peakTime} (peak ${peakPop}%), so keep an umbrella handy. ☔`,
        chips: ['What should I wear?', 'When should I go outside?'],
      };
    }

    if (targetDay && targetDay.pop > 35) {
      return {
        text: `There's a ${targetDay.pop}% chance of rain ${temporal.label} with ${condition(targetDay.code).label.toLowerCase()}. Carrying an umbrella is a safe bet! ☔`,
        chips: [`What's on my calendar ${temporal.label}?`, `When should I go outside?`],
      };
    }

    return {
      text: `You won't need an umbrella ${temporal.label}! Rain chance is low at only ${targetDay?.pop ?? 10}% in ${place.name}. ☀️`,
      chips: ['What should I wear?', 'When should I go outside?'],
    };
  }

  // 12. Clothing / Attire Query (e.g. "What should I wear?")
  if (has('wear', 'clothing', 'clothes', 'jacket', 'outfit', 'coat', 'shoes')) {
    const cur = weather.current;
    const rain = rainWindow(weather);
    const tempC = cur.temp;
    let advice = '';
    if (tempC < 10) {
      advice = `It's cold at ${fmtTemp(tempC, settings.tempUnit)}. Layer up with a warm coat, sweater, and closed shoes.`;
    } else if (tempC < 18) {
      advice = `It's mild at ${fmtTemp(tempC, settings.tempUnit)}. A light jacket, hoodie, or cardigan over a t-shirt is ideal.`;
    } else if (tempC < 26) {
      advice = `Pleasant conditions at ${fmtTemp(tempC, settings.tempUnit)}. A comfortable shirt and pants or shorts will feel great.`;
    } else {
      advice = `Warm day at ${fmtTemp(tempC, settings.tempUnit)}. Go with breathable cotton, sunglasses, and stay hydrated.`;
    }
    if (rain) {
      advice += ` Rain chances increase around ${formatTime(rain.start, settings.use24h)} — keep an umbrella or light rain shell handy! 🌧️`;
    } else if (cur.uv >= 6) {
      advice += ` Don't forget sunscreen or a hat for the midday UV (index ${Math.round(cur.uv)}). 🧢`;
    }
    return {
      text: advice,
      chips: ['When should I go outside?', 'Where are my free hours?'],
    };
  }

  // 13. Outdoor Activity / Walk / Run / Go Outside Queries
  if (has('go outside', 'can i go out', 'when should i go out', 'outdoor', 'walk', 'run', 'cycling', 'jog', 'bike')) {
    const win = bestOutdoorWindow(weather, temporal.dateKey);
    if (win) {
      const isRun = has('run', 'jog');
      return {
        text: `Around ${formatTime(win.start, settings.use24h)} looks comfortable for a ${isRun ? 'run' : 'walk'} ${temporal.label} (comfort score ${win.score}/100) — temperature is pleasant and rain risk is low. 🏃`,
        chips: ['Do I need an umbrella?', "What's my next meeting?"],
      };
    }

    const cur = weather.current;
    const score = comfortScore(cur);
    if (score >= 60) {
      return {
        text: `Yep — ${temporal.label} looks pleasant for outdoor time! ☀️ Current temperature is ${fmtTemp(cur.temp, settings.tempUnit)} with low rain risk.`,
        chips: ['Do I need an umbrella?', 'Where are my free hours?'],
      };
    }

    return {
      text: `You can head out, but conditions are cool at ${fmtTemp(cur.temp, settings.tempUnit)} with ${fmtWind(cur.wind, settings.windUnit)} wind. Late afternoon may be calmer. 🌤️`,
      chips: ['What should I wear?', 'Will it rain today?'],
    };
  }

  // 14. Weather Queries (temperature, tonight, tomorrow, general forecast)
  if (has('weather', 'temperature', 'temp', 'forecast', 'tonight', 'cold', 'hot')) {
    const targetDay = weather.daily[temporal.dayOffset >= 0 && temporal.dayOffset < weather.daily.length ? temporal.dayOffset : 0] || weather.daily[0];

    if (has('tonight')) {
      return {
        text: `Tonight in ${place.name}, expect temperatures around ${fmtTemp(targetDay.min, settings.tempUnit)} with ${condition(targetDay.code).short.toLowerCase()} skies. 🌙`,
        chips: ['What should I wear?', 'What do I have tomorrow?'],
      };
    }

    return {
      text: `The weather ${temporal.label} in ${place.name} is ${condition(targetDay.code).label.toLowerCase()}, highs of ${fmtTemp(targetDay.max, settings.tempUnit)} and lows of ${fmtTemp(targetDay.min, settings.tempUnit)} (rain chance ${targetDay.pop}%). 🌤️`,
      chips: ['Do I need an umbrella?', 'When should I go outside?'],
    };
  }

  // 15. Task & Prioritization Queries
  const isOpenTask = (t: Task) => !t.done;
  const isTaskQuery = has('task', 'tasks', 'overdue', 'prioritize', 'priority', 'what should i do first', 'what should i work on', 'finish quickly');
  if (isTaskQuery) {
    const open = poolTasks.filter(isOpenTask);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < todayK);

    if (has('overdue')) {
      if (overdue.length > 0) {
        return {
          text: `"${overdue[0].title}" has been sitting here since ${overdue[0].dueDate || 'a few days ago'}. At this point, it basically lives here. 🫠 Want to knock it out now?`,
          chips: ['What should I do first?', "What's my next meeting?"],
        };
      }
      return {
        text: `Great news — zero overdue tasks! Nothing is living rent-free in your backlog today. ✨`,
        chips: ['What should I do first?', 'Where are my free hours?'],
      };
    }

    if (has('high priority', 'urgent')) {
      const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high');
      if (urgent.length > 0) {
        return {
          text: `Your high-priority tasks: ${urgent.map((t) => `"${t.title}" [${t.priority}]`).join(', ')}.`,
          chips: ['What should I do first?', 'Where are my free hours?'],
        };
      }
      return {
        text: `You have no urgent tasks flagged right now. A great opportunity to focus on normal backlog items!`,
        chips: ['What should I do first?', 'Where are my free hours?'],
      };
    }

    if (has('do first', 'work on next', 'focus on', 'tackle first')) {
      const todayEvents = poolEvents.filter((e) => e.date === todayK && !e.allDay);
      const nextMeeting = todayEvents.find((e) => e.endMinutes > currentMinutes);
      const topTask = overdue[0] || open.find((t) => t.priority === 'urgent' || t.priority === 'high') || open[0];

      if (topTask && nextMeeting) {
        return {
          text: `You've got "${topTask.title}" (${topTask.priority === 'urgent' || topTask.priority === 'high' ? 'high priority' : 'open task'}) and your next meeting is at ${minutesToLabel(nextMeeting.startMinutes, settings.use24h)}. I'd tackle the task first while you have uninterrupted time!`,
          chips: ['Where are my free hours?', "What's my next meeting?"],
        };
      } else if (topTask) {
        return {
          text: `I'd tackle "${topTask.title}" first. It's your top priority item right now.`,
          chips: ['Where are my free hours?', 'When should I go outside?'],
        };
      }

      return {
        text: `Your task list is completely clear! Nothing pending right now. 🎉`,
        chips: ["What's my next meeting?", 'When should I go outside?'],
      };
    }

    // What tasks do I have today?
    const todayTasks = open.filter((t) => t.dueDate === todayK || !t.dueDate);
    if (todayTasks.length > 0) {
      return {
        text: `You have ${todayTasks.length} ${pluralize(todayTasks.length, 'task')} for today: ${todayTasks.slice(0, 5).map((t) => `"${t.title}"`).join(', ')}.`,
        chips: ['What should I do first?', 'Where are my free hours?'],
      };
    }

    return {
      text: `You don't have any pending tasks for today! All caught up. 🎉`,
      chips: ["What's on my calendar tomorrow?", 'When should I go outside?'],
    };
  }

  // 16. Free Hours & Schedule Gaps
  if (has('free hour', 'free hours', 'free time', 'free slot', 'gap', 'open time', 'downtime')) {
    const dateEvents = poolEvents.filter((e) => e.date === todayK && !e.allDay);
    const gaps = freeGaps(dateEvents);

    if (!dateEvents.length) {
      return {
        text: `Your whole day is free! You have no scheduled meetings today. A great day to pick an anchor project or enjoy time outside. ✨`,
        chips: ['What should I do first?', 'When should I go outside?'],
      };
    }
    if (!gaps.length) {
      return {
        text: `You have a packed schedule with very few open windows today. Try to guard a 15-minute breather between blocks! ☕`,
        chips: ['What should I do first?', 'What should I wear?'],
      };
    }
    const gapList = gaps
      .map((g) => `${minutesToLabel(g.start, settings.use24h)}–${minutesToLabel(g.end, settings.use24h)} (${Math.round((g.end - g.start) / 60 * 10) / 10}h)`)
      .join(', ');
    return {
      text: `Here are your best free blocks today: ${gapList}. ⏰`,
      chips: ['What should I do first?', 'When should I go outside?'],
    };
  }

  // 17. Day Planning & Daily Briefing (e.g. "Help me plan today", "Explain my schedule")
  if (has('plan today', 'plan my day', 'help me plan', 'explain my schedule', 'daily briefing', 'overview')) {
    const cur = weather.current;
    const dateEvents = poolEvents.filter((e) => e.date === todayK && !e.allDay);
    const openTasks = poolTasks.filter(isOpenTask);
    const rain = rainWindow(weather);

    let planText = `Here's a smart plan for today in ${place.name}:\n`;
    planText += `• Weather: ${condition(cur.code).label}, ${fmtTemp(cur.temp, settings.tempUnit)}${rain ? ` with rain expected around ${formatTime(rain.start, settings.use24h)}` : ' with low rain risk'}.\n`;

    if (dateEvents.length > 0) {
      planText += `• Calendar: ${dateEvents.length} scheduled ${pluralize(dateEvents.length, 'event')} (next: "${dateEvents[0].title}" at ${minutesToLabel(dateEvents[0].startMinutes, settings.use24h)}).\n`;
    } else {
      planText += `• Calendar: Open schedule — no meetings booked.\n`;
    }

    if (openTasks.length > 0) {
      planText += `• Tasks: ${openTasks.length} open items. Start with "${openTasks[0].title}".`;
    } else {
      planText += `• Tasks: All clear!`;
    }

    return {
      text: planText,
      chips: ['Where are my free hours?', 'What should I wear?', 'What should I do first?'],
    };
  }

  // 18. Conversational Fallback (helpful, concise, never identical boilerplate)
  return {
    text: `I want to make sure I give you the right answer — could you tell me a bit more about what you'd like to check with your weather, calendar, or tasks?`,
    chips: ["What's my next meeting?", 'What should I wear?', 'Where are my free hours?'],
  };
}

/* ------------------------------------------------------------------ */
/* Gemini Backend Call with Full Grounded Context                     */
/* ------------------------------------------------------------------ */

export function buildSystemContext(ctx: PlanContext) {
  const { weather, events = [], allEvents = [], tasks = [], allTasks = [], place, settings, now, integrations } = ctx;
  const poolEvents = allEvents.length > 0 ? allEvents : events;
  const poolTasks = allTasks.length > 0 ? allTasks : tasks;
  const cur = weather.current;
  const todayK = dateKey(now);
  const tmrK = dateKey(new Date(now.getTime() + 86400000));

  const todayEvs = poolEvents.filter((e) => e.date === todayK);
  const tmrEvs = poolEvents.filter((e) => e.date === tmrK);

  return [
    `You are Clever, a conversational personal planning assistant integrated into a weather, calendar, and task application. Think of yourself as a witty, casual friend who happens to be very good at organizing your day.`,
    `Personality: Casual, funny, slightly playful, clever, friendly, helpful, concise, context-aware.`,
    `Gently tease the situation, NOT the user. Follow the core formula when offering planning suggestions: Observation \u2192 Funny comment \u2192 Useful suggestion.`,
    `Keep recommendations obvious and practical. Target: 80% useful, 20% playful.`,
    `Use playful phrases naturally: "Future You", "your calendar has chosen violence", "the weather has beef with your schedule", "suspiciously empty", "uninvited", "living rent-free in your task list", "let's end the drama".`,
    `For straightforward factual queries (e.g. "What's my next meeting?"), give a clear, direct answer without forced jokes.`,
    `If the user asks something ambiguous and required information is missing, ask a concise follow-up question. Never invent events, tasks, or weather.`,
    ``,
    `Current Context:`,
    `Location: ${place.name}${place.region ? `, ${place.region}` : ''}. Local Time: ${now.toLocaleTimeString()} (${todayK}, ${now.toLocaleDateString(undefined, { weekday: 'long' })}).`,
    `Google Calendar Connected: ${Boolean(integrations?.googleCalendar)}. Google Tasks Connected: ${Boolean(integrations?.googleTasks)}.`,
    `Weather Now: ${condition(cur.code).label}, ${Math.round(cur.temp)}°C (feels ${Math.round(cur.feelsLike)}°C), rain prob ${cur.precip}%.`,
    `Today's Events: ${todayEvs.length ? todayEvs.map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}${e.location ? ` (${e.location})` : ''}`).join('; ') : 'none'}`,
    `Tomorrow's Events (${tmrK}): ${tmrEvs.length ? tmrEvs.map((e) => `"${e.title}" at ${minutesToLabel(e.startMinutes, settings.use24h)}${e.location ? ` (${e.location})` : ''}`).join('; ') : 'none'}`,
    `Open Tasks: ${poolTasks.filter((t) => !t.done).slice(0, 8).map((t) => `"${t.title}" [${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ''}]`).join('; ') || 'none'}`,
  ].join('\n');
}

export async function askGemini(
  question: string,
  ctx: PlanContext,
  history: ChatMessage[] = []
): Promise<{ text: string; chips: string[]; live: boolean; action?: CleverAction; isError?: boolean }> {
  const poolEvents = ctx.allEvents && ctx.allEvents.length > 0 ? ctx.allEvents : ctx.events;
  const poolTasks = ctx.allTasks && ctx.allTasks.length > 0 ? ctx.allTasks : ctx.tasks;
  const apiKey = ctx.settings.geminiApiKey || (typeof process !== 'undefined' ? (process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY) : undefined);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const contextPayload = {
      placeName: ctx.place.name,
      region: ctx.place.region,
      tempUnit: ctx.settings.tempUnit,
      windUnit: ctx.settings.windUnit,
      use24h: ctx.settings.use24h,
      userName: ctx.userName,
      nowIso: ctx.now.toISOString(),
      dayOfWeek: ctx.now.toLocaleDateString(undefined, { weekday: 'long' }),
      currentTimeFormatted: minutesToLabel(ctx.now.getHours() * 60 + ctx.now.getMinutes(), ctx.settings.use24h),
      current: ctx.weather.current
        ? {
            tempC: ctx.weather.current.temp,
            feelsLikeC: ctx.weather.current.feelsLike,
            code: ctx.weather.current.code,
            uv: ctx.weather.current.uv,
            wind: ctx.weather.current.wind,
            humidity: ctx.weather.current.humidity,
            isDay: ctx.weather.current.isDay,
          }
        : undefined,
      forecast: {
        today: ctx.weather.daily[0]
          ? {
              min: ctx.weather.daily[0].min,
              max: ctx.weather.daily[0].max,
              pop: ctx.weather.daily[0].pop,
              rain: ctx.weather.daily[0].precipSum,
              uvMax: ctx.weather.daily[0].uvMax,
              sunrise: ctx.weather.daily[0].sunrise,
              sunset: ctx.weather.daily[0].sunset,
            }
          : undefined,
        tomorrow: ctx.weather.daily[1]
          ? {
              date: ctx.weather.daily[1].date,
              min: ctx.weather.daily[1].min,
              max: ctx.weather.daily[1].max,
              pop: ctx.weather.daily[1].pop,
              code: ctx.weather.daily[1].code,
            }
          : undefined,
        rainWindow: rainWindow(ctx.weather),
        outdoorWindow: bestOutdoorWindow(ctx.weather, dateKey(ctx.now)),
      },
      events: poolEvents.map((e) => ({
        title: e.title,
        date: e.date,
        startMinutes: e.startMinutes,
        endMinutes: e.endMinutes,
        isOutdoor: e.isOutdoor,
        allDay: e.allDay,
        location: e.location,
        source: e.source,
      })),
      tasks: poolTasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        context: t.context,
        dueDate: t.dueDate,
        dueMinutes: t.dueMinutes,
        done: t.done,
        source: t.source,
      })),
      reminders: (ctx.reminders || []).slice(0, 6).map((r) => ({
        title: r.title,
        trigger: r.trigger,
        date: r.date,
        minutes: r.minutes,
        weatherRule: r.weatherRule,
      })),
      integrations: {
        googleCalendar: Boolean(ctx.integrations?.googleCalendar),
        googleTasks: Boolean(ctx.integrations?.googleTasks),
      },
      apiKey,
    };

    // Ensure role mapping conforms to Gemini (user / model)
    const recentHistory = history
      .slice(-8)
      .map((m) => ({
        role: (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user',
        text: m.text || m.content || '',
      }));

    // Try same-origin / local proxy first, fallback to DEFAULT_BACKEND_URL
    let res = await fetch(`${apiBaseUrl()}/api/ask-clever`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: contextPayload, history: recentHistory, apiKey }),
      signal: controller.signal,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${DEFAULT_BACKEND_URL}/api/ask-clever`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: contextPayload, history: recentHistory, apiKey }),
        signal: controller.signal,
      }).catch(() => null);
    }

    clearTimeout(timeout);

    if (res && res.ok) {
      const json: any = await res.json();
      const chips =
        Array.isArray(json.chips) && json.chips.length > 0
          ? json.chips
          : STARTER_PROMPTS.slice(0, 3);

      let action: CleverAction | undefined;
      if (json.type === 'addTask' && json.task) {
        action = { kind: 'addTask', task: json.task };
      } else if (json.type === 'addEvent' && json.event) {
        action = { kind: 'addEvent', event: json.event };
      } else if (json.type === 'addReminder' && json.reminder) {
        action = { kind: 'addReminder', reminder: json.reminder };
      } else if (json.type === 'confirmAction' || json.confirm) {
        action = { kind: 'confirmAction', description: json.confirm?.description || 'Confirm action' };
      }

      if (json.text && !json.error) {
        return { text: json.text, chips, live: true, action };
      }
    }
  } catch {
    // Network error or timeout
  }

  // Direct client-side Gemini fallback if API key is present
  if (apiKey) {
    try {
      const directContents = [
        ...history.slice(-8).map((m) => ({
          role: (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user',
          parts: [{ text: String(m.text || m.content || '').slice(0, 1000) }],
        })),
        { role: 'user', parts: [{ text: question }] },
      ];
      const directRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemContext(ctx) }] },
            contents: directContents,
            generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
          }),
        }
      );
      if (directRes.ok) {
        const dJson: any = await directRes.json();
        const rawText = dJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
        let cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed.text) {
            return {
              text: parsed.text,
              chips: Array.isArray(parsed.chips) ? parsed.chips : STARTER_PROMPTS.slice(0, 3),
              live: true,
            };
          }
        } catch {
          if (cleaned.length > 0) {
            return { text: cleaned, chips: STARTER_PROMPTS.slice(0, 3), live: true };
          }
        }
      }
    } catch {}
  }

  // Fallback to intelligent query-driven local engine
  const local = localAnswer(question, ctx, history);
  return { ...local, live: false };
}

/* ------------------------------------------------------------------ */
/* Real-time Contextual Recommendations via Gemini                    */
/* ------------------------------------------------------------------ */

export async function fetchSmartRecommendations(ctx: PlanContext): Promise<Suggestion[]> {
  const fallback = generateSuggestions(ctx);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const { weather, events = [], allEvents = [], tasks = [], allTasks = [], now, place } = ctx;
    const poolEvents = allEvents.length > 0 ? allEvents : events;
    const poolTasks = allTasks.length > 0 ? allTasks : tasks;

    // Filter relevant calendar events (today & upcoming 48 hours)
    const nowMs = now.getTime();
    const relevantEvents = poolEvents
      .filter((e) => {
        if (!e.date) return false;
        const [y, m, d] = e.date.split('-').map(Number);
        const evDate = new Date(y, m - 1, d).getTime();
        return evDate >= nowMs - 86400000 && evDate <= nowMs + 48 * 3600000;
      })
      .slice(0, 15)
      .map((e) => ({
        title: e.title,
        date: e.date,
        startMinutes: e.startMinutes,
        endMinutes: e.endMinutes,
        allDay: e.allDay,
        location: e.location,
        isOutdoor: e.isOutdoor,
        status: e.status,
      }));

    // Filter relevant tasks (open or completed today)
    const todayK = dateKey(now);
    const relevantTasks = poolTasks
      .filter((t) => !t.done || (t.completedAt && dateKey(t.completedAt) === todayK))
      .slice(0, 15)
      .map((t) => ({
        title: t.title,
        dueDate: t.dueDate,
        dueMinutes: t.dueMinutes,
        done: t.done,
        priority: t.priority,
        context: t.context,
      }));

    const contextPayload = {
      now: now.toISOString(),
      location: place?.name || 'Local',
      currentWeather: {
        temp: weather.current.temp,
        feelsLike: weather.current.feelsLike,
        condition: condition(weather.current.code).label,
        rainProb: rainWindow(weather)?.peak ?? (weather.daily[0]?.pop || 0),
        uv: weather.current.uv,
        wind: weather.current.wind,
        humidity: weather.current.humidity,
      },
      forecast: weather.daily.slice(0, 3).map((d) => ({
        date: d.date,
        condition: condition(d.code).label,
        maxTemp: d.max,
        minTemp: d.min,
        rainProb: d.pop,
      })),
      events: relevantEvents,
      tasks: relevantTasks,
    };

    let res = await fetch(`${apiBaseUrl()}/api/ai/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextPayload }),
      signal: controller.signal,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${DEFAULT_BACKEND_URL}/api/ai/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: contextPayload }),
        signal: controller.signal,
      }).catch(() => null);
    }

    clearTimeout(timeout);

    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        return data.recommendations.map((r: any, idx: number) => ({
          id: uid(`rec_${idx}`),
          icon: r.icon || 'sparkles',
          title: r.title || 'Smart Tip',
          body: r.body || '',
          tone: (['positive', 'caution', 'critical', 'info', 'focus'].includes(r.tone) ? r.tone : 'info') as SuggestionTone,
          confidence: typeof r.confidence === 'number' ? r.confidence : 0.85,
          tag: r.tag || 'Clever Tips',
          action: r.action ? {
            label: r.action.label || 'View',
            kind: r.action.kind || 'weather',
          } : undefined,
        }));
      }
    }
  } catch {
    // Graceful fallback to local deterministic suggestions
  }

  return fallback;
}


