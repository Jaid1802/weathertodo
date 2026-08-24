import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, IconBtn, ListGroup, Row, Sheet, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { formatTime, relativeDay } from '../lib/utils';

export default function IntegrationsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const i = state.integrations;
  const [syncing, setSyncing] = useState<null | 'calendar' | 'tasks'>(null);
  const [connecting, setConnecting] = useState(false);

  const googleEvents = state.events.filter((e) => e.source === 'google').length;
  const googleTasks = state.tasks.filter((t) => t.source === 'google').length;
  const connected = i.googleCalendar || i.googleTasks;

  const sync = async (kind: 'calendar' | 'tasks') => {
    setSyncing(kind);
    await new Promise((r) => setTimeout(r, 1100));
    app.setIntegrations(kind === 'calendar' ? { lastSyncCalendar: Date.now() } : { lastSyncTasks: Date.now() });
    setSyncing(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Integrations</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {/* Account card */}
        <Card style={{ marginBottom: Space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-google" size={22} color={theme.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700">Google Workspace</Txt>
              <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 2 }}>{connected ? i.account ?? 'Connected' : 'Not connected'}</Txt>
            </View>
            {connected ? <Badge label="CONNECTED" color={theme.success} bg={`${theme.success}18`} icon="checkmark-circle" /> : null}
          </View>

          <View style={{ height: 1, backgroundColor: theme.hairline, marginVertical: Space.md }} />

          {connected ? (
            <Btn
              title="Disconnect account"
              kind="ghost"
              tint={theme.danger}
              full
              onPress={() => app.setIntegrations({ googleCalendar: false, googleTasks: false, account: undefined })}
            />
          ) : (
            <Btn
              title={connecting ? 'Connecting…' : 'Connect Google account'}
              icon="logo-google"
              full
              loading={connecting}
              onPress={async () => {
                setConnecting(true);
                await new Promise((r) => setTimeout(r, 1200));
                app.setIntegrations({
                  googleCalendar: true,
                  googleTasks: true,
                  account: state.user?.email ?? 'you@gmail.com',
                  lastSyncCalendar: Date.now(),
                  lastSyncTasks: Date.now(),
                });
                setConnecting(false);
              }}
            />
          )}
        </Card>

        {/* Google Calendar */}
        <Card style={{ marginBottom: Space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#4285F41F', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="calendar" size={18} color="#4285F4" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700">Google Calendar</Txt>
              <Txt v="micro" c={theme.textTertiary}>{googleEvents} events synced</Txt>
            </View>
            <Toggle value={i.googleCalendar} onChange={(v) => app.setIntegrations({ googleCalendar: v, account: v ? i.account ?? 'you@gmail.com' : i.account })} tint="#4285F4" />
          </View>

          {i.googleCalendar && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                <Txt v="micro" c={theme.textTertiary}>
                  Last sync {i.lastSyncCalendar ? formatTime(i.lastSyncCalendar, state.settings.use24h) : 'never'}
                </Txt>
              </View>
              <View style={{ gap: 8 }}>
                {state.calendars.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surfaceAlt, borderRadius: Radius.sm, padding: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: c.color }} />
                    <Txt v="sub" style={{ flex: 1 }}>{c.name}</Txt>
                    <Txt v="micro" c={theme.textTertiary}>{state.events.filter((e) => e.calendarId === c.id).length}</Txt>
                    <Toggle value={c.visible} onChange={() => app.toggleCalendar(c.id)} tint={c.color} />
                  </View>
                ))}
              </View>
              <Btn
                title={syncing === 'calendar' ? 'Syncing…' : 'Sync now'}
                kind="secondary"
                icon="sync"
                full
                small
                loading={syncing === 'calendar'}
                style={{ marginTop: 12 }}
                onPress={() => sync('calendar')}
              />
            </>
          )}
        </Card>

        {/* Google Tasks */}
        <Card style={{ marginBottom: Space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: '#0FA9681F', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-done" size={18} color="#0FA968" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700">Google Tasks</Txt>
              <Txt v="micro" c={theme.textTertiary}>{googleTasks} tasks synced</Txt>
            </View>
            <Toggle value={i.googleTasks} onChange={(v) => app.setIntegrations({ googleTasks: v })} tint="#0FA968" />
          </View>

          {i.googleTasks && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                <Txt v="micro" c={theme.textTertiary}>
                  Last sync {i.lastSyncTasks ? formatTime(i.lastSyncTasks, state.settings.use24h) : 'never'}
                </Txt>
              </View>
              <View style={{ gap: 8 }}>
                {state.lists.map((l) => (
                  <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surfaceAlt, borderRadius: Radius.sm, padding: 10 }}>
                    <Ionicons name={l.icon as any} size={14} color={l.color} />
                    <Txt v="sub" style={{ flex: 1 }}>{l.name}</Txt>
                    <Txt v="micro" c={theme.textTertiary}>{state.tasks.filter((t) => t.listId === l.id && !t.done).length} open</Txt>
                  </View>
                ))}
              </View>
              <Btn
                title={syncing === 'tasks' ? 'Syncing…' : 'Sync now'}
                kind="secondary"
                icon="sync"
                full
                small
                loading={syncing === 'tasks'}
                style={{ marginTop: 12 }}
                onPress={() => sync('tasks')}
              />
            </>
          )}
        </Card>

        <ListGroup title="Data sources">
          <Row icon="partly-sunny-outline" title="Open-Meteo" subtitle="Forecast, hourly and daily data" value="Active" chevron={false} />
          <Row icon="sparkles-outline" title="Gemini" subtitle={state.settings.geminiKey ? 'Live model connected' : 'On-device reasoning'} onPress={() => navigation.navigate('Settings')} />
          <Row icon="phone-portrait-outline" title="Device location" subtitle="Used only to resolve your current city" onPress={() => navigation.navigate('Locations')} last />
        </ListGroup>

        <Card style={{ backgroundColor: theme.surfaceAlt, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.textSecondary} />
            <Txt v="sub" c={theme.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
              This preview simulates the Google OAuth handshake and keeps a local mirror of your calendars and task lists so the full sync experience is explorable end to end.
            </Txt>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
