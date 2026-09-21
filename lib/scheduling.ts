import { CalEvent } from './types';
import { WeatherBundle, condition, hoursForDay, HourPoint } from './weather';
import { formatTime } from './utils';

export interface BestWindowProposal {
  status: 'success' | 'no_window' | 'no_weather' | 'no_calendar';
  startMinutes?: number;
  endMinutes?: number;
  currentPeakPop?: number;
  bestPeakPop?: number;
  reason?: string;
  explanation?: string;
  message?: string;
}

interface WindowCandidate {
  startMinutes: number;
  endMinutes: number;
  peakPop: number;
  hasThunderstorm: boolean;
  hasRain: boolean;
  avgTemp: number;
  maxWind: number;
  score: number;
  weatherCondition: string;
}

/**
 * Calculates the best weather-friendly time window for an event that does NOT conflict with existing calendar events.
 */
export function findBestEventWindow(params: {
  eventDate: string;
  currentStart: number;
  currentEnd: number;
  weather: WeatherBundle | null;
  events: CalEvent[];
  excludeEventId?: string;
  use24h?: boolean;
}): BestWindowProposal {
  const { eventDate, currentStart, currentEnd, weather, events, excludeEventId, use24h = false } = params;

  if (!weather || !weather.daily?.length) {
    return {
      status: 'no_weather',
      message: "We can't check the weather right now, so I can't reliably find a better window.",
    };
  }

  if (!Array.isArray(events)) {
    return {
      status: 'no_calendar',
      message: "I can't check your schedule right now. Please try again.",
    };
  }

  // 1. Determine duration
  let duration = currentEnd - currentStart;
  if (duration <= 0 || isNaN(duration)) {
    duration = 60;
  }
  // Clamp duration to at most 12 hours
  duration = Math.min(duration, 12 * 60);

  // 2. Retrieve hourly forecast for the event date
  const dayHours = hoursForDay(weather, eventDate);
  if (!dayHours || dayHours.length === 0) {
    return {
      status: 'no_weather',
      message: "We can't check the weather right now, so I can't reliably find a better window.",
    };
  }

  // Existing calendar events on the same day (excluding current event being edited)
  const dayEvents = events.filter((e) => {
    if (excludeEventId && e.id === excludeEventId) return false;
    return e.date === eventDate && !e.allDay;
  });

  // Helper to check if a slot [start, end] conflicts with any calendar event
  const hasCalendarConflict = (start: number, end: number): boolean => {
    return dayEvents.some((e) => {
      const eStart = e.startMinutes ?? 0;
      const eEnd = e.endMinutes ?? eStart + 60;
      return start < eEnd && end > eStart;
    });
  };

  // Helper to extract weather metrics for a slot [start, end]
  const getWeatherForSlot = (start: number, end: number) => {
    const startHour = Math.floor(start / 60);
    const endHour = Math.ceil(end / 60);

    const slotHours: HourPoint[] = [];
    for (const h of dayHours) {
      const d = new Date(h.time);
      const hh = d.getHours();
      if (hh >= startHour && hh < endHour) {
        slotHours.push(h);
      }
    }

    if (!slotHours.length) {
      // Fallback to closest hour
      const targetH = Math.min(23, Math.max(0, startHour));
      const closest = dayHours.find((h) => new Date(h.time).getHours() === targetH) || dayHours[0];
      if (closest) slotHours.push(closest);
    }

    const peakPop = slotHours.length ? Math.max(...slotHours.map((h) => h.pop)) : 0;
    const hasThunderstorm = slotHours.some((h) => [95, 96, 99].includes(h.code));
    const hasRain = slotHours.some((h) => (h.code >= 51 && h.code <= 67) || (h.code >= 80 && h.code <= 82));
    const avgTemp = slotHours.reduce((sum, h) => sum + h.temp, 0) / (slotHours.length || 1);
    const maxWind = slotHours.length ? Math.max(...slotHours.map((h) => h.wind)) : 0;
    const worstCode = slotHours.length ? slotHours.reduce((prev, curr) => (curr.pop > prev.pop ? curr : prev)).code : 0;

    return {
      peakPop,
      hasThunderstorm,
      hasRain,
      avgTemp,
      maxWind,
      conditionLabel: condition(worstCode).label,
    };
  };

  // Analyze current slot
  const currentSlotWeather = getWeatherForSlot(currentStart, currentEnd);

  // 3. Scan potential candidate slots between 07:00 AM (420 mins) and 09:00 PM (1260 mins)
  // Step by 30-minute intervals
  const candidates: WindowCandidate[] = [];
  const earliestStart = 7 * 60; // 7:00 AM
  const latestEnd = 21 * 60; // 9:00 PM
  const maxStart = latestEnd - duration;

  for (let candStart = earliestStart; candStart <= maxStart; candStart += 30) {
    const candEnd = candStart + duration;

    // STEP 4: Check user calendar for conflicts
    if (hasCalendarConflict(candStart, candEnd)) {
      continue; // Skip conflicting slot
    }

    // Evaluate weather in this slot
    const w = getWeatherForSlot(candStart, candEnd);

    // Compute weather score (higher is better)
    let score = 100;

    // Heavy penalty for rain
    score -= w.peakPop * 1.3;

    // Extreme penalty for thunderstorms
    if (w.hasThunderstorm) score -= 60;
    else if (w.hasRain) score -= 25;

    // Comfort temperature penalty (ideal: 17°C - 28°C)
    if (w.avgTemp < 15) score -= (15 - w.avgTemp) * 2;
    if (w.avgTemp > 30) score -= (w.avgTemp - 30) * 2.5;

    // High wind penalty (> 25 km/h)
    if (w.maxWind > 25) score -= (w.maxWind - 25);

    // Slight preference for daylight/afternoon hours over very early morning
    if (candStart >= 9 * 60 && candStart <= 18 * 60) score += 5;

    // Slight preference for slots closer to original time (tie-breaker)
    const timeDeltaHours = Math.abs(candStart - currentStart) / 60;
    score -= Math.min(5, timeDeltaHours * 0.5);

    candidates.push({
      startMinutes: candStart,
      endMinutes: candEnd,
      peakPop: w.peakPop,
      hasThunderstorm: w.hasThunderstorm,
      hasRain: w.hasRain,
      avgTemp: w.avgTemp,
      maxWind: w.maxWind,
      score,
      weatherCondition: w.conditionLabel,
    });
  }

  // If no conflict-free candidate slot exists at all
  if (candidates.length === 0) {
    return {
      status: 'no_window',
      message: "I couldn't find a weather-friendly window that doesn't conflict with your calendar.",
    };
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];

  // Check if best candidate actually improves weather significantly over current slot
  // If current slot is already dry (< 25% rain, no thunderstorm) OR if best is not meaningfully better
  const popImprovement = currentSlotWeather.peakPop - best.peakPop;
  const thunderstormAvoided = currentSlotWeather.hasThunderstorm && !best.hasThunderstorm;

  // If the event isn't actually in danger (low rain and no storm), or if best window is not noticeably better
  if (currentSlotWeather.peakPop <= 30 && !currentSlotWeather.hasThunderstorm && !hasCalendarConflict(currentStart, currentEnd)) {
    // Current slot is already good
    return {
      status: 'no_window',
      message: "Your current time slot already has favorable weather and no calendar conflicts.",
    };
  }

  // If the best available candidate still has terrible weather (e.g. 80%+ rain or thunderstorm across the whole day)
  if (best.peakPop > 75 && best.hasThunderstorm) {
    return {
      status: 'no_window',
      message: "I couldn't find a weather-friendly window that doesn't conflict with your calendar.",
    };
  }

  const startLabel = formatTime(new Date(2000, 0, 1, Math.floor(best.startMinutes / 60), best.startMinutes % 60), use24h);
  const endLabel = formatTime(new Date(2000, 0, 1, Math.floor(best.endMinutes / 60), best.endMinutes % 60), use24h);

  let reason = `It's the driest available window (${best.peakPop}% rain risk) and doesn't conflict with your calendar.`;
  if (thunderstormAvoided) {
    reason = `Avoids thunderstorms with lower rain chance (${best.peakPop}%) and zero calendar conflicts.`;
  } else if (popImprovement >= 30) {
    reason = `Peak rain chance drops from ${currentSlotWeather.peakPop}% down to ${best.peakPop}%, with no calendar conflicts.`;
  }

  return {
    status: 'success',
    startMinutes: best.startMinutes,
    endMinutes: best.endMinutes,
    currentPeakPop: currentSlotWeather.peakPop,
    bestPeakPop: best.peakPop,
    reason,
    explanation: `Best available window: ${startLabel}–${endLabel}. Lower rain probability and no calendar conflicts.`,
  };
}
