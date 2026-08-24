import { CalEvent, CalendarInfo, Reminder, Task, TaskList } from './types';
import { addDays, dateKey, uid } from './utils';

export function seedLists(): TaskList[] {
  return [
    { id: 'inbox', name: 'Inbox', color: '#3B5BFF', icon: 'file-tray-full', source: 'local' },
    { id: 'work', name: 'Work', color: '#7B5BFF', icon: 'briefcase', source: 'local' },
    { id: 'personal', name: 'Personal', color: '#0FA968', icon: 'leaf', source: 'local' },
    { id: 'errands', name: 'Errands', color: '#E8890C', icon: 'bicycle', source: 'local' },
  ];
}

export function seedCalendars(): CalendarInfo[] {
  return [
    { id: 'cal_personal', name: 'Personal', color: '#3B5BFF', source: 'local', visible: true },
    { id: 'cal_work', name: 'Work', color: '#7B5BFF', source: 'local', visible: true },
    { id: 'cal_health', name: 'Health', color: '#0FA968', source: 'local', visible: true },
  ];
}

export function seedTasks(): Task[] {
  const today = dateKey(new Date());
  const tomorrow = dateKey(addDays(new Date(), 1));
  const in3 = dateKey(addDays(new Date(), 3));
  const now = Date.now();
  return [
    { id: uid('t'), title: 'Morning run along the waterfront', done: false, dueDate: today, dueMinutes: 7 * 60, priority: 'normal', context: 'outdoor', listId: 'personal', source: 'local', createdAt: now, estimateMin: 45 },
    { id: uid('t'), title: 'Finish Q3 roadmap deck', notes: 'Focus on the platform milestones section.', done: false, dueDate: today, dueMinutes: 11 * 60, priority: 'urgent', context: 'indoor', listId: 'work', source: 'local', createdAt: now, estimateMin: 90, subtasks: [ { id: uid('s'), title: 'Outline milestones', done: true }, { id: uid('s'), title: 'Add metrics slide', done: false } ] },
    { id: uid('t'), title: 'Pick up dry cleaning', done: false, dueDate: today, dueMinutes: 17 * 60 + 30, priority: 'normal', context: 'outdoor', listId: 'errands', source: 'google', createdAt: now, estimateMin: 20 },
    { id: uid('t'), title: 'Water the balcony plants', done: true, completedAt: now - 3600_000, dueDate: today, priority: 'low', context: 'outdoor', listId: 'personal', source: 'local', createdAt: now - 7200_000 },
    { id: uid('t'), title: 'Review design system tokens', done: false, dueDate: tomorrow, dueMinutes: 10 * 60, priority: 'high', context: 'indoor', listId: 'work', source: 'google', createdAt: now, estimateMin: 60 },
    { id: uid('t'), title: 'Book dentist appointment', done: false, dueDate: tomorrow, priority: 'normal', context: 'anywhere', listId: 'personal', source: 'local', createdAt: now },
    { id: uid('t'), title: 'Wash the car', done: false, dueDate: in3, priority: 'low', context: 'outdoor', listId: 'errands', source: 'local', createdAt: now, estimateMin: 40 },
    { id: uid('t'), title: 'Draft investor update', done: false, priority: 'high', context: 'indoor', listId: 'work', source: 'local', createdAt: now, estimateMin: 50 },
    { id: uid('t'), title: 'Plan weekend hike route', done: false, priority: 'normal', context: 'outdoor', listId: 'personal', source: 'local', createdAt: now, estimateMin: 25 },
  ];
}

export function seedEvents(): CalEvent[] {
  const t = dateKey(new Date());
  const t1 = dateKey(addDays(new Date(), 1));
  const t2 = dateKey(addDays(new Date(), 2));
  const t4 = dateKey(addDays(new Date(), 4));
  return [
    { id: uid('e'), title: 'Team standup', date: t, startMinutes: 9 * 60 + 30, endMinutes: 9 * 60 + 45, allDay: false, location: 'Video call', isOutdoor: false, kind: 'meeting', calendarId: 'cal_work', source: 'google', attendees: ['Maya', 'Dev', 'Ana'] },
    { id: uid('e'), title: 'Deep work: pricing model', date: t, startMinutes: 10 * 60, endMinutes: 12 * 60, allDay: false, isOutdoor: false, kind: 'focus', calendarId: 'cal_work', source: 'local' },
    { id: uid('e'), title: 'Lunch with Priya', date: t, startMinutes: 12 * 60 + 30, endMinutes: 13 * 60 + 30, allDay: false, location: 'Rooftop Garden Cafe', isOutdoor: true, kind: 'social', calendarId: 'cal_personal', source: 'google' },
    { id: uid('e'), title: 'Client review \u2014 Northwind', date: t, startMinutes: 15 * 60, endMinutes: 16 * 60, allDay: false, location: 'Studio 4', isOutdoor: false, kind: 'meeting', calendarId: 'cal_work', source: 'google', attendees: ['Sam', 'Jordan'] },
    { id: uid('e'), title: 'Evening tennis', date: t, startMinutes: 18 * 60 + 30, endMinutes: 20 * 60, allDay: false, location: 'Riverside Courts', isOutdoor: true, kind: 'health', calendarId: 'cal_health', source: 'local' },
    { id: uid('e'), title: 'Design critique', date: t1, startMinutes: 11 * 60, endMinutes: 12 * 60, allDay: false, isOutdoor: false, kind: 'meeting', calendarId: 'cal_work', source: 'google' },
    { id: uid('e'), title: 'Farmers market run', date: t1, startMinutes: 9 * 60, endMinutes: 10 * 60, allDay: false, location: 'Union Square', isOutdoor: true, kind: 'personal', calendarId: 'cal_personal', source: 'local' },
    { id: uid('e'), title: 'Flight to Seattle', date: t2, startMinutes: 7 * 60 + 15, endMinutes: 9 * 60 + 40, allDay: false, location: 'SFO T2', isOutdoor: false, kind: 'travel', calendarId: 'cal_personal', source: 'google' },
    { id: uid('e'), title: 'Trail run with Sam', date: t4, startMinutes: 7 * 60, endMinutes: 8 * 60 + 30, allDay: false, location: 'Coastal Ridge', isOutdoor: true, kind: 'health', calendarId: 'cal_health', source: 'local' },
  ];
}

export function seedReminders(): Reminder[] {
  const t = dateKey(new Date());
  return [
    { id: uid('r'), title: 'Take an umbrella', trigger: 'weather', weatherRule: 'rain', repeat: 'none', enabled: true, createdAt: Date.now() },
    { id: uid('r'), title: 'Stretch break', trigger: 'time', date: t, minutes: 15 * 60, repeat: 'weekdays', enabled: true, createdAt: Date.now() },
    { id: uid('r'), title: 'Buy oat milk', trigger: 'location', placeName: 'Grocery store', repeat: 'none', enabled: true, createdAt: Date.now() },
    { id: uid('r'), title: 'Apply sunscreen', trigger: 'weather', weatherRule: 'uv', repeat: 'daily', enabled: false, createdAt: Date.now() },
  ];
}
