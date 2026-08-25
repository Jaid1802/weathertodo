import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalEvent, CalendarInfo, ChatMessage, IntegrationState, Reminder, Settings, Task, TaskList, UserProfile,
} from './types';
import { seedCalendars, seedEvents, seedLists, seedReminders, seedTasks } from './seed';
import { DEFAULT_PLACES, Place, WeatherBundle, fetchWeather, synthesize } from './weather';
import { AppTheme, ColorScheme, getTheme } from './theme';
import { dateKey, uid } from './utils';

const KEY = '@aurelia/v1';

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
    places: [DEFAULT_PLACES[0], DEFAULT_PLACES[2], DEFAULT_PLACES[4]],
    activePlaceId: DEFAULT_PLACES[0].id,
    integrations: { googleCalendar: true, googleTasks: true, lastSyncCalendar: Date.now() - 1000 * 60 * 12, lastSyncTasks: Date.now() - 1000 * 60 * 34, account: 'you@gmail.com' },
    chat: [],
    onboarded: false,
    stats: { streak: 4, lastActive: dateKey(new Date()), completedTotal: 128, plansMade: 26 },
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

interface Ctx {
  ready: boolean;
  state: PersistShape;
  theme: AppTheme;
  scheme: ColorScheme;
  fontScale: number;
  // auth
  signIn: (email: string, name?: string, provider?: UserProfile['provider']) => void;
  signOut: () => void;
  updateProfile: (p: Partial<UserProfile>) => void;
  setOnboarded: (v: boolean) => void;
  // settings
  setSettings: (p: Partial<Settings>) => void;
  setNotifications: (p: Partial<Settings['notifications']>) => void;
  // tasks
  addTask: (t: Omit<Task, 'id' | 'createdAt'> & Partial<Pick<Task, 'id' | 'createdAt'>>) => Task;
  updateTask: (id: string, p: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addList: (name: string, color: string, icon: string) => void;
  deleteList: (id: string) => void;
  // events
  addEvent: (e: Omit<CalEvent, 'id'> & Partial<Pick<CalEvent, 'id'>>) => CalEvent;
  updateEvent: (id: string, p: Partial<CalEvent>) => void;
  deleteEvent: (id: string) => void;
  toggleCalendar: (id: string) => void;
  // reminders
  addReminder: (r: Omit<Reminder, 'id' | 'createdAt'>) => void;
  updateReminder: (id: string, p: Partial<Reminder>) => void;
  deleteReminder: (id: string) => void;
  // places
  addPlace: (p: Place) => void;
  removePlace: (id: string) => void;
  setActivePlace: (id: string) => void;
  reorderPlace: (id: string, dir: -1 | 1) => void;
  // integrations
  setIntegrations: (p: Partial<IntegrationState>) => void;
  syncGoogleData: (data: {
    calendars?: CalendarInfo[];
    events?: CalEvent[];
    lists?: TaskList[];
    tasks?: Task[];
    account?: string;
  }) => void;
  clearGoogleData: () => void;
  // chat
  pushChat: (m: ChatMessage) => void;
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
  const systemScheme = useColorScheme();
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherByPlace, setWeatherByPlace] = useState<Record<string, WeatherBundle>>({});
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistShape;
          dispatch({
            type: 'hydrate',
            payload: {
              ...defaultState(),
              ...parsed,
              settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}), notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.settings?.notifications || {}) } },
            },
          });
        }
      } catch {
        // ignore, use defaults
      } finally {
        hydrated.current = true;
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const id = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }, 220);
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
      if (b.source === 'offline') setWeatherError('Showing modelled forecast \u2014 live data unavailable');
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

  useEffect(() => {
    if (!ready) return;
    refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.activePlaceId]);

  const scheme: ColorScheme = state.settings.themeMode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : state.settings.themeMode;

  const theme = useMemo(() => getTheme(scheme, state.settings.highContrast), [scheme, state.settings.highContrast]);
  const fontScale = state.settings.largeText ? 1.14 : 1;

  const api: Ctx = useMemo(() => ({
    ready,
    state,
    theme,
    scheme,
    fontScale,
    signIn: (email, name, provider = 'email') => {
      const colors = ['#3B5BFF', '#7B5BFF', '#0FA968', '#E8890C', '#E5484D', '#0C8CE9'];
      const nm = name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      dispatch({
        type: 'patch',
        payload: {
          user: {
            id: uid('u'),
            name: nm,
            email,
            avatarColor: colors[Math.floor(Math.random() * colors.length)],
            createdAt: Date.now(),
            provider,
            headline: 'Planning smarter every day',
          },
          onboarded: true,
        },
      });
    },
    signOut: () => dispatch({ type: 'patch', payload: { user: null } }),
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
    addReminder: (r) => dispatch({ type: 'patch', payload: { reminders: [{ ...r, id: uid('r'), createdAt: Date.now() }, ...state.reminders] } }),
    updateReminder: (id, p) => dispatch({ type: 'patch', payload: { reminders: state.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)) } }),
    deleteReminder: (id) => dispatch({ type: 'patch', payload: { reminders: state.reminders.filter((r) => r.id !== id) } }),
    addPlace: (p) => {
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
    setActivePlace: (id) => dispatch({ type: 'patch', payload: { activePlaceId: id } }),
    reorderPlace: (id, dir) => {
      const arr = [...state.places];
      const i = arr.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      dispatch({ type: 'patch', payload: { places: arr } });
    },
    setIntegrations: (p) => dispatch({ type: 'patch', payload: { integrations: { ...state.integrations, ...p } } }),
    syncGoogleData: ({ calendars, events, lists, tasks, account }) => {
      const now = Date.now();
      const nextPatch: Partial<PersistShape> = {};

      if (calendars) {
        const localCalendars = state.calendars.filter((c) => c.source !== 'google');
        nextPatch.calendars = [...localCalendars, ...calendars];
      }

      if (events) {
        const localEvents = state.events.filter((e) => e.source !== 'google');
        nextPatch.events = [...localEvents, ...events];
      }

      if (lists) {
        const localLists = state.lists.filter((l) => l.source !== 'google');
        nextPatch.lists = [...localLists, ...lists];
      }

      if (tasks) {
        const localTasks = state.tasks.filter((t) => t.source !== 'google');
        nextPatch.tasks = [...localTasks, ...tasks];
      }

      nextPatch.integrations = {
        ...state.integrations,
        googleCalendar: calendars !== undefined ? true : state.integrations.googleCalendar,
        googleTasks: lists !== undefined || tasks !== undefined ? true : state.integrations.googleTasks,
        account: account ?? state.integrations.account,
        lastSyncCalendar: events !== undefined || calendars !== undefined ? now : state.integrations.lastSyncCalendar,
        lastSyncTasks: tasks !== undefined || lists !== undefined ? now : state.integrations.lastSyncTasks,
      };

      dispatch({ type: 'patch', payload: nextPatch });
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
      AsyncStorage.removeItem(KEY).catch(() => {});
      dispatch({ type: 'hydrate', payload: defaultState() });
    },
  }), [ready, state, theme, scheme, fontScale, weather, weatherLoading, weatherError, refreshWeather, activePlace, weatherByPlace, loadPlaceWeather]);

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
