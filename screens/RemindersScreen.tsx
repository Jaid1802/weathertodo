import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, EmptyState, IconBtn, Segmented, Sheet, Toggle, Touch, Txt } from '../components/ui';
import { DateStrip, Field, OptionGrid, TimeStrip } from '../components/Pickers';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { Reminder, ReminderRepeat, ReminderTrigger } from '../lib/types';
import { condition } from '../lib/weather';
import { dateKey, minutesToLabel, relativeDay } from '../lib/utils';

const TRIGGER_META: Record<ReminderTrigger, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  time: { icon: 'time', label: 'Time', color: '#3B5BFF' },
  location: { icon: 'location', label: 'Location', color: '#0FA968' },
  weather: { icon: 'partly-sunny', label: 'Weather', color: '#E8890C' },
};

const WEATHER_RULES = [
  { key: 'rain', label: 'When rain is forecast', icon: 'rainy-outline' as const },
  { key: 'clear', label: 'When skies clear', icon: 'sunny-outline' as const },
  { key: 'cold', label: 'When it drops below 5°', icon: 'snow-outline' as const },
  { key: 'hot', label: 'When it climbs above 30°', icon: 'thermometer-outline' as const },
  { key: 'uv', label: 'When UV is high', icon: 'sunny' as const },
];

export default function RemindersScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, weather } = app;
  const [filter, setFilter] = useState<'all' | ReminderTrigger>('all');
  const [composing, setComposing] = useState(false);

  const [title, setTitle] = useState('');
  const [trigger, setTrigger] = useState<ReminderTrigger>('time');
  const [date, setDate] = useState<string | undefined>(dateKey(new Date()));
  const [minutes, setMinutes] = useState<number | undefined>(9 * 60);
  const [repeat, setRepeat] = useState<ReminderRepeat>('none');
  const [placeName, setPlaceName] = useState('');
  const [weatherRule, setWeatherRule] = useState<'rain' | 'clear' | 'cold' | 'hot' | 'uv'>('rain');

  const list = useMemo(
    () => state.reminders.filter((r) => filter === 'all' || r.trigger === filter),
    [state.reminders, filter]
  );

  const activeWeatherRules = useMemo(() => {
    if (!weather) return [] as string[];
    const out: string[] = [];
    const c = weather.current;
    const pop = Math.max(...weather.hourly.slice(0, 12).map((h) => h.pop), 0);
    if (pop > 50) out.push('rain');
    if (condition(c.code).outdoorScore > 85) out.push('clear');
    if (c.temp < 5) out.push('cold');
    if (c.temp > 30) out.push('hot');
    if (c.uv >= 6) out.push('uv');
    return out;
  }, [weather]);

  const reset = () => {
    setTitle(''); setTrigger('time'); setDate(dateKey(new Date())); setMinutes(9 * 60);
    setRepeat('none'); setPlaceName(''); setWeatherRule('rain');
  };

  const inputStyle = {
    backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, color: theme.text, fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
    // @ts-ignore
    outlineStyle: 'none',
  } as any;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <View style={{ flex: 1 }}>
          <Txt v="headline" w="700">Reminders</Txt>
          <Txt v="micro" c={theme.textTertiary}>{state.reminders.filter((r) => r.enabled).length} active</Txt>
        </View>
        <IconBtn icon="add" bg={theme.accent} color={theme.onAccent} onPress={() => { reset(); setComposing(true); }} label="New reminder" />
      </View>

      <View style={{ paddingHorizontal: Space.lg, marginBottom: Space.sm }}>
        <Segmented
          options={[
            { key: 'all', label: 'All' },
            { key: 'time', label: 'Time', icon: 'time-outline' },
            { key: 'location', label: 'Place', icon: 'location-outline' },
            { key: 'weather', label: 'Weather', icon: 'partly-sunny-outline' },
          ]}
          value={filter}
          onChange={setFilter as any}
        />
      </View>

      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          activeWeatherRules.length ? (
            <Card style={{ marginBottom: Space.md, backgroundColor: `${theme.warning}14`, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name="notifications" size={17} color={theme.warning} />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="700" c={theme.warning}>Conditions are triggering now</Txt>
                  <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                    {state.reminders.filter((r) => r.trigger === 'weather' && r.enabled && r.weatherRule && activeWeatherRules.includes(r.weatherRule)).length
                      ? state.reminders
                          .filter((r) => r.trigger === 'weather' && r.enabled && r.weatherRule && activeWeatherRules.includes(r.weatherRule))
                          .map((r) => `“${r.title}”`)
                          .join(', ') + ' would fire based on the current forecast.'
                      : `Current conditions match: ${activeWeatherRules.join(', ')}. Add a weather reminder to act on them.`}
                  </Txt>
                </View>
              </View>
            </Card>
          ) : null
        }
        renderItem={({ item }) => <ReminderRow reminder={item} />}
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon="alarm-outline"
              title="No reminders here"
              body="Reminders can fire at a time, when you reach a place, or when the weather changes — like reminding you to grab an umbrella."
              actionLabel="Create reminder"
              onAction={() => { reset(); setComposing(true); }}
            />
          </Card>
        }
      />

      <Sheet visible={composing} onClose={() => setComposing(false)} title="New reminder">
        <Field label="Remind me to">
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Take an umbrella" placeholderTextColor={theme.textTertiary} style={inputStyle} autoFocus />
        </Field>

        <Field label="Trigger">
          <OptionGrid<ReminderTrigger>
            value={trigger}
            onChange={setTrigger}
            columns={3}
            options={[
              { key: 'time', label: 'Time', icon: 'time-outline' },
              { key: 'location', label: 'Place', icon: 'location-outline', color: theme.success },
              { key: 'weather', label: 'Weather', icon: 'partly-sunny-outline', color: theme.warning },
            ]}
          />
        </Field>

        {trigger === 'time' && (
          <>
            <Field label="Date"><DateStrip value={date} onChange={setDate} /></Field>
            <Field label="Time"><TimeStrip value={minutes} onChange={setMinutes} use24h={state.settings.use24h} /></Field>
            <Field label="Repeat">
              <OptionGrid<ReminderRepeat>
                value={repeat}
                onChange={setRepeat}
                columns={4}
                options={[
                  { key: 'none', label: 'Once' },
                  { key: 'daily', label: 'Daily' },
                  { key: 'weekdays', label: 'Weekdays' },
                  { key: 'weekly', label: 'Weekly' },
                ]}
              />
            </Field>
          </>
        )}

        {trigger === 'location' && (
          <Field label="When I arrive at" hint="Geofenced reminders fire when your device enters the area.">
            <TextInput value={placeName} onChangeText={setPlaceName} placeholder="e.g. Grocery store" placeholderTextColor={theme.textTertiary} style={inputStyle} />
          </Field>
        )}

        {trigger === 'weather' && (
          <Field label="Weather condition">
            <View style={{ gap: 8 }}>
              {WEATHER_RULES.map((r) => {
                const active = weatherRule === r.key;
                return (
                  <Touch key={r.key} onPress={() => setWeatherRule(r.key as any)} scale={0.98}>
                    <View
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: Radius.md,
                        backgroundColor: active ? `${theme.warning}1A` : theme.surfaceAlt,
                        borderWidth: 1.5, borderColor: active ? theme.warning : 'transparent',
                      }}
                    >
                      <Ionicons name={r.icon} size={17} color={active ? theme.warning : theme.textTertiary} />
                      <Txt v="callout" w={active ? '600' : '400'} style={{ flex: 1 }}>{r.label}</Txt>
                      {active && <Ionicons name="checkmark-circle" size={17} color={theme.warning} />}
                    </View>
                  </Touch>
                );
              })}
            </View>
          </Field>
        )}

        <Btn
          title="Create reminder"
          full
          onPress={() => {
            if (!title.trim()) return;
            app.addReminder({
              title: title.trim(),
              trigger,
              date: trigger === 'time' ? date : undefined,
              minutes: trigger === 'time' ? minutes : undefined,
              repeat,
              placeName: trigger === 'location' ? placeName.trim() || 'Saved place' : undefined,
              weatherRule: trigger === 'weather' ? weatherRule : undefined,
              enabled: true,
            });
            setComposing(false);
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const app = useApp();
  const { theme, state } = app;
  const meta = TRIGGER_META[reminder.trigger];
  const detail =
    reminder.trigger === 'time'
      ? `${reminder.date ? relativeDay(new Date(Number(reminder.date.split('-')[0]), Number(reminder.date.split('-')[1]) - 1, Number(reminder.date.split('-')[2]))) : ''} ${reminder.minutes !== undefined ? minutesToLabel(reminder.minutes, state.settings.use24h) : ''}${reminder.repeat !== 'none' ? ` · ${reminder.repeat}` : ''}`
      : reminder.trigger === 'location'
        ? `Arriving at ${reminder.placeName}`
        : WEATHER_RULES.find((w) => w.key === reminder.weatherRule)?.label ?? 'Weather change';

  return (
    <Card style={{ marginBottom: 10, opacity: reminder.enabled ? 1 : 0.55 }} padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: Space.md, gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: `${meta.color}1C`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="callout" w="600">{reminder.title}</Txt>
          <Txt v="micro" c={theme.textTertiary} style={{ marginTop: 2 }}>{detail}</Txt>
        </View>
        <Toggle value={reminder.enabled} onChange={(v) => app.updateReminder(reminder.id, { enabled: v })} tint={meta.color} />
        <IconBtn icon="trash-outline" size={32} iconSize={15} color={theme.danger} bg="transparent" onPress={() => app.deleteReminder(reminder.id)} label="Delete" />
      </View>
    </Card>
  );
}
