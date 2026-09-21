export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskContext = 'outdoor' | 'indoor' | 'anywhere';
export type TaskSource = 'local' | 'google';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  done: boolean;
  completed?: boolean;
  completedAt?: number;
  dueDate?: string; // YYYY-MM-DD
  dueMinutes?: number; // minutes from midnight (0-1440)
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
  startMinutes: number; // 0-1440
  endMinutes: number;   // 0-1440
  allDay: boolean;
  location?: string;
  isOutdoor: boolean;
  kind: EventKind;
  calendarId: string;
  source: TaskSource;
  attendees?: string[];
  status?: string;
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
  date?: string; // YYYY-MM-DD
  minutes?: number;
  repeat: ReminderRepeat;
  placeName?: string;
  weatherRule?: 'rain' | 'clear' | 'cold' | 'hot' | 'uv';
  enabled: boolean;
  createdAt: number;
}

export interface WeatherData {
  locationName?: string;
  current?: {
    temp: number;
    feelsLike: number;
    condition: string;
    description?: string;
    humidity: number;
    windSpeed: number;
    precipitation?: number;
    rainChance?: number;
    uvIndex?: number;
    outdoorScore?: number;
    sunrise?: string;
    sunset?: string;
    aqi?: number;
    aqiLevel?: string;
  };
  hourly?: {
    time: string;
    temp: number;
    condition: string;
    rainChance: number;
  }[];
  daily?: {
    day: string;
    date: string;
    tempMax: number;
    tempMin: number;
    condition: string;
    rainProb: number;
  }[];
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

export type CleverActionKind = 'addTask' | 'addEvent' | 'addReminder' | 'deleteTask' | 'deleteEvent' | 'confirmAction';

export interface CleverAction {
  type?: string;
  kind?: CleverActionKind;
  status?: 'proposed' | 'executed' | 'cancelled';
  description?: string;
  data?: any;
  task?: { title: string; priority?: Priority; context?: TaskContext; dueDate?: string; dueMinutes?: number };
  event?: { title: string; date?: string; startMinutes?: number; endMinutes?: number; isOutdoor?: boolean; allDay?: boolean; location?: string };
  reminder?: { title: string; date?: string; minutes?: number; trigger?: ReminderTrigger; repeat?: ReminderRepeat };
  targetId?: string;
  confirmed?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'model';
  content?: string;
  text?: string;
  timestamp?: number;
  ts?: number;
  chips?: string[];
  pending?: boolean;
  live?: boolean;
  action?: CleverAction;
  actions?: CleverAction[];
  actionDone?: boolean;
  sourcesUsed?: string[];
  isError?: boolean;
  retryQuestion?: string;
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
  geminiKey?: string;
  geminiApiKey?: string;
  geminiTone?: 'concise' | 'balanced' | 'detailed';
  autoSuggest?: boolean;
  timeFormat?: string;
  outdoorPref?: string;
}

export type UserSettings = Settings;
