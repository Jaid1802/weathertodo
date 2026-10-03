import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export interface NotificationPayloadData {
  type?: 'task' | 'event' | 'daily_summary' | 'overdue_summary' | 'weather' | string;
  targetId?: string;
  eventDate?: string;
  url?: string;
  [key: string]: any;
}

/**
 * Navigates to the appropriate screen based on notification click payload.
 */
export function navigateToNotification(data: NotificationPayloadData): void {
  if (!navigationRef.isReady()) {
    setTimeout(() => {
      if (navigationRef.isReady()) {
        navigateToNotification(data);
      }
    }, 500);
    return;
  }

  try {
    const type = data?.type;
    const targetId = data?.targetId;
    const eventDate = data?.eventDate;

    if (type === 'task') {
      navigationRef.navigate('Main', {
        screen: 'Tasks',
        params: { highlightTaskId: targetId },
      });
    } else if (type === 'event') {
      navigationRef.navigate('Main', {
        screen: 'Calendar',
        params: { selectedDate: eventDate, highlightEventId: targetId },
      });
    } else if (type === 'daily_summary' || type === 'overdue_summary') {
      navigationRef.navigate('Main', {
        screen: 'Tasks',
        params: { filter: 'today' },
      });
    } else if (type === 'weather') {
      navigationRef.navigate('WeatherDetail');
    } else {
      navigationRef.navigate('Main', { screen: 'Home' });
    }
  } catch (err) {
    console.warn('[Navigation] Could not navigate for notification:', err);
  }
}
