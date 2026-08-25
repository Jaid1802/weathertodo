import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Badge, Btn, Card, IconBtn, ListGroup, Row, Sheet, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { formatTime, relativeDay } from '../lib/utils';
import {
  googleDiscovery,
  GOOGLE_SCOPES,
  exchangeGoogleCode,
  disconnectGoogleAccount,
  hasStoredGoogleAuth,
  getStoredGoogleUser,
} from '../lib/googleAuth';
import {
  listGoogleCalendars,
  listGoogleEvents,
  listGoogleTaskLists,
  listGoogleTasks,
  fetchAllGoogleData,
} from '../lib/googleApi';
import { CalEvent, Task } from '../lib/types';

// Complete auth session if returning from web browser
WebBrowser.maybeCompleteAuthSession();

export default function IntegrationsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const i = state.integrations;
  const [syncing, setSyncing] = useState<null | 'calendar' | 'tasks' | 'all'>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const googleEvents = state.events.filter((e) => e.source === 'google').length;
  const googleTasks = state.tasks.filter((t) => t.source === 'google').length;
  const connected = (i.googleCalendar || i.googleTasks) && Boolean(i.account);

  // Setup OAuth Request
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'agon',
    path: 'auth/google/callback',
  });

  const googleClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '1084284897213-placeholder.apps.googleusercontent.com';

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId,
      scopes: GOOGLE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    googleDiscovery
  );

  // Check stored auth on load
  useEffect(() => {
    (async () => {
      const hasAuth = await hasStoredGoogleAuth();
      if (hasAuth && !i.account) {
        const user = await getStoredGoogleUser();
        if (user?.email) {
          app.setIntegrations({ account: user.email });
        }
      }
    })();
  }, []);

  const handleConnect = async () => {
    if (!request) {
      Alert.alert('Configuration Warning', 'OAuth request is preparing. If this persists, ensure Google Client ID is configured.');
      return;
    }

    setConnecting(true);
    setErrorMsg(null);

    try {
      const res = await promptAsync();

      if (res?.type === 'success' && res.params.code) {
        const tokens = await exchangeGoogleCode(
          res.params.code,
          request.codeVerifier,
          redirectUri
        );

        const email = tokens.user?.email || state.user?.email || 'Connected';

        // Run full initial sync
        setSyncing('all');
        try {
          const fullData = await fetchAllGoogleData();
          app.syncGoogleData({
            calendars: fullData.calendars,
            events: fullData.events,
            lists: fullData.lists,
            tasks: fullData.tasks,
            account: email,
          });
        } catch (syncErr: any) {
          console.warn('Initial sync warning:', syncErr);
          app.setIntegrations({
            googleCalendar: true,
            googleTasks: true,
            account: email,
            lastSyncCalendar: Date.now(),
            lastSyncTasks: Date.now(),
          });
        }
      } else if (res?.type === 'error') {
        setErrorMsg(res.error?.message || 'Authentication error occurred');
      }
    } catch (err: any) {
      console.error('Google connect error:', err);
      setErrorMsg(err.message || 'Failed to connect Google account');
    } finally {
      setConnecting(false);
      setSyncing(null);
    }
  };

  const handleDisconnect = async () => {
    setSyncing('all');
    try {
      await disconnectGoogleAccount();
    } catch (e) {
      console.warn('Disconnect error:', e);
    } finally {
      app.clearGoogleData();
      setSyncing(null);
    }
  };

  const syncCalendar = async () => {
    setSyncing('calendar');
    setErrorMsg(null);
    try {
      const calendars = await listGoogleCalendars();
      let events: CalEvent[] = [];
      for (const cal of calendars) {
        const calEvents = await listGoogleEvents(cal.id);
        events = events.concat(calEvents);
      }
      app.syncGoogleData({ calendars, events });
    } catch (err: any) {
      console.error('Sync calendar error:', err);
      setErrorMsg(err.message || 'Failed to sync Google Calendar');
    } finally {
      setSyncing(null);
    }
  };

  const syncTasks = async () => {
    setSyncing('tasks');
    setErrorMsg(null);
    try {
      const lists = await listGoogleTaskLists();
      let tasks: Task[] = [];
      for (const l of lists) {
        const listTasks = await listGoogleTasks(l.id);
        tasks = tasks.concat(listTasks);
      }
      app.syncGoogleData({ lists, tasks });
    } catch (err: any) {
      console.error('Sync tasks error:', err);
      setErrorMsg(err.message || 'Failed to sync Google Tasks');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Integrations</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {errorMsg && (
          <Card style={{ backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}40`, marginBottom: Space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="alert-circle" size={20} color={theme.danger} />
              <Txt v="sub" c={theme.danger} style={{ flex: 1 }}>{errorMsg}</Txt>
              <Touch onPress={() => setErrorMsg(null)}>
                <Ionicons name="close" size={18} color={theme.danger} />
              </Touch>
            </View>
          </Card>
        )}

        {/* Account card */}
        <Card style={{ marginBottom: Space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-google" size={22} color={theme.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700">Google Workspace</Txt>
              <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 2 }}>
                {connected ? i.account ?? 'Connected' : 'Not connected'}
              </Txt>
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
              loading={syncing === 'all'}
              onPress={handleDisconnect}
            />
          ) : (
            <Btn
              title={connecting ? 'Connecting with Google…' : 'Connect Google account'}
              icon="logo-google"
              full
              loading={connecting}
              onPress={handleConnect}
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
            <Toggle
              value={Boolean(i.googleCalendar && connected)}
              onChange={(v) => {
                if (v && !connected) {
                  handleConnect();
                } else {
                  app.setIntegrations({ googleCalendar: v });
                }
              }}
              tint="#4285F4"
            />
          </View>

          {i.googleCalendar && connected && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                <Txt v="micro" c={theme.textTertiary}>
                  Last sync {i.lastSyncCalendar ? formatTime(i.lastSyncCalendar, state.settings.use24h) : 'never'}
                </Txt>
              </View>
              {state.calendars.filter((c) => c.source === 'google').length > 0 && (
                <View style={{ gap: 8 }}>
                  {state.calendars
                    .filter((c) => c.source === 'google')
                    .map((c) => (
                      <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surfaceAlt, borderRadius: Radius.sm, padding: 10 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: c.color }} />
                        <Txt v="sub" style={{ flex: 1 }}>{c.name}</Txt>
                        <Txt v="micro" c={theme.textTertiary}>{state.events.filter((e) => e.calendarId === c.id).length}</Txt>
                        <Toggle value={c.visible} onChange={() => app.toggleCalendar(c.id)} tint={c.color} />
                      </View>
                    ))}
                </View>
              )}
              <Btn
                title={syncing === 'calendar' ? 'Syncing…' : 'Sync now'}
                kind="secondary"
                icon="sync"
                full
                small
                loading={syncing === 'calendar'}
                style={{ marginTop: 12 }}
                onPress={syncCalendar}
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
            <Toggle
              value={Boolean(i.googleTasks && connected)}
              onChange={(v) => {
                if (v && !connected) {
                  handleConnect();
                } else {
                  app.setIntegrations({ googleTasks: v });
                }
              }}
              tint="#0FA968"
            />
          </View>

          {i.googleTasks && connected && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                <Txt v="micro" c={theme.textTertiary}>
                  Last sync {i.lastSyncTasks ? formatTime(i.lastSyncTasks, state.settings.use24h) : 'never'}
                </Txt>
              </View>
              {state.lists.filter((l) => l.source === 'google').length > 0 && (
                <View style={{ gap: 8 }}>
                  {state.lists
                    .filter((l) => l.source === 'google')
                    .map((l) => (
                      <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surfaceAlt, borderRadius: Radius.sm, padding: 10 }}>
                        <Ionicons name={l.icon as any} size={14} color={l.color} />
                        <Txt v="sub" style={{ flex: 1 }}>{l.name}</Txt>
                        <Txt v="micro" c={theme.textTertiary}>{state.tasks.filter((t) => t.listId === l.id && !t.done).length} open</Txt>
                      </View>
                    ))}
                </View>
              )}
              <Btn
                title={syncing === 'tasks' ? 'Syncing…' : 'Sync now'}
                kind="secondary"
                icon="sync"
                full
                small
                loading={syncing === 'tasks'}
                style={{ marginTop: 12 }}
                onPress={syncTasks}
              />
            </>
          )}
        </Card>

        <ListGroup title="Data sources">
          <Row icon="partly-sunny-outline" title="Open-Meteo" subtitle="Forecast, hourly and daily data" value="Active" chevron={false} />
          <Row icon="sparkles-outline" title="Gemini" subtitle={state.settings.geminiKey ? 'Live model connected' : 'On-device reasoning'} onPress={() => navigation.navigate('Settings')} />
          <Row icon="phone-portrait-outline" title="Device location" subtitle="Used only to resolve your current city" onPress={() => navigation.navigate('Locations')} last />
        </ListGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
