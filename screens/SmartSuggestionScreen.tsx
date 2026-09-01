import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated, Keyboard, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Badge, Btn, Chip, GlassCard, IconBtn, Skeleton, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import { condition, skyFor } from '../lib/weather';
import {
  PlanContext, Suggestion, ScheduleAction,
  askGemini, generateSuggestions, STARTER_PROMPTS,
} from '../lib/gemini';
import { dateKey, formatTime } from '../lib/utils';

export default function SmartSuggestionScreen({ navigation }: any) {
  const app = useApp();
  const { state, weather, activePlace, theme, scheme } = app;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = state.settings;

  const todayKey = dateKey(new Date());

  const skyKey = useMemo(() => {
    if (!settings.dynamicWeatherTheme) return scheme === 'dark' ? 'clear-night' : 'clear-day';
    if (settings.weatherOverride) return settings.weatherOverride as any;
    if (!weather) return 'cloudy';
    const today = weather.daily.find((d) => d.date === todayKey);
    const hoursFromSunrise = today ? (Date.now() - today.sunrise) / 3600_000 : undefined;
    const minsToSunset = today ? (today.sunset - Date.now()) / 60000 : 999;
    if (weather.current.isDay && minsToSunset > 0 && minsToSunset < 55 && weather.current.code <= 3) return 'sunset';
    return skyFor(weather.current.code, weather.current.isDay, hoursFromSunrise);
  }, [weather, settings.dynamicWeatherTheme, settings.weatherOverride, todayKey, scheme]);

  const sky = getSky(skyKey as any);
  const glass = { tint: settings.highContrast ? 'rgba(0,0,0,0.42)' : sky.glass, border: settings.highContrast ? 'rgba(255,255,255,0.55)' : sky.glassBorder };
  const onSky = sky.onSky;
  const onSkyMuted = settings.highContrast ? 'rgba(255,255,255,0.92)' : sky.onSkyMuted;

  const todayEvents = useMemo(() => {
    const visible = new Set(state.calendars.filter((c) => c.visible).map((c) => c.id));
    return state.events
      .filter((e) => e.date === todayKey && visible.has(e.calendarId))
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [state.events, state.calendars, todayKey]);

  const todayTasks = useMemo(
    () => state.tasks.filter((t) => (t.dueDate === todayKey) || (!t.dueDate && !t.done) || (t.dueDate && t.dueDate < todayKey && !t.done)),
    [state.tasks, todayKey]
  );

  const planCtx: PlanContext | null = useMemo(() => {
    if (!weather) return null;
    return {
      place: activePlace,
      weather,
      events: todayEvents,
      tasks: todayTasks,
      allTasks: state.tasks,
      settings,
      userName: state.user?.name ?? 'there',
      now: new Date(),
    };
  }, [weather, activePlace, todayEvents, todayTasks, state.tasks, settings, state.user]);

  const suggestions: Suggestion[] = useMemo(() => (planCtx ? generateSuggestions(planCtx) : []), [planCtx]);

  // Ask Schedule state
  const [askQuery, setAskQuery] = useState('');
  const [askAnswer, setAskAnswer] = useState<{ text: string; chips: string[]; live: boolean; action?: ScheduleAction } | null>(null);
  const [asking, setAsking] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const submitAskSchedule = useCallback(async (q?: string) => {
    const question = (q ?? askQuery).trim();
    if (!question || !planCtx) return;
    Keyboard.dismiss();
    setAsking(true);
    setAskAnswer(null);
    setActionDone(false);
    try {
      const result = await askGemini(question, planCtx);
      setAskAnswer(result);
    } catch {
      setAskAnswer({ text: 'Something went wrong. Try again.', chips: [], live: false });
    } finally {
      setAsking(false);
    }
  }, [askQuery, planCtx]);

  const TONE_COLOR: Record<string, string> = {
    critical: '#FF6B6B', caution: '#FFC46B', focus: '#9DB4FF', positive: '#6FE0A8', info: '#CFE3FF',
  };

  return (
    <View style={{ flex: 1 }}>
      <WeatherBackground sky={sky} reduceMotion={settings.reduceMotion} scrim={settings.highContrast ? 0.18 : 0} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: Space.lg, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <IconBtn
          icon="arrow-back"
          onPress={() => navigation.goBack()}
          size={36}
          bg="rgba(255,255,255,0.16)"
          color={onSky}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt v="title3" w="700" c={onSky}>Smart Suggestion</Txt>
          <Txt v="micro" c={onSkyMuted}>Ask Schedule anything</Txt>
        </View>
        <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={14} color={sky.accent} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search bar */}
        <GlassCard tint={glass.tint} border={glass.border} style={{ marginBottom: Space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={onSkyMuted} />
            <TextInput
              ref={inputRef}
              placeholder="Ask about your day…"
              placeholderTextColor={onSkyMuted}
              value={askQuery}
              onChangeText={setAskQuery}
              onSubmitEditing={() => submitAskSchedule()}
              returnKeyType="send"
              style={{
                flex: 1,
                color: onSky,
                fontSize: 15,
                fontWeight: '500',
                letterSpacing: -0.1,
                paddingVertical: Platform.OS === 'web' ? 6 : 2,
                // @ts-ignore web
                outlineStyle: 'none',
              }}
            />
            <Touch
              onPress={() => submitAskSchedule()}
              disabled={!askQuery.trim() || asking}
              scale={0.9}
            >
              <View style={{ width: 32, height: 32, borderRadius: 32, backgroundColor: askQuery.trim() ? sky.accent : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-up" size={16} color={askQuery.trim() ? '#0B1533' : onSkyMuted} />
              </View>
            </Touch>
          </View>
        </GlassCard>

        {/* Starter chips */}
        {!askAnswer && !asking && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: Space.md }}>
            {STARTER_PROMPTS.slice(0, 5).map((p) => (
              <Chip
                key={p}
                label={p}
                onPress={() => {
                  setAskQuery(p);
                  submitAskSchedule(p);
                }}
                tint={sky.accent}
                fg="#0B1533"
                dim="rgba(255,255,255,0.16)"
                small
              />
            ))}
          </ScrollView>
        )}

        {/* Answer card */}
        {(asking || askAnswer) && (
          <GlassCard tint={glass.tint} border={glass.border} style={{ marginBottom: Space.md }}>
            {asking ? (
              <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
                <Skeleton w={width - Space.lg * 4} h={16} r={8} />
                <Skeleton w={(width - Space.lg * 4) * 0.7} h={16} r={8} />
                <Skeleton w={(width - Space.lg * 4) * 0.5} h={16} r={8} />
              </View>
            ) : askAnswer ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Ionicons name="sparkles" size={14} color={sky.accent} />
                  <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.9, flex: 1 }}>Ask Schedule</Txt>
                  <Badge
                    label={askAnswer.live ? 'GEMINI' : 'ON-DEVICE'}
                    color={onSky}
                    bg={askAnswer.live ? 'rgba(111,224,168,0.28)' : 'rgba(255,255,255,0.16)'}
                  />
                </View>
                <Txt v="body" c={onSky} style={{ lineHeight: 23 }}>{askAnswer.text}</Txt>

                {askAnswer.chips.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 14 }}>
                    {askAnswer.chips.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        onPress={() => {
                          setAskQuery(c);
                          submitAskSchedule(c);
                        }}
                        tint={sky.accent}
                        fg="#0B1533"
                        dim="rgba(255,255,255,0.16)"
                        small
                      />
                    ))}
                  </ScrollView>
                )}

                {askAnswer.action && !actionDone && (
                  <View style={{ marginTop: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons
                        name={askAnswer.action.kind === 'addTask' ? 'checkmark-circle-outline' : 'calendar-outline'}
                        size={15}
                        color={sky.accent}
                      />
                      <Txt v="sub" w="700" c={onSky}>
                        {askAnswer.action.kind === 'addTask'
                          ? `Add "${askAnswer.action.task?.title}" as a task?`
                          : `Add "${askAnswer.action.event?.title}" to your calendar?`}
                      </Txt>
                    </View>
                    <Btn
                      title={askAnswer.action.kind === 'addTask' ? 'Add task' : 'Add to calendar'}
                      icon="add"
                      kind="glass"
                      tint="rgba(255,255,255,0.22)"
                      onTint={onSky}
                      small
                      onPress={() => {
                        if (askAnswer.action?.kind === 'addTask' && askAnswer.action.task) {
                          app.addTask({
                            title: askAnswer.action.task.title,
                            priority: askAnswer.action.task.priority,
                            context: askAnswer.action.task.context,
                            dueDate: todayKey,
                            dueMinutes: askAnswer.action.task.dueMinutes,
                            listId: 'inbox',
                            done: false,
                            source: 'local',
                          });
                        } else if (askAnswer.action?.kind === 'addEvent' && askAnswer.action.event) {
                          app.addEvent({
                            title: askAnswer.action.event.title,
                            date: todayKey,
                            startMinutes: askAnswer.action.event.startMinutes,
                            endMinutes: askAnswer.action.event.endMinutes,
                            allDay: false,
                            isOutdoor: askAnswer.action.event.isOutdoor,
                            kind: 'personal',
                            calendarId: state.calendars[0]?.id ?? 'cal_personal',
                            source: 'local',
                          });
                        }
                        setActionDone(true);
                      }}
                    />
                  </View>
                )}

                {askAnswer.action && actionDone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                    <Ionicons name="checkmark-circle" size={15} color={sky.accent} />
                    <Txt v="sub" w="600" c={onSky}>Added.</Txt>
                  </View>
                )}
              </>
            ) : null}
          </GlassCard>
        )}

        {/* Today's insights */}
        <View style={{ marginTop: Space.sm }}>
          <Txt v="headline" w="700" c={onSky} style={{ marginBottom: Space.sm }}>Today's insights</Txt>
          {suggestions.length === 0
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} w={width - Space.lg * 2} h={120} r={16} style={{ marginBottom: 10 }} />)
            : suggestions.map((s) => (
                <GlassCard key={s.id} tint={glass.tint} border={glass.border} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: `${TONE_COLOR[s.tone]}33`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={s.icon as any} size={14} color={TONE_COLOR[s.tone]} />
                    </View>
                    <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.7, flex: 1 }}>{s.tag}</Txt>
                    <Badge label={`${Math.round(s.confidence * 100)}%`} color={onSky} bg="rgba(255,255,255,0.16)" />
                  </View>
                  <Txt v="headline" w="700" c={onSky} style={{ lineHeight: 22 }}>{s.title}</Txt>
                  <Txt v="sub" c={onSkyMuted} style={{ marginTop: 6, lineHeight: 19 }} numberOfLines={4}>{s.body}</Txt>
                  {s.action && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
                      <Txt v="sub" w="700" c={sky.accent}>{s.action.label}</Txt>
                      <Ionicons name="arrow-forward" size={13} color={sky.accent} />
                    </View>
                  )}
                </GlassCard>
              ))}
        </View>
      </ScrollView>
    </View>
  );
}
