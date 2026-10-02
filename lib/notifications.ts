import { Platform } from 'react-native';
import { CalEvent, Settings, Task } from './types';
import { minutesToLabel } from './utils';

export interface ScheduledNotification {
  id: string; // user + type + targetId + triggerTimestamp
  userId: string;
  targetId: string;
  type: 'task' | 'event';
  title: string;
  body: string;
  triggerTimestamp: number;
  scheduledAt: number;
  fired?: boolean;
}

const STORAGE_KEY = '@weatherwhattodo/scheduled_notifications_v1';

// In-memory cache of scheduled notifications
let memoryStore: ScheduledNotification[] = [];
let initialized = false;
let checkInterval: any = null;

function loadStoredNotifications(): ScheduledNotification[] {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Notifications] Failed to load notifications from storage:', e);
    }
  }
  return memoryStore;
}

function saveStoredNotifications(list: ScheduledNotification[]): void {
  memoryStore = list;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[Notifications] Failed to persist notifications:', e);
    }
  }
}

/** Converts date string (YYYY-MM-DD) and minutes from midnight to unix epoch timestamp */
export function parseDateTimeToMs(dateStr: string, minutes: number): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return NaN;
  }
  const [y, m, d] = parts;
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  const dateObj = new Date(y, m - 1, d, hour, min, 0, 0);
  return dateObj.getTime();
}

/** Check platform notification permission */
export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    return window.Notification.permission;
  }
  return 'unsupported';
}

/** Request notification permission from browser */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const perm = await window.Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

/** Fire a notification right now using available platform API */
export function firePlatformNotification(title: string, body: string, tag?: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (window.Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, {
              body,
              icon: '/favicon.ico',
              tag: tag || 'weatherwhattodo',
              badge: '/favicon.ico',
            });
          }).catch(() => {
            new window.Notification(title, {
              body,
              icon: '/favicon.ico',
              tag: tag || 'weatherwhattodo',
            });
          });
        } else {
          new window.Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: tag || 'weatherwhattodo',
          });
        }
      } catch (err) {
        console.warn('[Notifications] Could not display system notification:', err);
      }
    }
  }
}

/** Check and dispatch any due notifications */
export function tickNotifications(): void {
  const now = Date.now();
  const all = loadStoredNotifications();
  let changed = false;

  const remaining: ScheduledNotification[] = [];

  for (const item of all) {
    // If notification has already fired, drop it
    if (item.fired) {
      changed = true;
      continue;
    }

    // If trigger time was in the distant past (> 10 minutes ago, e.g. device was turned off),
    // do not flood user with stale notifications (Rule 10: do not immediately fire outdated notifications)
    if (item.triggerTimestamp < now - 10 * 60 * 1000) {
      changed = true;
      continue;
    }

    // If trigger time has arrived (within the current time window)
    if (item.triggerTimestamp <= now) {
      firePlatformNotification(item.title, item.body, item.id);
      item.fired = true;
      changed = true;
    } else {
      remaining.push(item);
    }
  }

  if (changed) {
    saveStoredNotifications(remaining);
  }
}

/**
 * Initialize notification engine
 * Starts periodic checks and listens to visibility change
 */
export function initNotificationEngine(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // Initial purge of stale notifications and trigger check
  tickNotifications();

  // Run check every 10 seconds
  if (typeof window !== 'undefined') {
    checkInterval = setInterval(tickNotifications, 10000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tickNotifications();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', onVisible);
      initialized = false;
    };
  }

  return () => {
    initialized = false;
  };
}

/* ========================================================================== */
/*                             TASK NOTIFICATIONS                             */
/* ========================================================================== */

/**
 * Calculates reminder time and schedules a notification for an upcoming task.
 * Stable ID: ${userId}_task_${task.id}_${triggerTimestamp}
 */
export function scheduleTaskNotification(
  task: Task,
  userId: string,
  settings: Settings
): ScheduledNotification | null {
  // Respect settings
  if (!settings.notifications.taskReminders) {
    return null;
  }

  // Never notify for completed or deleted tasks
  if (task.done || task.completed) {
    return null;
  }

  // Never notify for tasks without meaningful due date and due time
  if (!task.dueDate || task.dueMinutes === undefined) {
    return null;
  }

  const dueTimestamp = parseDateTimeToMs(task.dueDate, task.dueMinutes);
  if (isNaN(dueTimestamp)) {
    return null;
  }

  // Reminder offset (default 30 mins before, or user selected minutes)
  const offsetMinutes = task.reminderMinutesBefore !== undefined ? task.reminderMinutesBefore : 30;
  const triggerTimestamp = dueTimestamp - offsetMinutes * 60 * 1000;

  // Never schedule notifications in the past
  if (triggerTimestamp <= Date.now()) {
    return null;
  }

  // Cancel any existing notification for this task first to avoid duplicates
  cancelTaskNotification(task.id, userId);

  const stableId = `${userId}_task_${task.id}_${triggerTimestamp}`;

  let title = 'Task coming up';
  let body = `"${task.title}" is due in ${offsetMinutes} minutes.`;
  if (offsetMinutes === 0) {
    title = 'Task reminder';
    body = `"${task.title}" is due now at ${minutesToLabel(task.dueMinutes, settings.use24h)}.`;
  } else if (offsetMinutes >= 60) {
    title = 'Task reminder';
    const hours = Math.round(offsetMinutes / 60);
    body = `"${task.title}" is due in ${hours} hour${hours > 1 ? 's' : ''}.`;
  }

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: task.id,
    type: 'task',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
  };

  const list = loadStoredNotifications();
  // Filter out any duplicate with the same ID
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/**
 * Cancel pending notifications for a specific task
 */
export function cancelTaskNotification(taskId: string, userId?: string): void {
  const list = loadStoredNotifications();
  const next = list.filter((n) => {
    if (n.targetId !== taskId || n.type !== 'task') return true;
    if (userId && n.userId !== userId) return true;
    return false;
  });
  if (next.length !== list.length) {
    saveStoredNotifications(next);
  }
}

/**
 * Reschedule notification for a task (e.g. after edit or toggle)
 */
export function rescheduleTaskNotification(
  task: Task,
  userId: string,
  settings: Settings
): ScheduledNotification | null {
  cancelTaskNotification(task.id, userId);
  return scheduleTaskNotification(task, userId, settings);
}

/* ========================================================================== */
/*                            EVENT NOTIFICATIONS                             */
/* ========================================================================== */

/**
 * Calculates reminder time and schedules a notification for an upcoming event.
 * Stable ID: ${userId}_event_${event.id}_${triggerTimestamp}
 */
export function scheduleEventNotification(
  event: CalEvent,
  userId: string,
  settings: Settings
): ScheduledNotification | null {
  // Respect settings
  if (!settings.notifications.eventAlerts) {
    return null;
  }

  if (!event.date) {
    return null;
  }

  // All day events start at 9:00 AM for notification purposes if not specified
  const startMins = event.allDay ? 9 * 60 : (event.startMinutes ?? 9 * 60);
  const startTimestamp = parseDateTimeToMs(event.date, startMins);
  if (isNaN(startTimestamp)) {
    return null;
  }

  // Never notify for events in the past
  if (startTimestamp <= Date.now()) {
    return null;
  }

  // Reminder offset (default 30 mins before, or user selected minutes)
  const offsetMinutes = event.reminderMinutesBefore !== undefined ? event.reminderMinutesBefore : 30;
  const triggerTimestamp = startTimestamp - offsetMinutes * 60 * 1000;

  // Never schedule notifications in the past
  if (triggerTimestamp <= Date.now()) {
    return null;
  }

  // Cancel any existing notification for this event first to avoid duplicates
  cancelEventNotification(event.id, userId);

  const stableId = `${userId}_event_${event.id}_${triggerTimestamp}`;

  let title = 'Upcoming event';
  let body = `"${event.title}" starts in ${offsetMinutes} minutes.`;
  if (offsetMinutes === 0) {
    title = 'Event reminder';
    body = `"${event.title}" starts now.`;
  } else if (offsetMinutes >= 60) {
    title = 'Event reminder';
    const hours = Math.round(offsetMinutes / 60);
    body = `"${event.title}" starts in ${hours} hour${hours > 1 ? 's' : ''}.`;
  }

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: event.id,
    type: 'event',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
  };

  const list = loadStoredNotifications();
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/**
 * Cancel pending notifications for a specific event
 */
export function cancelEventNotification(eventId: string, userId?: string): void {
  const list = loadStoredNotifications();
  const next = list.filter((n) => {
    if (n.targetId !== eventId || n.type !== 'event') return true;
    if (userId && n.userId !== userId) return true;
    return false;
  });
  if (next.length !== list.length) {
    saveStoredNotifications(next);
  }
}

/**
 * Reschedule notification for an event (e.g. after edit or time change)
 */
export function rescheduleEventNotification(
  event: CalEvent,
  userId: string,
  settings: Settings
): ScheduledNotification | null {
  cancelEventNotification(event.id, userId);
  return scheduleEventNotification(event, userId, settings);
}

/* ========================================================================== */
/*                             USER ISOLATION & CLEANUP                       */
/* ========================================================================== */

/**
 * Cancels and clears all scheduled notifications for a user upon sign out.
 */
export function clearUserNotifications(userId: string): void {
  const list = loadStoredNotifications();
  const next = list.filter((n) => n.userId !== userId);
  saveStoredNotifications(next);
}

/**
 * Cleans up notifications associated with Google data when Google sync is disconnected
 */
export function clearGoogleNotifications(userId: string): void {
  const list = loadStoredNotifications();
  const next = list.filter((n) => {
    if (n.userId !== userId) return true;
    // Target IDs starting with gcal_ or gtask_ are Google-synced
    if (n.targetId.startsWith('gcal_') || n.targetId.startsWith('gtask_')) return false;
    return true;
  });
  saveStoredNotifications(next);
}

/**
 * Synchronizes scheduled notifications with current tasks and events for the active user.
 * Ensures no orphan notifications remain and all valid upcoming items have scheduled reminders.
 */
export function syncAllNotifications(
  tasks: Task[],
  events: CalEvent[],
  userId: string,
  settings: Settings
): void {
  const validTaskIds = new Set(tasks.map((t) => t.id));
  const validEventIds = new Set(events.map((e) => e.id));

  // 1. Remove orphan notifications for deleted tasks or events
  const list = loadStoredNotifications();
  const cleaned = list.filter((n) => {
    if (n.userId !== userId) return true;
    if (n.type === 'task' && !validTaskIds.has(n.targetId)) return false;
    if (n.type === 'event' && !validEventIds.has(n.targetId)) return false;
    return true;
  });
  saveStoredNotifications(cleaned);

  // 2. Schedule notifications for all upcoming valid tasks
  if (settings.notifications.taskReminders) {
    for (const t of tasks) {
      if (!t.done && !t.completed && t.dueDate && t.dueMinutes !== undefined) {
        scheduleTaskNotification(t, userId, settings);
      }
    }
  }

  // 3. Schedule notifications for all upcoming events
  if (settings.notifications.eventAlerts) {
    for (const e of events) {
      if (e.date) {
        scheduleEventNotification(e, userId, settings);
      }
    }
  }
}
