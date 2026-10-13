import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, AppState, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, IconBtn, ListGroup, Row, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { minutesToLabel } from '../lib/utils';
import { getNotificationPermissionDetails, requestNotificationPermission, sendTestNotification } from '../lib/notifications';

export default function NotificationsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, scheme } = app;
  const isFocused = useIsFocused();
  const n = state.settings.notifications;
  const [permission, setPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('granted');
  const [canAskAgain, setCanAskAgain] = useState(true);

  const checkPermission = useCallback(async () => {
    const details = await getNotificationPermissionDetails();
    setPermission(details.status);
    setCanAskAgain(details.canAskAgain);
  }, []);

  useEffect(() => {
    checkPermission();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPermission();
      }
    });

    return () => {
      sub.remove();
    };
  }, [checkPermission]);

  const handleEnablePermissions = async () => {
    await requestNotificationPermission();
    await checkPermission();
  };

  const handleOpenSettings = async () => {
    if (Platform.OS !== 'web') {
      try {
        await Linking.openSettings();
      } catch (e) {
        console.warn('Could not open settings', e);
      }
    }
  };

  const handleTestNotification = async () => {
    await sendTestNotification();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      {isFocused && <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Notifications</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {permission === 'granted' ? (
          <Card style={{ marginBottom: Space.lg, borderColor: theme.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(52, 199, 89, 0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-circle" size={22} color="#34C759" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="callout" w="700">Notifications Enabled</Txt>
                <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 2 }}>
                  System notifications are active for upcoming tasks and calendar events.
                </Txt>
              </View>
              <Btn
                title="Test"
                icon="paper-plane-outline"
                kind="secondary"
                small
                onPress={handleTestNotification}
              />
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: Space.lg, borderColor: permission === 'denied' ? theme.danger : theme.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: permission === 'denied' ? 'rgba(229,72,77,0.14)' : theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={permission === 'denied' ? 'notifications-off' : 'notifications'} size={20} color={permission === 'denied' ? theme.danger : theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="callout" w="700">Notifications Disabled</Txt>
                <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 2, marginBottom: 12 }}>
                  {permission === 'denied'
                    ? 'Device notifications are blocked in Android system settings. Please open settings to allow notifications and receive reminders.'
                    : 'Enable notifications to receive task and event reminders.'}
                </Txt>
                {permission === 'denied' || !canAskAgain ? (
                  <Btn
                    title="Open System Settings"
                    icon="settings-outline"
                    kind="secondary"
                    small
                    onPress={handleOpenSettings}
                  />
                ) : (
                  <Btn
                    title="Enable Notifications"
                    icon="notifications-outline"
                    kind="primary"
                    small
                    onPress={handleEnablePermissions}
                  />
                )}
              </View>
            </View>
          </Card>
        )}
        <Card style={{ marginBottom: Space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sunny" size={21} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700">Morning briefing</Txt>
              <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 2 }}>Delivered at {minutesToLabel(n.briefingHour * 60, state.settings.use24h)} every day</Txt>
            </View>
            <Toggle value={n.dailyBriefing} onChange={(v) => app.setNotifications({ dailyBriefing: v })} />
          </View>

          {n.dailyBriefing && (
            <View style={{ marginTop: Space.md }}>
              <Txt v="micro" c={theme.textTertiary} w="700" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Delivery time</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[5, 6, 7, 8, 9, 10, 11].map((h) => {
                  const active = n.briefingHour === h;
                  return (
                    <Touch key={h} onPress={() => app.setNotifications({ briefingHour: h })} scale={0.94}>
                      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: active ? theme.accent : theme.surfaceAlt }}>
                        <Txt v="sub" w="600" c={active ? theme.onAccent : theme.textSecondary}>{minutesToLabel(h * 60, state.settings.use24h)}</Txt>
                      </View>
                    </Touch>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Card>

        <ListGroup title="Weather alerts" footer="Smart Suggestion only notifies you when the weather actually changes a decision you have already made.">
          <Row
            icon="warning-outline"
            iconBg={theme.danger}
            title="Severe weather"
            subtitle="Storms, extreme heat, high wind"
            right={<Toggle value={n.severeWeather} onChange={(v) => app.setNotifications({ severeWeather: v })} />}
          />
          <Row
            icon="rainy-outline"
            title="Rain before outdoor plans"
            subtitle="Fires 60 minutes ahead"
            right={<Toggle value={n.rainAlerts} onChange={(v) => app.setNotifications({ rainAlerts: v })} />}
            last
          />
        </ListGroup>

        <ListGroup title="Productivity">
          <Row
            icon="checkmark-circle-outline"
            title="Task reminders"
            subtitle="At the due time you set"
            right={<Toggle value={n.taskReminders} onChange={(v) => app.setNotifications({ taskReminders: v })} />}
          />
          <Row
            icon="calendar-outline"
            title="Event alerts"
            subtitle="30 minutes before each event"
            right={<Toggle value={n.eventAlerts} onChange={(v) => app.setNotifications({ eventAlerts: v })} />}
            last
          />
        </ListGroup>

        <Card style={{ backgroundColor: theme.surfaceAlt, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <Txt v="sub" c={theme.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
              Preview build: notification preferences are saved locally and drive in-app alerts. System push delivery is enabled in the native release.
            </Txt>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
