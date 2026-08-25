import { CalEvent, CalendarInfo, Task, TaskList } from './types';
import { getValidAccessToken, refreshGoogleAccessToken } from './googleAuth';
import { dateKey } from './utils';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TASKS_API_BASE = 'https://www.googleapis.com/tasks/v1';

/** Helper to run authenticated Google API fetch with automatic retry on 401 */
async function googleFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated with Google. Please reconnect your account.');
  }

  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // If 401, retry once after refreshing token
  if (res.status === 401) {
    token = await refreshGoogleAccessToken();
    if (token) {
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    }
  }

  return res;
}

/* ========================================================================== */
/*                           GOOGLE CALENDAR API                              */
/* ========================================================================== */

export async function listGoogleCalendars(): Promise<CalendarInfo[]> {
  const res = await googleFetch(`${CALENDAR_API_BASE}/users/me/calendarList`);
  if (!res.ok) {
    throw new Error(`Failed to list calendars: ${res.statusText}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any) => ({
    id: item.id,
    name: item.summaryOverride || item.summary || 'Untitled Calendar',
    color: item.backgroundColor || '#4285F4',
    source: 'google' as const,
    visible: Boolean(item.selected ?? true),
  }));
}

/** Converts Google Calendar event to app's CalEvent */
function mapGoogleEventToCalEvent(item: any, calendarId: string): CalEvent | null {
  if (!item.id || item.status === 'cancelled') return null;

  const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
  let dateStr = '';
  let startMinutes = 9 * 60; // 9:00 AM default
  let endMinutes = 10 * 60; // 10:00 AM default

  if (isAllDay) {
    dateStr = item.start.date;
    startMinutes = 0;
    endMinutes = 24 * 60;
  } else if (item.start?.dateTime) {
    const startDate = new Date(item.start.dateTime);
    dateStr = dateKey(startDate);
    startMinutes = startDate.getHours() * 60 + startDate.getMinutes();

    if (item.end?.dateTime) {
      const endDate = new Date(item.end.dateTime);
      endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
      if (endMinutes <= startMinutes) endMinutes = Math.min(startMinutes + 60, 24 * 60);
    } else {
      endMinutes = Math.min(startMinutes + 60, 24 * 60);
    }
  } else {
    dateStr = dateKey(new Date());
  }

  // Infer outdoor status based on location/title
  const text = `${item.summary || ''} ${item.location || ''}`.toLowerCase();
  const isOutdoor = /park|hike|run|walk|jog|beach|garden|outdoor|court|trail|field/i.test(text);

  return {
    id: `gcal_${item.id}`,
    title: item.summary || 'Untitled Event',
    notes: item.description || undefined,
    date: dateStr,
    startMinutes,
    endMinutes,
    allDay: isAllDay,
    location: item.location || undefined,
    isOutdoor,
    kind: 'personal',
    calendarId,
    source: 'google',
    attendees: item.attendees?.map((a: any) => a.displayName || a.email).filter(Boolean),
  };
}

export async function listGoogleEvents(
  calendarId: string,
  timeMin?: string,
  timeMax?: string
): Promise<CalEvent[]> {
  const min = timeMin || new Date(Date.now() - 30 * 86400000).toISOString();
  const max = timeMax || new Date(Date.now() + 60 * 86400000).toISOString();

  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=250`;

  const res = await googleFetch(url);
  if (!res.ok) {
    console.warn(`Could not fetch events for calendar ${calendarId}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const items = data.items || [];

  return items
    .map((item: any) => mapGoogleEventToCalEvent(item, calendarId))
    .filter((e: CalEvent | null): e is CalEvent => e !== null);
}

export async function createGoogleEvent(calendarId: string, event: Partial<CalEvent>): Promise<any> {
  const body: any = {
    summary: event.title,
    description: event.notes,
    location: event.location,
  };

  if (event.allDay) {
    body.start = { date: event.date };
    body.end = { date: event.date };
  } else if (event.date && event.startMinutes !== undefined && event.endMinutes !== undefined) {
    const [y, m, d] = event.date.split('-').map(Number);
    const start = new Date(y, m - 1, d, Math.floor(event.startMinutes / 60), event.startMinutes % 60);
    const end = new Date(y, m - 1, d, Math.floor(event.endMinutes / 60), event.endMinutes % 60);
    body.start = { dateTime: start.toISOString() };
    body.end = { dateTime: end.toISOString() };
  }

  const res = await googleFetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Failed to create Google Calendar event');
  return await res.json();
}

/* ========================================================================== */
/*                             GOOGLE TASKS API                               */
/* ========================================================================== */

const GOOGLE_LIST_COLORS = ['#4285F4', '#0FA968', '#EA4335', '#FBBC04', '#9334E6', '#00ACC1'];

export async function listGoogleTaskLists(): Promise<TaskList[]> {
  const res = await googleFetch(`${TASKS_API_BASE}/users/@me/lists`);
  if (!res.ok) {
    throw new Error(`Failed to list task lists: ${res.statusText}`);
  }

  const data = await res.json();
  const items = data.items || [];

  return items.map((item: any, idx: number) => ({
    id: `gtasklist_${item.id}`,
    name: item.title || 'My Tasks',
    color: GOOGLE_LIST_COLORS[idx % GOOGLE_LIST_COLORS.length],
    icon: 'checkbox-outline',
    source: 'google' as const,
  }));
}

/** Converts Google Task to app's Task */
function mapGoogleTaskToTask(item: any, listId: string): Task | null {
  if (!item.id || item.deleted) return null;

  let dueDate: string | undefined = undefined;
  if (item.due) {
    dueDate = dateKey(new Date(item.due));
  }

  const isDone = item.status === 'completed';
  const completedAt = item.completed ? new Date(item.completed).getTime() : undefined;
  const createdAt = item.updated ? new Date(item.updated).getTime() : Date.now();

  const isOutdoor = /outside|park|walk|run|garden|lawn|outdoor|market|grocer/i.test(`${item.title || ''} ${item.notes || ''}`);

  return {
    id: `gtask_${item.id}`,
    title: item.title || 'Untitled Task',
    notes: item.notes || undefined,
    done: isDone,
    completedAt,
    dueDate,
    dueMinutes: undefined,
    priority: 'normal',
    context: isOutdoor ? 'outdoor' : 'anywhere',
    listId,
    source: 'google',
    createdAt,
  };
}

export async function listGoogleTasks(taskListId: string): Promise<Task[]> {
  // taskListId might have our prefix 'gtasklist_'
  const cleanListId = taskListId.replace(/^gtasklist_/, '');
  const url = `${TASKS_API_BASE}/lists/${encodeURIComponent(cleanListId)}/tasks?showCompleted=true&showHidden=true&maxResults=100`;

  const res = await googleFetch(url);
  if (!res.ok) {
    console.warn(`Could not fetch tasks for list ${taskListId}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const items = data.items || [];

  return items
    .map((item: any) => mapGoogleTaskToTask(item, taskListId))
    .filter((t: Task | null): t is Task => t !== null);
}

export async function createGoogleTask(taskListId: string, task: Partial<Task>): Promise<any> {
  const cleanListId = taskListId.replace(/^gtasklist_/, '');
  const body: any = {
    title: task.title,
    notes: task.notes,
    status: task.done ? 'completed' : 'needsAction',
  };

  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    body.due = new Date(Date.UTC(y, m - 1, d)).toISOString();
  }

  const res = await googleFetch(`${TASKS_API_BASE}/lists/${encodeURIComponent(cleanListId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('Failed to create Google Task');
  return await res.json();
}

export async function updateGoogleTaskStatus(
  taskListId: string,
  taskId: string,
  done: boolean
): Promise<void> {
  const cleanListId = taskListId.replace(/^gtasklist_/, '');
  const cleanTaskId = taskId.replace(/^gtask_/, '');

  await googleFetch(`${TASKS_API_BASE}/lists/${encodeURIComponent(cleanListId)}/tasks/${encodeURIComponent(cleanTaskId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: done ? 'completed' : 'needsAction',
    }),
  });
}

/* ========================================================================== */
/*                               FULL SYNC                                    */
/* ========================================================================== */

export async function fetchAllGoogleData(): Promise<{
  calendars: CalendarInfo[];
  events: CalEvent[];
  lists: TaskList[];
  tasks: Task[];
}> {
  // 1. Fetch Calendars & Events
  const calendars = await listGoogleCalendars();
  let events: CalEvent[] = [];

  for (const cal of calendars) {
    try {
      const calEvents = await listGoogleEvents(cal.id);
      events = events.concat(calEvents);
    } catch (e) {
      console.warn(`Error fetching events for calendar ${cal.id}:`, e);
    }
  }

  // 2. Fetch Task Lists & Tasks
  const lists = await listGoogleTaskLists();
  let tasks: Task[] = [];

  for (const l of lists) {
    try {
      const listTasks = await listGoogleTasks(l.id);
      tasks = tasks.concat(listTasks);
    } catch (e) {
      console.warn(`Error fetching tasks for list ${l.id}:`, e);
    }
  }

  return { calendars, events, lists, tasks };
}
