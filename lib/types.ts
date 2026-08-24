export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskContext = 'outdoor' | 'indoor' | 'anywhere';
export type TaskSource = 'local' | 'google';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  done: boolean;
  completedAt?: number;
  dueDate?: string; // YYYY-MM-DD
  dueMinutes?: number; // minutes from midnight
  priority: Priority;
  context: TaskContext;
  listId: string;
  source: TaskSource;
  createdAt: number;
  estimateMin?: number;
  subtasks?: { id: string; title: string; done: boolean }[];
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
  icon: string;
  source: TaskSource;
}

export type EventKind = 'meeting' | 'focus' | 'personal' | 'travel' | 'health' | 'social';

export interface CalEvent {
  id: string;
  title: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  startMinutes: number;
  endMinutes: number;
  allDay: boolean;
  location?: string;
  isOutdoor: boolean;
  kind: EventKind;
  calendarId: string;
  source: TaskSource;
  attendees?: string[];
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  source: TaskSource;
  visible: boolean;
}

export type ReminderTrigger = 'time' | 'location' | 'weather';
export type ReminderRepeat = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface Reminder {
  id: string;
  title: string;
  trigger: ReminderTrigger;
  date?: string;
  minutes?: number;
  repeat: ReminderRepeat;
  placeName?: string;
  weatherRule?: 'rain' | 'clear' | 'cold' | 'hot' | 'uv';
  enabled: boolean;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  createdAt: number;
  provider: 'email' | 'google' | 'guest';
  headline?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  ts: number;
  chips?: string[];
  pending?: boolean;
}

export interface IntegrationState {
  googleCalendar: boolean;
  googleTasks: boolean;
  lastSyncCalendar?: number;
  lastSyncTasks?: number;
  account?: string;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  themeMode: ThemeMode;
  tempUnit: 'C' | 'F';
  windUnit: 'kmh' | 'mph' | 'ms';
  use24h: boolean;
  weekStartsMonday: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  boldText: boolean;
  dynamicWeatherTheme: boolean;
  weatherOverride: string | null;
  notifications: {
    dailyBriefing: boolean;
    briefingHour: number;
    severeWeather: boolean;
    rainAlerts: boolean;
    taskReminders: boolean;
    eventAlerts: boolean;
  };
  geminiKey: string;
  geminiTone: 'concise' | 'balanced' | 'detailed';
  autoSuggest: boolean;
}
