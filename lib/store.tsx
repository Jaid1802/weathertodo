'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CalEvent, CalendarInfo, ChatMessage, IntegrationState, Reminder, Settings, Task, TaskList, UserProfile,
} from './types';
import { seedCalendars, seedEvents, seedLists, seedReminders, seedTasks } from './seed';
import { DEFAULT_PLACES, Place, WeatherBundle, fetchWeather, synthesize, reverseGeocode } from './weather';
import { AppTheme, ColorScheme, getTheme } from './theme';
import { dateKey, uid } from './utils';
import { getValidAccessToken, getStoredGoogleUser, disconnectGoogleAccount } from './googleAuth';
import {
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

const KEY = '@weatherwhattodo/v1';

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

function defaultState(): PersistShape {
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
    onboarded: true,
    stats: { streak: 0, lastActive: dateKey(new Date()), completedTotal: 0, plansMade: 0 },
  };
}

type Action =
  | { type: 'hydrate'; payload: PersistShape }
  | { type: 'patch'; payload: Partial<PersistShape> }
  | { type: 'settings'; payload: Partial<Settings> }
  | { type: 'notifications'; payload: Partial<Settings['notifications']> };

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
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as PersistShape, defaultState);
  const [ready, setReady] = useState(false);
  const [systemDark, setSystemDark] = useState(true);
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherByPlace, setWeatherByPlace] = useState<Record<string, WeatherBundle>>({});
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const matcher = window.matchMedia('(prefers-color-scheme: dark)');
      setSystemDark(matcher.matches);
      const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
      matcher.addEventListener('change', listener);
      return () => matcher.removeEventListener('change', listener);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      let initialPersist: PersistShape = defaultState();
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as PersistShape;
            initialPersist = {
              ...defaultState(),
              ...parsed,
              settings: {
                ...DEFAULT_SETTINGS,
                ...(parsed.settings || {}),
                notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.settings?.notifications || {}) },
              },
            };
          }
        } catch {}

        // 1. Check if returning from Supabase OAuth with an authorization code
        if (typeof window !== 'undefined' && window.location) {
          try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get('code');

            if (isSupabaseConfigured() && code) {
              const { session, error } = await exchangeSupabaseCode(code);
              if (session?.user) {
                const u = session.user;
                const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
                const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
                initialPersist.user = {
                  id: u.id,
                  name,
                  email: u.email || '',
                  avatarColor: initialPersist.user?.avatarColor || '#3B5BFF',
                  avatarUrl: avatar,
                  createdAt: new Date(u.created_at).getTime() || Date.now(),
                  provider: 'google',
                  headline: initialPersist.user?.headline || 'Planning smarter every day',
                };
                initialPersist.onboarded = true;
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
              window.history.replaceState({}, document.title, cleanPath);
            }
          } catch (e) {
            console.warn('[Supabase] Auth callback error:', e);
          }
        }

        // 2. Check active Supabase session if configured
        if (isSupabaseConfigured()) {
          try {
            const session = await getSupabaseSession();
            if (session?.user) {
              const u = session.user;
              const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
              const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
              initialPersist.user = {
                id: u.id,
                name,
                email: u.email || '',
                avatarColor: initialPersist.user?.avatarColor || '#3B5BFF',
                avatarUrl: avatar || initialPersist.user?.avatarUrl,
                createdAt: new Date(u.created_at).getTime() || Date.now(),
                provider: (u.app_metadata?.provider === 'google' ? 'google' : 'email'),
                headline: initialPersist.user?.headline || 'Planning smarter every day',
              };
              initialPersist.onboarded = true;
            }
          } catch (e) {
            console.warn('[Supabase] Session check error:', e);
          }
        }
      }

      if (mounted) {
        dispatch({ type: 'hydrate', payload: initialPersist });
        hydrated.current = true;
        setReady(true);
      }
    })();

    // 3. Listen to Supabase Auth State changes in realtime
    let authSub: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (!mounted) return;
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              const u = session.user;
              const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
              const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
              dispatch({
                type: 'patch',
                payload: {
                  user: {
                    id: u.id,
                    name,
                    email: u.email || '',
                    avatarColor: '#3B5BFF',
                    avatarUrl: avatar,
                    createdAt: new Date(u.created_at).getTime() || Date.now(),
                    provider: (u.app_metadata?.provider === 'google' ? 'google' : 'email'),
                    headline: 'Planning smarter every day',
                  },
                  onboarded: true,
                },
              });
            }
          } else if (event === 'SIGNED_OUT') {
            dispatch({ type: 'patch', payload: { user: null } });
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

  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {}
    }, 200);
    return () => clearTimeout(id);
  }, [state]);

  const activePlace = useMemo(
    () => state.places.find((p) => p.id === state.activePlaceId) ?? state.places[0] ?? DEFAULT_PLACES[0],
    [state.places, state.activePlaceId]
  );

  const refreshWeather = useCallback(async (force = false) => {
    const place = state.places.find((p) => p.id === state.activePlaceId) ?? state.places[0] ?? DEFAULT_PLACES[0];
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
      setWeatherByPlace((m) => ({ ...m, [place.id]: b }));
      if (b.source === 'offline') setWeatherError('Showing modelled forecast — live data unavailable');
    } catch {
      const b = synthesize(place);
      setWeather(b);
      setWeatherError('Offline mode');
    } finally {
      setWeatherLoading(false);
    }
  }, [state.activePlaceId, state.places, weatherByPlace]);

  const loadPlaceWeather = useCallback(async (p: Place) => {
    const cached = weatherByPlace[p.id];
    if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 15) return;
    const b = await fetchWeather(p);
    setWeatherByPlace((m) => ({ ...m, [p.id]: b }));
  }, [weatherByPlace]);

  // Auto-detect real device/browser location on startup
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const hasCurrent = state.places.some((p) => p.id === 'current');
    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            const currentPlace: Place = { ...place, id: 'current' };
            dispatch({
              type: 'patch',
              payload: {
                places: [
                  currentPlace,
                  ...state.places.filter((p) => p.id !== 'current' && p.id !== 'sf' && p.name !== currentPlace.name),
                ],
                activePlaceId: (!state.activePlaceId || state.activePlaceId === 'current' || state.activePlaceId === 'sf' || !hasCurrent)
                  ? 'current'
                  : state.activePlaceId,
              },
            });
          } catch {}
        },
        () => {
          // Permission denied or unavailable — keep existing state without forcing SF
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    }
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
                ...state.events.filter((e) => e.source !== 'google' && !e.id.startsWith('e_')),
                ...data.events,
              ],
              lists: [
                ...state.lists.filter((l) => l.source !== 'google' && l.id !== 'inbox'),
                ...data.lists,
              ],
              tasks: [
                ...state.tasks.filter((t) => t.source !== 'google' && !t.id.startsWith('t_')),
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

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [ready, state.integrations.googleCalendar, state.integrations.googleTasks]);

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
    signIn: (email, name, provider = 'email', customId?: string, avatarUrl?: string) => {
      const colors = ['#3B5BFF', '#7B5BFF', '#0FA968', '#E8890C', '#E5484D', '#0C8CE9'];
      const nm = name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const existingId = state.user?.email === email ? state.user.id : undefined;
      const userId = customId || existingId || uid('u');
      dispatch({
        type: 'patch',
        payload: {
          user: {
            id: userId,
            name: nm,
            email,
            avatarColor: colors[Math.floor(Math.random() * colors.length)],
            avatarUrl: avatarUrl || state.user?.avatarUrl,
            createdAt: state.user?.createdAt || Date.now(),
            provider,
            headline: state.user?.headline || 'Planning smarter every day',
          },
          onboarded: true,
        },
      });
    },
    signOut: async () => {
      try {
        await signOutSupabase();
      } catch (err) {
        console.warn('SignOut error:', err);
      }
      dispatch({ type: 'patch', payload: { user: null } });
    },
    updateProfile: (p) => dispatch({ type: 'patch', payload: { user: state.user ? { ...state.user, ...p } : null } }),
    setOnboarded: (v) => dispatch({ type: 'patch', payload: { onboarded: v } }),
    setSettings: (p) => dispatch({ type: 'settings', payload: p }),
    setNotifications: (p) => dispatch({ type: 'notifications', payload: p }),
    addTask: (t) => {
      const task: Task = { id: t.id ?? uid('t'), createdAt: t.createdAt ?? Date.now(), ...t } as Task;
      dispatch({ type: 'patch', payload: { tasks: [task, ...state.tasks] } });
      return task;
    },
    updateTask: (id, p) => dispatch({ type: 'patch', payload: { tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) } }),
    toggleTask: (id) => {
      const t = state.tasks.find((x) => x.id === id);
      const nowDone = t ? !t.done : true;
      dispatch({
        type: 'patch',
        payload: {
          tasks: state.tasks.map((x) => (x.id === id ? { ...x, done: nowDone, completedAt: nowDone ? Date.now() : undefined } : x)),
          stats: { ...state.stats, completedTotal: state.stats.completedTotal + (nowDone ? 1 : -1) },
        },
      });
      // Synchronize completion status with Google Tasks API if it is a Google task
      if (t && t.source === 'google' && t.listId) {
        updateGoogleTaskStatus(t.listId, t.id, nowDone).catch((err) => {
          console.warn('Failed to sync task status to Google Tasks:', err);
        });
      }
    },
    deleteTask: (id) => dispatch({ type: 'patch', payload: { tasks: state.tasks.filter((t) => t.id !== id) } }),
    addList: (name, color, icon) => dispatch({ type: 'patch', payload: { lists: [...state.lists, { id: uid('l'), name, color, icon, source: 'local' }] } }),
    deleteList: (id) => dispatch({
      type: 'patch',
      payload: {
        lists: state.lists.filter((l) => l.id !== id),
        tasks: state.tasks.map((t) => (t.listId === id ? { ...t, listId: 'inbox' } : t)),
      },
    }),
    addEvent: (e) => {
      const ev: CalEvent = { id: e.id ?? uid('e'), ...e } as CalEvent;
      dispatch({ type: 'patch', payload: { events: [...state.events, ev] } });
      return ev;
    },
    updateEvent: (id, p) => dispatch({ type: 'patch', payload: { events: state.events.map((e) => (e.id === id ? { ...e, ...p } : e)) } }),
    deleteEvent: (id) => dispatch({ type: 'patch', payload: { events: state.events.filter((e) => e.id !== id) } }),
    toggleCalendar: (id) => dispatch({ type: 'patch', payload: { calendars: state.calendars.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)) } }),
    addReminder: (r) => dispatch({ type: 'patch', payload: { reminders: [{ id: uid('r'), createdAt: Date.now(), enabled: true, trigger: 'time' as const, repeat: 'none' as const, ...r }, ...state.reminders] } }),
    updateReminder: (id, p) => dispatch({ type: 'patch', payload: { reminders: state.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)) } }),
    deleteReminder: (id) => dispatch({ type: 'patch', payload: { reminders: state.reminders.filter((r) => r.id !== id) } }),
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
    updateSettings: (p) => dispatch({ type: 'settings', payload: p }),
    addChatMessage: (m) => dispatch({ type: 'patch', payload: { chat: [...state.chat, m] } }),
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
    },
    removePlace: (id) => {
      const next = state.places.filter((p) => p.id !== id);
      dispatch({
        type: 'patch',
        payload: { places: next, activePlaceId: state.activePlaceId === id ? next[0]?.id ?? DEFAULT_PLACES[0].id : state.activePlaceId },
      });
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
              ...state.events.filter((e) => e.source !== 'google' && !e.id.startsWith('e_')),
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
              ...state.tasks.filter((t) => t.source !== 'google' && !t.id.startsWith('t_')),
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
              ? { events: [...state.events.filter((e) => e.source !== 'google' && !e.id.startsWith('e_')), ...data.events] }
              : {}),
            ...(payload?.lists !== undefined || !payload
              ? { lists: [...state.lists.filter((l) => l.source !== 'google' && l.id !== 'inbox'), ...data.lists] }
              : {}),
            ...(payload?.tasks !== undefined || !payload
              ? { tasks: [...state.tasks.filter((t) => t.source !== 'google' && !t.id.startsWith('t_')), ...data.tasks] }
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
    pushChat: (m) => dispatch({ type: 'patch', payload: { chat: [...state.chat, m] } }),
    updateChat: (id, p) => dispatch({ type: 'patch', payload: { chat: state.chat.map((c) => (c.id === id ? { ...c, ...p } : c)) } }),
    clearChat: () => dispatch({ type: 'patch', payload: { chat: [] } }),
    bumpStat: (k, by = 1) => dispatch({ type: 'patch', payload: { stats: { ...state.stats, [k]: state.stats[k] + by } } }),
    weather,
    weatherLoading,
    weatherError,
    refreshWeather,
    activePlace,
    weatherByPlace,
    loadPlaceWeather,
    resetAll: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(KEY);
      }
      dispatch({ type: 'hydrate', payload: defaultState() });
    },
  }), [ready, state, theme, scheme, fontScale, weather, weatherLoading, weatherError, calendarLoading, tasksLoading, refreshWeather, activePlace, weatherByPlace, loadPlaceWeather]);

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
