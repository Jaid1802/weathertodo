import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, IconBtn, Toggle, Touch, Txt } from '../components/ui';
import { DateStrip, Field, OptionGrid, TimeStrip } from '../components/Pickers';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { EventKind } from '../lib/types';
import { bestOutdoorWindow, condition, fmtTemp, hoursForDay } from '../lib/weather';
import { dateKey, formatTime, minutesToLabel } from '../lib/utils';
import { findBestEventWindow, BestWindowProposal } from '../lib/scheduling';
import { updateGoogleEvent } from '../lib/googleApi';

export default function EventEditorScreen({ navigation, route }: any) {
  const app = useApp();
  const { state, theme, weather } = app;
  const id: string | undefined = route?.params?.id;
  const preset = route?.params?.preset ?? {};
  const existing = id ? state.events.find((e) => e.id === id) : undefined;

  const [title, setTitle] = useState(existing?.title ?? preset.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [date, setDate] = useState<string>(existing?.date ?? preset.date ?? dateKey(new Date()));
  const [start, setStart] = useState<number>(existing?.startMinutes ?? preset.startMinutes ?? 9 * 60);
  const [end, setEnd] = useState<number>(existing?.endMinutes ?? (preset.startMinutes ? preset.startMinutes + 60 : 10 * 60));
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [location, setLocation] = useState(existing?.location ?? '');
  const [isOutdoor, setIsOutdoor] = useState(existing?.isOutdoor ?? false);
  const [kind, setKind] = useState<EventKind>(existing?.kind ?? preset.kind ?? 'meeting');
  const [calendarId, setCalendarId] = useState(existing?.calendarId ?? state.calendars[0]?.id ?? 'cal_personal');

  // Best window calculation & confirmation states
  const [calculatingWindow, setCalculatingWindow] = useState(false);
  const [proposedWindow, setProposedWindow] = useState<BestWindowProposal | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const inputStyle = {
    backgroundColor: theme.bgElevated,
    borderRadius: Radius.md,
    padding: 14,
    color: theme.text,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    // @ts-ignore web
    outlineStyle: 'none',
  } as any;

  const dayWeather = useMemo(() => weather?.daily.find((d) => d.date === date), [weather, date]);
  const window = useMemo(() => (weather ? bestOutdoorWindow(weather, date) : null), [weather, date]);
  const slotHours = useMemo(() => {
    if (!weather) return [];
    return hoursForDay(weather, date).filter((h) => {
      const hh = new Date(h.time).getHours();
      return hh >= Math.floor(start / 60) && hh <= Math.floor(end / 60);
    });
  }, [weather, date, start, end]);
  const slotRisk = slotHours.length ? Math.max(...slotHours.map((h) => h.pop)) : 0;

  const handleFindBestWindow = async () => {
    if (calculatingWindow) return;
    setCalculatingWindow(true);
    setNoticeMessage(null);
    setProposedWindow(null);

    // Brief smooth delay so user sees loading state
    await new Promise((r) => setTimeout(r, 350));

    const result = findBestEventWindow({
      eventDate: date,
      currentStart: start,
      currentEnd: end,
      weather,
      events: state.events,
      excludeEventId: existing?.id,
      use24h: state.settings.use24h,
    });

    setProposedWindow(result);
    if (result.status !== 'success') {
      setNoticeMessage(result.message || "I couldn't find a weather-friendly window that doesn't conflict with your calendar.");
    }
    setCalculatingWindow(false);
  };

  const handleConfirmMove = async () => {
    if (!proposedWindow || proposedWindow.startMinutes === undefined || proposedWindow.endMinutes === undefined) return;
    const newStart = proposedWindow.startMinutes;
    const newEnd = proposedWindow.endMinutes;

    setStart(newStart);
    setEnd(newEnd);

    if (existing) {
      if (existing.source === 'google') {
        const res = await updateGoogleEvent(calendarId, existing.id, {
          date,
          startMinutes: newStart,
          endMinutes: newEnd,
        });

        if (res.permissionDenied) {
          setNoticeMessage(res.error || 'Your calendar is connected for viewing, but editing permission is required to move this event.');
          setProposedWindow(null);
          return;
        } else if (!res.success) {
          setNoticeMessage(res.error || 'Could not sync the change with Google Calendar.');
          setProposedWindow(null);
          return;
        }
      }
      app.updateEvent(existing.id, {
        startMinutes: newStart,
        endMinutes: newEnd,
      });
    }

    setProposedWindow(null);
    setNoticeMessage(`Moved to ${minutesToLabel(newStart, state.settings.use24h)}–${minutesToLabel(newEnd, state.settings.use24h)}.`);
  };

  const save = () => {
    const payload = {
      title: title.trim() || 'Untitled event',
      notes: notes.trim() || undefined,
      date,
      startMinutes: allDay ? 0 : start,
      endMinutes: allDay ? 24 * 60 - 1 : Math.max(start + 15, end),
      allDay,
      location: location.trim() || undefined,
      isOutdoor,
      kind,
      calendarId,
      source: existing?.source ?? ('local' as const),
    };
    if (existing) app.updateEvent(existing.id, payload);
    else app.addEvent(payload as any);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="close" onPress={() => navigation.goBack()} label="Cancel" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>{existing ? 'Edit event' : 'New event'}</Txt>
        {existing && <IconBtn icon="trash-outline" color={theme.danger} onPress={() => { app.deleteEvent(existing.id); navigation.goBack(); }} label="Delete event" />}
        <Btn title="Save" small onPress={save} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="Title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Coffee with Sam"
              placeholderTextColor={theme.textTertiary}
              style={[inputStyle, { fontSize: 18, fontWeight: '600' }]}
              autoFocus={!existing}
            />
          </Field>

          <Field label="Date">
            <DateStrip value={date} onChange={(v) => { if (v) { setDate(v); setProposedWindow(null); setNoticeMessage(null); } }} />
          </Field>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="sunny-outline" size={17} color={theme.accent} />
              <Txt v="callout" w="500">All-day event</Txt>
            </View>
            <Toggle value={allDay} onChange={setAllDay} />
          </View>

          {!allDay && (
            <>
              <Field label={`Starts · ${minutesToLabel(start, state.settings.use24h)}`}>
                <TimeStrip value={start} onChange={(v) => { const nv = v ?? 9 * 60; setStart(nv); if (end <= nv) setEnd(nv + 60); setProposedWindow(null); }} use24h={state.settings.use24h} />
              </Field>
              <Field label={`Ends · ${minutesToLabel(end, state.settings.use24h)}`}>
                <TimeStrip value={end} onChange={(v) => { setEnd(Math.max(start + 15, v ?? start + 60)); setProposedWindow(null); }} use24h={state.settings.use24h} />
              </Field>
            </>
          )}

          <Field label="Location">
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Add a place or link"
              placeholderTextColor={theme.textTertiary}
              style={inputStyle}
            />
          </Field>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, marginBottom: Space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name="leaf-outline" size={17} color={theme.success} />
              <View style={{ flex: 1 }}>
                <Txt v="callout" w="500">This happens outdoors</Txt>
                <Txt v="micro" c={theme.textTertiary}>Smart Suggestion will warn you about weather conflicts</Txt>
              </View>
            </View>
            <Toggle value={isOutdoor} onChange={setIsOutdoor} tint={theme.success} />
          </View>

          <Field label="Type">
            <OptionGrid<EventKind>
              value={kind}
              onChange={setKind}
              columns={3}
              options={[
                { key: 'meeting', label: 'Meeting', icon: 'people-outline' },
                { key: 'focus', label: 'Focus', icon: 'flash-outline' },
                { key: 'personal', label: 'Personal', icon: 'heart-outline' },
                { key: 'travel', label: 'Travel', icon: 'airplane-outline' },
                { key: 'health', label: 'Health', icon: 'fitness-outline' },
                { key: 'social', label: 'Social', icon: 'wine-outline' },
              ]}
            />
          </Field>

          <Field label="Calendar">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {state.calendars.map((c) => {
                const active = c.id === calendarId;
                return (
                  <Touch key={c.id} onPress={() => setCalendarId(c.id)} scale={0.95}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: active ? c.color : theme.surfaceAlt }}>
                      <View style={{ width: 9, height: 9, borderRadius: 9, backgroundColor: active ? '#fff' : c.color }} />
                      <Txt v="sub" w="600" c={active ? '#fff' : theme.textSecondary}>{c.name}</Txt>
                    </View>
                  </Touch>
                );
              })}
            </View>
          </Field>

          <Field label="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Agenda, prep, links…"
              placeholderTextColor={theme.textTertiary}
              style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' }]}
              multiline
            />
          </Field>

          {dayWeather && (
            <Card style={{ backgroundColor: isOutdoor && slotRisk > 50 ? `${theme.warning}18` : theme.accentSoft, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name={isOutdoor && slotRisk > 50 ? 'warning' : 'sparkles'} size={17} color={isOutdoor && slotRisk > 50 ? theme.warning : theme.accent} />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="700" c={isOutdoor && slotRisk > 50 ? theme.warning : theme.accent}>
                    {isOutdoor && slotRisk > 50 ? 'Weather conflict' : 'Forecast for this slot'}
                  </Txt>
                  <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                    {condition(dayWeather.code).label}, {fmtTemp(dayWeather.min, state.settings.tempUnit)}–{fmtTemp(dayWeather.max, state.settings.tempUnit)}.
                    {slotHours.length ? ` During your slot the peak rain chance is ${slotRisk}%.` : ''}
                    {isOutdoor && window ? ` The driest outdoor window is ${formatTime(window.start, state.settings.use24h)}–${formatTime(window.end, state.settings.use24h)}.` : ''}
                  </Txt>

                  {/* Proposed window confirmation box */}
                  {proposedWindow && proposedWindow.status === 'success' && proposedWindow.startMinutes !== undefined && proposedWindow.endMinutes !== undefined && (
                    <View style={{ marginTop: 12, padding: 12, backgroundColor: theme.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: theme.border }}>
                      <Txt v="callout" w="700" c={theme.text}>
                        How about moving this to {minutesToLabel(proposedWindow.startMinutes, state.settings.use24h)}–{minutesToLabel(proposedWindow.endMinutes, state.settings.use24h)}?
                      </Txt>
                      <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                        {proposedWindow.reason}
                      </Txt>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <Btn
                          title="Cancel"
                          small
                          kind="ghost"
                          onPress={() => setProposedWindow(null)}
                        />
                        <Btn
                          title={`Move to ${minutesToLabel(proposedWindow.startMinutes, state.settings.use24h)}`}
                          small
                          kind="primary"
                          onPress={handleConfirmMove}
                        />
                      </View>
                    </View>
                  )}

                  {/* Notification / failure message */}
                  {noticeMessage && (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: theme.surfaceAlt, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
                      <Txt v="sub" c={theme.textSecondary} style={{ flex: 1 }}>{noticeMessage}</Txt>
                      <Touch onPress={() => setNoticeMessage(null)} scale={0.9}>
                        <Ionicons name="close" size={14} color={theme.textTertiary} />
                      </Touch>
                    </View>
                  )}

                  {/* Action button */}
                  {isOutdoor && slotRisk > 40 && !proposedWindow && (
                    <Btn
                      title={calculatingWindow ? 'Finding a better weather window…' : 'Move to the best window'}
                      small
                      kind="secondary"
                      disabled={calculatingWindow}
                      style={{ marginTop: 10 }}
                      onPress={handleFindBestWindow}
                    />
                  )}

                  {calculatingWindow && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Txt v="sub" c={theme.textSecondary}>Checking weather and calendar availability…</Txt>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          )}

          {existing?.source === 'google' && (
            <View style={{ marginTop: Space.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="logo-google" size={14} color={theme.textTertiary} />
              <Txt v="micro" c={theme.textTertiary}>Synced with Google Calendar</Txt>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
