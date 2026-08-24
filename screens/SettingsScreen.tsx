import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, IconBtn, ListGroup, Row, Segmented, Sheet, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { formatTime } from '../lib/utils';

export default function SettingsScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const s = state.settings;
  const [keySheet, setKeySheet] = useState(false);
  const [keyDraft, setKeyDraft] = useState(s.geminiKey);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Settings</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {/* Smart Suggestion */}
        <ListGroup title="Smart Suggestion" footer="Without a key, Smart Suggestion reasons entirely on-device using your weather, calendar and task data. Nothing leaves the phone.">
          <Row
            icon="key-outline"
            title="Gemini API key"
            subtitle={s.geminiKey ? `Connected · ••••${s.geminiKey.slice(-4)}` : 'Not connected — using on-device reasoning'}
            onPress={() => { setKeyDraft(s.geminiKey); setKeySheet(true); }}
          />
          <View style={{ paddingHorizontal: Space.md, paddingVertical: 13, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={theme.accent} />
              </View>
              <Txt v="callout" w="500" style={{ flex: 1 }}>Response style</Txt>
            </View>
            <Segmented
              options={[{ key: 'concise', label: 'Concise' }, { key: 'balanced', label: 'Balanced' }, { key: 'detailed', label: 'Detailed' }]}
              value={s.geminiTone}
              onChange={(v) => app.setSettings({ geminiTone: v })}
            />
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 58 }} />
          <Row
            icon="bulb-outline"
            title="Proactive suggestions"
            subtitle="Surface insights on the home dashboard"
            right={<Toggle value={s.autoSuggest} onChange={(v) => app.setSettings({ autoSuggest: v })} />}
            last
          />
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
          <Row icon="information-circle-outline" title="About Aurelia" onPress={() => navigation.navigate('About')} />
          <Row icon="refresh-outline" iconBg={theme.danger} title="Reset all data" danger chevron={false} onPress={() => setConfirmReset(true)} last />
        </ListGroup>

        <Txt v="micro" c={theme.textTertiary} center style={{ marginTop: Space.sm }}>Aurelia v1.0 · Weather data by Open-Meteo</Txt>
      </ScrollView>

      <Sheet visible={keySheet} onClose={() => setKeySheet(false)} title="Gemini API key">
        <Txt v="callout" c={theme.textSecondary} style={{ lineHeight: 21, marginBottom: Space.md }}>
          Paste a Google AI Studio key to let Smart Suggestion answer with the live Gemini model. Your key is stored only on this device and is sent directly to Google.
        </Txt>
        <TextInput
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder="AIza…"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{
            backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, color: theme.text, fontSize: 16,
            borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Space.md,
            // @ts-ignore
            outlineStyle: 'none',
          }}
        />
        <Btn title="Save key" full onPress={() => { app.setSettings({ geminiKey: keyDraft.trim() }); setKeySheet(false); }} />
        {!!s.geminiKey && (
          <>
            <View style={{ height: 8 }} />
            <Btn title="Remove key" kind="ghost" tint={theme.danger} full onPress={() => { app.setSettings({ geminiKey: '' }); setKeyDraft(''); setKeySheet(false); }} />
          </>
        )}
        <Card style={{ marginTop: Space.md, backgroundColor: theme.surfaceAlt, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.textSecondary} />
            <Txt v="sub" c={theme.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
              With no key, every insight you see is generated locally from your own data. The experience stays complete either way.
            </Txt>
          </View>
        </Card>
      </Sheet>

      <Sheet visible={confirmReset} onClose={() => setConfirmReset(false)} title="Reset everything?">
        <Txt v="callout" c={theme.textSecondary} style={{ lineHeight: 21, marginBottom: Space.lg }}>
          This clears your tasks, events, reminders, locations, settings and conversation history, and restores the demo data set. It cannot be undone.
        </Txt>
        <Btn title="Reset all data" kind="danger" full onPress={() => { app.resetAll(); setConfirmReset(false); }} />
        <View style={{ height: 8 }} />
        <Btn title="Cancel" kind="secondary" full onPress={() => setConfirmReset(false)} />
      </Sheet>
    </SafeAreaView>
  );
}
