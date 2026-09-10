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
  const outdoorTasks = openTasks.filter((t) => t.context === 'outdoor');
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < todayKey);
  const gaps = freeGaps(sorted);
  const biggestGap = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const hrs = nextHours(weather, 12);

  /* 1. Rain vs outdoor commitments -------------------------------- */
  if (rain && outdoorEvents.length) {
    const clash = outdoorEvents.find((e) => {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const evStart = start.getTime() + e.startMinutes * 60000;
      const evEnd = start.getTime() + e.endMinutes * 60000;
      return evStart < rain.end && evEnd > rain.start;
    });
    if (clash) {
      out.push({
        id: uid('sg'),
        icon: 'umbrella',
        title: `Rain may hit \u201C${clash.title}\u201D`,
        body: `${rain.peak}% chance of precipitation between ${formatTime(rain.start, settings.use24h)} and ${formatTime(rain.end, settings.use24h)}. ${clash.title} is outdoors at ${minutesToLabel(clash.startMinutes, settings.use24h)} \u2014 consider moving it or packing a shell.`,
        tone: 'critical',
        confidence: 0.92,
        tag: 'Weather \u00D7 Calendar',
        action: { label: 'Open calendar', kind: 'calendar' },
      });
    }
  }

  /* 2. Rain incoming generally ------------------------------------ */
  if (rain && !out.length) {
    out.push({
      id: uid('sg'),
      icon: 'rainy',
      title: `Rain arriving around ${formatTime(rain.start, settings.use24h)}`,
      body: `Peak chance ${rain.peak}%. If you have anything outside, the window before ${formatTime(rain.start, settings.use24h)} is your cleanest run.`,
      tone: 'caution',
      confidence: 0.85,
      tag: 'Weather',
      action: { label: 'See forecast', kind: 'weather' },
    });
  }

  /* 3. Best outdoor window x outdoor tasks ------------------------ */
  if (window && outdoorTasks.length && window.score > 55) {
    out.push({
      id: uid('sg'),
      icon: 'walk',
      title: `Best outdoor window: ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}`,
      body: `${outdoorTasks.length} outdoor ${pluralize(outdoorTasks.length, 'task')} waiting \u2014 starting with \u201C${outdoorTasks[0].title}\u201D. Conditions score ${window.score}/100 in that slot.`,
      tone: 'positive',
      confidence: 0.88,
      tag: 'Weather \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 4. Overdue backlog -------------------------------------------- */
  if (overdue.length) {
    out.push({
      id: uid('sg'),
      icon: 'alert-circle',
      title: `${overdue.length} overdue ${pluralize(overdue.length, 'task')}`,
      body: `\u201C${overdue[0].title}\u201D has been waiting since ${overdue[0].dueDate}. Pull one into today's ${biggestGap ? `${minutesToLabel(biggestGap.start, settings.use24h)} gap` : 'schedule'} and clear the drag.`,
      tone: 'caution',
      confidence: 0.9,
      tag: 'Tasks',
      action: { label: 'Triage now', kind: 'tasks' },
    });
  }

  /* 5. Focus block in the largest gap ----------------------------- */
  if (biggestGap && biggestGap.end - biggestGap.start >= 75) {
    const indoorHigh = openTasks.filter((t) => t.context !== 'outdoor' && (t.priority === 'high' || t.priority === 'urgent'));
    if (indoorHigh.length) {
      out.push({
        id: uid('sg'),
        icon: 'flash',
        title: `Protect ${minutesToLabel(biggestGap.start, settings.use24h)}\u2013${minutesToLabel(biggestGap.end, settings.use24h)} for deep work`,
        body: `That's ${Math.round((biggestGap.end - biggestGap.start) / 60 * 10) / 10}h clear. \u201C${indoorHigh[0].title}\u201D is your highest-leverage item and it's indoor-friendly \u2014 perfect for this block.`,
        tone: 'focus',
        confidence: 0.82,
        tag: 'Calendar \u00D7 Tasks',
        action: { label: 'Block the time', kind: 'moveEvent', payload: { start: biggestGap.start, title: `Focus: ${indoorHigh[0].title}` } },
      });
    }
  }

  /* 6. UV warning -------------------------------------------------- */
  const maxUv = Math.max(cur.uv, ...hrs.map((h) => h.uv));
  if (maxUv >= 6 && cur.isDay) {
    out.push({
      id: uid('sg'),
      icon: 'sunny',
      title: `${uvLabel(maxUv)} UV today \u2014 index ${Math.round(maxUv)}`,
      body: `Peak exposure is midday. If you're outside for ${outdoorEvents.length ? `\u201C${outdoorEvents[0].title}\u201D` : 'more than 20 minutes'}, use SPF 30+ and shade between 11am and 3pm.`,
      tone: 'caution',
      confidence: 0.8,
      tag: 'Weather',
      action: { label: 'Add reminder', kind: 'reminders' },
    });
  }

  /* 7. Temperature extremes ---------------------------------------- */
  if (cur.temp <= 4) {
    out.push({
      id: uid('sg'),
      icon: 'snow',
      title: `Cold start \u2014 feels like ${fmtTemp(cur.feelsLike, unit)}`,
      body: `Layer up. Wind at ${fmtWind(cur.wind, settings.windUnit)} is pulling the apparent temperature down. Warm up the car early if you're driving.`,
      tone: 'info',
      confidence: 0.78,
      tag: 'Weather',
    });
  } else if (cur.temp >= 31) {
    out.push({
      id: uid('sg'),
      icon: 'thermometer',
      title: `Heat advisory \u2014 ${fmtTemp(cur.temp, unit)} outside`,
      body: `Feels like ${fmtTemp(cur.feelsLike, unit)}. Shift anything physical to before 10am or after 6pm and keep water nearby during ${upcoming.length ? 'your afternoon blocks' : 'the afternoon'}.`,
      tone: 'caution',
      confidence: 0.84,
      tag: 'Weather',
    });
  }

  /* 8. Wind ---------------------------------------------------------- */
  if (cur.wind >= 32) {
    out.push({
      id: uid('sg'),
      icon: 'flag',
      title: `Strong wind \u2014 ${fmtWind(cur.wind, settings.windUnit)}`,
      body: `Cycling, deliveries and anything lightweight outdoors will be difficult. Secure balcony items before ${formatTime(Date.now() + 4 * 3600_000, settings.use24h)}.`,
      tone: 'caution',
      confidence: 0.76,
      tag: 'Weather',
    });
  }

  /* 9. Packed schedule ---------------------------------------------- */
  const load = dayLoad(sorted);
  if (load >= 300) {
    out.push({
      id: uid('sg'),
      icon: 'timer',
      title: `${Math.round(load / 60 * 10) / 10}h of meetings today`,
      body: `Dense day. Consider declining or shortening one block \u2014 you have ${openTasks.length} open ${pluralize(openTasks.length, 'task')} and only ${gaps.reduce((a, g) => a + (g.end - g.start), 0)} minutes of clear space.`,
      tone: 'caution',
      confidence: 0.81,
      tag: 'Calendar',
      action: { label: 'Review day', kind: 'calendar' },
    });
  } else if (load === 0 && openTasks.length > 0) {
    out.push({
      id: uid('sg'),
      icon: 'sparkles',
      title: 'A clear calendar \u2014 rare and valuable',
      body: `No meetings today. With ${comfortScore(cur)}/100 comfort outside, front-load ${outdoorTasks.length ? 'the outdoor list' : 'your hardest task'} and keep the afternoon loose.`,
      tone: 'positive',
      confidence: 0.79,
      tag: 'Calendar \u00D7 Tasks',
      action: { label: 'View tasks', kind: 'tasks' },
    });
  }

  /* 10. Golden hour ---------------------------------------------------- */
  const today = weather.daily.find((d) => d.date === todayKey);
  if (today && cur.isDay) {
    const minsToSunset = (today.sunset - now.getTime()) / 60000;
    if (minsToSunset > 30 && minsToSunset < 110 && condition(cur.code).outdoorScore > 60) {
      out.push({
        id: uid('sg'),
        icon: 'partly-sunny',
        title: `Golden hour in ${Math.round(minsToSunset - 40)} min`,
        body: `Sunset at ${formatTime(today.sunset, settings.use24h)} with clear-ish skies. A short walk now doubles as a reset between ${upcoming.length ? 'blocks' : 'tasks'}.`,
        tone: 'positive',
        confidence: 0.72,
        tag: 'Weather',
      });
    }
  }

  /* 11. Air quality ------------------------------------------------------ */
  const aqi = aqiFromWeather(cur);
  if (aqi > 100) {
    out.push({
      id: uid('sg'),
      icon: 'cloud',
      title: `Air quality ${aqiLabel(aqi)} (${aqi})`,
      body: 'Move cardio indoors today and keep windows shut during the afternoon peak.',
      tone: 'caution',
      confidence: 0.7,
      tag: 'Weather \u00D7 Health',
    });
  }

  /* 12. Momentum --------------------------------------------------------- */
  const doneToday = ctx.allTasks.filter((t) => t.done && t.completedAt && dateKey(t.completedAt) === todayKey);
  if (doneToday.length >= 2) {
    out.push({
      id: uid('sg'),
      icon: 'trending-up',
      title: `${doneToday.length} done already`,
      body: `Momentum is real. ${openTasks.length ? `\u201C${openTasks[0].title}\u201D is the natural next pull.` : 'Everything on today\u2019s list is clear \u2014 consider pulling one item from tomorrow.'}`,
      tone: 'positive',
      confidence: 0.68,
      tag: 'Tasks',
      action: { label: 'Keep going', kind: 'tasks' },
    });
  }

  /* 13. Nothing planned --------------------------------------------------- */
  if (!sorted.length && !openTasks.length) {
    out.push({
      id: uid('sg'),
      icon: 'add-circle',
      title: 'Your day is a blank page',
      body: `Conditions score ${comfortScore(cur)}/100. Add one anchor task and one outdoor moment \u2014 that's usually enough structure.`,
      tone: 'info',
      confidence: 0.6,
      tag: 'Planning',
      action: { label: 'Add a task', kind: 'addTask' },
    });
  }

  return out
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.confidence - a.confidence)
    .slice(0, 6);
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
/* Conversational answers                                              */
/* ------------------------------------------------------------------ */

export const STARTER_PROMPTS = [
  "What's my day looking like?",
  'Can I go outside today?',
  'What should I get done first?',
  "When's the best time for a walk?",
  'Will the rain affect my plans?',
  'What should I prioritize today?',
];

export function localAnswer(question: string, ctx: PlanContext, history: ChatMessage[] = []): { text: string; chips: string[]; action?: CleverAction } {
  const q = question.toLowerCase().trim();
  const { weather, events, allEvents = [], tasks, allTasks, reminders = [], settings, place, userName, now, integrations } = ctx;
  const cur = weather.current;
  const sorted = sortEvents(events.filter((e) => !e.allDay));
  const open = tasks.filter((t) => !t.done);
  const rain = rainWindow(weather);
  const todayKey = dateKey(now);
  const window = bestOutdoorWindow(weather, todayKey);
  const gaps = freeGaps(sorted);
  const chipsDefault = ["What's my day looking like?", 'Can I go outside today?', 'What should I prioritize today?'];

  const has = (...k: string[]) => k.some((x) => q.includes(x));

  // 1. Natural Language Task Creation: e.g. "Add 'Buy milk' to my tasks" or "Add a task to buy groceries"
  const addTaskMatch = question.match(/(?:add\s+(?:a\s+)?task(?:\s+to)?\s+["“']?([^"”']+)["”']?|add\s+["“']([^"”']+)["”']\s+to\s+(?:my\s+)?tasks?)/i);
  if (addTaskMatch) {
    const taskTitle = (addTaskMatch[1] || addTaskMatch[2] || '').trim();
    if (taskTitle) {
      const isOutdoor = /outdoor|walk|run|bike|grocer|shop|car|mow|yard/i.test(taskTitle);
      return {
        text: `Got it! I've set up a task for "${taskTitle}". Ready to add it?`,
        chips: ["What's my day looking like?", 'What should I get done first?'],
        action: {
          kind: 'addTask',
          task: {
            title: taskTitle,
            priority: 'normal',
            context: isOutdoor ? 'outdoor' : 'anywhere',
            dueDate: todayKey,
          },
        },
      };
    }
  }

  // 2. Natural Language Reminder Creation: e.g. "Remind me tomorrow at 8 AM to buy groceries" or "Remind me at 6 PM to go running"
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
    const isTomorrow = /tomorrow/i.test(question);
    const targetDate = isTomorrow ? dateKey(new Date(now.getTime() + 86400000)) : todayKey;

    return {
      text: `Sure thing! I can remind you ${isTomorrow ? 'tomorrow' : 'today'} ${timeStr ? `at ${timeStr}` : ''} to "${reminderTitle}". Want me to set it?`,
      chips: ["What's my day looking like?", 'Will the rain affect my plans?'],
      action: {
        kind: 'addReminder',
        reminder: {
          title: reminderTitle,
          date: targetDate,
          minutes: mins,
          trigger: 'time',
          repeat: 'none',
        },
      },
    };
  }

  // 3. Destructive Action Confirmation: e.g. "Delete my meeting tomorrow" or "Delete task"
  if (has('delete', 'remove', 'cancel') && has('meeting', 'event', 'calendar', 'task', 'reminder')) {
    const isEvent = has('meeting', 'event', 'calendar');
    const isTask = has('task');
    return {
      text: `I can delete that ${isEvent ? 'calendar event' : isTask ? 'task' : 'item'}. Want me to go ahead?`,
      chips: ['Yes, delete it', 'No, keep it', "What's my day looking like?"],
      action: {
        kind: 'confirmAction',
        description: `Delete ${isEvent ? 'event' : isTask ? 'task' : 'item'}`,
      },
    };
  }

  // 4. Missing Google Integration Awareness
  if (has('google calendar', 'google tasks', 'connect google', 'sync calendar') && (!integrations?.googleCalendar || !integrations?.googleTasks)) {
    return {
      text: `I don't have access to your Google Calendar or Tasks yet. Connect your Google account in Settings/Integrations and I'll pull in your full schedule seamlessly!`,
      chips: ["What's my day looking like?", 'Can I go outside today?'],
    };
  }

  // 5. Daily Briefing / "What's my day looking like?"
  if (has('day looking like', 'plan my day', 'daily briefing', 'briefing', 'summary of today', 'how does my day', 'what does my day')) {
    const outdoorTasks = open.filter((t) => t.context === 'outdoor');
    const g = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];

    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
    const lines = [
      `${greeting}! 🌤️ Here's the snapshot for today in ${place.name}:`,
      ``,
      `• Weather: ${condition(cur.code).label}, ${fmtTemp(cur.temp, settings.tempUnit)} (feels like ${fmtTemp(cur.feelsLike, settings.tempUnit)}). Comfort score is ${comfortScore(cur)}/100.`,
      sorted.length
        ? `• Calendar: You have ${sorted.length} ${pluralize(sorted.length, 'event')} \u2014 starting with "${sorted[0].title}" at ${minutesToLabel(sorted[0].startMinutes, settings.use24h)}.`
        : `• Calendar: Clear schedule \u2014 no meetings booked!`,
      open.length
        ? `• Tasks: ${open.length} open ${pluralize(open.length, 'task')}, prioritized by urgency.`
        : `• Tasks: All clear for today.`,
      rain
        ? `• Heads up: Rain expected starting around ${formatTime(rain.start, settings.use24h)} (peak ${rain.peak}%).`
        : window
        ? `• Outdoor Window: Best time outside is ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}.`
        : '',
      g ? `• Deep Work: Free window from ${minutesToLabel(g.start, settings.use24h)}\u2013${minutesToLabel(g.end, settings.use24h)}.` : '',
      ``,
      open.length ? `Sunshine first, productivity second! 😄` : `Enjoy the free time!`,
    ].filter(Boolean);

    return {
      text: lines.join('\n'),
      chips: ['Can I go outside today?', 'What should I prioritize today?', 'Will the rain affect my plans?'],
    };
  }

  // 6. "Can I go outside today?" / Lunch outside / Evening run
  if (has('go outside', 'can i go out', 'lunch outside', 'eat outside', 'sit outside', 'outdoor today')) {
    if (rain) {
      return {
        text: `You can, but timing is key! 🌦️ There's rain expected around ${formatTime(rain.start, settings.use24h)} (peak ${rain.peak}%). If you're planning lunch or stepping out, aim for before ${formatTime(rain.start, settings.use24h)} to stay dry.`,
        chips: ["When's the best time for a walk?", 'Will the rain affect my plans?', 'What should I wear?'],
      };
    }
    const score = comfortScore(cur);
    if (score >= 65) {
      return {
        text: `Yep \u2014 today looks great for it! ☀️ Comfort score is ${score}/100 with ${fmtTemp(cur.temp, settings.tempUnit)} and gentle breezes. Perfect time to step out.`,
        chips: ["When's the best time for a walk?", "What's my day looking like?"],
      };
    } else {
      return {
        text: `You can, but pack a layer. It's ${fmtTemp(cur.temp, settings.tempUnit)} and feels like ${fmtTemp(cur.feelsLike, settings.tempUnit)} with ${cur.wind} km/h wind.`,
        chips: ['What should I wear?', "When's the best time for a walk?"],
      };
    }
  }

  // 7. "When should I go for a walk?" / "When should I walk the dog?" / "When to exercise"
  if (has('walk', 'run', 'cycling', 'bike', 'dog', 'jog', 'exercise')) {
    if (has('tomorrow')) {
      const tmr = weather.daily[1];
      if (tmr) {
        return {
          text: `For tomorrow, I'd go between 7–9 AM or in the early evening. 🚴 It'll be around ${fmtTemp(tmr.min, settings.tempUnit)}–${fmtTemp(tmr.max, settings.tempUnit)} with ${tmr.pop}% rain chance and lighter wind.`,
          chips: ['Do I have anything scheduled tomorrow?', "What's my day looking like?"],
        };
      }
    }
    if (window) {
      return {
        text: `I'd aim for around ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}. 🐕 Conditions score ${window.score}/100, the temperature drops nicely, and rain chance is minimal. Your calendar looks clear then too!`,
        chips: ['Add a walk task', 'Will the rain affect my plans?', "What's my day looking like?"],
      };
    }
    return {
      text: `Late afternoon or around 6:30 PM looks best today. Temperature will be cooler and wind is calmer.`,
      chips: ["What's my day looking like?", 'Can I go outside today?'],
    };
  }

  // 8. "Will the rain affect my plans?" / Rain check
  if (has('rain', 'affect my plans', 'wet', 'umbrella', 'storm')) {
    const outdoorEvents = sorted.filter((e) => e.isOutdoor);
    if (rain) {
      if (outdoorEvents.length) {
        return {
          text: `Heads up! 🌧️ Rain is expected from ${formatTime(rain.start, settings.use24h)} to ${formatTime(rain.end, settings.use24h)} (peak ${rain.peak}%). That overlaps with "${outdoorEvents[0].title}" at ${minutesToLabel(outdoorEvents[0].startMinutes, settings.use24h)}. If you can shift it before ${formatTime(rain.start, settings.use24h)}, you'll have much better conditions.`,
          chips: ['Move my outdoor event', 'Best outdoor window', "What's my day looking like?"],
        };
      }
      return {
        text: `Rain is rolling in around ${formatTime(rain.start, settings.use24h)} and peaking around ${rain.peak}%. None of your scheduled calendar events are marked outdoors, but if you have errands, do them before ${formatTime(rain.start, settings.use24h)}.`,
        chips: ['What should I wear?', "What's my day looking like?"],
      };
    }
    return {
      text: `Looking clear! 🌤️ No significant rain is expected today (highest chance is negligible). Your plans are safe from the weather.`,
      chips: ["What's my day looking like?", 'Can I go outside today?'],
    };
  }

  // 9. "What should I get done first?" / "What should I prioritize today?"
  if (has('first', 'prioritize', 'priority', 'what should i do', 'tasks', 'get done')) {
    const overdue = open.filter((t) => t.dueDate && t.dueDate < todayKey);
    const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high');
    const outdoor = open.filter((t) => t.context === 'outdoor');

    if (!open.length) {
      return {
        text: `Your task list is completely clear today! 🎉 Rest or take a walk \u2014 you've earned it.`,
        chips: ['Can I go outside today?', "When's the best time for a walk?"],
      };
    }

    const first = overdue[0] || urgent[0] || open[0];
    const parts = [
      `Here's what I'd tackle first:`,
      ``,
      `1. "${first.title}" \u2014 ${first.dueDate && first.dueDate < todayKey ? 'Overdue, knock this out to clear the backlog!' : 'Highest leverage item.'}`,
    ];

    if (open[1]) {
      parts.push(`2. "${open[1].title}" \u2014 ${open[1].context === 'outdoor' && rain ? 'Do this before the afternoon rain.' : 'Quick win next.'}`);
    }
    if (open[2]) {
      parts.push(`3. "${open[2].title}"`);
    }

    parts.push(``);
    parts.push(`Knock out "${first.title}" first and future-you will be very pleased. 😄`);

    return {
      text: parts.join('\n'),
      chips: ['Where are my free blocks?', 'Plan my day', 'Can I go outside today?'],
    };
  }

  // 10. Tomorrow's Schedule / Forecast
  if (has('tomorrow')) {
    const tmrKey = dateKey(new Date(now.getTime() + 86400000));
    const tmrEvents = (allEvents.length ? allEvents : events).filter((e) => e.date === tmrKey);
    const tmrWeather = weather.daily[1];

    if (tmrEvents.length) {
      return {
        text: `Tomorrow's looking pretty structured: You have ${tmrEvents.length} ${pluralize(tmrEvents.length, 'event')}, starting with "${tmrEvents[0].title}" at ${minutesToLabel(tmrEvents[0].startMinutes, settings.use24h)}. Weather-wise, it's ${tmrWeather ? `${condition(tmrWeather.code).label.toLowerCase()}, ${fmtTemp(tmrWeather.min, settings.tempUnit)}–${fmtTemp(tmrWeather.max, settings.tempUnit)}` : 'pleasant'}.`,
        chips: ['Can I go cycling tomorrow?', "What's my day looking like?"],
      };
    }
    return {
      text: `Tomorrow's calendar is wide open! 🌤️ Weather looks like ${tmrWeather ? `${condition(tmrWeather.code).label.toLowerCase()} with a high of ${fmtTemp(tmrWeather.max, settings.tempUnit)}` : 'great conditions'}.`,
      chips: ['Can I go cycling tomorrow?', "What's my day looking like?"],
    };
  }

  // 11. Conversational Follow-up Support
  if (history.length > 0) {
    const foundUser = [...history].reverse().find((m) => m.role === 'user');
    const lastUserMsg = (foundUser?.text || foundUser?.content || '').toLowerCase();
    if (has('what about tomorrow', 'how about tomorrow', 'and tomorrow')) {
      if (lastUserMsg.includes('run') || lastUserMsg.includes('walk') || lastUserMsg.includes('outside')) {
        const tmr = weather.daily[1];
        return {
          text: `Tomorrow is actually great for it! 🌤️ High of ${tmr ? fmtTemp(tmr.max, settings.tempUnit) : '24°C'} with low rain chance. Early morning or around 6 PM will be the sweet spot.`,
          chips: ['Do I have anything scheduled tomorrow?', "What's my day looking like?"],
        };
      }
    }
  }

  // Default synthesis
  return {
    text: `${generateBriefing(ctx)}\n\nAsk me anything about your schedule, weather, or what to tackle next!`,
    chips: chipsDefault,
  };
}

function bestDayLabel(weather: WeatherBundle) {
  let best = weather.daily[0];
  let bestScore = -1;
  for (const d of weather.daily.slice(0, 7)) {
    const s = condition(d.code).outdoorScore - d.pop * 0.5 - Math.abs((d.max + d.min) / 2 - 21) * 2;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return new Date(best.time).toLocaleDateString(undefined, { weekday: 'long' });
}

/* ------------------------------------------------------------------ */
/* Gemini call & Backend Proxy                                        */
/* ------------------------------------------------------------------ */

export function buildSystemContext(ctx: PlanContext) {
  const { weather, events, tasks, place, settings, now } = ctx;
  const cur = weather.current;
  return [
    `You are Ask Clever, a friendly, smart, weather-aware daily planning assistant. Combine weather, calendar and tasks into short actionable guidance.`,
    `Location: ${place.name}${place.region ? `, ${place.region}` : ''}. Local time: ${formatTime(now, settings.use24h)}.`,
    `Now: ${condition(cur.code).label}, ${Math.round(cur.temp)}C (feels ${Math.round(cur.feelsLike)}C), humidity ${cur.humidity}%, wind ${Math.round(cur.wind)}km/h, UV ${cur.uv}.`,
    `Next 12h: ${nextHours(weather, 12).map((h) => `${new Date(h.time).getHours()}h ${Math.round(h.temp)}C ${h.pop}%`).join('; ')}`,
    `Today's events: ${events.length ? events.map((e) => `${e.title} ${minutesToLabel(e.startMinutes)}-${minutesToLabel(e.endMinutes)}${e.isOutdoor ? ' (outdoor)' : ''}`).join('; ') : 'none'}`,
    `Open tasks: ${tasks.filter((t) => !t.done).map((t) => `${t.title} [${t.priority}${t.context === 'outdoor' ? ', outdoor' : ''}]`).join('; ') || 'none'}`,
    `Tone: friendly, smart, concise, conversational.`,
  ].join('\n');
}

export async function askGemini(
  question: string,
  ctx: PlanContext,
  history: ChatMessage[] = []
): Promise<{ text: string; chips: string[]; live: boolean; action?: CleverAction }> {
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
      events: ctx.events.map((e) => ({
        title: e.title,
        date: e.date,
        startMinutes: e.startMinutes,
        endMinutes: e.endMinutes,
        isOutdoor: e.isOutdoor,
        allDay: e.allDay,
        location: e.location,
        source: e.source,
      })),
      tasks: ctx.tasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        context: t.context,
        dueDate: t.dueDate,
        dueMinutes: t.dueMinutes,
        done: t.done,
        source: t.source,
      })),
      reminders: (ctx.reminders || []).slice(0, 5).map((r) => ({
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
    };

    const recentHistory = history
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    const res = await fetch(`${apiBaseUrl()}/api/ask-clever`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: contextPayload, history: recentHistory }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
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
    // Network error, timeout, or non-JSON — fall through to local
  }

  // Fallback to offline rule-based local answer
  const local = localAnswer(question, ctx, history);
  return { ...local, live: false };
}

