import { CalEvent, CalendarInfo, Reminder, Task, TaskList } from './types';

export function seedLists(): TaskList[] {
  return [
    { id: 'inbox', name: 'Inbox', color: '#3B5BFF', icon: 'file-tray-full', source: 'local' },
  ];
}

export function seedCalendars(): CalendarInfo[] {
  return [
    { id: 'cal_primary', name: 'My Calendar', color: '#3B5BFF', source: 'local', visible: true },
  ];
}

export function seedTasks(): Task[] {
  return [];
}

export function seedEvents(): CalEvent[] {
  return [];
}

export function seedReminders(): Reminder[] {
  return [];
}
