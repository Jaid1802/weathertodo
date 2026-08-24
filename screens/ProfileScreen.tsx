import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, IconBtn, ListGroup, Ring, Row, Sheet, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, shadow } from '../lib/theme';
import { dateKey, formatTime, initials, pluralize, relativeDay } from '../lib/utils';

export default function ProfileScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const { width } = useWindowDimensions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.user?.name ?? '');
  const [headline, setHeadline] = useState(state.user?.headline ?? '');

  const user = state.user;
  const todayKey = dateKey(new Date());

  const totalOpen = state.tasks.filter((t) => !t.done).length;
  const doneToday = state.tasks.filter((t) => t.done && t.completedAt && dateKey(t.completedAt) === todayKey).length;

  const completedTasks = useMemo(() => {
    return state.tasks
      .filter((t) => t.done && t.completedAt)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 15);
  }, [state.tasks]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.xs, flexDirection: 'row', alignItems: 'center' }}>
          <Txt v="title1" w="700" style={{ flex: 1 }}>Profile</Txt>
          <IconBtn icon="settings-outline" onPress={() => navigation.navigate('Settings')} label="Settings" />
        </View>

        {/* Identity card */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.md }}>
          <View style={{ borderRadius: Radius.xl, overflow: 'hidden', ...shadow(2, theme.shadow) }}>
            <LinearGradient
              colors={theme.scheme === 'dark' ? ['#1B2440', '#131A2E'] : ['#4C6BFF', '#7B5BFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: Space.lg }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View
                  style={{
                    width: 64, height: 64, borderRadius: 64, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Txt v="title2" w="700" c="#fff">{initials(user?.name ?? 'You')}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="title3" w="700" c="#fff">{user?.name ?? 'Guest'}</Txt>
                  <Txt v="sub" c="rgba(255,255,255,0.8)" style={{ marginTop: 2 }}>{user?.email ?? 'Not signed in'}</Txt>
                  {user?.headline ? <Txt v="micro" c="rgba(255,255,255,0.72)" style={{ marginTop: 5, fontStyle: 'italic' }}>{user.headline}</Txt> : null}
                </View>
                <IconBtn icon="create-outline" size={34} bg="rgba(255,255,255,0.2)" color="#fff" onPress={() => { setName(user?.name ?? ''); setHeadline(user?.headline ?? ''); setEditing(true); }} label="Edit profile" />
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Today snapshot */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ring progress={doneToday / Math.max(1, doneToday + totalOpen)} size={62} stroke={7} color={theme.accent}>
                <Ionicons name="today-outline" size={20} color={theme.accent} />
              </Ring>
              <View style={{ flex: 1 }}>
                <Txt v="headline" w="700">Today so far</Txt>
                <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 3, lineHeight: 19 }}>
                  {doneToday} {pluralize(doneToday, 'task')} completed, {totalOpen} still open across {state.lists.length} lists.
                </Txt>
              </View>
            </View>
          </Card>
        </View>

        {/* Task History */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
          <Txt v="title3" w="700" style={{ marginBottom: Space.sm }}>Task History</Txt>
          {completedTasks.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.bgElevated,
                borderRadius: Radius.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.hairline,
                padding: Space.lg,
                alignItems: 'center',
              }}
            >
              <Txt v="sub" c={theme.textTertiary}>No completed tasks yet</Txt>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {completedTasks.map((t) => {
                const list = state.lists.find((l) => l.id === t.listId);
                return (
                  <View
                    key={t.id}
                    style={{
                      backgroundColor: theme.bgElevated,
                      borderRadius: Radius.lg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.hairline,
                      padding: Space.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: `${theme.accent}1F`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={18} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt v="callout" w="600" numberOfLines={1}>{t.title}</Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {list && (
                          <Txt v="micro" c={list.color ?? theme.textTertiary} w="600">
                            {list.name}
                          </Txt>
                        )}
                        {list && t.completedAt && (
                          <Txt v="micro" c={theme.textTertiary}>·</Txt>
                        )}
                        {t.completedAt && (
                          <Txt v="micro" c={theme.textTertiary}>
                            {relativeDay(new Date(t.completedAt))} · {formatTime(t.completedAt, state.settings.use24h)}
                          </Txt>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Quick links */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
          <ListGroup title="Manage">
            <Row icon="location-outline" title="Locations" subtitle={`${state.places.length} saved`} onPress={() => navigation.navigate('Locations')} />
            <Row icon="alarm-outline" title="Reminders" subtitle={`${state.reminders.filter((r) => r.enabled).length} active`} onPress={() => navigation.navigate('Reminders')} />
            <Row icon="link-outline" title="Integrations" subtitle={state.integrations.googleCalendar || state.integrations.googleTasks ? 'Google connected' : 'Not connected'} onPress={() => navigation.navigate('Integrations')} />
            <Row icon="color-palette-outline" title="Appearance" subtitle={state.settings.themeMode === 'system' ? 'Match system' : state.settings.themeMode === 'dark' ? 'Dark' : 'Light'} onPress={() => navigation.navigate('Appearance')} last />
          </ListGroup>

          <ListGroup title="Account">
            <Row icon="shield-checkmark-outline" title="Privacy" subtitle="All data stays on this device" onPress={() => navigation.navigate('About')} />
            <Row icon="settings-outline" title="Settings" onPress={() => navigation.navigate('Settings')} />
            <Row
              icon="log-out-outline"
              iconBg={theme.danger}
              title="Sign out"
              danger
              onPress={() => app.signOut()}
              last
              chevron={false}
            />
          </ListGroup>
        </View>

        <Txt v="micro" c={theme.textTertiary} center style={{ marginTop: Space.md }}>
          Aurelia · Weather + Productivity Assistant · v1.0
        </Txt>
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit profile">
        <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Name</Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.textTertiary}
          style={{
            backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, color: theme.text, fontSize: 16,
            borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Space.md,
            // @ts-ignore
            outlineStyle: 'none',
          }}
        />
        <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Headline</Txt>
        <TextInput
          value={headline}
          onChangeText={setHeadline}
          placeholder="One line about how you work"
          placeholderTextColor={theme.textTertiary}
          style={{
            backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, color: theme.text, fontSize: 16,
            borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Space.lg,
            // @ts-ignore
            outlineStyle: 'none',
          }}
        />
        <Btn
          title="Save changes"
          full
          onPress={() => {
            app.updateProfile({ name: name.trim() || 'You', headline: headline.trim() });
            setEditing(false);
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}
