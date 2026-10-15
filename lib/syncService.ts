import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import {
  CalEvent,
  CalendarInfo,
  ChatMessage,
  Reminder,
  Settings,
  Task,
  TaskList,
  UserProfile,
} from './types';
import { Place } from './weather';

export interface RemoteChange {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord?: any;
  oldRecord?: any;
}

export interface PendingSyncMutation {
  id: string;
  table: 'tasks' | 'events' | 'reminders' | 'task_lists' | 'calendars' | 'places';
  action: 'upsert' | 'delete';
  record?: any;
  timestamp: number;
}

const SIGNED_OUT_STORAGE_KEY = '@weatherwhattodo/signed_out_cache_v2';
const GUEST_STORAGE_KEY = '@weatherwhattodo/guest_cache_v2';
const USER_STORAGE_PREFIX = '@weatherwhattodo/cache_v2_';
const DELETED_TASKS_PREFIX = '@weatherwhattodo/deleted_tasks_';
const PENDING_QUEUE_PREFIX = '@weatherwhattodo/pending_queue_';
export const LAST_AUTH_MODE_KEY = '@weatherwhattodo/last_auth_mode';

export type AuthMode = 'google' | 'email' | 'guest' | 'signed_out';

/**
 * Validates that an ID is a valid canonical RFC-4122 UUID.
 * Supabase Postgres columns typed as UUID will throw code 22P02 if a non-UUID string is passed.
 */
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

export function getUserStorageKey(userId?: string | null): string {
  if (!userId) {
    return SIGNED_OUT_STORAGE_KEY;
  }
  if (userId === 'guest_user') {
    return GUEST_STORAGE_KEY;
  }
  return `${USER_STORAGE_PREFIX}${userId}`;
}

export async function getLastAuthMode(): Promise<AuthMode | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return (window.localStorage.getItem(LAST_AUTH_MODE_KEY) as AuthMode) || null;
    }
    const val = await AsyncStorage.getItem(LAST_AUTH_MODE_KEY);
    return (val as AuthMode) || null;
  } catch {
    return null;
  }
}

export async function setLastAuthMode(mode: AuthMode): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LAST_AUTH_MODE_KEY, mode);
      return;
    }
    await AsyncStorage.setItem(LAST_AUTH_MODE_KEY, mode);
  } catch {}
}

export async function readLocalCache(key: string): Promise<any | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Sync] Read local cache error for key', key, err);
    return null;
  }
}

export async function writeLocalCache(key: string, data: any): Promise<void> {
  try {
    const raw = JSON.stringify(data);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, raw);
      return;
    }
    await AsyncStorage.setItem(key, raw);
  } catch (err) {
    console.warn('[Sync] Write local cache error for key', key, err);
  }
}

export async function removeLocalCache(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn('[Sync] Remove local cache error for key', key, err);
  }
}

/* ========================================================================== */
/*                        DELETION TOMBSTONES TRACKING                        */
/* ========================================================================== */

export async function getDeletedTaskIds(userId: string): Promise<Set<string>> {
  if (!isValidUuid(userId)) return new Set();
  const raw = await readLocalCache(`${DELETED_TASKS_PREFIX}${userId}`);
  return new Set(Array.isArray(raw) ? raw : []);
}

export async function recordDeletedTaskId(userId: string, taskId: string): Promise<void> {
  if (!isValidUuid(userId)) return;
  const current = await getDeletedTaskIds(userId);
  current.add(taskId);
  await writeLocalCache(`${DELETED_TASKS_PREFIX}${userId}`, Array.from(current).slice(-300));
}

/* ========================================================================== */
/*                       DURABLE PENDING SYNC QUEUE                           */
/* ========================================================================== */

export async function getPendingQueue(userId: string): Promise<PendingSyncMutation[]> {
  if (!isValidUuid(userId)) return [];
  const data = await readLocalCache(`${PENDING_QUEUE_PREFIX}${userId}`);
  return Array.isArray(data) ? data : [];
}

export async function enqueuePendingSync(userId: string, mutation: PendingSyncMutation): Promise<void> {
  if (!isValidUuid(userId)) return;
  const queue = await getPendingQueue(userId);
  const filtered = queue.filter((m) => !(m.id === mutation.id && m.table === mutation.table));
  filtered.push(mutation);
  await writeLocalCache(`${PENDING_QUEUE_PREFIX}${userId}`, filtered);
}

export async function dequeuePendingSync(userId: string, mutationId: string, table: string): Promise<void> {
  if (!isValidUuid(userId)) return;
  const queue = await getPendingQueue(userId);
  const next = queue.filter((m) => !(m.id === mutationId && m.table === table));
  await writeLocalCache(`${PENDING_QUEUE_PREFIX}${userId}`, next);
}

export async function flushPendingSyncQueue(userId: string): Promise<void> {
  if (!isValidUuid(userId)) return;
  const queue = await getPendingQueue(userId);
  if (queue.length === 0) return;

  for (const item of queue) {
    try {
      if (item.table === 'tasks') {
        if (item.action === 'upsert' && item.record) {
          await saveTaskToCloud(item.record, userId);
        } else if (item.action === 'delete') {
          await deleteTaskFromCloud(item.id, userId);
        }
      } else if (item.table === 'events') {
        if (item.action === 'upsert' && item.record) {
          await saveEventToCloud(item.record, userId);
        } else if (item.action === 'delete') {
          await deleteEventFromCloud(item.id, userId);
        }
      }
      await dequeuePendingSync(userId, item.id, item.table);
    } catch (e) {
      console.warn('[Sync] Flush queue item failed, keeping in queue:', item.id, e);
      break;
    }
  }
}

/* ========================================================================== */
/*                         DATA RECORD MAPPERS                                */
/* ========================================================================== */

export function mapTaskRow(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || undefined,
    done: Boolean(row.done),
    completed: Boolean(row.done),
    completedAt: row.completed_at ? Number(row.completed_at) : undefined,
    dueDate: row.due_date || undefined,
    dueMinutes: row.due_minutes ?? undefined,
    priority: row.priority || 'normal',
    context: row.context || 'anywhere',
    listId: row.list_id || 'inbox',
    source: row.source || 'local',
    createdAt: row.created_at_client
      ? Number(row.created_at_client)
      : row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    estimateMin: row.estimate_min ?? undefined,
    subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
    reminderMinutesBefore: row.reminder_minutes_before ?? undefined,
  };
}

export function mapListRow(row: any): TaskList {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    source: row.source || 'local',
  };
}

export function mapEventRow(row: any): CalEvent {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || undefined,
    date: row.date,
    startMinutes: Number(row.start_minutes) || 0,
    endMinutes: Number(row.end_minutes) || 0,
    allDay: Boolean(row.all_day),
    location: row.location || undefined,
    isOutdoor: Boolean(row.is_outdoor),
    kind: row.kind || 'meeting',
    calendarId: row.calendar_id || 'cal_primary',
    source: row.source || 'local',
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    status: row.status || undefined,
    reminderMinutesBefore: row.reminder_minutes_before ?? undefined,
  };
}

export function mapCalendarRow(row: any): CalendarInfo {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    source: row.source || 'local',
    visible: Boolean(row.visible),
  };
}

export function mapReminderRow(row: any): Reminder {
  return {
    id: row.id,
    title: row.title,
    trigger: row.trigger || 'time',
    date: row.date || undefined,
    minutes: row.minutes ?? undefined,
    repeat: row.repeat || 'none',
    placeName: row.place_name || undefined,
    weatherRule: row.weather_rule || undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at_client
      ? Number(row.created_at_client)
      : row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
  };
}

export function mapPlaceRow(row: any): Place {
  return {
    id: row.id,
    name: row.name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  };
}

export function mapChatRow(row: any): ChatMessage {
  return {
    id: row.id,
    role: row.role as any,
    content: row.content || undefined,
    text: row.content || undefined,
    timestamp: row.ts
      ? Number(row.ts)
      : row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now(),
    ts: row.ts ? Number(row.ts) : undefined,
    chips: Array.isArray(row.chips) ? row.chips : [],
    action: row.action || undefined,
    actions: Array.isArray(row.actions) ? row.actions : undefined,
    actionDone: Boolean(row.action_done),
    sourcesUsed: Array.isArray(row.sources_used) ? row.sources_used : [],
    isError: Boolean(row.is_error),
    retryQuestion: row.retry_question || undefined,
  };
}

export function mapSettingsRow(s: any): Partial<Settings> {
  return {
    themeMode: (s.theme_mode as any) || 'system',
    tempUnit: (s.temp_unit as any) || 'C',
    windUnit: (s.wind_unit as any) || 'kmh',
    use24h: Boolean(s.use_24h),
    weekStartsMonday: Boolean(s.week_starts_monday),
    highContrast: Boolean(s.high_contrast),
    reduceMotion: Boolean(s.reduce_motion),
    largeText: Boolean(s.large_text),
    boldText: Boolean(s.bold_text),
    dynamicWeatherTheme: Boolean(s.dynamic_weather_theme),
    weatherOverride: s.weather_override || null,
    notifications:
      typeof s.notifications === 'object' && s.notifications !== null
        ? s.notifications
        : {
            dailyBriefing: true,
            briefingHour: 7,
            severeWeather: true,
            rainAlerts: true,
            taskReminders: true,
            eventAlerts: true,
          },
    geminiTone: (s.gemini_tone as any) || 'balanced',
    autoSuggest: Boolean(s.auto_suggest),
  };
}

/* ========================================================================== */
/*                 SAFE TWO-WAY CROSS-PLATFORM RECONCILIATION                 */
/* ========================================================================== */

/**
 * Reconciles local tasks with cloud tasks safely without data loss.
 * - Legitimate local-only tasks (e.g. created on mobile offline or before initial sync) are identified for upload.
 * - Tasks present on cloud but missing locally are retained in the merged list.
 * - Tasks present on both are resolved by the latest timestamp / completed status.
 * - Deleted tasks (known in tombstone set) are not resurrected.
 * - Google tasks are preserved cleanly.
 */
export function reconcileTasksWithCloud(
  userId: string,
  localTasks: Task[],
  remoteTasks: Task[],
  knownDeletedIds: Set<string> = new Set()
): { mergedTasks: Task[]; tasksToUpload: Task[] } {
  const remoteMap = new Map<string, Task>();
  for (const r of remoteTasks) {
    remoteMap.set(r.id, r);
  }

  const localMap = new Map<string, Task>();
  for (const l of localTasks) {
    if (l.source !== 'google') {
      localMap.set(l.id, l);
    }
  }

  const tasksToUpload: Task[] = [];
  const mergedNonGoogle: Task[] = [];

  // 1. Process all local non-Google tasks
  for (const [id, local] of localMap.entries()) {
    if (knownDeletedIds.has(id)) {
      continue; // Confirmed deleted, skip
    }

    const remote = remoteMap.get(id);
    if (!remote) {
      // Local task not on server: legitimate local-only task.
      // Must upload to Supabase so it appears on all platforms.
      tasksToUpload.push(local);
      mergedNonGoogle.push(local);
    } else {
      // Exists on both: resolve conflicts by latest update
      const localTime = Math.max(local.completedAt || 0, local.createdAt || 0);
      const remoteTime = Math.max(remote.completedAt || 0, remote.createdAt || 0);

      if (
        localTime > remoteTime &&
        (local.done !== remote.done ||
          local.title !== remote.title ||
          local.notes !== remote.notes ||
          local.dueDate !== remote.dueDate)
      ) {
        tasksToUpload.push(local);
        mergedNonGoogle.push(local);
      } else {
        mergedNonGoogle.push(remote);
      }
    }
  }

  // 2. Process remote tasks that are not present locally
  for (const [id, remote] of remoteMap.entries()) {
    if (!localMap.has(id) && !knownDeletedIds.has(id)) {
      mergedNonGoogle.push(remote);
    }
  }

  // 3. Preserve Google tasks from local state
  const googleTasks = localTasks.filter((t) => t.source === 'google');
  const mergedTasks = [...mergedNonGoogle, ...googleTasks];

  return { mergedTasks, tasksToUpload };
}

/* ========================================================================== */
/*                     REMOTE DATA FETCH & QUERIES                            */
/* ========================================================================== */

/**
 * Fetch all user-owned data from Supabase PostgreSQL
 */
export async function fetchRemoteUserData(userId: string): Promise<{
  profile: Partial<UserProfile> | null;
  settings: Partial<Settings> | null;
  tasks: Task[];
  lists: TaskList[];
  events: CalEvent[];
  calendars: CalendarInfo[];
  reminders: Reminder[];
  places: Place[];
  chat: ChatMessage[];
  stats: { streak: number; lastActive: string; completedTotal: number; plansMade: number } | null;
} | null> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return null;

  try {
    const [
      profileRes,
      settingsRes,
      tasksRes,
      listsRes,
      eventsRes,
      calendarsRes,
      remindersRes,
      placesRes,
      chatRes,
      statsRes,
    ] = await Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      client.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('task_lists').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      client.from('events').select('*').eq('user_id', userId).order('date', { ascending: true }),
      client.from('calendars').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      client.from('reminders').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('places').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      client.from('ask_clever_messages').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(100),
      client.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // Critical failure check: If tasks query errored, return null so caller knows fetch failed
    // rather than incorrectly treating null data as zero tasks
    if (tasksRes.error) {
      console.error('[Sync] Error fetching tasks from Supabase:', tasksRes.error);
      return null;
    }

    // Map Tasks
    const tasks: Task[] = (tasksRes.data || []).map(mapTaskRow);

    // Map Lists
    const lists: TaskList[] = (listsRes.data || []).map(mapListRow);

    // Map Events
    const events: CalEvent[] = (eventsRes.data || []).map(mapEventRow);

    // Map Calendars
    const calendars: CalendarInfo[] = (calendarsRes.data || []).map(mapCalendarRow);

    // Map Reminders
    const reminders: Reminder[] = (remindersRes.data || []).map(mapReminderRow);

    // Map Places
    const places: Place[] = (placesRes.data || []).map(mapPlaceRow);

    // Map Chat Messages
    const chat: ChatMessage[] = (chatRes.data || []).map(mapChatRow);

    // Map Profile
    let profile: Partial<UserProfile> | null = null;
    if (profileRes.data) {
      profile = {
        id: profileRes.data.id,
        name: profileRes.data.display_name || undefined,
        email: profileRes.data.email || undefined,
        avatarColor: profileRes.data.avatar_color || '#3B5BFF',
        avatarUrl: profileRes.data.avatar_url || undefined,
        headline: profileRes.data.headline || undefined,
        provider: (profileRes.data.provider as any) || 'email',
      };
    }

    // Map Settings
    let settings: Partial<Settings> | null = null;
    if (settingsRes.data) {
      settings = mapSettingsRow(settingsRes.data);
    }

    // Map Stats
    let stats: { streak: number; lastActive: string; completedTotal: number; plansMade: number } | null = null;
    if (statsRes.data) {
      stats = {
        streak: Number(statsRes.data.streak) || 0,
        lastActive: statsRes.data.last_active,
        completedTotal: Number(statsRes.data.completed_total) || 0,
        plansMade: Number(statsRes.data.plans_made) || 0,
      };
    }

    return {
      profile,
      settings,
      tasks,
      lists,
      events,
      calendars,
      reminders,
      places,
      chat,
      stats,
    };
  } catch (err) {
    console.error('[Sync] Error fetching remote data from Supabase:', err);
    return null;
  }
}

/**
 * Uploads initial seed/local data to Supabase if the user has no existing records yet
 */
export async function seedInitialUserDataIfEmpty(
  userId: string,
  data: {
    tasks: Task[];
    lists: TaskList[];
    events: CalEvent[];
    calendars: CalendarInfo[];
    reminders: Reminder[];
    settings: Settings;
  }
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  try {
    // Check if tasks already exist
    const { count, error } = await client
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error || (count !== null && count > 0)) {
      return; // User already has remote data
    }

    // Insert task lists
    if (data.lists.length > 0) {
      const { error: listsErr } = await client.from('task_lists').upsert(
        data.lists.map((l) => ({
          id: l.id,
          user_id: userId,
          name: l.name,
          color: l.color,
          icon: l.icon,
          source: l.source,
          updated_at: new Date().toISOString(),
        }))
      );
      if (listsErr) console.warn('[Sync] Seed task_lists error:', listsErr);
    }

    // Insert tasks
    if (data.tasks.length > 0) {
      const { error: tasksErr } = await client.from('tasks').upsert(
        data.tasks.map((t) => ({
          id: t.id,
          user_id: userId,
          title: t.title,
          notes: t.notes || null,
          done: Boolean(t.done),
          completed_at: t.completedAt || null,
          due_date: t.dueDate || null,
          due_minutes: t.dueMinutes ?? null,
          priority: t.priority,
          context: t.context,
          list_id: t.listId || 'inbox',
          source: t.source,
          created_at_client: t.createdAt,
          estimate_min: t.estimateMin ?? null,
          subtasks: t.subtasks || [],
          reminder_minutes_before: t.reminderMinutesBefore ?? null,
          updated_at: new Date().toISOString(),
        }))
      );
      if (tasksErr) console.warn('[Sync] Seed tasks error:', tasksErr);
    }

    // Insert calendars
    if (data.calendars.length > 0) {
      const { error: calErr } = await client.from('calendars').upsert(
        data.calendars.map((c) => ({
          id: c.id,
          user_id: userId,
          name: c.name,
          color: c.color,
          source: c.source,
          visible: c.visible,
          updated_at: new Date().toISOString(),
        }))
      );
      if (calErr) console.warn('[Sync] Seed calendars error:', calErr);
    }

    // Insert events
    if (data.events.length > 0) {
      const { error: evErr } = await client.from('events').upsert(
        data.events.map((e) => ({
          id: e.id,
          user_id: userId,
          title: e.title,
          notes: e.notes || null,
          date: e.date,
          start_minutes: e.startMinutes,
          end_minutes: e.endMinutes,
          all_day: Boolean(e.allDay),
          location: e.location || null,
          is_outdoor: Boolean(e.isOutdoor),
          kind: e.kind,
          calendar_id: e.calendarId || 'cal_primary',
          source: e.source,
          attendees: e.attendees || [],
          status: e.status || null,
          reminder_minutes_before: e.reminderMinutesBefore ?? null,
          updated_at: new Date().toISOString(),
        }))
      );
      if (evErr) console.warn('[Sync] Seed events error:', evErr);
    }

    // Insert reminders
    if (data.reminders.length > 0) {
      const { error: remErr } = await client.from('reminders').upsert(
        data.reminders.map((r) => ({
          id: r.id,
          user_id: userId,
          title: r.title,
          trigger: r.trigger,
          date: r.date || null,
          minutes: r.minutes ?? null,
          repeat: r.repeat,
          place_name: r.placeName || null,
          weather_rule: r.weatherRule || null,
          enabled: Boolean(r.enabled),
          created_at_client: r.createdAt,
          updated_at: new Date().toISOString(),
        }))
      );
      if (remErr) console.warn('[Sync] Seed reminders error:', remErr);
    }

    // Upsert settings
    await saveSettingsToCloud(data.settings, userId);
  } catch (err) {
    console.warn('[Sync] Seed initial user data error:', err);
  }
}

/* ========================================================================== */
/*                       MUTATIONS WITH PROPER ERROR CHECKS                   */
/* ========================================================================== */

export async function saveProfileToCloud(profile: Partial<UserProfile>, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('profiles').upsert({
    id: userId,
    display_name: profile.name || null,
    email: profile.email || null,
    avatar_color: profile.avatarColor || null,
    avatar_url: profile.avatarUrl || null,
    headline: profile.headline || null,
    provider: profile.provider || 'email',
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save profile to cloud:', error.message || error);
    throw error;
  }
}

export async function saveTaskToCloud(task: Task, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user') return;
  if (!isValidUuid(userId)) {
    console.warn('[Sync] Cannot save task to cloud with invalid UUID:', userId);
    return;
  }

  const { error } = await client.from('tasks').upsert({
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes || null,
    done: Boolean(task.done),
    completed_at: task.completedAt || null,
    due_date: task.dueDate || null,
    due_minutes: task.dueMinutes ?? null,
    priority: task.priority || 'normal',
    context: task.context || 'anywhere',
    list_id: task.listId || 'inbox',
    source: task.source || 'local',
    created_at_client: task.createdAt || Date.now(),
    estimate_min: task.estimateMin ?? null,
    subtasks: task.subtasks || [],
    reminder_minutes_before: task.reminderMinutesBefore ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Error upserting task to Supabase:', error.message || error);
    throw error;
  }
}

export async function deleteTaskFromCloud(taskId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('tasks').delete().match({ id: taskId, user_id: userId });
  if (error) {
    console.error('[Sync] Error deleting task from Supabase:', error.message || error);
    throw error;
  }
}

export async function saveEventToCloud(event: CalEvent, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('events').upsert({
    id: event.id,
    user_id: userId,
    title: event.title,
    notes: event.notes || null,
    date: event.date,
    start_minutes: event.startMinutes,
    end_minutes: event.endMinutes,
    all_day: Boolean(event.allDay),
    location: event.location || null,
    is_outdoor: Boolean(event.isOutdoor),
    kind: event.kind || 'meeting',
    calendar_id: event.calendarId || 'cal_primary',
    source: event.source || 'local',
    attendees: event.attendees || [],
    status: event.status || null,
    reminder_minutes_before: event.reminderMinutesBefore ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save event to cloud:', error.message || error);
    throw error;
  }
}

export async function deleteEventFromCloud(eventId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('events').delete().match({ id: eventId, user_id: userId });
  if (error) {
    console.error('[Sync] Failed to delete event from cloud:', error.message || error);
    throw error;
  }
}

export async function saveReminderToCloud(reminder: Reminder, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('reminders').upsert({
    id: reminder.id,
    user_id: userId,
    title: reminder.title,
    trigger: reminder.trigger || 'time',
    date: reminder.date || null,
    minutes: reminder.minutes ?? null,
    repeat: reminder.repeat || 'none',
    place_name: reminder.placeName || null,
    weather_rule: reminder.weatherRule || null,
    enabled: Boolean(reminder.enabled),
    created_at_client: reminder.createdAt || Date.now(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save reminder to cloud:', error.message || error);
    throw error;
  }
}

export async function deleteReminderFromCloud(reminderId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('reminders').delete().match({ id: reminderId, user_id: userId });
  if (error) {
    console.error('[Sync] Failed to delete reminder from cloud:', error.message || error);
    throw error;
  }
}

export async function saveSettingsToCloud(settings: Settings, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('user_settings').upsert({
    user_id: userId,
    theme_mode: settings.themeMode,
    temp_unit: settings.tempUnit,
    wind_unit: settings.windUnit,
    use_24h: settings.use24h,
    week_starts_monday: settings.weekStartsMonday,
    high_contrast: settings.highContrast,
    reduce_motion: settings.reduceMotion,
    large_text: settings.largeText,
    bold_text: settings.boldText,
    dynamic_weather_theme: settings.dynamicWeatherTheme,
    weather_override: settings.weatherOverride,
    notifications: settings.notifications,
    gemini_tone: settings.geminiTone || 'balanced',
    auto_suggest: settings.autoSuggest ?? true,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save settings to cloud:', error.message || error);
    throw error;
  }
}

export async function saveTaskListToCloud(list: TaskList, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('task_lists').upsert({
    id: list.id,
    user_id: userId,
    name: list.name,
    color: list.color,
    icon: list.icon,
    source: list.source || 'local',
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save task list to cloud:', error.message || error);
    throw error;
  }
}

export async function deleteTaskListFromCloud(listId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('task_lists').delete().match({ id: listId, user_id: userId });
  if (error) {
    console.error('[Sync] Failed to delete task list from cloud:', error.message || error);
    throw error;
  }
}

export async function saveCalendarToCloud(calendar: CalendarInfo, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('calendars').upsert({
    id: calendar.id,
    user_id: userId,
    name: calendar.name,
    color: calendar.color,
    source: calendar.source || 'local',
    visible: Boolean(calendar.visible),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save calendar to cloud:', error.message || error);
    throw error;
  }
}

export async function savePlaceToCloud(place: Place, userId: string, sortOrder = 0): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('places').upsert({
    id: place.id,
    user_id: userId,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    is_custom: Boolean((place as any).isCustom),
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save place to cloud:', error.message || error);
    throw error;
  }
}

export async function deletePlaceFromCloud(placeId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('places').delete().match({ id: placeId, user_id: userId });
  if (error) {
    console.error('[Sync] Failed to delete place from cloud:', error.message || error);
    throw error;
  }
}

export async function saveChatMessageToCloud(msg: ChatMessage, userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('ask_clever_messages').upsert({
    id: msg.id,
    user_id: userId,
    conversation_id: 'default',
    role: msg.role,
    content: msg.content || msg.text || '',
    ts: msg.ts || msg.timestamp || Date.now(),
    chips: msg.chips || [],
    action: msg.action || null,
    actions: msg.actions || null,
    action_done: Boolean(msg.actionDone),
    sources_used: msg.sourcesUsed || [],
    is_error: Boolean(msg.isError),
    retry_question: msg.retryQuestion || null,
  });

  if (error) {
    console.error('[Sync] Failed to save chat message to cloud:', error.message || error);
    throw error;
  }
}

export async function clearChatInCloud(userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('ask_clever_messages').delete().eq('user_id', userId);
  if (error) {
    console.error('[Sync] Failed to clear chat in cloud:', error.message || error);
    throw error;
  }
}

export async function saveUserStatsToCloud(
  stats: { streak: number; lastActive: string; completedTotal: number; plansMade: number },
  userId: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  const { error } = await client.from('user_stats').upsert({
    user_id: userId,
    streak: stats.streak,
    last_active: stats.lastActive,
    completed_total: stats.completedTotal,
    plans_made: stats.plansMade,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[Sync] Failed to save user stats to cloud:', error.message || error);
    throw error;
  }
}

/**
 * Deletes all user records and account profile
 */
export async function deleteAccountData(userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) return;

  try {
    const { error } = await client.from('profiles').delete().eq('id', userId);
    if (error) {
      console.error('[Sync] Failed to delete user profile from cloud:', error);
    }
    await removeLocalCache(getUserStorageKey(userId));
    await removeLocalCache(`${DELETED_TASKS_PREFIX}${userId}`);
    await removeLocalCache(`${PENDING_QUEUE_PREFIX}${userId}`);
  } catch (err) {
    console.error('[Sync] Failed to delete user account data:', err);
  }
}

/* ========================================================================== */
/*                        REALTIME CROSS-DEVICE SYNC                          */
/* ========================================================================== */

/**
 * Subscribe to Supabase Realtime changes for the authenticated user
 */
export function subscribeToRealtimeChanges(
  userId: string,
  onRemoteChange: (change: RemoteChange) => void
): () => void {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'guest_user' || !isValidUuid(userId)) {
    return () => {};
  }

  const channelName = `realtime-user-${userId}`;
  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'tasks',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'events',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reminders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'reminders',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_settings',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'user_settings',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_lists',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'task_lists',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'calendars',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'calendars',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'places',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'places',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ask_clever_messages',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onRemoteChange({
          table: 'ask_clever_messages',
          eventType: payload.eventType as any,
          newRecord: payload.new,
          oldRecord: payload.old,
        });
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Safely migrates guest tasks to a Google authenticated user.
 * Preserves stable IDs, avoids duplicate uploads, and ensures tasks are associated with target user.
 */
export async function migrateGuestTasksToUser(
  targetUserId: string,
  guestTasks: Task[]
): Promise<{ success: boolean; count: number; migratedTasks: Task[] }> {
  if (!isValidUuid(targetUserId) || !isSupabaseConfigured() || !Array.isArray(guestTasks) || guestTasks.length === 0) {
    return { success: true, count: 0, migratedTasks: [] };
  }

  try {
    const remote = await fetchRemoteUserData(targetUserId);
    const existingKeys = new Set(
      (remote?.tasks || []).map((t) => `${t.title.trim().toLowerCase()}_${t.dueDate || ''}`)
    );

    const migratedTasks: Task[] = [];
    let count = 0;

    for (const gt of guestTasks) {
      if (gt.source === 'google') continue;
      const key = `${gt.title.trim().toLowerCase()}_${gt.dueDate || ''}`;
      if (existingKeys.has(key)) {
        continue; // duplicate prevention
      }

      const migratedTask: Task = {
        ...gt,
        source: 'local',
      };

      try {
        await saveTaskToCloud(migratedTask, targetUserId);
        existingKeys.add(key);
        migratedTasks.push(migratedTask);
        count++;
      } catch (uploadErr) {
        console.warn('[Sync] Failed uploading migrated guest task:', gt.id, uploadErr);
      }
    }

    return { success: true, count, migratedTasks };
  } catch (err) {
    console.error('[Sync] Error migrating guest tasks to user:', err);
    return { success: false, count: 0, migratedTasks: [] };
  }
}
