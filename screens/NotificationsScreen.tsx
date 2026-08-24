import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, IconBtn, ListGroup, Row, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { minutesToLabel } from '../lib/utils';

export default function NotificationsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const n = state.settings.notifications;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Notifications</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
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
            subtitle="10 minutes before each event"
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
