import { CalEvent, Settings, Task } from './types';
import {
  CurrentWeather, Place, WeatherBundle, bestOutdoorWindow, condition, fmtTemp, fmtWind,
  hoursForDay, nextHours, rainWindow, uvLabel, aqiFromWeather, aqiLabel,
} from './weather';
import { dateKey, minutesToLabel, formatTime, pluralize, uid } from './utils';

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
  tasks: Task[]; // today's + overdue, undone first
  allTasks: Task[];
  settings: Settings;
  userName: string;
  now: Date;
}

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
    `${c.label} in ${place.name}, ${fmtTemp(cur.temp, settings.tempUnit)} and feels like ${fmtTemp(cur.feelsLike, settings.tempUnit)}${today ? `, heading to ${fmtTemp(today.max, settings.tempUnit)}` : ''}.`
  );

  if (sorted.length) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    lines.push(
      `You have ${sorted.length} ${pluralize(sorted.length, 'event')} \u2014 starting with ${first.title} at ${minutesToLabel(first.startMinutes, settings.use24h)} and wrapping after ${last.title} at ${minutesToLabel(last.endMinutes, settings.use24h)}.`
    );
  } else {
    lines.push('No calendar events today, which means the shape of the day is yours to set.');
  }

  if (open.length) {
    const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high');
    lines.push(
      `${open.length} open ${pluralize(open.length, 'task')}${urgent.length ? `, ${urgent.length} of them high priority \u2014 \u201C${urgent[0].title}\u201D is the one that matters most` : ''}.`
    );
  } else {
    lines.push('Your task list for today is already clear.');
  }

  if (rain) {
    lines.push(`Rain is likely from ${formatTime(rain.start, settings.use24h)} (peak ${rain.peak}%) \u2014 plan errands before that.`);
  } else if (window) {
    lines.push(`Your cleanest outdoor window is ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)}.`);
  }

  if (gaps.length) {
    const g = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    lines.push(`Biggest free block: ${minutesToLabel(g.start, settings.use24h)}\u2013${minutesToLabel(g.end, settings.use24h)}. That's where the hard thinking should go.`);
  }

  const tone = settings.geminiTone;
  if (tone === 'concise') return lines.slice(0, 3).join(' ');
  if (tone === 'detailed') {
    lines.push(
      `Comfort index is ${comfortScore(cur)}/100 with ${cur.humidity}% humidity and wind at ${fmtWind(cur.wind, settings.windUnit)}. ${today ? `Sunrise was ${formatTime(today.sunrise, settings.use24h)} and sunset lands at ${formatTime(today.sunset, settings.use24h)}.` : ''}`
    );
    lines.push(`One suggestion, ${userName.split(' ')[0]}: decide now what "done" looks like today. Everything else is negotiable.`);
  }
  return lines.join(' ');
}

/* ------------------------------------------------------------------ */
/* Conversational answers                                              */
/* ------------------------------------------------------------------ */

export const STARTER_PROMPTS = [
  'Plan my day',
  'When should I go outside?',
  'Will it rain today?',
  'What should I wear?',
  'Where are my free blocks?',
  'What should I do first?',
  'Is tomorrow better for the run?',
  'Summarise my week',
];

export function localAnswer(question: string, ctx: PlanContext): { text: string; chips: string[] } {
  const q = question.toLowerCase();
  const { weather, events, tasks, settings, place, now } = ctx;
  const cur = weather.current;
  const sorted = sortEvents(events.filter((e) => !e.allDay));
  const open = tasks.filter((t) => !t.done);
  const rain = rainWindow(weather);
  const window = bestOutdoorWindow(weather, dateKey(now));
  const gaps = freeGaps(sorted);
  const chipsDefault = ['Plan my day', 'What should I wear?', 'Free blocks'];

  const has = (...k: string[]) => k.some((x) => q.includes(x));

  if (has('plan my day', 'plan the day', 'brief', 'summary of today', 'how does my day')) {
    const g = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    const outdoorTasks = open.filter((t) => t.context === 'outdoor');
    const parts = [
      `Here's how I'd shape today in ${place.name}:`,
      ``,
      `\u2022 Weather: ${condition(cur.code).label}, ${fmtTemp(cur.temp, settings.tempUnit)}, comfort ${comfortScore(cur)}/100.`,
      sorted.length
        ? `\u2022 Anchors: ${sorted.slice(0, 3).map((e) => `${e.title} at ${minutesToLabel(e.startMinutes, settings.use24h)}`).join(', ')}${sorted.length > 3 ? ` +${sorted.length - 3} more` : ''}.`
        : `\u2022 Anchors: none scheduled \u2014 you own the whole day.`,
      g ? `\u2022 Deep work: ${minutesToLabel(g.start, settings.use24h)}\u2013${minutesToLabel(g.end, settings.use24h)} is your longest clear block. Put ${open.find((t) => t.priority === 'urgent' || t.priority === 'high')?.title ?? 'your hardest task'} there.` : '',
      window && outdoorTasks.length
        ? `\u2022 Outside: ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)} scores ${window.score}/100 \u2014 batch ${outdoorTasks.map((t) => `\u201C${t.title}\u201D`).slice(0, 2).join(' and ')} then.`
        : window ? `\u2022 Outside: ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)} is the nicest stretch. Take a walk.` : '',
      rain ? `\u2022 Watch out: rain from ${formatTime(rain.start, settings.use24h)}, peaking at ${rain.peak}%.` : '',
      ``,
      `If you only finish one thing, make it ${open[0]?.title ?? 'a genuine break'}.`,
    ].filter(Boolean);
    return { text: parts.join('\n'), chips: ['Move something outdoors', 'What should I wear?', 'Free blocks'] };
  }

  if (has('rain', 'umbrella', 'wet')) {
    if (rain) {
      return {
        text: `Yes \u2014 rain is likely from ${formatTime(rain.start, settings.use24h)} through roughly ${formatTime(rain.end, settings.use24h)}, peaking at ${rain.peak}% probability.\n\nAnything outdoors before ${formatTime(rain.start, settings.use24h)} is safe. ${sorted.filter((e) => e.isOutdoor).length ? `Your outdoor commitments today: ${sorted.filter((e) => e.isOutdoor).map((e) => e.title).join(', ')}.` : ''} Take a shell rather than an umbrella if wind is above ${fmtWind(25, settings.windUnit)}.`,
        chips: ['Move my outdoor event', 'Best outdoor window', 'Add umbrella reminder'],
      };
    }
    const maxPop = Math.max(...nextHours(weather, 18).map((h) => h.pop), 0);
    return {
      text: `No meaningful rain expected. Highest precipitation probability in the next 18 hours is ${maxPop}%, which is background noise. Leave the umbrella at home.`,
      chips: ['Best outdoor window', 'Plan my day'],
    };
  }

  if (has('wear', 'dress', 'jacket', 'coat')) {
    const t = cur.temp;
    let layer = 'a light layer';
    if (t <= 2) layer = 'a heavy coat, gloves and something over your ears';
    else if (t <= 9) layer = 'a proper jacket over a mid layer';
    else if (t <= 16) layer = 'a light jacket you can take off indoors';
    else if (t <= 24) layer = 'one layer \u2014 long sleeves are enough';
    else layer = 'breathable, light clothing';
    const extras = [
      rain ? 'water-resistant shoes and a shell' : '',
      cur.uv >= 6 ? 'sunglasses and SPF 30+' : '',
      cur.wind >= 28 ? 'something wind-proof' : '',
    ].filter(Boolean);
    return {
      text: `It's ${fmtTemp(cur.temp, settings.tempUnit)} and feels like ${fmtTemp(cur.feelsLike, settings.tempUnit)} \u2014 go with ${layer}.${extras.length ? `\n\nAlso bring ${extras.join(', ')}.` : ''}\n\n${sorted.some((e) => e.isOutdoor) ? `You're outdoors for ${sorted.filter((e) => e.isOutdoor).map((e) => e.title).join(' and ')}, so plan for the full stretch, not just the commute.` : 'Most of your day is indoors, so prioritise comfort over coverage.'}`,
      chips: ['Will it rain today?', 'Plan my day'],
    };
  }

  if (has('outside', 'outdoor', 'walk', 'run', 'exercise', 'fresh air')) {
    if (window) {
      const outdoorTasks = open.filter((t) => t.context === 'outdoor');
      return {
        text: `Best window is ${formatTime(window.start, settings.use24h)}\u2013${formatTime(window.end, settings.use24h)} with a conditions score of ${window.score}/100.\n\n${gaps.some((g) => g.start <= new Date(window.start).getHours() * 60 && g.end >= new Date(window.end).getHours() * 60) ? 'Your calendar is clear then, so nothing to move.' : 'You have something scheduled around then \u2014 the next best option is a short break between blocks.'}${outdoorTasks.length ? `\n\nStack these while you're out: ${outdoorTasks.map((t) => t.title).join(', ')}.` : ''}`,
        chips: ['Add an outdoor task', 'Will it rain today?', 'Plan my day'],
      };
    }
    return { text: 'Conditions are poor for outdoor time across the next 12 hours. I would keep today indoors and revisit tomorrow morning.', chips: chipsDefault };
  }

  if (has('free', 'gap', 'available', 'block', 'time for')) {
    if (!gaps.length) return { text: 'You have no free block longer than 30 minutes between 8am and 9pm. That is a signal, not a schedule \u2014 consider dropping one commitment.', chips: ['Review my day', 'Plan my day'] };
    return {
      text: `Free blocks today:\n\n${gaps.map((g) => `\u2022 ${minutesToLabel(g.start, settings.use24h)}\u2013${minutesToLabel(g.end, settings.use24h)} (${Math.round((g.end - g.start) / 60 * 10) / 10}h)`).join('\n')}\n\nThat's ${Math.round(gaps.reduce((a, g) => a + g.end - g.start, 0) / 60 * 10) / 10} hours of usable space against ${open.length} open ${pluralize(open.length, 'task')}.`,
      chips: ['What should I do first?', 'Plan my day'],
    };
  }

  if (has('first', 'priority', 'most important', 'focus on', 'start with')) {
    const ranked = [...open].sort((a, b) => {
      const p: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return p[a.priority] - p[b.priority] || (a.dueMinutes ?? 1440) - (b.dueMinutes ?? 1440);
    });
    if (!ranked.length) return { text: 'Nothing open. Genuinely \u2014 your list is clear. Rest counts as a valid next action.', chips: ['Add a task', 'Plan my day'] };
    const top = ranked[0];
    return {
      text: `Start with \u201C${top.title}\u201D.\n\nWhy: it's ${top.priority} priority${top.dueMinutes !== undefined ? `, due at ${minutesToLabel(top.dueMinutes, settings.use24h)}` : ''}${top.estimateMin ? `, and only needs about ${top.estimateMin} minutes` : ''}. ${top.context === 'outdoor' ? `It's outdoors, and conditions are ${comfortScore(cur)}/100 right now \u2014 go before that changes.` : `It's indoor work, so weather isn't a constraint.`}\n\nAfter that: ${ranked.slice(1, 3).map((t) => t.title).join(', ') || 'you are clear'}.`,
      chips: ['Free blocks', 'Plan my day'],
    };
  }

  if (has('tomorrow')) {
    const tmr = weather.daily[1];
    if (tmr) {
      const c2 = condition(tmr.code);
      const better = c2.outdoorScore > condition(cur.code).outdoorScore;
      return {
        text: `Tomorrow: ${c2.label}, ${fmtTemp(tmr.min, settings.tempUnit)} to ${fmtTemp(tmr.max, settings.tempUnit)}, ${tmr.pop}% chance of precipitation, UV up to ${Math.round(tmr.uvMax)}.\n\n${better ? 'That is better than today for anything outdoors \u2014 worth shifting the run.' : 'Today is actually the better outdoor day, so do not defer.'}`,
        chips: ['Plan my day', 'Best outdoor window'],
      };
    }
  }

  if (has('week', 'next 7', 'coming days')) {
    return {
      text: `Week ahead in ${place.name}:\n\n${weather.daily.slice(0, 7).map((d) => `\u2022 ${new Date(d.time).toLocaleDateString(undefined, { weekday: 'short' })} \u2014 ${condition(d.code).short}, ${fmtTemp(d.min, settings.tempUnit)}/${fmtTemp(d.max, settings.tempUnit)}, ${d.pop}% rain`).join('\n')}\n\nBest outdoor day looks like ${bestDayLabel(weather)}.`,
      chips: ['Plan my day', 'Is tomorrow better for the run?'],
    };
  }

  if (has('event', 'meeting', 'calendar', 'schedule')) {
    if (!sorted.length) return { text: 'Nothing on the calendar today. Your first commitment is whatever you decide it is.', chips: ['Plan my day', 'Add a task'] };
    return {
      text: `Today's schedule:\n\n${sorted.map((e) => `\u2022 ${minutesToLabel(e.startMinutes, settings.use24h)}\u2013${minutesToLabel(e.endMinutes, settings.use24h)} \u2014 ${e.title}${e.isOutdoor ? ' (outdoor)' : ''}`).join('\n')}\n\nTotal booked: ${Math.round(dayLoad(sorted) / 60 * 10) / 10}h. Free: ${Math.round(gaps.reduce((a, g) => a + g.end - g.start, 0) / 60 * 10) / 10}h.`,
      chips: ['Free blocks', 'Plan my day'],
    };
  }

  if (has('task', 'todo', 'to-do', 'list')) {
    if (!open.length) return { text: 'No open tasks today. That is a clean slate, not an oversight.', chips: ['Add a task', 'Plan my day'] };
    return {
      text: `${open.length} open ${pluralize(open.length, 'task')}:\n\n${open.slice(0, 6).map((t) => `\u2022 ${t.title} \u2014 ${t.priority}${t.context === 'outdoor' ? ', outdoor' : ''}`).join('\n')}\n\n${open.filter((t) => t.context === 'outdoor').length ? `The outdoor ones pair well with ${window ? `${formatTime(window.start, settings.use24h)}` : 'the early afternoon'}.` : 'All indoor \u2014 weather is not a blocker today.'}`,
      chips: ['What should I do first?', 'Plan my day'],
    };
  }

  if (has('hello', 'hi ', 'hey', 'good morning')) {
    return {
      text: `Hello. In ${place.name} it's ${fmtTemp(cur.temp, settings.tempUnit)} and ${condition(cur.code).label.toLowerCase()}. You have ${sorted.length} ${pluralize(sorted.length, 'event')} and ${open.length} open ${pluralize(open.length, 'task')} today. Want me to shape a plan?`,
      chips: STARTER_PROMPTS.slice(0, 3),
    };
  }

  // Generic synthesis fallback
  return {
    text: `${generateBriefing(ctx)}\n\nAsk me to plan the day, find free blocks, or check whether the weather will interfere with something specific.`,
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
/* Optional live Gemini call                                           */
/* ------------------------------------------------------------------ */

export function buildSystemContext(ctx: PlanContext) {
  const { weather, events, tasks, place, settings, now } = ctx;
  const cur = weather.current;
  return [
    `You are Smart Suggestion, a calm, precise daily-planning assistant. Combine weather, calendar and tasks into short actionable guidance. Never invent data.`,
    `Location: ${place.name}${place.region ? `, ${place.region}` : ''}. Local time: ${formatTime(now, settings.use24h)}.`,
    `Now: ${condition(cur.code).label}, ${Math.round(cur.temp)}C (feels ${Math.round(cur.feelsLike)}C), humidity ${cur.humidity}%, wind ${Math.round(cur.wind)}km/h, UV ${cur.uv}.`,
    `Next 12h: ${nextHours(weather, 12).map((h) => `${new Date(h.time).getHours()}h ${Math.round(h.temp)}C ${h.pop}%`).join('; ')}`,
    `Today's events: ${events.length ? events.map((e) => `${e.title} ${minutesToLabel(e.startMinutes)}-${minutesToLabel(e.endMinutes)}${e.isOutdoor ? ' (outdoor)' : ''}`).join('; ') : 'none'}`,
    `Open tasks: ${tasks.filter((t) => !t.done).map((t) => `${t.title} [${t.priority}${t.context === 'outdoor' ? ', outdoor' : ''}]`).join('; ') || 'none'}`,
    `Tone: ${settings.geminiTone}. Use short paragraphs and bullet points. Max 160 words.`,
  ].join('\n');
}

export async function askGemini(question: string, ctx: PlanContext): Promise<{ text: string; chips: string[]; live: boolean }> {
  const key = ctx.settings.geminiKey?.trim();
  if (!key) {
    const local = localAnswer(question, ctx);
    return { ...local, live: false };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemContext(ctx) }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    if (!text) throw new Error('empty');
    return { text: text.trim(), chips: ['Plan my day', 'Free blocks', 'What should I wear?'], live: true };
  } catch {
    const local = localAnswer(question, ctx);
    return { ...local, live: false };
  }
}
