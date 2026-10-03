import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CalEvent, Settings, Task } from './types';
import { dateKey, minutesToLabel } from './utils';
import { navigateToNotification, NotificationPayloadData } from './navigation';

export interface ScheduledNotification {
  id: string; // Deterministic: userId + type + targetId + triggerTimestamp
  userId: string;
  targetId: string;
  type: 'task' | 'event' | 'daily_summary' | 'overdue_summary' | 'weather';
  title: string;
  body: string;
  triggerTimestamp: number;
  scheduledAt: number;
  fired?: boolean;
  data?: NotificationPayloadData;
}

const STORAGE_KEY = '@weatherwhattodo/scheduled_notifications_v2';
const OVERDUE_SENT_KEY = '@weatherwhattodo/overdue_notification_sent_v2';
const ANDROID_CHANNEL_ID = 'reminders';

// In-memory cache of scheduled notifications
let memoryStore: ScheduledNotification[] = [];
let initialized = false;
let checkInterval: any = null;
let nativeResponseSubscription: any = null;

// Configure default notification presentation behavior for native (foreground alerts)
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (err) {
    console.warn('[Notifications] setNotificationHandler error:', err);
  }
}

/* ========================================================================== */
/*                                PERSISTENCE                                 */
/* ========================================================================== */

function loadStoredNotifications(): ScheduledNotification[] {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        memoryStore = JSON.parse(raw);
        return memoryStore;
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

/* ========================================================================== */
/*                            TIMEZONE & PARSING                              */
/* ========================================================================== */

/**
 * Converts date string (YYYY-MM-DD) and minutes from midnight to local epoch ms.
 * Strictly respects the user's local timezone.
 */
export function parseDateTimeToMs(dateStr: string, minutes: number): number {
  if (!dateStr) return NaN;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return NaN;
  }
  const [y, m, d] = parts;
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  // JavaScript Date(y, monthIndex, d, h, m) parses in the user's local timezone
  const dateObj = new Date(y, m - 1, d, hour, min, 0, 0);
  return dateObj.getTime();
}

/* ========================================================================== */
/*                           PERMISSIONS & CHANNELS                           */
/* ========================================================================== */

/** Check platform notification permission */
export async function getNotificationPermissionAsync(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return window.Notification.permission;
    }
    return 'unsupported';
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'default';
  } catch {
    return 'default';
  }
}

/** Synchronous check for web/fallback */
export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    return window.Notification.permission;
  }
  return 'default';
}

/** Request notification permission across Web and Native */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await window.Notification.requestPermission();
        if (perm === 'granted') {
          // Register service worker and try web push subscription
          registerServiceWorkerAndPush();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    return false;
  }

  try {
    // Setup Android notification channel first
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Task & Event Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (err) {
    console.warn('[Notifications] Failed to request permissions:', err);
    return false;
  }
}

/* ========================================================================== */
/*                           WEB / PWA SERVICE WORKER                         */
/* ========================================================================== */

/** Registers service worker on web and handles push subscription */
export async function registerServiceWorkerAndPush(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[Notifications] Service Worker registered with scope:', registration.scope);

    // Listen for notification clicks sent back from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        navigateToNotification(event.data.data);
      }
    });

    // Check if pushManager is supported and request subscription
    if ('pushManager' in registration && window.Notification.permission === 'granted') {
      try {
        // Fetch public VAPID key from backend if available
        const vapidRes = await fetch('/api/notifications/vapid-public-key').catch(() => null);
        if (vapidRes && vapidRes.ok) {
          const { publicKey } = await vapidRes.json();
          if (publicKey) {
            const existingSub = await registration.pushManager.getSubscription();
            if (!existingSub) {
              const convertedKey = urlBase64ToUint8Array(publicKey);
              const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedKey as any,
              });
              // Send subscription to server
              await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub }),
              }).catch(() => {});
            }
          }
        }
      } catch (pushErr) {
        console.log('[Notifications] Web push subscription optional note:', pushErr);
      }
    }
  } catch (err) {
    console.warn('[Notifications] Service worker registration failed:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* ========================================================================== */
/*                             DISPATCHING & TICK                             */
/* ========================================================================== */

/** Fire an instant notification right now */
export async function firePlatformNotification(
  title: string,
  body: string,
  data?: NotificationPayloadData,
  tag?: string
): Promise<void> {
  const payloadData = data || { type: 'weather', url: '/' };

  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    if (window.Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification(title, {
            body,
            icon: '/assets/icon.png',
            badge: '/assets/icon.png',
            tag: tag || 'weatherwhattodo',
            data: payloadData,
            renotify: true,
          } as any);
        } else {
          const notif = new window.Notification(title, {
            body,
            icon: '/assets/icon.png',
            tag: tag || 'weatherwhattodo',
            data: payloadData,
          });
          notif.onclick = () => {
            window.focus();
            navigateToNotification(payloadData);
            notif.close();
          };
        }
      } catch (err) {
        console.warn('[Notifications] Could not display system notification:', err);
      }
    }
  } else if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: payloadData,
          sound: 'default',
        },
        trigger: null, // trigger immediately
      });
    } catch (err) {
      console.warn('[Notifications] Native fire failed:', err);
    }
  }
}

/** Check and dispatch any due notifications (for web / foreground tick) */
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

    // Stale safeguard: if trigger time was in the distant past (> 15 minutes ago, e.g. device was off), drop it
    if (item.triggerTimestamp < now - 15 * 60 * 1000) {
      changed = true;
      continue;
    }

    // If trigger time has arrived
    if (item.triggerTimestamp <= now) {
      firePlatformNotification(item.title, item.body, item.data, item.id);
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

/* ========================================================================== */
/*                             INITIALIZATION                                 */
/* ========================================================================== */

/**
 * Initialize notification engine:
 * - Configures native channels and click response listeners
 * - Registers web service worker and push
 * - Sets up tick interval
 */
export function initNotificationEngine(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // Web Service Worker setup
  if (Platform.OS === 'web') {
    registerServiceWorkerAndPush();
    tickNotifications();

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
  } else {
    // Native Expo Notifications setup
    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
            name: 'Task & Event Reminders',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#3B82F6',
            sound: 'default',
            enableVibrate: true,
            enableLights: true,
          });
        }

        // Listen for notification responses (user tapping on notification)
        nativeResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as NotificationPayloadData;
          if (data) {
            navigateToNotification(data);
          }
        });

        // Check if app was opened by a notification response
        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse?.notification) {
          const data = lastResponse.notification.request.content.data as NotificationPayloadData;
          if (data) {
            navigateToNotification(data);
          }
        }
      } catch (err) {
        console.warn('[Notifications] Error initializing native notifications:', err);
      }
    })();

    return () => {
      if (nativeResponseSubscription) {
        nativeResponseSubscription.remove();
        nativeResponseSubscription = null;
      }
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
 * Calculates reminder time and schedules an OS/platform notification for an upcoming task.
 * Stable ID: ${userId}_task_${task.id}_${triggerTimestamp}
 */
export async function scheduleTaskNotification(
  task: Task,
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  // Respect user settings
  if (!settings.notifications.taskReminders) {
    return null;
  }

  // Never notify for completed, deleted, or archived tasks
  if (task.done || task.completed) {
    return null;
  }

  // Never notify for tasks without valid due date and due minutes
  if (!task.dueDate || task.dueMinutes === undefined) {
    return null;
  }

  const dueTimestamp = parseDateTimeToMs(task.dueDate, task.dueMinutes);
  if (isNaN(dueTimestamp)) {
    return null;
  }

  // Reminder offset (default 30 mins before, or task specific reminder)
  const offsetMinutes = task.reminderMinutesBefore !== undefined ? task.reminderMinutesBefore : 30;
  const triggerTimestamp = dueTimestamp - offsetMinutes * 60 * 1000;

  // Never schedule notifications in the past
  if (triggerTimestamp <= Date.now()) {
    return null;
  }

  // Cancel any existing notification for this task first to avoid duplicates
  await cancelTaskNotification(task.id, userId);

  const stableId = `${userId}_task_${task.id}_${triggerTimestamp}`;

  let title = 'Task due soon';
  let body = `${task.title} is due in ${offsetMinutes} minutes.`;
  if (offsetMinutes === 0) {
    title = 'Task reminder';
    body = `${task.title} is due now at ${minutesToLabel(task.dueMinutes, settings.use24h)}.`;
  } else if (offsetMinutes >= 60) {
    title = 'Task reminder';
    const hours = Math.round(offsetMinutes / 60);
    body = `${task.title} is due in ${hours} hour${hours > 1 ? 's' : ''}.`;
  }

  const payloadData: NotificationPayloadData = {
    type: 'task',
    targetId: task.id,
    url: '/tasks',
  };

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: task.id,
    type: 'task',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
    data: payloadData,
  };

  // Schedule on Native OS if on native platform
  if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: stableId,
        content: {
          title,
          body,
          data: payloadData,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerTimestamp),
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    } catch (err) {
      console.warn('[Notifications] Native schedule task error:', err);
    }
  }

  // Store in memory & web storage
  const list = loadStoredNotifications();
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/**
 * Cancel pending notifications for a specific task
 */
export async function cancelTaskNotification(taskId: string, userId?: string): Promise<void> {
  const list = loadStoredNotifications();
  const toCancel = list.filter((n) => {
    if (n.targetId !== taskId || n.type !== 'task') return false;
    if (userId && n.userId !== userId) return false;
    return true;
  });

  // Cancel on Native OS
  if (Platform.OS !== 'web') {
    for (const item of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(item.id);
      } catch {}
    }
  }

  const next = list.filter((n) => !toCancel.some((c) => c.id === n.id));
  if (next.length !== list.length) {
    saveStoredNotifications(next);
  }
}

/**
 * Reschedule notification for a task (e.g. after edit or time change)
 */
export async function rescheduleTaskNotification(
  task: Task,
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  await cancelTaskNotification(task.id, userId);
  return scheduleTaskNotification(task, userId, settings);
}

/* ========================================================================== */
/*                            EVENT NOTIFICATIONS                             */
/* ========================================================================== */

/**
 * Calculates reminder time and schedules an OS/platform notification for an upcoming event.
 * Stable ID: ${userId}_event_${event.id}_${triggerTimestamp}
 */
export async function scheduleEventNotification(
  event: CalEvent,
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  // Respect user settings
  if (!settings.notifications.eventAlerts) {
    return null;
  }

  if (!event.date) {
    return null;
  }

  // All-day event vs timed event
  let triggerTimestamp: number;
  let offsetMinutes = event.reminderMinutesBefore !== undefined ? event.reminderMinutesBefore : 30;
  let title = 'Upcoming event';
  let body = '';

  if (event.allDay) {
    // For all-day events, schedule a morning reminder on the day of the event
    const briefingHour = settings.notifications.briefingHour ?? 9;
    const morningMs = parseDateTimeToMs(event.date, briefingHour * 60);
    if (isNaN(morningMs)) return null;

    triggerTimestamp = morningMs;
    title = "Today's event";
    body = `All-day event today: ${event.title}${event.location ? ` at ${event.location}` : ''}.`;
  } else {
    const startMins = event.startMinutes ?? 9 * 60;
    const startTimestamp = parseDateTimeToMs(event.date, startMins);
    if (isNaN(startTimestamp)) {
      return null;
    }

    // Never notify for events in the past
    if (startTimestamp <= Date.now()) {
      return null;
    }

    triggerTimestamp = startTimestamp - offsetMinutes * 60 * 1000;

    if (offsetMinutes === 0) {
      body = `${event.title} starts now${event.location ? ` at ${event.location}` : ''}.`;
    } else {
      body = `${event.title} starts in ${offsetMinutes} minutes${event.location ? ` at ${event.location}` : ''}.`;
    }
  }

  // Never schedule in the past
  if (triggerTimestamp <= Date.now()) {
    return null;
  }

  // Cancel any existing notification for this event first
  await cancelEventNotification(event.id, userId);

  const stableId = `${userId}_event_${event.id}_${triggerTimestamp}`;

  const payloadData: NotificationPayloadData = {
    type: 'event',
    targetId: event.id,
    eventDate: event.date,
    url: '/calendar',
  };

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: event.id,
    type: 'event',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
    data: payloadData,
  };

  // Schedule on Native OS if on native platform
  if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: stableId,
        content: {
          title,
          body,
          data: payloadData,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerTimestamp),
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    } catch (err) {
      console.warn('[Notifications] Native schedule event error:', err);
    }
  }

  const list = loadStoredNotifications();
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/**
 * Cancel pending notifications for a specific event
 */
export async function cancelEventNotification(eventId: string, userId?: string): Promise<void> {
  const list = loadStoredNotifications();
  const toCancel = list.filter((n) => {
    if (n.targetId !== eventId || n.type !== 'event') return false;
    if (userId && n.userId !== userId) return false;
    return true;
  });

  if (Platform.OS !== 'web') {
    for (const item of toCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(item.id);
      } catch {}
    }
  }

  const next = list.filter((n) => !toCancel.some((c) => c.id === n.id));
  if (next.length !== list.length) {
    saveStoredNotifications(next);
  }
}

/**
 * Reschedule notification for an event (e.g. after edit or time change)
 */
export async function rescheduleEventNotification(
  event: CalEvent,
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  await cancelEventNotification(event.id, userId);
  return scheduleEventNotification(event, userId, settings);
}

/* ========================================================================== */
/*                         DAILY PENDING TASK SUMMARY                         */
/* ========================================================================== */

/**
 * Schedules the morning daily pending task summary.
 * Only sends when there are pending tasks for today.
 * Integrates directly with existing `settings.notifications.dailyBriefing` and `briefingHour`.
 */
export async function scheduleDailyTaskSummary(
  tasks: Task[],
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  if (!settings.notifications.dailyBriefing) {
    return null;
  }

  const todayKey = dateKey(new Date());
  // Find pending tasks for today
  const pendingToday = tasks.filter(
    (t) => !t.done && !t.completed && (t.dueDate === todayKey || !t.dueDate)
  );

  const count = pendingToday.length;
  // Rule 3: Do NOT send the notification if there are zero pending tasks
  if (count === 0) {
    return null;
  }

  const briefingHour = settings.notifications.briefingHour ?? 8;
  const triggerTimestamp = parseDateTimeToMs(todayKey, briefingHour * 60);

  // If the briefing time for today has already passed, schedule for tomorrow morning
  let targetDateKey = todayKey;
  let finalTrigger = triggerTimestamp;
  if (triggerTimestamp <= Date.now()) {
    const tmr = new Date(Date.now() + 24 * 60 * 60 * 1000);
    targetDateKey = dateKey(tmr);
    finalTrigger = parseDateTimeToMs(targetDateKey, briefingHour * 60);
  }

  const stableId = `${userId}_daily_${targetDateKey}`;

  const title = 'Your tasks for today';
  const body = `You have ${count} task${count > 1 ? 's' : ''} waiting for you today.`;

  const payloadData: NotificationPayloadData = {
    type: 'daily_summary',
    url: '/tasks',
  };

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: `daily_${targetDateKey}`,
    type: 'daily_summary',
    title,
    body,
    triggerTimestamp: finalTrigger,
    scheduledAt: Date.now(),
    data: payloadData,
  };

  if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: stableId,
        content: {
          title,
          body,
          data: payloadData,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(finalTrigger),
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    } catch (err) {
      console.warn('[Notifications] Native schedule daily summary error:', err);
    }
  }

  const list = loadStoredNotifications();
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/* ========================================================================== */
/*                         OVERDUE TASK NOTIFICATION                          */
/* ========================================================================== */

/**
 * Checks for overdue tasks and schedules an alert with once-per-day cooldown.
 */
export async function scheduleOverdueTaskSummary(
  tasks: Task[],
  userId: string,
  settings: Settings
): Promise<ScheduledNotification | null> {
  if (!settings.notifications.taskReminders) {
    return null;
  }

  const todayKey = dateKey(new Date());
  // Find overdue tasks
  const overdueTasks = tasks.filter((t) => !t.done && !t.completed && t.dueDate && t.dueDate < todayKey);
  const count = overdueTasks.length;

  const stableId = `${userId}_overdue_${todayKey}`;

  // If no overdue tasks, ensure any pending overdue notification is cancelled
  if (count === 0) {
    if (Platform.OS !== 'web') {
      try {
        await Notifications.cancelScheduledNotificationAsync(stableId);
      } catch {}
    }
    const list = loadStoredNotifications();
    saveStoredNotifications(list.filter((n) => n.id !== stableId));
    return null;
  }

  // Deduplication cooldown: check if overdue notification was already sent today for this user
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const lastSent = window.localStorage.getItem(`${OVERDUE_SENT_KEY}_${userId}`);
      if (lastSent === todayKey) {
        return null; // Already notified today
      }
    } catch {}
  }

  const title = 'Tasks need attention';
  const body = `You have ${count} overdue task${count > 1 ? 's' : ''}.`;

  const payloadData: NotificationPayloadData = {
    type: 'overdue_summary',
    url: '/tasks',
  };

  // Schedule to notify in 1 minute to avoid immediate spam on boot
  const triggerTimestamp = Date.now() + 60 * 1000;

  const item: ScheduledNotification = {
    id: stableId,
    userId,
    targetId: `overdue_${todayKey}`,
    type: 'overdue_summary',
    title,
    body,
    triggerTimestamp,
    scheduledAt: Date.now(),
    data: payloadData,
  };

  if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: stableId,
        content: {
          title,
          body,
          data: payloadData,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerTimestamp),
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    } catch (err) {
      console.warn('[Notifications] Native schedule overdue error:', err);
    }
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(`${OVERDUE_SENT_KEY}_${userId}`, todayKey);
    } catch {}
  }

  const list = loadStoredNotifications();
  const filtered = list.filter((n) => n.id !== stableId);
  filtered.push(item);
  saveStoredNotifications(filtered);

  return item;
}

/* ========================================================================== */
/*                             USER ISOLATION & CLEANUP                       */
/* ========================================================================== */

/**
 * Cancels and clears all scheduled notifications for a user upon sign out.
 * Ensures User A's notifications never appear for User B.
 */
export async function clearUserNotifications(userId: string): Promise<void> {
  const list = loadStoredNotifications();
  const userItems = list.filter((n) => n.userId === userId);

  if (Platform.OS !== 'web') {
    for (const item of userItems) {
      try {
        await Notifications.cancelScheduledNotificationAsync(item.id);
      } catch {}
    }
  }

  const next = list.filter((n) => n.userId !== userId);
  saveStoredNotifications(next);
}

/**
 * Cleans up notifications associated with Google data when Google sync is disconnected.
 * Local notifications remain completely intact.
 */
export async function clearGoogleNotifications(userId: string): Promise<void> {
  const list = loadStoredNotifications();
  const googleItems = list.filter((n) => {
    if (n.userId !== userId) return false;
    return n.targetId.startsWith('gcal_') || n.targetId.startsWith('gtask_');
  });

  if (Platform.OS !== 'web') {
    for (const item of googleItems) {
      try {
        await Notifications.cancelScheduledNotificationAsync(item.id);
      } catch {}
    }
  }

  const next = list.filter((n) => !googleItems.some((g) => g.id === n.id));
  saveStoredNotifications(next);
}

/**
 * Full reconciliation: synchronizes all scheduled notifications with active user's tasks & events.
 * 1. Cancels orphan notifications for deleted items
 * 2. Deduplicates existing schedules
 * 3. Schedules missing task reminders
 * 4. Schedules missing event reminders
 * 5. Schedules daily briefing summary
 * 6. Checks overdue tasks
 */
export async function syncAllNotifications(
  tasks: Task[],
  events: CalEvent[],
  userId: string,
  settings: Settings
): Promise<void> {
  const validTaskIds = new Set(tasks.map((t) => t.id));
  const validEventIds = new Set(events.map((e) => e.id));

  // 1. Remove orphan notifications for deleted tasks or events
  const list = loadStoredNotifications();
  const orphans = list.filter((n) => {
    if (n.userId !== userId) return false;
    if (n.type === 'task' && !validTaskIds.has(n.targetId)) return true;
    if (n.type === 'event' && !validEventIds.has(n.targetId)) return true;
    return false;
  });

  if (Platform.OS !== 'web') {
    for (const orphan of orphans) {
      try {
        await Notifications.cancelScheduledNotificationAsync(orphan.id);
      } catch {}
    }
  }

  const cleaned = list.filter((n) => !orphans.some((o) => o.id === n.id));
  saveStoredNotifications(cleaned);

  // 2. Schedule notifications for upcoming valid tasks
  if (settings.notifications.taskReminders) {
    for (const t of tasks) {
      if (!t.done && !t.completed && t.dueDate && t.dueMinutes !== undefined) {
        await scheduleTaskNotification(t, userId, settings);
      }
    }
  } else {
    // If task reminders are disabled, cancel any active task notifications
    const activeTasks = cleaned.filter((n) => n.userId === userId && n.type === 'task');
    for (const item of activeTasks) {
      await cancelTaskNotification(item.targetId, userId);
    }
  }

  // 3. Schedule notifications for upcoming events
  if (settings.notifications.eventAlerts) {
    for (const e of events) {
      if (e.date) {
        await scheduleEventNotification(e, userId, settings);
      }
    }
  } else {
    // If event alerts are disabled, cancel any active event notifications
    const activeEvents = cleaned.filter((n) => n.userId === userId && n.type === 'event');
    for (const item of activeEvents) {
      await cancelEventNotification(item.targetId, userId);
    }
  }

  // 4. Daily briefing task summary
  if (settings.notifications.dailyBriefing) {
    await scheduleDailyTaskSummary(tasks, userId, settings);
  }

  // 5. Overdue task summary check
  if (settings.notifications.taskReminders) {
    await scheduleOverdueTaskSummary(tasks, userId, settings);
  }
}

/** Reschedule all active notifications */
export async function rescheduleAllNotifications(
  tasks: Task[],
  events: CalEvent[],
  userId: string,
  settings: Settings
): Promise<void> {
  return syncAllNotifications(tasks, events, userId, settings);
}

/** Send an immediate test notification for user/verification purposes */
export async function sendTestNotification(): Promise<void> {
  await firePlatformNotification(
    'Weather What To-Do',
    'Real notifications are active and working on your device!',
    { type: 'weather', url: '/' },
    'test_notification'
  );
}
