import React, { useMemo, useRef, useState } from 'react';
import { Animated, FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, Chip, EmptyState, IconBtn, Segmented, Sheet, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, shadow } from '../lib/theme';
import { condition, fmtTemp } from '../lib/weather';
import { CalEvent } from '../lib/types';
import { addDays, dateKey, formatDateLong, minutesToLabel, monthName, pluralize, relativeDay, startOfDay } from '../lib/utils';

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  meeting: 'people', focus: 'flash', personal: 'heart', travel: 'airplane', health: 'fitness', social: 'wine',
};

export default function CalendarScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, weather } = app;
  const { width } = useWindowDimensions();
  const settings = state.settings;
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [selected, setSelected] = useState(dateKey(new Date()));
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('month');
  const [showCals, setShowCals] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visibleCals = useMemo(() => new Set(state.calendars.filter((c) => c.visible).map((c) => c.id)), [state.calendars]);
  const events = useMemo(() => state.events.filter((e) => visibleCals.has(e.calendarId)), [state.events, visibleCals]);

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of events) {
      (m[e.date] ||= []).push(e);
    }
    Object.values(m).forEach((l) => l.sort((a, b) => a.startMinutes - b.startMinutes));
    return m;
  }, [events]);

  const weatherByDay = useMemo(() => {
    const m: Record<string, { code: number; max: number; min: number; pop: number }> = {};
    weather?.daily.forEach((d) => { m[d.date] = { code: d.code, max: d.max, min: d.min, pop: d.pop }; });
    return m;
  }, [weather]);

  const monthGrid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffsetRaw = first.getDay() - (settings.weekStartsMonday ? 1 : 0);
    const startOffset = (startOffsetRaw + 7) % 7;
    const gridStart = addDays(first, -startOffset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor, settings.weekStartsMonday]);

  const weeks = useMemo(() => {
    const out: Date[][] = [];
    for (let i = 0; i < monthGrid.length; i += 7) out.push(monthGrid.slice(i, i + 7));
    return out;
  }, [monthGrid]);

  const weekDays = useMemo(() => {
    const base = new Date(selected.split('-').map(Number)[0], Number(selected.split('-')[1]) - 1, Number(selected.split('-')[2]));
    const offsetRaw = base.getDay() - (settings.weekStartsMonday ? 1 : 0);
    const offset = (offsetRaw + 7) % 7;
    const start = addDays(base, -offset);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected, settings.weekStartsMonday]);

  const dayNames = settings.weekStartsMonday ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const selectedEvents = byDay[selected] ?? [];
  const selectedTasks = state.tasks.filter((t) => t.dueDate === selected);
  const todayKey = dateKey(new Date());

  const agendaDays = useMemo(() => {
    const out: { key: string; date: Date; events: CalEvent[] }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(new Date(), i);
      const k = dateKey(d);
      if (byDay[k]?.length) out.push({ key: k, date: d, events: byDay[k] });
    }
    return out;
  }, [byDay]);

  const cell = (Math.min(width, 560) - Space.lg * 2 - 12) / 7;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.xs, paddingBottom: Space.sm, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt v="title1" w="700">{monthName(cursor)}</Txt>
          <Txt v="sub" c={theme.textTertiary}>{cursor.getFullYear()} · {events.length} {pluralize(events.length, 'event')}</Txt>
        </View>
        <IconBtn icon="layers-outline" onPress={() => setShowCals(true)} label="Calendars" />
        <IconBtn icon="today-outline" onPress={() => { setCursor(startOfDay(new Date())); setSelected(todayKey); }} label="Today" />
        <IconBtn icon="add" bg={theme.accent} color={theme.onAccent} onPress={() => navigation.navigate('EventEditor', { preset: { date: selected } })} label="New event" />
      </View>

      <View style={{ paddingHorizontal: Space.lg, marginBottom: Space.sm }}>
        <Segmented
          options={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }, { key: 'agenda', label: 'Agenda' }]}
          value={view}
          onChange={setView}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              app.setIntegrations({ lastSyncCalendar: Date.now() });
              await new Promise((r) => setTimeout(r, 700));
              setRefreshing(false);
            }}
            tintColor={theme.accent}
          />
        }
      >
        {view === 'month' && (
          <View style={{ paddingHorizontal: Space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <IconBtn icon="chevron-back" size={32} iconSize={16} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} label="Previous month" />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Txt v="callout" w="600" c={theme.textSecondary}>{monthName(cursor, true)} {cursor.getFullYear()}</Txt>
              </View>
              <IconBtn icon="chevron-forward" size={32} iconSize={16} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} label="Next month" />
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {dayNames.map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <Txt v="micro" c={theme.textTertiary} w="700">{d}</Txt>
                </View>
              ))}
            </View>

            <View style={{ gap: 2 }}>
              {weeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row' }}>
                  {week.map((d) => {
                    const k = dateKey(d);
                    const inMonth = d.getMonth() === cursor.getMonth();
                    const isToday = k === todayKey;
                    const isSel = k === selected;
                    const evs = byDay[k] ?? [];
                    const w = weatherByDay[k];
                    return (
                      <Touch key={k} onPress={() => setSelected(k)} scale={0.92} style={{ flex: 1 }}>
                        <View
                          style={{
                            height: cell + 18, alignItems: 'center', justifyContent: 'flex-start',
                            paddingTop: 5, borderRadius: Radius.sm,
                            backgroundColor: isSel ? theme.accent : 'transparent',
                            opacity: inMonth ? 1 : 0.32,
                          }}
                        >
                          <Txt v="callout" w={isToday || isSel ? '700' : '500'} c={isSel ? theme.onAccent : isToday ? theme.accent : theme.text}>
                            {d.getDate()}
                          </Txt>
                          {w ? (
                            <Ionicons name={condition(w.code).icon as any} size={11} color={isSel ? theme.onAccent : theme.textTertiary} style={{ marginTop: 2 }} />
                          ) : (
                            <View style={{ height: 13 }} />
                          )}
                          <View style={{ flexDirection: 'row', gap: 2, marginTop: 2, height: 5 }}>
                            {evs.slice(0, 3).map((e) => {
                              const c = state.calendars.find((x) => x.id === e.calendarId);
                              return <View key={e.id} style={{ width: 4, height: 4, borderRadius: 4, backgroundColor: isSel ? theme.onAccent : c?.color ?? theme.accent }} />;
                            })}
                          </View>
                        </View>
                      </Touch>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        )}

        {view === 'week' && (
          <View style={{ paddingHorizontal: Space.lg }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {weekDays.map((d) => {
                const k = dateKey(d);
                const isSel = k === selected;
                const w = weatherByDay[k];
                const evs = byDay[k] ?? [];
                return (
                  <Touch key={k} onPress={() => setSelected(k)} style={{ flex: 1 }} scale={0.95}>
                    <View
                      style={{
                        alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, gap: 4,
                        backgroundColor: isSel ? theme.accent : theme.bgElevated,
                        borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
                      }}
                    >
                      <Txt v="micro" c={isSel ? theme.onAccent : theme.textTertiary} w="700">{d.toLocaleDateString(undefined, { weekday: 'short' })[0]}</Txt>
                      <Txt v="headline" w="700" c={isSel ? theme.onAccent : theme.text}>{d.getDate()}</Txt>
                      {w && <Ionicons name={condition(w.code).icon as any} size={13} color={isSel ? theme.onAccent : theme.textSecondary} />}
                      {w && <Txt v="micro" c={isSel ? theme.onAccent : theme.textTertiary}>{fmtTemp(w.max, settings.tempUnit)}</Txt>}
                      <View style={{ height: 4, flexDirection: 'row', gap: 2 }}>
                        {evs.slice(0, 3).map((e) => (
                          <View key={e.id} style={{ width: 3, height: 3, borderRadius: 3, backgroundColor: isSel ? theme.onAccent : theme.accent }} />
                        ))}
                      </View>
                    </View>
                  </Touch>
                );
              })}
            </View>

            {/* Timeline */}
            <Card style={{ marginTop: Space.lg }} padded={false}>
              <View style={{ padding: Space.md }}>
                <Txt v="micro" c={theme.textTertiary} w="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>Timeline · {relativeDay(new Date(selected.split('-').map(Number)[0], Number(selected.split('-')[1]) - 1, Number(selected.split('-')[2])))}</Txt>
              </View>
              {Array.from({ length: 15 }, (_, i) => i + 7).map((hour) => {
                const evs = selectedEvents.filter((e) => !e.allDay && Math.floor(e.startMinutes / 60) === hour);
                return (
                  <View key={hour} style={{ flexDirection: 'row', minHeight: 42, paddingHorizontal: Space.md }}>
                    <Txt v="micro" c={theme.textTertiary} style={{ width: 46, paddingTop: 2 }}>{minutesToLabel(hour * 60, settings.use24h)}</Txt>
                    <View style={{ flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingVertical: 4, gap: 4 }}>
                      {evs.map((e) => {
                        const c = state.calendars.find((x) => x.id === e.calendarId);
                        return (
                          <Touch key={e.id} onPress={() => navigation.navigate('EventEditor', { id: e.id })} scale={0.98}>
                            <View style={{ backgroundColor: `${c?.color ?? theme.accent}1F`, borderLeftWidth: 3, borderLeftColor: c?.color ?? theme.accent, borderRadius: 8, padding: 8 }}>
                              <Txt v="sub" w="600" numberOfLines={1}>{e.title}</Txt>
                              <Txt v="micro" c={theme.textTertiary}>{minutesToLabel(e.startMinutes, settings.use24h)} – {minutesToLabel(e.endMinutes, settings.use24h)}</Txt>
                            </View>
                          </Touch>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <View style={{ height: Space.md }} />
            </Card>
          </View>
        )}

        {view === 'agenda' ? (
          <View style={{ paddingHorizontal: Space.lg }}>
            {agendaDays.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title="Nothing coming up"
                body="Your next 30 days are open. Add an event and Smart Suggestion will factor the weather into it."
                actionLabel="Add event"
                onAction={() => navigation.navigate('EventEditor', { preset: { date: selected } })}
              />
            ) : (
              agendaDays.map((g) => {
                const w = weatherByDay[g.key];
                return (
                  <View key={g.key} style={{ marginBottom: Space.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Txt v="headline" w="700">{relativeDay(g.date)}</Txt>
                      <Txt v="sub" c={theme.textTertiary}>{formatDateLong(g.date)}</Txt>
                      <View style={{ flex: 1 }} />
                      {w && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name={condition(w.code).icon as any} size={14} color={theme.textSecondary} />
                          <Txt v="sub" c={theme.textSecondary}>{fmtTemp(w.max, settings.tempUnit)}</Txt>
                        </View>
                      )}
                    </View>
                    <Card padded={false}>
                      {g.events.map((e, i) => (
                        <EventRow key={e.id} event={e} last={i === g.events.length - 1} onPress={() => navigation.navigate('EventEditor', { id: e.id })} weatherCode={w?.code} />
                      ))}
                    </Card>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Selected day detail (month & week views) */
          <View style={{ paddingHorizontal: Space.lg, marginTop: Space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Space.sm }}>
              <View style={{ flex: 1 }}>
                <Txt v="title3" w="700">{relativeDay(new Date(Number(selected.split('-')[0]), Number(selected.split('-')[1]) - 1, Number(selected.split('-')[2])))}</Txt>
                <Txt v="sub" c={theme.textTertiary}>
                  {selectedEvents.length} {pluralize(selectedEvents.length, 'event')} · {selectedTasks.length} {pluralize(selectedTasks.length, 'task')}
                </Txt>
              </View>
              {weatherByDay[selected] && (
                <Touch onPress={() => navigation.navigate('WeatherDetail')} scale={0.96}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surfaceAlt, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill }}>
                    <Ionicons name={condition(weatherByDay[selected].code).icon as any} size={15} color={theme.accent} />
                    <Txt v="sub" w="600">{fmtTemp(weatherByDay[selected].max, settings.tempUnit)}</Txt>
                    <Txt v="micro" c={theme.textTertiary}>{weatherByDay[selected].pop}%</Txt>
                  </View>
                </Touch>
              )}
            </View>

            {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
              <Card>
                <EmptyState
                  icon="sparkles-outline"
                  title="Open day"
                  body="Nothing planned yet. This is a good slot for deep work or something outdoors."
                  actionLabel="Add event"
                  onAction={() => navigation.navigate('EventEditor', { preset: { date: selected } })}
                />
              </Card>
            ) : (
              <>
                {selectedEvents.length > 0 && (
                  <Card padded={false} style={{ marginBottom: Space.md }}>
                    {selectedEvents.map((e, i) => (
                      <EventRow key={e.id} event={e} last={i === selectedEvents.length - 1} onPress={() => navigation.navigate('EventEditor', { id: e.id })} weatherCode={weatherByDay[selected]?.code} />
                    ))}
                  </Card>
                )}
                {selectedTasks.length > 0 && (
                  <>
                    <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginLeft: 4, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Tasks due</Txt>
                    <Card padded={false}>
                      {selectedTasks.map((t, i) => (
                        <View key={t.id}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Space.md, paddingVertical: 12 }}>
                            <Touch onPress={() => app.toggleTask(t.id)} hitSlop={8} scale={0.9}>
                              <View style={{ width: 21, height: 21, borderRadius: 21, borderWidth: 2, borderColor: t.done ? theme.success : theme.border, backgroundColor: t.done ? theme.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                {t.done && <Ionicons name="checkmark" size={13} color="#fff" />}
                              </View>
                            </Touch>
                            <Touch style={{ flex: 1 }} onPress={() => navigation.navigate('TaskEditor', { id: t.id })}>
                              <Txt v="callout" w="500" style={{ textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.5 : 1 }}>{t.title}</Txt>
                            </Touch>
                            {t.context === 'outdoor' && <Badge label="OUTDOOR" icon="leaf" color={theme.success} bg={`${theme.success}1F`} />}
                          </View>
                          {i < selectedTasks.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 50 }} />}
                        </View>
                      ))}
                    </Card>
                  </>
                )}
              </>
            )}

            <Card style={{ marginTop: Space.md, backgroundColor: theme.accentSoft, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name="sparkles" size={17} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="600" c={theme.accent}>Weather-aware scheduling</Txt>
                  <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 3, lineHeight: 19 }}>
                    {selectedEvents.some((e) => e.isOutdoor) && weatherByDay[selected]?.pop && weatherByDay[selected].pop > 50
                      ? `${weatherByDay[selected].pop}% chance of rain and you have outdoor plans. Consider a backup.`
                      : weatherByDay[selected]
                        ? `${condition(weatherByDay[selected].code).label} expected, ${fmtTemp(weatherByDay[selected].min, settings.tempUnit)}–${fmtTemp(weatherByDay[selected].max, settings.tempUnit)}. Good for ${condition(weatherByDay[selected].code).outdoorScore > 65 ? 'outdoor blocks' : 'indoor focus'}.`
                        : 'Forecast for this date is outside the 10-day range.'}
                  </Txt>
                </View>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      <Sheet visible={showCals} onClose={() => setShowCals(false)} title="Calendars">
        {state.calendars.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <View style={{ width: 14, height: 14, borderRadius: 14, backgroundColor: c.color }} />
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="600">{c.name}</Txt>
              <Txt v="micro" c={theme.textTertiary}>{c.source === 'google' ? 'Google Calendar' : 'On this device'} · {state.events.filter((e) => e.calendarId === c.id).length} events</Txt>
            </View>
            <Toggle value={c.visible} onChange={() => app.toggleCalendar(c.id)} tint={c.color} />
          </View>
        ))}
        <View style={{ height: 8 }} />
        <Btn title="Manage Google Calendar" kind="secondary" icon="logo-google" full onPress={() => { setShowCals(false); navigation.navigate('Integrations'); }} />
      </Sheet>
    </SafeAreaView>
  );
}

function EventRow({ event, last, onPress, weatherCode }: { event: CalEvent; last: boolean; onPress: () => void; weatherCode?: number }) {
  const { state, theme } = useApp();
  const cal = state.calendars.find((c) => c.id === event.calendarId);
  const risky = event.isOutdoor && weatherCode !== undefined && condition(weatherCode).outdoorScore < 50;
  return (
    <View>
      <Touch onPress={onPress} scale={0.99}>
        <View style={{ flexDirection: 'row', paddingHorizontal: Space.md, paddingVertical: 13, gap: 12 }}>
          <View style={{ width: 56 }}>
            <Txt v="sub" w="700">{event.allDay ? 'All day' : minutesToLabel(event.startMinutes, state.settings.use24h)}</Txt>
            {!event.allDay && <Txt v="micro" c={theme.textTertiary}>{minutesToLabel(event.endMinutes, state.settings.use24h)}</Txt>}
          </View>
          <View style={{ width: 3, borderRadius: 3, backgroundColor: cal?.color ?? theme.accent }} />
          <View style={{ flex: 1 }}>
            <Txt v="callout" w="600" numberOfLines={1}>{event.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              <Ionicons name={KIND_ICON[event.kind] ?? 'ellipse'} size={11} color={theme.textTertiary} />
              <Txt v="micro" c={theme.textTertiary}>{event.location ?? cal?.name}</Txt>
              {event.isOutdoor && <Badge label="OUTDOOR" icon="leaf" color={theme.success} bg={`${theme.success}1A`} />}
              {risky && <Badge label="WEATHER RISK" icon="warning" color={theme.warning} bg={`${theme.warning}1F`} />}
              {event.source === 'google' && <Badge label="GOOGLE" color={theme.textTertiary} bg={theme.surfaceAlt} />}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} style={{ alignSelf: 'center' }} />
        </View>
      </Touch>
      {!last && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: Space.md + 68 }} />}
    </View>
  );
}
