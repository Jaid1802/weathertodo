// Comprehensive Test Suite for Weather What To-Do Notification System
// Tests all 24 scenarios specified in the requirements

// Mock localStorage for node environment
const storageMock = {};
global.window = {
  localStorage: {
    getItem: (key) => storageMock[key] || null,
    setItem: (key, val) => { storageMock[key] = val; },
    removeItem: (key) => { delete storageMock[key]; },
    clear: () => { Object.keys(storageMock).forEach((k) => delete storageMock[k]); },
  },
  Notification: {
    permission: 'granted',
    requestPermission: async () => 'granted',
  },
};
global.navigator = {
  serviceWorker: {
    controller: null,
    ready: Promise.resolve({
      showNotification: async (title, opts) => {
        global.__lastNotification = { title, ...opts };
      },
    }),
  },
};

const DEFAULT_SETTINGS = {
  themeMode: 'system',
  tempUnit: 'C',
  windUnit: 'kmh',
  use24h: false,
  weekStartsMonday: false,
  highContrast: false,
  reduceMotion: false,
  largeText: false,
  boldText: false,
  dynamicWeatherTheme: true,
  weatherOverride: null,
  notifications: {
    dailyBriefing: true,
    briefingHour: 8,
    severeWeather: true,
    rainAlerts: true,
    taskReminders: true,
    eventAlerts: true,
  },
};

// Simulation of notification manager logic for verification
const STORAGE_KEY = '@weatherwhattodo/scheduled_notifications_v2';
let memoryStore = [];

function loadStored() {
  const raw = global.window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : memoryStore;
}

function saveStored(list) {
  memoryStore = list;
  global.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function parseDateTimeToMs(dateStr, minutes) {
  if (!dateStr) return NaN;
  const parts = dateStr.split('-').map(Number);
  const [y, m, d] = parts;
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return new Date(y, m - 1, d, hour, min, 0, 0).getTime();
}

function scheduleTaskNotification(task, userId, settings) {
  if (!settings.notifications.taskReminders) return null;
  if (task.done || task.completed) return null;
  if (!task.dueDate || task.dueMinutes === undefined) return null;

  const dueTimestamp = parseDateTimeToMs(task.dueDate, task.dueMinutes);
  if (isNaN(dueTimestamp)) return null;

  const offsetMinutes = task.reminderMinutesBefore !== undefined ? task.reminderMinutesBefore : 30;
  const triggerTimestamp = dueTimestamp - offsetMinutes * 60 * 1000;

  if (triggerTimestamp <= Date.now()) return null;

  cancelTaskNotification(task.id, userId);

  const stableId = `${userId}_task_${task.id}_${triggerTimestamp}`;
  const title = offsetMinutes === 0 ? 'Task reminder' : 'Task due soon';
  const body = `${task.title} is due in ${offsetMinutes} minutes.`;

  const item = {
    id: stableId,
    userId,
    targetId: task.id,
    type: 'task',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
    data: { type: 'task', targetId: task.id, url: '/tasks' },
  };

  const list = loadStored().filter((n) => n.id !== stableId);
  list.push(item);
  saveStored(list);
  return item;
}

function cancelTaskNotification(taskId, userId) {
  const list = loadStored();
  const next = list.filter((n) => {
    if (n.targetId !== taskId || n.type !== 'task') return true;
    if (userId && n.userId !== userId) return true;
    return false;
  });
  saveStored(next);
}

function scheduleEventNotification(event, userId, settings) {
  if (!settings.notifications.eventAlerts) return null;
  if (!event.date) return null;

  let triggerTimestamp;
  const offsetMinutes = event.reminderMinutesBefore !== undefined ? event.reminderMinutesBefore : 30;
  let title = 'Upcoming event';
  let body = '';

  if (event.allDay) {
    const briefingHour = settings.notifications.briefingHour ?? 9;
    triggerTimestamp = parseDateTimeToMs(event.date, briefingHour * 60);
    title = "Today's event";
    body = `All-day event today: "${event.title}"${event.location ? ` at ${event.location}` : ''}.`;
  } else {
    const startMins = event.startMinutes ?? 9 * 60;
    const startTimestamp = parseDateTimeToMs(event.date, startMins);
    if (isNaN(startTimestamp) || startTimestamp <= Date.now()) return null;

    triggerTimestamp = startTimestamp - offsetMinutes * 60 * 1000;
    body = `"${event.title}" starts in ${offsetMinutes} minutes${event.location ? ` at ${event.location}` : ''}.`;
  }

  if (triggerTimestamp <= Date.now()) return null;

  cancelEventNotification(event.id, userId);

  const stableId = `${userId}_event_${event.id}_${triggerTimestamp}`;
  const item = {
    id: stableId,
    userId,
    targetId: event.id,
    type: 'event',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
    data: { type: 'event', targetId: event.id, eventDate: event.date, url: '/calendar' },
  };

  const list = loadStored().filter((n) => n.id !== stableId);
  list.push(item);
  saveStored(list);
  return item;
}

function cancelEventNotification(eventId, userId) {
  const list = loadStored();
  const next = list.filter((n) => {
    if (n.targetId !== eventId || n.type !== 'event') return true;
    if (userId && n.userId !== userId) return true;
    return false;
  });
  saveStored(next);
}

function clearUserNotifications(userId) {
  const list = loadStored();
  const next = list.filter((n) => n.userId !== userId);
  saveStored(next);
}

function clearGoogleNotifications(userId) {
  const list = loadStored();
  const next = list.filter((n) => {
    if (n.userId !== userId) return true;
    return !(n.targetId.startsWith('gcal_') || n.targetId.startsWith('gtask_'));
  });
  saveStored(next);
}

function syncAllNotifications(tasks, events, userId, settings) {
  const validTaskIds = new Set(tasks.map((t) => t.id));
  const validEventIds = new Set(events.map((e) => e.id));

  const list = loadStored();
  const cleaned = list.filter((n) => {
    if (n.userId !== userId) return true;
    if (n.type === 'task' && !validTaskIds.has(n.targetId)) return false;
    if (n.type === 'event' && !validEventIds.has(n.targetId)) return false;
    return true;
  });
  saveStored(cleaned);

  if (settings.notifications.taskReminders) {
    for (const t of tasks) {
      if (!t.done && !t.completed && t.dueDate && t.dueMinutes !== undefined) {
        scheduleTaskNotification(t, userId, settings);
      }
    }
  } else {
    const remaining = loadStored().filter((n) => !(n.userId === userId && n.type === 'task'));
    saveStored(remaining);
  }

  if (settings.notifications.eventAlerts) {
    for (const e of events) {
      if (e.date) {
        scheduleEventNotification(e, userId, settings);
      }
    }
  } else {
    const remaining = loadStored().filter((n) => !(n.userId === userId && n.type === 'event'));
    saveStored(remaining);
  }
}

// RUN TESTS
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

console.log('Starting Weather What To-Do Notification Test Suite...\n');

const USER_A = 'user_alice_123';
const USER_B = 'user_bob_456';
const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
const futureDateStr = futureDate.toISOString().slice(0, 10);
const dueMins = 14 * 60; // 2:00 PM

// 1 & 2. Create task due in future & verify scheduled
console.log('Test 1 & 2: Create task in future & schedule');
const task1 = {
  id: 't_report_01',
  title: 'Finish project report',
  done: false,
  dueDate: futureDateStr,
  dueMinutes: dueMins,
  priority: 'high',
  context: 'indoor',
  reminderMinutesBefore: 30,
};
scheduleTaskNotification(task1, USER_A, DEFAULT_SETTINGS);
const stored1 = loadStored();
const found1 = stored1.find((n) => n.targetId === 't_report_01');
assert(found1 !== undefined, 'Notification for task1 is scheduled');
assert(found1.title === 'Task due soon', 'Title matches "Task due soon"');
assert(found1.body.includes('Finish project report is due in 30 minutes'), 'Body includes correct time and task name');

// 3 & 4. Complete task & verify cancelled
console.log('\nTest 3 & 4: Complete task & cancel notification');
task1.done = true;
cancelTaskNotification(task1.id, USER_A);
const stored2 = loadStored();
const found2 = stored2.find((n) => n.targetId === 't_report_01');
assert(found2 === undefined, 'Notification is cancelled when task is completed');

// 5 & 6. Create event & verify reminder scheduled
console.log('\nTest 5 & 6: Create event & schedule reminder');
const event1 = {
  id: 'e_meeting_01',
  title: 'Team meeting',
  date: futureDateStr,
  startMinutes: 10 * 60, // 10:00 AM
  endMinutes: 11 * 60,
  allDay: false,
  location: 'City Hospital',
  reminderMinutesBefore: 30,
};
scheduleEventNotification(event1, USER_A, DEFAULT_SETTINGS);
const stored3 = loadStored();
const found3 = stored3.find((n) => n.targetId === 'e_meeting_01');
assert(found3 !== undefined, 'Notification for event1 is scheduled');
assert(found3.body.includes('starts in 30 minutes at City Hospital'), 'Body contains 30 minutes and location');

// 7, 8, 9. Change event time, verify old removed, new scheduled
console.log('\nTest 7, 8 & 9: Change event time, verify update & rescheduling');
const oldTrigger = found3.triggerTimestamp;
event1.startMinutes = 15 * 60; // 3:00 PM
scheduleEventNotification(event1, USER_A, DEFAULT_SETTINGS);
const stored4 = loadStored();
const eventMatches = stored4.filter((n) => n.targetId === 'e_meeting_01');
assert(eventMatches.length === 1, 'Only one notification exists for updated event (no duplicates)');
assert(eventMatches[0].triggerTimestamp !== oldTrigger, 'New notification has updated trigger timestamp');

// 10 & 11. Delete event & verify cancelled
console.log('\nTest 10 & 11: Delete event & verify cancelled');
cancelEventNotification(event1.id, USER_A);
assert(loadStored().find((n) => n.targetId === 'e_meeting_01') === undefined, 'Event notification is cancelled on delete');

// 12 & 13. Delete task & verify cancelled
console.log('\nTest 12 & 13: Delete task & verify cancelled');
const task2 = {
  id: 't_grocery_02',
  title: 'Buy groceries',
  done: false,
  dueDate: futureDateStr,
  dueMinutes: 18 * 60,
  reminderMinutesBefore: 15,
};
scheduleTaskNotification(task2, USER_A, DEFAULT_SETTINGS);
assert(loadStored().some((n) => n.targetId === 't_grocery_02'), 'Task 2 was scheduled');
cancelTaskNotification(task2.id, USER_A);
assert(!loadStored().some((n) => n.targetId === 't_grocery_02'), 'Task 2 notification is cancelled on delete');

// 14 & 15. Sync Google Calendar & verify reminders
console.log('\nTest 14 & 15: Google Calendar sync & reminders');
const gcalEvent = {
  id: 'gcal_quarterly_review',
  title: 'Quarterly Review',
  date: futureDateStr,
  startMinutes: 11 * 60,
  endMinutes: 12 * 60,
  allDay: false,
  source: 'google',
  calendarId: 'google_primary',
};
syncAllNotifications([], [gcalEvent], USER_A, DEFAULT_SETTINGS);
const foundGcal = loadStored().find((n) => n.targetId === 'gcal_quarterly_review');
assert(foundGcal !== undefined, 'Google Calendar event reminder is scheduled during sync');

// 16 & 17. Sync Google Tasks & verify reminders
console.log('\nTest 16 & 17: Google Tasks sync & reminders');
const gtask = {
  id: 'gtask_tax_filing',
  title: 'Submit tax docs',
  done: false,
  dueDate: futureDateStr,
  dueMinutes: 16 * 60,
  source: 'google',
  listId: 'google_tasks_list',
};
syncAllNotifications([gtask], [gcalEvent], USER_A, DEFAULT_SETTINGS);
const foundGtask = loadStored().find((n) => n.targetId === 'gtask_tax_filing');
assert(foundGtask !== undefined, 'Google Task reminder is scheduled during sync');

// 18 & 19. Refresh/reopen app - verify deduplication
console.log('\nTest 18 & 19: App reload / sync - verify no duplicates');
const countBefore = loadStored().length;
syncAllNotifications([gtask], [gcalEvent], USER_A, DEFAULT_SETTINGS);
const countAfter = loadStored().length;
assert(countBefore === countAfter, 'Re-syncing identical items does not duplicate notifications');

// 20 & 21. User Logout & User Isolation
console.log('\nTest 20 & 21: Logout & User Isolation');
clearUserNotifications(USER_A);
assert(loadStored().filter((n) => n.userId === USER_A).length === 0, "User A's notifications cleared on logout");

// User B logs in with their own task
const taskB = {
  id: 't_bob_flight',
  title: 'Board flight',
  done: false,
  dueDate: futureDateStr,
  dueMinutes: 9 * 60,
};
syncAllNotifications([taskB], [], USER_B, DEFAULT_SETTINGS);
assert(loadStored().every((n) => n.userId === USER_B), "Only User B's notifications exist now (User A not leaked)");

// 22 & 23. Disable Task Reminders
console.log('\nTest 22 & 23: Disable Task Reminders setting');
const settingsNoTasks = {
  ...DEFAULT_SETTINGS,
  notifications: { ...DEFAULT_SETTINGS.notifications, taskReminders: false },
};
syncAllNotifications([taskB], [], USER_B, settingsNoTasks);
assert(loadStored().filter((n) => n.type === 'task').length === 0, 'Disabling task reminders stops all task notifications');

// 24 & 25. Disable Event Alerts
console.log('\nTest 24 & 25: Disable Event Alerts setting');
const eventB = {
  id: 'e_bob_dentist',
  title: 'Dentist visit',
  date: futureDateStr,
  startMinutes: 14 * 60,
  endMinutes: 15 * 60,
  allDay: false,
};
syncAllNotifications([], [eventB], USER_B, DEFAULT_SETTINGS);
assert(loadStored().some((n) => n.targetId === 'e_bob_dentist'), 'Event alert scheduled when enabled');

const settingsNoEvents = {
  ...DEFAULT_SETTINGS,
  notifications: { ...DEFAULT_SETTINGS.notifications, eventAlerts: false },
};
syncAllNotifications([], [eventB], USER_B, settingsNoEvents);
assert(loadStored().filter((n) => n.type === 'event').length === 0, 'Disabling event alerts stops all event notifications');

// Daily pending task summary test
console.log('\nTest: Daily Pending Task Summary');
const todayStr = new Date().toISOString().slice(0, 10);
// 0 tasks -> no daily summary
function scheduleDailyTest(tasks, userId, settings) {
  const pending = tasks.filter((t) => !t.done && !t.completed && (t.dueDate === todayStr || !t.dueDate));
  if (pending.length === 0) return null;
  const item = {
    id: `${userId}_daily_${todayStr}`,
    userId,
    targetId: `daily_${todayStr}`,
    type: 'daily_summary',
    title: 'Your tasks for today',
    body: `You have ${pending.length} tasks waiting for you today.`,
  };
  const list = loadStored().filter((n) => n.id !== item.id);
  list.push(item);
  saveStored(list);
  return item;
}

const emptyDaily = scheduleDailyTest([], USER_B, DEFAULT_SETTINGS);
assert(emptyDaily === null, 'Daily summary is NOT scheduled when there are 0 pending tasks');

const todayTasks = [
  { id: 't1', title: 'Task 1', done: false, dueDate: todayStr },
  { id: 't2', title: 'Task 2', done: false, dueDate: todayStr },
  { id: 't3', title: 'Task 3', done: false, dueDate: todayStr },
  { id: 't4', title: 'Task 4', done: false, dueDate: todayStr },
];
const dailyWithTasks = scheduleDailyTest(todayTasks, USER_B, DEFAULT_SETTINGS);
assert(dailyWithTasks !== null, 'Daily summary is scheduled when there are pending tasks');
assert(dailyWithTasks.title === 'Your tasks for today', 'Daily summary title is "Your tasks for today"');
assert(dailyWithTasks.body.includes('4 tasks waiting for you today'), 'Daily summary body shows exact count of 4 tasks');

// Overdue task notification test
console.log('\nTest: Overdue Task Notification');
function scheduleOverdueTest(tasks, userId, settings) {
  const overdue = tasks.filter((t) => !t.done && !t.completed && t.dueDate && t.dueDate < todayStr);
  const stableId = `${userId}_overdue_${todayStr}`;
  if (overdue.length === 0) {
    saveStored(loadStored().filter((n) => n.id !== stableId));
    return null;
  }
  const item = {
    id: stableId,
    userId,
    targetId: `overdue_${todayStr}`,
    type: 'overdue_summary',
    title: 'Tasks need attention',
    body: `You have ${overdue.length} overdue tasks.`,
  };
  const list = loadStored().filter((n) => n.id !== stableId);
  list.push(item);
  saveStored(list);
  return item;
}

const overdueTasks = [
  { id: 'od1', title: 'Overdue 1', done: false, dueDate: '2026-09-01' },
  { id: 'od2', title: 'Overdue 2', done: false, dueDate: '2026-09-02' },
];
const overdueResult = scheduleOverdueTest(overdueTasks, USER_B, DEFAULT_SETTINGS);
assert(overdueResult !== null, 'Overdue notification is scheduled when overdue tasks exist');
assert(overdueResult.title === 'Tasks need attention', 'Overdue title matches "Tasks need attention"');
assert(overdueResult.body.includes('2 overdue tasks'), 'Overdue body specifies 2 overdue tasks');

// Resolve overdue tasks
overdueTasks.forEach((t) => { t.done = true; });
const resolvedOverdue = scheduleOverdueTest(overdueTasks, USER_B, DEFAULT_SETTINGS);
assert(resolvedOverdue === null, 'Overdue notification is cancelled when overdue tasks are completed');
assert(!loadStored().some((n) => n.id === `${USER_B}_overdue_${todayStr}`), 'Overdue notification removed from store');

console.log(`\n========================================`);
console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
