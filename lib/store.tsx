'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import {
  CalEvent, CalendarInfo, ChatMessage, IntegrationState, Reminder, Settings, Task, TaskList, UserProfile,
} from './types';
import { seedCalendars, seedEvents, seedLists, seedReminders, seedTasks } from './seed';
import { DEFAULT_PLACES, Place, WeatherBundle, fetchWeather, synthesize, reverseGeocode } from './weather';
import { AppTheme, ColorScheme, getTheme } from './theme';
import { dateKey, uid } from './utils';
import {
  checkLocationPermission,
  resolveCurrentDevicePlace,
  getLastKnownPlace,
  LocationPermissionState,
} from './locationService';
import { getValidAccessToken, getStoredGoogleUser, disconnectGoogleAccount, clearStoredGoogleTokens } from './googleAuth';
import {
  deleteGoogleEvent,
  deleteGoogleTask,
  fetchAllGoogleData,
  fetchGoogleCalendarData,
  fetchGoogleTasksData,
  updateGoogleTaskStatus,
} from './googleApi';
import {
  getSupabaseClient,
  getSupabaseSession,
  isSupabaseConfigured,
  signOutSupabase,
  exchangeSupabaseCode,
} from './supabase';
import {
  initNotificationEngine,
  scheduleTaskNotification,
  cancelTaskNotification,
  rescheduleTaskNotification,
  scheduleEventNotification,
  cancelEventNotification,
  rescheduleEventNotification,
  clearUserNotifications,
  clearGoogleNotifications,
  syncAllNotifications,
} from './notifications';
import {
  getUserStorageKey,
  readLocalCache,
  writeLocalCache,
  removeLocalCache,
  isValidUuid,
  getDeletedTaskIds,
  recordDeletedTaskId,
  enqueuePendingSync,
  flushPendingSyncQueue,
  reconcileTasksWithCloud,
  fetchRemoteUserData,
  seedInitialUserDataIfEmpty,
  saveProfileToCloud,
  saveTaskToCloud,
  deleteTaskFromCloud,
  saveEventToCloud,
  deleteEventFromCloud,
  saveReminderToCloud,
  deleteReminderFromCloud,
  saveSettingsToCloud,
  saveTaskListToCloud,
  deleteTaskListFromCloud,
  saveCalendarToCloud,
  savePlaceToCloud,
  deletePlaceFromCloud,
  saveChatMessageToCloud,
  clearChatInCloud,
  saveUserStatsToCloud,
  deleteAccountData,
  subscribeToRealtimeChanges,
  RemoteChange,
  mapTaskRow,
  mapEventRow,
  mapReminderRow,
  mapListRow,
  mapCalendarRow,
  mapPlaceRow,
  mapChatRow,
  mapSettingsRow,
  getLastAuthMode,
  setLastAuthMode,
  migrateGuestTasksToUser as migrateGuestTasksService,
} from './syncService';

const LEGACY_KEY = '@weatherwhattodo/v1';
const WEATHER_CACHE_KEY = '@weatherwhattodo/cached_weather';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface PersistShape {
  user: UserProfile | null;
  settings: Settings;
  tasks: Task[];
  lists: TaskList[];
  events: CalEvent[];
  calendars: CalendarInfo[];
  reminders: Reminder[];
  places: Place[];
  activePlaceId: string;
  integrations: IntegrationState;
  chat: ChatMessage[];
  onboarded: boolean;
  hasSeenWelcome: boolean;
  stats: { streak: number; lastActive: string; completedTotal: number; plansMade: number };
}

export const DEFAULT_SETTINGS: Settings = {
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
    briefingHour: 7,
    severeWeather: true,
    rainAlerts: true,
    taskReminders: true,
    eventAlerts: true,
  },
  geminiKey: '',
  geminiTone: 'balanced',
  autoSuggest: true,
};

function defaultState(onboarded = false, hasSeenWelcome = false): PersistShape {
  return {
    user: null,
    settings: DEFAULT_SETTINGS,
    tasks: seedTasks(),
    lists: seedLists(),
    events: seedEvents(),
    calendars: seedCalendars(),
    reminders: seedReminders(),
    places: [],
    activePlaceId: 'current',
    integrations: {
      googleCalendar: false,
      googleTasks: false,
      account: undefined,
    },
    chat: [],
    onboarded,
    hasSeenWelcome,
    stats: { streak: 0, lastActive: dateKey(new Date()), completedTotal: 0, plansMade: 0 },
  };
}

type Action =
  | { type: 'hydrate'; payload: PersistShape }
  | { type: 'patch'; payload: Partial<PersistShape> }
  | { type: 'settings'; payload: Partial<Settings> }
  | { type: 'notifications'; payload: Partial<Settings['notifications']> }
  | { type: 'realtimeTaskChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any }
  | { type: 'realtimeEventChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any }
  | { type: 'realtimeReminderChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any }
  | { type: 'realtimeListChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any }
  | { type: 'realtimeCalendarChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any }
  | { type: 'realtimePlaceChange'; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; newRecord?: any; oldRecord?: any };

function reducer(state: PersistShape, action: Action): PersistShape {
  switch (action.type) {
    case 'hydrate':
      return action.payload;
    case 'patch':
      return { ...state, ...action.payload };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'notifications':
      return { ...state, settings: { ...state.settings, notifications: { ...state.settings.notifications, ...action.payload } } };
    case 'realtimeTaskChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          tasks: state.tasks.filter((t) => t.id !== oldRecord.id),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const task = mapTaskRow(newRecord);
        const exists = state.tasks.some((t) => t.id === task.id);
        const nextTasks = exists
          ? state.tasks.map((t) => (t.id === task.id ? task : t))
          : [task, ...state.tasks];
        return {
          ...state,
          tasks: nextTasks,
        };
      }
      return state;
    }
    case 'realtimeEventChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          events: state.events.filter((e) => e.id !== oldRecord.id),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const ev = mapEventRow(newRecord);
        const exists = state.events.some((e) => e.id === ev.id);
        const nextEvents = exists
          ? state.events.map((e) => (e.id === ev.id ? ev : e))
          : [...state.events, ev];
        return {
          ...state,
          events: nextEvents,
        };
      }
      return state;
    }
    case 'realtimeReminderChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          reminders: state.reminders.filter((r) => r.id !== oldRecord.id),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const rem = mapReminderRow(newRecord);
        const exists = state.reminders.some((r) => r.id === rem.id);
        const nextReminders = exists
          ? state.reminders.map((r) => (r.id === rem.id ? rem : r))
          : [rem, ...state.reminders];
        return {
          ...state,
          reminders: nextReminders,
        };
      }
      return state;
    }
    case 'realtimeListChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          lists: state.lists.filter((l) => l.id !== oldRecord.id),
          tasks: state.tasks.map((t) => (t.listId === oldRecord.id ? { ...t, listId: 'inbox' } : t)),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const list = mapListRow(newRecord);
        const exists = state.lists.some((l) => l.id === list.id);
        const nextLists = exists
          ? state.lists.map((l) => (l.id === list.id ? list : l))
          : [...state.lists, list];
        return {
          ...state,
          lists: nextLists,
        };
      }
      return state;
    }
    case 'realtimeCalendarChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          calendars: state.calendars.filter((c) => c.id !== oldRecord.id),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const cal = mapCalendarRow(newRecord);
        const exists = state.calendars.some((c) => c.id === cal.id);
        const nextCalendars = exists
          ? state.calendars.map((c) => (c.id === cal.id ? cal : c))
          : [...state.calendars, cal];
        return {
          ...state,
          calendars: nextCalendars,
        };
      }
      return state;
    }
    case 'realtimePlaceChange': {
      const { eventType, newRecord, oldRecord } = action;
      if (eventType === 'DELETE' && oldRecord?.id) {
        return {
          ...state,
          places: state.places.filter((p) => p.id !== oldRecord.id),
        };
      }
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord?.id) {
        const p = mapPlaceRow(newRecord);
        const exists = state.places.some((x) => x.id === p.id);
        const nextPlaces = exists
          ? state.places.map((x) => (x.id === p.id ? p : x))
          : [...state.places, p];
        return {
          ...state,
          places: nextPlaces,
        };
      }
      return state;
    }
    default:
      return state;
  }
}

export interface Ctx {
  ready: boolean;
  state: PersistShape;
  theme: AppTheme;
  scheme: ColorScheme;
  fontScale: number;
  // Direct state accessors
  events: CalEvent[];
  tasks: Task[];
  reminders: Reminder[];
  places: Place[];
  settings: Settings;
  chatMessages: ChatMessage[];
  googleConnected: boolean;
  googleUser: { email?: string; name?: string; picture?: string } | null;
  loadingWeather: boolean;
  calendarLoading: boolean;
  tasksLoading: boolean;
  // auth
  signIn: (email: string, name?: string, provider?: UserProfile['provider'], customId?: string, avatarUrl?: string) => void;
  signOut: () => Promise<void>;
  updateProfile: (p: Partial<UserProfile>) => void;
  setOnboarded: (v: boolean) => void;
  continueAsSignedOut: () => void;
  migrateGuestTasksToUser: (targetUserId: string) => Promise<{ success: boolean; count: number; migratedTasks: Task[] }>;
  // settings
  setSettings: (p: Partial<Settings>) => void;
  updateSettings: (p: Partial<Settings>) => void;
  setNotifications: (p: Partial<Settings['notifications']>) => void;
  // tasks
  addTask: (t: Partial<Task> & { title: string }) => Task;
  updateTask: (id: string, p: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addList: (name: string, color: string, icon: string) => void;
  deleteList: (id: string) => void;
  // events
  addEvent: (e: Partial<CalEvent> & { title: string }) => CalEvent;
  updateEvent: (id: string, p: Partial<CalEvent>) => void;
  deleteEvent: (id: string) => void;
  toggleCalendar: (id: string) => void;
  // reminders
  addReminder: (r: Partial<Reminder> & { title: string }) => void;
  updateReminder: (id: string, p: Partial<Reminder>) => void;
  deleteReminder: (id: string) => void;
  // places
  addPlace: (p: Place) => void;
  removePlace: (id: string) => void;
  setActivePlace: (idOrPlace: string | Place) => void;
  reorderPlace: (id: string, dir: -1 | 1) => void;
  refreshCurrentLocation: (requestPermission?: boolean) => Promise<{
    place: Place | null;
    status: LocationPermissionState;
    canAskAgain: boolean;
    errorMessage?: string;
  }>;
  // integrations
  setIntegrations: (p: Partial<IntegrationState>) => void;
  syncCalendar: (force?: boolean) => Promise<void>;
  syncTasks: (force?: boolean) => Promise<void>;
  syncGoogleData: (payload?: {
    calendars?: CalendarInfo[];
    events?: CalEvent[];
    lists?: TaskList[];
    tasks?: Task[];
    account?: string;
  }) => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  clearGoogleData: () => void;
  // chat
  pushChat: (m: ChatMessage) => void;
  addChatMessage: (m: ChatMessage) => void;
  updateChat: (id: string, p: Partial<ChatMessage>) => void;
  clearChat: () => void;
  bumpStat: (k: 'completedTotal' | 'plansMade', by?: number) => void;
  // weather
  weather: WeatherBundle | null;
  weatherLoading: boolean;
  weatherError: string | null;
  refreshWeather: (force?: boolean) => Promise<void>;
  activePlace: Place;
  weatherByPlace: Record<string, WeatherBundle>;
  loadPlaceWeather: (p: Place) => Promise<void>;
  resetAll: () => void;
  // cloud sync & multi-device
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  syncWithCloud: (force?: boolean, targetUserId?: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, () => defaultState(false, false));
  const [ready, setReady] = useState(false);
  const [systemDark, setSystemDark] = useState(true);
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherByPlace, setWeatherByPlace] = useState<Record<string, WeatherBundle>>({});
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const hydrated = useRef(false);
  const isSyncingRef = useRef(false);

  const nativeColorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const matcher = window.matchMedia('(prefers-color-scheme: dark)');
      setSystemDark(matcher.matches);
      const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
      matcher.addEventListener('change', listener);
      return () => matcher.removeEventListener('change', listener);
    } else if (nativeColorScheme) {
      setSystemDark(nativeColorScheme === 'dark');
    }
  }, [nativeColorScheme]);

  const syncWithCloud = useCallback(async (force = false, targetUserId?: string) => {
    const userId = targetUserId || state.user?.id;
    if (!userId || userId === 'guest_user' || !isValidUuid(userId) || !isSupabaseConfigured()) {
      setSyncStatus('idle');
      return;
    }

    if (isSyncingRef.current && !force) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');

    try {
      // 1. Flush durable pending mutations first (e.g. offline creations/edits/deletes)
      await flushPendingSyncQueue(userId);

      // 2. Fetch authoritative remote data
      const remote = await fetchRemoteUserData(userId);
      if (!remote) {
        setSyncStatus('error');
        return;
      }

      // 3. Reconcile local tasks with cloud tasks safely without data loss
      const deletedIds = await getDeletedTaskIds(userId);
      const { mergedTasks, tasksToUpload } = reconcileTasksWithCloud(
        userId,
        state.tasks,
        remote.tasks,
        deletedIds
      );

      // Upload legitimate local-only tasks to cloud idempotently
      if (tasksToUpload.length > 0) {
        for (const t of tasksToUpload) {
          try {
            await saveTaskToCloud(t, userId);
          } catch (e) {
            console.warn('[Sync] Failed to upload local task:', t.id, e);
          }
        }
      }

      // Reconcile task lists
      const localLists = state.lists.filter((l) => l.source !== 'google');
      const remoteListMap = new Map(remote.lists.map((l) => [l.id, l]));
      const mergedLists = [...remote.lists];
      for (const l of localLists) {
        if (!remoteListMap.has(l.id)) {
          await saveTaskListToCloud(l, userId).catch(() => {});
          mergedLists.push(l);
        }
      }
      const allLists = [
        ...mergedLists,
        ...state.lists.filter((l) => l.source === 'google'),
      ];

      // Reconcile events
      const localEvents = state.events.filter((e) => e.source !== 'google');
      const remoteEventMap = new Map(remote.events.map((e) => [e.id, e]));
      const mergedEvents = [...remote.events];
      for (const ev of localEvents) {
        if (!remoteEventMap.has(ev.id)) {
          await saveEventToCloud(ev, userId).catch(() => {});
          mergedEvents.push(ev);
        }
      }
      const allEvents = [
        ...mergedEvents,
        ...state.events.filter((e) => e.source === 'google'),
      ];

      // Reconcile calendars
      const localCals = state.calendars.filter((c) => c.source !== 'google');
      const remoteCalMap = new Map(remote.calendars.map((c) => [c.id, c]));
      const mergedCals = [...remote.calendars];
      for (const c of localCals) {
        if (!remoteCalMap.has(c.id)) {
          await saveCalendarToCloud(c, userId).catch(() => {});
          mergedCals.push(c);
        }
      }
      const allCals = [
        ...mergedCals,
        ...state.calendars.filter((c) => c.source === 'google'),
      ];

      // Merge remote authoritative records with local Google integration records
      dispatch({
        type: 'patch',
        payload: {
          user: remote.profile
            ? {
                id: userId,
                name: remote.profile.name || state.user?.name || 'User',
                email: remote.profile.email || state.user?.email || '',
                avatarColor: remote.profile.avatarColor || state.user?.avatarColor || '#3B5BFF',
                avatarUrl: remote.profile.avatarUrl || state.user?.avatarUrl,
                createdAt: remote.profile.createdAt || state.user?.createdAt || Date.now(),
                provider: state.user?.provider || (remote.profile.provider as any) || 'email',
                headline: remote.profile.headline || state.user?.headline || 'Planning smarter every day',
              }
            : state.user,
          settings: remote.settings
            ? { ...state.settings, ...remote.settings }
            : state.settings,
          tasks: mergedTasks,
          lists: allLists,
          events: allEvents,
          calendars: allCals,
          reminders: remote.reminders.length > 0 ? remote.reminders : state.reminders,
          places: remote.places.length > 0 ? remote.places : state.places,
          chat: remote.chat.length > 0 ? remote.chat : state.chat,
          stats: remote.stats ? remote.stats : state.stats,
        },
      });

      setLastSyncedAt(Date.now());
      setSyncStatus('synced');
    } catch (err) {
      console.error('[Sync] syncWithCloud failed:', err);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  }, [state.user?.id, state.tasks, state.lists, state.events, state.calendars, state.reminders, state.settings, state.places, state.chat, state.stats]);

  useEffect(() => {
    let mounted = true;

    // Safety watchdog: ensure ready is set to true within 3.5s no matter what happens
    const safetyTimer = setTimeout(() => {
      if (mounted && !hydrated.current) {
        console.warn('[Store] Hydration safety timer fired - forcing ready state');
        hydrated.current = true;
        setReady(true);
      }
    }, 3500);

    (async () => {
      let initialPersist: PersistShape = defaultState();
      let activeUserId: string | null = null;
      let activeUserObj: UserProfile | null = null;

      try {
        // 1. Check if returning from Supabase OAuth with an authorization code or error (Web only)
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
          try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get('code');
            const urlErr =
              url.searchParams.get('error_description') ||
              url.searchParams.get('error') ||
              url.searchParams.get('auth_error');

            if (urlErr && window.sessionStorage) {
              window.sessionStorage.setItem('@weatherwhattodo/auth_error', urlErr);
            }

            if (isSupabaseConfigured() && code) {
              const { session, error: exchangeErr } = await exchangeSupabaseCode(code);
              if (exchangeErr) {
                console.error('[Supabase OAuth Callback Error]:', exchangeErr);
                if (window.sessionStorage) {
                  window.sessionStorage.setItem(
                    '@weatherwhattodo/auth_error',
                    exchangeErr.message || 'Google sign-in could not be completed.'
                  );
                }
              } else if (session?.user) {
                if (window.sessionStorage) {
                  window.sessionStorage.removeItem('@weatherwhattodo/auth_error');
                }
                const u = session.user;
                activeUserId = u.id;
                const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
                const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
                activeUserObj = {
                  id: u.id,
                  name,
                  email: u.email || '',
                  avatarColor: '#3B5BFF',
                  avatarUrl: avatar,
                  createdAt: new Date(u.created_at).getTime() || Date.now(),
                  provider: 'google',
                  headline: 'Planning smarter every day',
                };
              }
            }

            // Clean up callback URL parameters without full page reload
            if (
              url.searchParams.has('code') ||
              url.searchParams.has('error') ||
              url.searchParams.has('error_description') ||
              url.pathname.includes('/auth/callback')
            ) {
              const cleanPath = url.pathname.replace(/\/auth\/callback\/?/, '/') || '/';
              if (typeof document !== 'undefined') {
                window.history.replaceState({}, document.title, cleanPath);
              }
            }
          } catch (e) {
            console.warn('[Supabase] Auth callback error:', e);
          }
        }

        // 2. Check active Supabase session if configured with strict 2.5s timeout
        if (!activeUserId && isSupabaseConfigured()) {
          try {
            const sessionPromise = getSupabaseSession();
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
            const session = await Promise.race([sessionPromise, timeoutPromise]);
            if (session?.user) {
              const u = session.user;
              activeUserId = u.id;
              const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
              const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
              activeUserObj = {
                id: u.id,
                name,
                email: u.email || '',
                avatarColor: '#3B5BFF',
                avatarUrl: avatar,
                createdAt: new Date(u.created_at).getTime() || Date.now(),
                provider: (u.app_metadata?.provider === 'google' ? 'google' : 'email'),
                headline: 'Planning smarter every day',
              };
              await setLastAuthMode(u.app_metadata?.provider === 'google' ? 'google' : 'email');
            }
          } catch (e) {
            console.warn('[Supabase] Session check error:', e);
          }
        }

        // 3. If no active Supabase session, check previous auth mode preference
        if (!activeUserId) {
          const lastMode = await getLastAuthMode();
          if (lastMode === 'guest') {
            activeUserId = 'guest_user';
            activeUserObj = {
              id: 'guest_user',
              name: 'Guest',
              email: 'guest@weatherwhattodo.app',
              avatarColor: '#64748B',
              createdAt: Date.now(),
              provider: 'guest',
              headline: 'Planning smarter every day',
            };
          }
          // Note: if lastMode is 'signed_out', 'google' (expired), or null (fresh install),
          // activeUserId stays null so the user is unauthenticated / signed-out.
        }

        // 4. Load user-partitioned local cache with strict 2.5s timeout
        const cacheKey = getUserStorageKey(activeUserId);
        const cachePromise = readLocalCache(cacheKey);
        const cacheTimeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
        let parsed = await Promise.race([cachePromise, cacheTimeoutPromise]);

        // Fallback migration: If partitioned cache doesn't exist yet, check legacy cache
        if (!parsed && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
          try {
            const raw = window.localStorage.getItem(LEGACY_KEY);
            if (raw) {
              const legacy = JSON.parse(raw);
              if (!activeUserId || legacy.user?.id === activeUserId) {
                parsed = legacy;
              }
            }
          } catch {}
        }

        if (parsed) {
          initialPersist = {
            ...defaultState(Boolean(parsed.onboarded), Boolean(parsed.hasSeenWelcome)),
            ...parsed,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(parsed.settings || {}),
              notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.settings?.notifications || {}) },
            },
          };
        }

        if (activeUserObj) {
          initialPersist.user = {
            ...initialPersist.user,
            ...activeUserObj,
          };
          initialPersist.onboarded = true;
          initialPersist.hasSeenWelcome = true;
        }

        // If places are empty, check if we have a saved last-known device place
        if (initialPersist.places.length === 0) {
          try {
            const savedLastPlace = await getLastKnownPlace();
            if (savedLastPlace) {
              initialPersist.places = [savedLastPlace];
              initialPersist.activePlaceId = 'current';
            }
          } catch {}
        }

        if (mounted) {
          dispatch({ type: 'hydrate', payload: initialPersist });
          hydrated.current = true;
          // Hydrate persistent cached weather
          try {
            const cachedWeather = await readLocalCache(WEATHER_CACHE_KEY);
            if (cachedWeather && typeof cachedWeather === 'object') {
              setWeatherByPlace(cachedWeather);
              const activeId = initialPersist.activePlaceId;
              const place = initialPersist.places.find((p) => p.id === activeId) ?? initialPersist.places[0];
              if (place && cachedWeather[place.id]) {
                setWeather(cachedWeather[place.id]);
                setWeatherLoading(false);
              }
            }
          } catch {}
          setReady(true);
        }

        // 4. Background cloud sync for authenticated users
        if (activeUserId && activeUserId !== 'guest_user') {
          syncWithCloud(false, activeUserId).catch((err) => {
            console.warn('[Store] Background sync error:', err);
          });
        }
      } catch (hydrationErr) {
        console.error('[Store] Critical hydration error:', hydrationErr);
        if (mounted) {
          dispatch({ type: 'hydrate', payload: initialPersist });
          hydrated.current = true;
          setReady(true);
        }
      } finally {
        clearTimeout(safetyTimer);
        if (mounted && !hydrated.current) {
          hydrated.current = true;
          setReady(true);
        }
      }
    })();

    // 5. Supabase Auth State changes listener
    let authSub: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        const { data } = client.auth.onAuthStateChange(async (event, session) => {
          if (!mounted) return;
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              const u = session.user;
              const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
              const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
              const usr: UserProfile = {
                id: u.id,
                name,
                email: u.email || '',
                avatarColor: '#3B5BFF',
                avatarUrl: avatar,
                createdAt: new Date(u.created_at).getTime() || Date.now(),
                provider: (u.app_metadata?.provider === 'google' ? 'google' : 'email'),
                headline: 'Planning smarter every day',
              };
              dispatch({
                type: 'patch',
                payload: {
                  user: usr,
                  onboarded: true,
                },
              });
              saveProfileToCloud(usr, u.id).catch(() => {});
              syncWithCloud(false, u.id);
            }
          } else if (event === 'SIGNED_OUT') {
            clearUserNotifications(state.user?.id || 'guest_user');
            dispatch({ type: 'hydrate', payload: defaultState() });
            setSyncStatus('idle');
          }
        });
        authSub = data.subscription;
      }
    }

    return () => {
      mounted = false;
      if (authSub) {
        authSub.unsubscribe();
      }
    };
  }, []);

  // Realtime subscription for cross-device synchronization
  useEffect(() => {
    const userId = state.user?.id;
    if (!ready || !userId || userId === 'guest_user' || !isValidUuid(userId) || !isSupabaseConfigured()) {
      return;
    }

    const unsubscribe = subscribeToRealtimeChanges(userId, (change: RemoteChange) => {
      const { table, eventType, newRecord, oldRecord } = change;

      if (table === 'tasks') {
        dispatch({ type: 'realtimeTaskChange', eventType, newRecord, oldRecord });
        if (eventType === 'DELETE' && oldRecord?.id) {
          cancelTaskNotification(oldRecord.id, userId);
        } else if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
          const task = mapTaskRow(newRecord);
          rescheduleTaskNotification(task, userId, state.settings);
        }
      } else if (table === 'events') {
        dispatch({ type: 'realtimeEventChange', eventType, newRecord, oldRecord });
        if (eventType === 'DELETE' && oldRecord?.id) {
          cancelEventNotification(oldRecord.id, userId);
        } else if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
          const ev = mapEventRow(newRecord);
          rescheduleEventNotification(ev, userId, state.settings);
        }
      } else if (table === 'reminders') {
        dispatch({ type: 'realtimeReminderChange', eventType, newRecord, oldRecord });
      } else if (table === 'user_settings' && newRecord) {
        const remoteSettings = mapSettingsRow(newRecord);
        dispatch({ type: 'settings', payload: remoteSettings });
      } else if (table === 'task_lists') {
        dispatch({ type: 'realtimeListChange', eventType, newRecord, oldRecord });
      } else if (table === 'calendars') {
        dispatch({ type: 'realtimeCalendarChange', eventType, newRecord, oldRecord });
      } else if (table === 'places') {
        dispatch({ type: 'realtimePlaceChange', eventType, newRecord, oldRecord });
      } else if (table === 'ask_clever_messages' && newRecord) {
        const msg = mapChatRow(newRecord);
        dispatch({ type: 'patch', payload: { chat: [...state.chat.filter((m) => m.id !== msg.id), msg] } });
      }
    });

    return unsubscribe;
  }, [ready, state.user?.id]);

  // Initialize notification background engine
  useEffect(() => {
    const cleanup = initNotificationEngine();
    return cleanup;
  }, []);

  // Sync scheduled notifications with current user's tasks and events
  useEffect(() => {
    if (!ready) return;
    const userId = state.user?.id || 'signed_out_user';
    syncAllNotifications(state.tasks, state.events, userId, state.settings);
  }, [ready, state.user?.id, state.tasks, state.events, state.settings.notifications]);

  // Persist state to partitioned local storage
  useEffect(() => {
    if (!hydrated.current) return;
    const storageKey = getUserStorageKey(state.user?.id);
    const id = setTimeout(() => {
      writeLocalCache(storageKey, state).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [state]);

  const fallbackPlace: Place = useMemo(() => ({
    id: 'current',
    name: 'Current location',
    lat: 0,
    lon: 0,
  }), []);

  const activePlace = useMemo(
    () => state.places.find((p) => p.id === state.activePlaceId) ?? state.places[0] ?? fallbackPlace,
    [state.places, state.activePlaceId, fallbackPlace]
  );

  const refreshWeather = useCallback(async (force = false) => {
    const place = state.places.find((p) => p.id === state.activePlaceId) ?? state.places[0];
    if (!place || (place.lat === 0 && place.lon === 0)) {
      setWeatherLoading(false);
      return;
    }
    const cached = weatherByPlace[place.id];
    if (!force && cached && Date.now() - cached.fetchedAt < 1000 * 60 * 10) {
      setWeather(cached);
      setWeatherLoading(false);
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const b = await fetchWeather(place);
      setWeather(b);
      setWeatherByPlace((m) => {
        const next = { ...m, [place.id]: b };
        writeLocalCache(WEATHER_CACHE_KEY, next).catch(() => {});
        return next;
      });
      if (b.source === 'offline') setWeatherError('Showing modelled forecast — live data unavailable');
    } catch {
      if (cached) {
        setWeather(cached);
        setWeatherError('Offline mode — displaying cached forecast');
      } else {
        const b = synthesize(place);
        setWeather(b);
        setWeatherError('Offline mode');
      }
    } finally {
      setWeatherLoading(false);
    }
  }, [state.activePlaceId, state.places, weatherByPlace]);

  const loadPlaceWeather = useCallback(async (p: Place) => {
    const cached = weatherByPlace[p.id];
    if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 15) return;
    try {
      const b = await fetchWeather(p);
      setWeatherByPlace((m) => {
        const next = { ...m, [p.id]: b };
        writeLocalCache(WEATHER_CACHE_KEY, next).catch(() => {});
        return next;
      });
    } catch {}
  }, [weatherByPlace]);

  // Persistent device location handling:
  // 1. If user already has a saved place, use it immediately as temporary fallback.
  // 2. On mount, if location permission is already granted, refresh the device's actual current location
  //    and weather in the background without prompting the user.
  // 3. Never hardcode a fixed city or show repeated unprovoked permission dialogs.
  useEffect(() => {
    if (!ready) return;

    (async () => {
      try {
        const { status } = await checkLocationPermission();
        if (status === 'granted') {
          const res = await resolveCurrentDevicePlace(false);
          if (res.place) {
            const others = state.places.filter((p) => p.id !== 'current');
            dispatch({
              type: 'patch',
              payload: {
                places: [res.place, ...others],
                activePlaceId: state.activePlaceId === 'current' || state.places.length === 0 ? 'current' : state.activePlaceId,
              },
            });
          }
        }
      } catch (err) {
        console.warn('[Store] Background location refresh error:', err);
      }
    })();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    refreshWeather();
  }, [ready, state.activePlaceId, refreshWeather]);

  // Auto-sync Google Calendar & Tasks when connected and app mounts or returns to active
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const isGoogleConnected = Boolean(state.integrations.googleCalendar || state.integrations.googleTasks);
    if (!isGoogleConnected) return;

    const checkAndSync = async () => {
      const token = await getValidAccessToken();
      if (!token) return;
      const now = Date.now();
      const calStale = !state.integrations.lastSyncCalendar || (now - state.integrations.lastSyncCalendar > 60000);
      const taskStale = !state.integrations.lastSyncTasks || (now - state.integrations.lastSyncTasks > 60000);

      if (calStale || taskStale) {
        try {
          const data = await fetchAllGoogleData();
          const user = await getStoredGoogleUser();
          dispatch({
            type: 'patch',
            payload: {
              calendars: [
                ...state.calendars.filter((c) => c.source !== 'google' && c.id !== 'cal_primary'),
                ...data.calendars,
              ],
              events: [
                ...state.events.filter((e) => e.source !== 'google'),
                ...data.events,
              ],
              lists: [
                ...state.lists.filter((l) => l.source !== 'google' && l.id !== 'inbox'),
                ...data.lists,
              ],
              tasks: [
                ...state.tasks.filter((t) => t.source !== 'google'),
                ...data.tasks,
              ],
              integrations: {
                ...state.integrations,
                googleCalendar: true,
                googleTasks: true,
                account: user?.email || state.integrations.account,
                lastSyncCalendar: now,
                lastSyncTasks: now,
              },
            },
          });
        } catch {}
      }
    };

    checkAndSync();

    if (Platform.OS === 'web') {
      const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          checkAndSync();
          if (state.user?.id && state.user.id !== 'guest_user') {
            syncWithCloud(true);
          }
        }
      };
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    } else {
      const sub = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          checkAndSync();
          if (state.user?.id && state.user.id !== 'guest_user') {
            syncWithCloud(true);
          }
        }
      });
      return () => sub.remove();
    }
  }, [ready, state.integrations.googleCalendar, state.integrations.googleTasks, state.user?.id, syncWithCloud]);

  const scheme: ColorScheme = state.settings.themeMode === 'system'
    ? (systemDark ? 'dark' : 'light')
    : state.settings.themeMode;

  const theme = useMemo(() => getTheme(scheme, state.settings.highContrast), [scheme, state.settings.highContrast]);
  const fontScale = state.settings.largeText ? 1.14 : 1;

  const api: Ctx = useMemo(() => ({
    ready,
    state,
    theme,
    scheme,
    fontScale,
    syncStatus,
    lastSyncedAt,
    syncWithCloud,
    signIn: (email, name, provider = 'email', customId?: string, avatarUrl?: string) => {
      // 1. Explicit handling for Guest session
      if (provider === 'guest') {
        setLastAuthMode('guest').catch(() => {});
        dispatch({
          type: 'patch',
          payload: {
            user: {
              id: 'guest_user',
              name: 'Guest',
              email: 'guest@weatherwhattodo.app',
              avatarColor: '#64748B',
              avatarUrl: undefined,
              createdAt: Date.now(),
              provider: 'guest',
              headline: 'Planning smarter every day',
            },
            integrations: {
              googleCalendar: false,
              googleTasks: false,
              account: undefined,
              lastSyncCalendar: undefined,
              lastSyncTasks: undefined,
            },
            onboarded: true,
            hasSeenWelcome: true,
          },
        });
        setSyncStatus('idle');
        return;
      }

      // 2. Handling for Authenticated users (Google or Email/Password)
      setLastAuthMode(provider === 'google' ? 'google' : 'email').catch(() => {});
      const colors = ['#3B5BFF', '#7B5BFF', '#0FA968', '#E8890C', '#E5484D', '#0C8CE9'];
      const rawName = name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const nm = (rawName.trim() === 'Guest' || rawName.trim() === 'Guest User') ? (email.split('@')[0] || 'User') : rawName;
      const existingId = (state.user && state.user.provider !== 'guest' && state.user.email === email && isValidUuid(state.user.id))
        ? state.user.id
        : undefined;
      const userId = (customId && isValidUuid(customId))
        ? customId
        : (existingId || customId || uid('u'));

      const userProfile: UserProfile = {
        id: userId,
        name: nm,
        email,
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        avatarUrl: avatarUrl || (state.user?.provider !== 'guest' ? state.user?.avatarUrl : undefined),
        createdAt: (state.user && state.user.provider !== 'guest') ? state.user.createdAt : Date.now(),
        provider,
        headline: (state.user && state.user.provider !== 'guest' ? state.user.headline : 'Planning smarter every day'),
      };

      dispatch({
        type: 'patch',
        payload: {
          user: userProfile,
          onboarded: true,
          hasSeenWelcome: true,
        },
      });

      if (isValidUuid(userId)) {
        saveProfileToCloud(userProfile, userId).catch(() => {});
        syncWithCloud(true, userId);
      } else if (isSupabaseConfigured()) {
        getSupabaseSession().then((session) => {
          if (session?.user?.id && isValidUuid(session.user.id)) {
            const canonicalId = session.user.id;
            const updatedProfile = { ...userProfile, id: canonicalId };
            dispatch({ type: 'patch', payload: { user: updatedProfile } });
            saveProfileToCloud(updatedProfile, canonicalId).catch(() => {});
            syncWithCloud(true, canonicalId);
          }
        }).catch(() => {});
      }
    },
    continueAsSignedOut: () => {
      setLastAuthMode('signed_out').catch(() => {});
      dispatch({
        type: 'patch',
        payload: {
          user: null,
          onboarded: true,
          hasSeenWelcome: true,
        },
      });
    },
    migrateGuestTasksToUser: async (targetUserId: string) => {
      const nonGoogleTasks = state.tasks.filter((t) => t.source !== 'google');
      const res = await migrateGuestTasksService(targetUserId, nonGoogleTasks);
      if (res.success && res.migratedTasks.length > 0) {
        dispatch({
          type: 'patch',
          payload: {
            tasks: [...res.migratedTasks, ...state.tasks.filter((t) => t.source === 'google')],
          },
        });
      }
      return res;
    },
    signOut: async () => {
      const currentUserId = state.user?.id || 'guest_user';
      clearUserNotifications(currentUserId);
      try {
        await signOutSupabase();
      } catch (err) {
        console.warn('SignOut error:', err);
      }
      try {
        await clearStoredGoogleTokens();
      } catch {}
      await setLastAuthMode('signed_out');
      const signedOutCache = await readLocalCache(getUserStorageKey(null));
      const nextSignedOutState: PersistShape = signedOutCache
        ? {
            ...defaultState(true, true),
            ...signedOutCache,
            user: null,
            onboarded: true,
            hasSeenWelcome: true,
            places: state.places.length > 0 ? state.places : signedOutCache.places || [],
            activePlaceId: state.activePlaceId || 'current',
            integrations: {
              googleCalendar: false,
              googleTasks: false,
              account: undefined,
            },
          }
        : {
            ...defaultState(true, true),
            places: state.places,
            activePlaceId: state.activePlaceId,
          };
      dispatch({ type: 'hydrate', payload: nextSignedOutState });
      setSyncStatus('idle');
      setLastSyncedAt(null);
    },
    deleteAccount: async () => {
      const currentUserId = state.user?.id;
      if (!currentUserId || currentUserId === 'guest_user') {
        clearUserNotifications(currentUserId || 'guest_user');
        await setLastAuthMode('signed_out');
        dispatch({ type: 'hydrate', payload: defaultState(true, true) });
        setSyncStatus('idle');
        return;
      }

      clearUserNotifications(currentUserId);
      try {
        await deleteAccountData(currentUserId);
      } catch (err) {
        console.error('deleteAccountData error:', err);
      }
      try {
        await signOutSupabase();
      } catch {}
      try {
        await clearStoredGoogleTokens();
      } catch {}
      await removeLocalCache(getUserStorageKey(currentUserId));
      await setLastAuthMode('signed_out');
      dispatch({ type: 'hydrate', payload: defaultState(true, true) });
      setSyncStatus('idle');
      setLastSyncedAt(null);
    },
    updateProfile: (p) => {
      if (!state.user) return;
      const updatedUser = { ...state.user, ...p };
      dispatch({ type: 'patch', payload: { user: updatedUser } });
      if (updatedUser.id && updatedUser.id !== 'guest_user') {
        saveProfileToCloud(updatedUser, updatedUser.id).catch(() => {});
      }
    },
    setOnboarded: (v) => dispatch({ type: 'patch', payload: { onboarded: v } }),
    setSettings: (p) => {
      const nextSettings = { ...state.settings, ...p };
      dispatch({ type: 'settings', payload: p });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveSettingsToCloud(nextSettings, state.user.id).catch(() => {});
      }
    },
    updateSettings: (p) => {
      const nextSettings = { ...state.settings, ...p };
      dispatch({ type: 'settings', payload: p });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveSettingsToCloud(nextSettings, state.user.id).catch(() => {});
      }
    },
    setNotifications: (p) => {
      const nextSettings = {
        ...state.settings,
        notifications: { ...state.settings.notifications, ...p },
      };
      dispatch({ type: 'notifications', payload: p });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveSettingsToCloud(nextSettings, state.user.id).catch(() => {});
      }
    },
    addTask: (t) => {
      const task: Task = { id: t.id ?? uid('t'), createdAt: t.createdAt ?? Date.now(), ...t } as Task;
      dispatch({ type: 'patch', payload: { tasks: [task, ...state.tasks] } });
      const userId = state.user?.id || 'guest_user';
      scheduleTaskNotification(task, userId, state.settings);
      if (isValidUuid(state.user?.id)) {
        setSyncStatus('syncing');
        saveTaskToCloud(task, state.user!.id)
          .then(() => {
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
          })
          .catch((err) => {
            console.warn('[Sync] Failed to save task immediately, enqueuing for background sync:', err);
            setSyncStatus('error');
            enqueuePendingSync(state.user!.id, {
              id: task.id,
              table: 'tasks',
              action: 'upsert',
              record: task,
              timestamp: Date.now(),
            }).catch(() => {});
          });
      }
      return task;
    },
    updateTask: (id, p) => {
      const nextTasks = state.tasks.map((t) => (t.id === id ? { ...t, ...p } : t));
      dispatch({ type: 'patch', payload: { tasks: nextTasks } });
      const updated = nextTasks.find((t) => t.id === id);
      const userId = state.user?.id || 'guest_user';
      if (updated) {
        rescheduleTaskNotification(updated, userId, state.settings);
        if (isValidUuid(state.user?.id)) {
          setSyncStatus('syncing');
          saveTaskToCloud(updated, state.user!.id)
            .then(() => {
              setSyncStatus('synced');
              setLastSyncedAt(Date.now());
            })
            .catch((err) => {
              console.warn('[Sync] Failed to update task in cloud, enqueuing:', err);
              setSyncStatus('error');
              enqueuePendingSync(state.user!.id, {
                id: updated.id,
                table: 'tasks',
                action: 'upsert',
                record: updated,
                timestamp: Date.now(),
              }).catch(() => {});
            });
        }
      }
    },
    toggleTask: (id) => {
      const t = state.tasks.find((x) => x.id === id);
      const nowDone = t ? !t.done : true;
      const userId = state.user?.id || 'guest_user';
      const updatedTask = t ? { ...t, done: nowDone, completedAt: nowDone ? Date.now() : undefined } : null;

      dispatch({
        type: 'patch',
        payload: {
          tasks: state.tasks.map((x) => (x.id === id ? { ...x, done: nowDone, completedAt: nowDone ? Date.now() : undefined } : x)),
          stats: { ...state.stats, completedTotal: state.stats.completedTotal + (nowDone ? 1 : -1) },
        },
      });
      if (nowDone) {
        cancelTaskNotification(id, userId);
      } else if (t) {
        scheduleTaskNotification({ ...t, done: false }, userId, state.settings);
      }
      if (updatedTask && isValidUuid(state.user?.id)) {
        setSyncStatus('syncing');
        saveTaskToCloud(updatedTask, state.user!.id)
          .then(() => {
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
          })
          .catch((err) => {
            console.warn('[Sync] Failed to save toggled task in cloud, enqueuing:', err);
            setSyncStatus('error');
            enqueuePendingSync(state.user!.id, {
              id: updatedTask.id,
              table: 'tasks',
              action: 'upsert',
              record: updatedTask,
              timestamp: Date.now(),
            }).catch(() => {});
          });
      }
      // Synchronize completion status with Google Tasks API if it is a Google task
      if (t && t.source === 'google' && t.listId) {
        updateGoogleTaskStatus(t.listId, t.id, nowDone).catch((err) => {
          console.warn('Failed to sync task status to Google Tasks:', err);
        });
      }
    },
    deleteTask: (id) => {
      const task = state.tasks.find((t) => t.id === id);
      const userId = state.user?.id || 'guest_user';
      cancelTaskNotification(id, userId);
      dispatch({ type: 'patch', payload: { tasks: state.tasks.filter((t) => t.id !== id) } });
      if (isValidUuid(state.user?.id)) {
        recordDeletedTaskId(state.user!.id, id).catch(() => {});
        setSyncStatus('syncing');
        deleteTaskFromCloud(id, state.user!.id)
          .then(() => {
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
          })
          .catch((err) => {
            console.warn('[Sync] Failed to delete task in cloud, enqueuing:', err);
            setSyncStatus('error');
            enqueuePendingSync(state.user!.id, {
              id,
              table: 'tasks',
              action: 'delete',
              timestamp: Date.now(),
            }).catch(() => {});
          });
      }
      if (task && task.source === 'google' && task.listId) {
        deleteGoogleTask(task.listId, task.id).catch((err) => {
          console.warn('Failed to sync task deletion to Google Tasks:', err);
        });
      }
    },
    addList: (name, color, icon) => {
      const newList: TaskList = { id: uid('l'), name, color, icon, source: 'local' };
      dispatch({ type: 'patch', payload: { lists: [...state.lists, newList] } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveTaskListToCloud(newList, state.user.id).catch(() => {});
      }
    },
    deleteList: (id) => {
      dispatch({
        type: 'patch',
        payload: {
          lists: state.lists.filter((l) => l.id !== id),
          tasks: state.tasks.map((t) => (t.listId === id ? { ...t, listId: 'inbox' } : t)),
        },
      });
      if (state.user?.id && state.user.id !== 'guest_user') {
        deleteTaskListFromCloud(id, state.user.id).catch(() => {});
      }
    },
    addEvent: (e) => {
      const ev: CalEvent = { id: e.id ?? uid('e'), ...e } as CalEvent;
      dispatch({ type: 'patch', payload: { events: [...state.events, ev] } });
      const userId = state.user?.id || 'guest_user';
      scheduleEventNotification(ev, userId, state.settings);
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveEventToCloud(ev, state.user.id).catch(() => {});
      }
      return ev;
    },
    updateEvent: (id, p) => {
      const nextEvents = state.events.map((e) => (e.id === id ? { ...e, ...p } : e));
      dispatch({ type: 'patch', payload: { events: nextEvents } });
      const updated = nextEvents.find((e) => e.id === id);
      const userId = state.user?.id || 'guest_user';
      if (updated) {
        rescheduleEventNotification(updated, userId, state.settings);
        if (state.user?.id && state.user.id !== 'guest_user') {
          saveEventToCloud(updated, state.user.id).catch(() => {});
        }
      }
    },
    deleteEvent: (id) => {
      const event = state.events.find((e) => e.id === id);
      const userId = state.user?.id || 'guest_user';
      cancelEventNotification(id, userId);
      dispatch({ type: 'patch', payload: { events: state.events.filter((e) => e.id !== id) } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        deleteEventFromCloud(id, state.user.id).catch(() => {});
      }
      if (event && event.source === 'google' && event.calendarId) {
        deleteGoogleEvent(event.calendarId, event.id).catch((err) => {
          console.warn('Failed to sync event deletion to Google Calendar:', err);
        });
      }
    },
    toggleCalendar: (id) => {
      const nextCalendars = state.calendars.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
      dispatch({ type: 'patch', payload: { calendars: nextCalendars } });
      const updated = nextCalendars.find((c) => c.id === id);
      if (updated && state.user?.id && state.user.id !== 'guest_user') {
        saveCalendarToCloud(updated, state.user.id).catch(() => {});
      }
    },
    addReminder: (r) => {
      const newRem: Reminder = { id: uid('r'), createdAt: Date.now(), enabled: true, trigger: 'time' as const, repeat: 'none' as const, ...r };
      dispatch({ type: 'patch', payload: { reminders: [newRem, ...state.reminders] } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveReminderToCloud(newRem, state.user.id).catch(() => {});
      }
    },
    updateReminder: (id, p) => {
      const nextReminders = state.reminders.map((r) => (r.id === id ? { ...r, ...p } : r));
      dispatch({ type: 'patch', payload: { reminders: nextReminders } });
      const updated = nextReminders.find((r) => r.id === id);
      if (updated && state.user?.id && state.user.id !== 'guest_user') {
        saveReminderToCloud(updated, state.user.id).catch(() => {});
      }
    },
    deleteReminder: (id) => {
      dispatch({ type: 'patch', payload: { reminders: state.reminders.filter((r) => r.id !== id) } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        deleteReminderFromCloud(id, state.user.id).catch(() => {});
      }
    },
    events: state.events,
    tasks: state.tasks,
    reminders: state.reminders,
    places: state.places,
    settings: state.settings,
    chatMessages: state.chat,
    googleConnected: Boolean(state.integrations.googleCalendar || state.integrations.googleTasks),
    googleUser: state.integrations.account ? { email: state.integrations.account } : null,
    loadingWeather: weatherLoading,
    calendarLoading,
    tasksLoading,
    addChatMessage: (m) => {
      dispatch({ type: 'patch', payload: { chat: [...state.chat, m] } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveChatMessageToCloud(m, state.user.id).catch(() => {});
      }
    },
    addPlace: (p) => {
      if (p.id === 'current') {
        const others = state.places.filter((x) => x.id !== 'current');
        dispatch({ type: 'patch', payload: { places: [p, ...others], activePlaceId: 'current' } });
        return;
      }
      if (state.places.some((x) => x.id === p.id)) {
        dispatch({ type: 'patch', payload: { activePlaceId: p.id } });
        return;
      }
      dispatch({ type: 'patch', payload: { places: [...state.places, p], activePlaceId: p.id } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        savePlaceToCloud(p, state.user.id, state.places.length).catch(() => {});
      }
    },
    removePlace: (id) => {
      const next = state.places.filter((p) => p.id !== id);
      dispatch({
        type: 'patch',
        payload: { places: next, activePlaceId: state.activePlaceId === id ? (next[0]?.id ?? 'current') : state.activePlaceId },
      });
      if (state.user?.id && state.user.id !== 'guest_user') {
        deletePlaceFromCloud(id, state.user.id).catch(() => {});
      }
    },
    setActivePlace: (idOrPlace) => {
      const id = typeof idOrPlace === 'string' ? idOrPlace : idOrPlace.id;
      dispatch({ type: 'patch', payload: { activePlaceId: id } });
    },
    reorderPlace: (id, dir) => {
      const arr = [...state.places];
      const i = arr.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      dispatch({ type: 'patch', payload: { places: arr } });
    },
    refreshCurrentLocation: async (requestPermission = false) => {
      const res = await resolveCurrentDevicePlace(requestPermission);
      if (res.place) {
        const others = state.places.filter((p) => p.id !== 'current');
        dispatch({
          type: 'patch',
          payload: {
            places: [res.place, ...others],
            activePlaceId: 'current',
          },
        });
        if (state.user?.id && state.user.id !== 'guest_user') {
          savePlaceToCloud(res.place, state.user.id, 0).catch(() => {});
        }
      }
      return res;
    },
    setIntegrations: (p: Partial<IntegrationState>) =>
      dispatch({ type: 'patch', payload: { integrations: { ...state.integrations, ...p } } }),
    syncCalendar: async (force = false) => {
      try {
        const token = await getValidAccessToken();
        if (!token) return;
        const now = Date.now();
        if (!force && state.integrations.lastSyncCalendar && now - state.integrations.lastSyncCalendar < 45000) {
          return;
        }
        setCalendarLoading(true);
        const { calendars, events } = await fetchGoogleCalendarData();
        const user = await getStoredGoogleUser();
        dispatch({
          type: 'patch',
          payload: {
            calendars: [
              ...state.calendars.filter((c) => c.source !== 'google' && c.id !== 'cal_primary'),
              ...calendars,
            ],
            events: [
              ...state.events.filter((e) => e.source !== 'google'),
              ...events,
            ],
            integrations: {
              ...state.integrations,
              googleCalendar: true,
              account: user?.email || state.integrations.account,
              lastSyncCalendar: now,
            },
          },
        });
      } catch (err) {
        console.warn('Calendar sync error:', err);
      } finally {
        setCalendarLoading(false);
      }
    },
    syncTasks: async (force = false) => {
      try {
        const token = await getValidAccessToken();
        if (!token) return;
        const now = Date.now();
        if (!force && state.integrations.lastSyncTasks && now - state.integrations.lastSyncTasks < 45000) {
          return;
        }
        setTasksLoading(true);
        const { lists, tasks } = await fetchGoogleTasksData();
        const user = await getStoredGoogleUser();
        dispatch({
          type: 'patch',
          payload: {
            lists: [
              ...state.lists.filter((l) => l.source !== 'google' && l.id !== 'inbox'),
              ...lists,
            ],
            tasks: [
              ...state.tasks.filter((t) => t.source !== 'google'),
              ...tasks,
            ],
            integrations: {
              ...state.integrations,
              googleTasks: true,
              account: user?.email || state.integrations.account,
              lastSyncTasks: now,
            },
          },
        });
      } catch (err) {
        console.warn('Tasks sync error:', err);
      } finally {
        setTasksLoading(false);
      }
    },
    syncGoogleData: async (payload) => {
      try {
        const user = await getStoredGoogleUser();
        const now = Date.now();
        setCalendarLoading(true);
        setTasksLoading(true);
        const data = payload
          ? {
              calendars: payload.calendars ?? [],
              events: payload.events ?? [],
              lists: payload.lists ?? [],
              tasks: payload.tasks ?? [],
            }
          : await fetchAllGoogleData();

        dispatch({
          type: 'patch',
          payload: {
            ...(payload?.calendars !== undefined || !payload
              ? { calendars: [...state.calendars.filter((c) => c.source !== 'google' && c.id !== 'cal_primary'), ...data.calendars] }
              : {}),
            ...(payload?.events !== undefined || !payload
              ? { events: [...state.events.filter((e) => e.source !== 'google'), ...data.events] }
              : {}),
            ...(payload?.lists !== undefined || !payload
              ? { lists: [...state.lists.filter((l) => l.source !== 'google' && l.id !== 'inbox'), ...data.lists] }
              : {}),
            ...(payload?.tasks !== undefined || !payload
              ? { tasks: [...state.tasks.filter((t) => t.source !== 'google'), ...data.tasks] }
              : {}),
            integrations: {
              ...state.integrations,
              googleCalendar: true,
              googleTasks: true,
              account: payload?.account || user?.email || state.integrations.account,
              lastSyncCalendar: payload?.calendars || payload?.events || !payload ? now : state.integrations.lastSyncCalendar,
              lastSyncTasks: payload?.lists || payload?.tasks || !payload ? now : state.integrations.lastSyncTasks,
            },
          },
        });
      } catch (err) {
        console.warn('Sync error:', err);
      } finally {
        setCalendarLoading(false);
        setTasksLoading(false);
      }
    },
    disconnectGoogle: async () => {
      const currentUserId = state.user?.id || 'guest_user';
      clearGoogleNotifications(currentUserId);
      await disconnectGoogleAccount();
      dispatch({
        type: 'patch',
        payload: {
          calendars: state.calendars.filter((c) => c.source !== 'google'),
          events: state.events.filter((e) => e.source !== 'google'),
          lists: state.lists.filter((l) => l.source !== 'google'),
          tasks: state.tasks.filter((t) => t.source !== 'google'),
          integrations: {
            googleCalendar: false,
            googleTasks: false,
            account: undefined,
            lastSyncCalendar: undefined,
            lastSyncTasks: undefined,
          },
        },
      });
    },
    clearGoogleData: () => {
      const currentUserId = state.user?.id || 'guest_user';
      clearGoogleNotifications(currentUserId);
      dispatch({
        type: 'patch',
        payload: {
          calendars: state.calendars.filter((c) => c.source !== 'google'),
          events: state.events.filter((e) => e.source !== 'google'),
          lists: state.lists.filter((l) => l.source !== 'google'),
          tasks: state.tasks.filter((t) => t.source !== 'google'),
          integrations: {
            googleCalendar: false,
            googleTasks: false,
            account: undefined,
            lastSyncCalendar: undefined,
            lastSyncTasks: undefined,
          },
        },
      });
    },
    pushChat: (m) => {
      dispatch({ type: 'patch', payload: { chat: [...state.chat, m] } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveChatMessageToCloud(m, state.user.id).catch(() => {});
      }
    },
    updateChat: (id, p) => {
      const nextChat = state.chat.map((c) => (c.id === id ? { ...c, ...p } : c));
      dispatch({ type: 'patch', payload: { chat: nextChat } });
      const updated = nextChat.find((c) => c.id === id);
      if (updated && state.user?.id && state.user.id !== 'guest_user') {
        saveChatMessageToCloud(updated, state.user.id).catch(() => {});
      }
    },
    clearChat: () => {
      dispatch({ type: 'patch', payload: { chat: [] } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        clearChatInCloud(state.user.id).catch(() => {});
      }
    },
    bumpStat: (k, by = 1) => {
      const nextStats = { ...state.stats, [k]: state.stats[k] + by };
      dispatch({ type: 'patch', payload: { stats: nextStats } });
      if (state.user?.id && state.user.id !== 'guest_user') {
        saveUserStatsToCloud(nextStats, state.user.id).catch(() => {});
      }
    },
    weather,
    weatherLoading,
    weatherError,
    refreshWeather,
    activePlace,
    weatherByPlace,
    loadPlaceWeather,
    resetAll: () => {
      const userId = state.user?.id || 'guest_user';
      removeLocalCache(getUserStorageKey(userId)).catch(() => {});
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LEGACY_KEY);
      }
      dispatch({ type: 'hydrate', payload: defaultState() });
      setSyncStatus('idle');
      setLastSyncedAt(null);
    },
  }), [
    ready,
    state,
    theme,
    scheme,
    fontScale,
    syncStatus,
    lastSyncedAt,
    syncWithCloud,
    weather,
    weatherLoading,
    weatherError,
    calendarLoading,
    tasksLoading,
    refreshWeather,
    activePlace,
    weatherByPlace,
    loadPlaceWeather,
  ]);

  return <AppCtx.Provider value={api}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useTheme() {
  return useApp().theme;
}
