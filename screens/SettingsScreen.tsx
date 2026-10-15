import React, { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, IconBtn, ListGroup, Row, Segmented, Sheet, Toggle, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { formatTime } from '../lib/utils';
import { signInWithSupabaseGoogle } from '../lib/supabase';

export default function SettingsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, scheme } = app;
  const s = state.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [manageAccountSheet, setManageAccountSheet] = useState(false);
  const [linkGuestSheet, setLinkGuestSheet] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const user = state.user;
  const isGuest = user?.provider === 'guest';
  const isGoogle = user?.provider === 'google';
  const isEmail = user?.provider === 'email';
  const isSignedIn = Boolean(user && !isGuest);
  const isSignedOut = !user;

  const handleGoogleSignIn = async (migrateGuest = false) => {
    if (googleBusy) return;
    setAuthError(null);
    setGoogleBusy(true);

    try {
      const res = await signInWithSupabaseGoogle();
      if (res.cancelled) {
        setAuthError('Google sign-in was cancelled.');
        setGoogleBusy(false);
      } else if (res.error) {
        setAuthError(res.error);
        setGoogleBusy(false);
      } else if (res.session?.user) {
        const u = res.session.user;
        const uName = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
        const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;

        if (migrateGuest && isGuest) {
          await app.migrateGuestTasksToUser(u.id);
        }

        app.signIn(u.email || '', uName, 'google', u.id, avatar);
        setLinkGuestSheet(false);
        setGoogleBusy(false);
      }
    } catch (err: any) {
      console.error('[Google Sign-In Error in Settings]:', err);
      setAuthError(err?.message || 'Google sign-in failed. Please try again.');
      setGoogleBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Settings</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {authError && (
          <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: Radius.md, padding: Space.md, marginBottom: Space.md, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
            <Txt v="callout" c="#EF4444" style={{ flex: 1 }}>{authError}</Txt>
            <IconBtn icon="close" size={18} onPress={() => setAuthError(null)} label="Dismiss error" />
          </View>
        )}

        {/* ---------------- Account Section ---------------- */}
        <ListGroup
          title="Account"
          footer={
            isSignedOut
              ? 'Signing in enables account-based task synchronization and connected services across web and mobile.'
              : isGuest
              ? 'Guest data is stored locally on this device. Sign in with Google to link and back up your tasks to the cloud.'
              : undefined
          }
        >
          {isSignedOut && (
            <>
              <Row
                icon="person-outline"
                title="Account status"
                value="Not signed in"
                chevron={false}
              />
              <View style={{ paddingHorizontal: Space.md, paddingVertical: 10 }}>
                <Btn
                  title={googleBusy ? 'Connecting to Google...' : 'Sign in with Google'}
                  icon="logo-google"
                  full
                  loading={googleBusy}
                  disabled={googleBusy}
                  kind="primary"
                  onPress={() => handleGoogleSignIn(false)}
                />
              </View>
              <Row
                icon="key-outline"
                title="More sign-in options"
                subtitle="Sign in with email, create account, or guest mode"
                onPress={() => navigation.navigate('SignIn')}
                last
              />
            </>
          )}

          {isGoogle && (
            <>
              <Row
                icon="checkmark-circle-outline"
                iconBg="#10B981"
                title="Account status"
                value="Signed in"
                subtitle="Google Account"
                chevron={false}
              />
              <Row
                icon="mail-outline"
                title={user?.name || 'Google User'}
                subtitle={user?.email || 'Google Account'}
                value={app.syncStatus === 'syncing' ? 'Syncing...' : 'Synced'}
                chevron={false}
              />
              <Row
                icon="shield-checkmark-outline"
                title="Manage account"
                subtitle="View profile & security details"
                onPress={() => setManageAccountSheet(true)}
              />
              <Row
                icon="log-out-outline"
                title="Sign out"
                subtitle="Return to signed-out state"
                danger
                last
                onPress={() => setConfirmSignOut(true)}
              />
            </>
          )}

          {isEmail && (
            <>
              <Row
                icon="checkmark-circle-outline"
                iconBg="#3B82F6"
                title="Account status"
                value="Signed in"
                subtitle="Email Account"
                chevron={false}
              />
              <Row
                icon="mail-outline"
                title={user?.name || 'User'}
                subtitle={user?.email}
                value={app.syncStatus === 'syncing' ? 'Syncing...' : 'Synced'}
                chevron={false}
              />
              <Row
                icon="shield-checkmark-outline"
                title="Manage account"
                subtitle="Account & cloud sync options"
                onPress={() => setManageAccountSheet(true)}
              />
              <Row
                icon="log-out-outline"
                title="Sign out"
                subtitle="Return to signed-out state"
                danger
                last
                onPress={() => setConfirmSignOut(true)}
              />
            </>
          )}

          {isGuest && (
            <>
              <Row
                icon="person-outline"
                title="Account status"
                value="Guest"
                subtitle="Stored on this device · Not synced to cloud"
                chevron={false}
              />
              <Row
                icon="logo-google"
                iconBg="#3B82F6"
                title="Sign in with Google"
                subtitle="Link & retain your guest tasks in the cloud"
                onPress={() => setLinkGuestSheet(true)}
              />
              <Row
                icon="log-out-outline"
                title="Sign out of guest mode"
                subtitle="Return to signed-out state"
                danger
                last
                onPress={() => setConfirmSignOut(true)}
              />
            </>
          )}
        </ListGroup>

        {/* Units */}
        <ListGroup title="Units & format">
          <Row
            icon="thermometer-outline"
            title="Temperature"
            right={
              <View style={{ width: 120 }}>
                <Segmented options={[{ key: 'C', label: '°C' }, { key: 'F', label: '°F' }]} value={s.tempUnit} onChange={(v) => app.setSettings({ tempUnit: v })} />
              </View>
            }
          />
          <Row
            icon="navigate-outline"
            title="Wind speed"
            right={
              <View style={{ width: 180 }}>
                <Segmented
                  options={[{ key: 'kmh', label: 'km/h' }, { key: 'mph', label: 'mph' }, { key: 'ms', label: 'm/s' }]}
                  value={s.windUnit}
                  onChange={(v) => app.setSettings({ windUnit: v })}
                />
              </View>
            }
          />
          <Row
            icon="time-outline"
            title="24-hour time"
            subtitle={`Now shows as ${formatTime(new Date(), s.use24h)}`}
            right={<Toggle value={s.use24h} onChange={(v) => app.setSettings({ use24h: v })} />}
          />
          <Row
            icon="calendar-outline"
            title="Week starts Monday"
            right={<Toggle value={s.weekStartsMonday} onChange={(v) => app.setSettings({ weekStartsMonday: v })} />}
            last
          />
        </ListGroup>

        {/* Navigation to sub-screens */}
        <ListGroup title="Experience">
          <Row icon="color-palette-outline" title="Appearance" subtitle={s.themeMode === 'system' ? 'Match system' : s.themeMode === 'dark' ? 'Always dark' : 'Always light'} onPress={() => navigation.navigate('Appearance')} />
          <Row icon="accessibility-outline" title="Accessibility" subtitle={[s.highContrast && 'High contrast', s.largeText && 'Large text', s.reduceMotion && 'Reduced motion'].filter(Boolean).join(' · ') || 'Default'} onPress={() => navigation.navigate('Accessibility')} />
          <Row icon="notifications-outline" title="Notifications" subtitle={`${Object.values(s.notifications).filter((v) => v === true).length} enabled`} onPress={() => navigation.navigate('Notifications')} />
          <Row icon="link-outline" title="Integrations" subtitle={state.integrations.googleCalendar || state.integrations.googleTasks ? state.integrations.account ?? 'Google connected' : 'Nothing connected'} onPress={() => navigation.navigate('Integrations')} last />
        </ListGroup>

        <ListGroup title="Data">
          <Row icon="location-outline" title="Locations" value={`${state.places.length}`} onPress={() => navigation.navigate('Locations')} />
          <Row icon="alarm-outline" title="Reminders" value={`${state.reminders.length}`} onPress={() => navigation.navigate('Reminders')} />
          <Row icon="information-circle-outline" title="About Weather What To-Do" onPress={() => navigation.navigate('About')} />
          <Row icon="refresh-outline" iconBg={theme.danger} title="Reset all data" danger chevron={false} onPress={() => setConfirmReset(true)} last />
        </ListGroup>

        <Txt v="micro" c={theme.textTertiary} center style={{ marginTop: Space.sm }}>Weather What To-Do v1.0 · Weather data by Open-Meteo</Txt>
      </ScrollView>

      {/* Reset Confirmation Sheet */}
      <Sheet visible={confirmReset} onClose={() => setConfirmReset(false)} title="Reset everything?">
        <Txt v="callout" c={theme.textSecondary} style={{ lineHeight: 21, marginBottom: Space.lg }}>
          This clears your tasks, events, reminders, locations, settings and conversation history, and restores the demo data set. It cannot be undone.
        </Txt>
        <Btn title="Reset all data" kind="danger" full onPress={() => { app.resetAll(); setConfirmReset(false); }} />
        <View style={{ height: 8 }} />
        <Btn title="Cancel" kind="secondary" full onPress={() => setConfirmReset(false)} />
      </Sheet>

      {/* Sign Out Confirmation Sheet */}
      <Sheet visible={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out?">
        <Txt v="callout" c={theme.textSecondary} style={{ lineHeight: 21, marginBottom: Space.lg }}>
          You will be returned to the signed-out state. Your cloud tasks and account records remain securely stored in your account, and you can sign in again from Settings at any time.
        </Txt>
        <Btn
          title="Sign out"
          kind="danger"
          full
          onPress={async () => {
            setConfirmSignOut(false);
            await app.signOut();
          }}
        />
        <View style={{ height: 8 }} />
        <Btn title="Cancel" kind="secondary" full onPress={() => setConfirmSignOut(false)} />
      </Sheet>

      {/* Manage Account Sheet */}
      <Sheet visible={manageAccountSheet} onClose={() => setManageAccountSheet(false)} title="Manage account">
        <View style={{ marginBottom: Space.lg, gap: 10 }}>
          <View style={{ backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: Space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Txt v="caption" c={theme.textTertiary}>AUTHENTICATED EMAIL</Txt>
            <Txt v="body" w="600" style={{ marginTop: 2 }}>{user?.email || 'N/A'}</Txt>
          </View>
          <View style={{ backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: Space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Txt v="caption" c={theme.textTertiary}>DISPLAY NAME</Txt>
            <Txt v="body" w="600" style={{ marginTop: 2 }}>{user?.name || 'User'}</Txt>
          </View>
          <View style={{ backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: Space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Txt v="caption" c={theme.textTertiary}>PROVIDER</Txt>
            <Txt v="body" w="600" style={{ marginTop: 2 }}>{isGoogle ? 'Google OAuth (Supabase Auth)' : 'Email (Supabase Auth)'}</Txt>
          </View>
        </View>
        {isGoogle && (
          <>
            <Btn
              title="Google Account Security"
              icon="open-outline"
              kind="secondary"
              full
              onPress={() => Linking.openURL('https://myaccount.google.com/security')}
            />
            <View style={{ height: 8 }} />
          </>
        )}
        <Btn title="Done" kind="primary" full onPress={() => setManageAccountSheet(false)} />
      </Sheet>

      {/* Link Guest Account Sheet */}
      <Sheet visible={linkGuestSheet} onClose={() => setLinkGuestSheet(false)} title="Link to Google Account">
        <Txt v="callout" c={theme.textSecondary} style={{ lineHeight: 21, marginBottom: Space.md }}>
          Upgrading to a Google account unlocks automatic cloud synchronization across your web and mobile devices.
        </Txt>
        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', borderRadius: Radius.md, padding: Space.md, marginBottom: Space.lg, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={18} color="#10B981" />
            <Txt v="sub" w="600" c="#10B981">Guest Data Retention</Txt>
          </View>
          <Txt v="caption" c={theme.textSecondary} style={{ lineHeight: 18 }}>
            Your existing local guest tasks will be safely preserved and migrated to your Google cloud account using stable IDs and duplicate prevention.
          </Txt>
        </View>
        <Btn
          title={googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
          icon="logo-google"
          full
          loading={googleBusy}
          disabled={googleBusy}
          kind="primary"
          onPress={() => handleGoogleSignIn(true)}
        />
        <View style={{ height: 8 }} />
        <Btn title="Cancel" kind="secondary" full onPress={() => setLinkGuestSheet(false)} />
      </Sheet>
    </SafeAreaView>
  );
}
