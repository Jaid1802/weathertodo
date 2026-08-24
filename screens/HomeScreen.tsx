import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated, Platform, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Badge, Chip, GlassCard, IconBtn, Skeleton, Touch, Txt } from '../components/ui';
import { MetricTile, TempCurve } from '../components/Charts';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import {
  aqiFromWeather, aqiLabel, bestOutdoorWindow, condition, fmtTemp, fmtWind, nextHours, skyFor, uvLabel, windCompass,
} from '../lib/weather';
import { PlanContext, Suggestion, comfortScore, generateBriefing, generateSuggestions } from '../lib/gemini';
import { dateKey, formatDateLong, formatHourShort, formatTime, greeting, minutesToLabel, pluralize } from '../lib/utils';

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  meeting: 'people', focus: 'flash', personal: 'heart', travel: 'airplane', health: 'fitness', social: 'wine',
};

const TONE_COLOR: Record<string, string> = {
  critical: '#FF6B6B', caution: '#FFC46B', focus: '#9DB4FF', positive: '#6FE0A8', info: '#CFE3FF',
};

export default function HomeScreen({ navigation }: any) {
  const app = useApp();
  const { state, weather, weatherLoading, refreshWeather, activePlace, theme, scheme } = app;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const settings = state.settings;
  const reduce = settings.reduceMotion;

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

  const dayProgress = useMemo(() => {
    if (!weather) return 0.5;
    const today = weather.daily.find((d) => d.date === todayKey);
    if (!today) return 0.5;
    return Math.max(0, Math.min(1, (Date.now() - today.sunrise) / Math.max(1, today.sunset - today.sunrise)));
  }, [weather, todayKey]);

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
  const openTasks = todayTasks.filter((t) => !t.done);

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
  const briefing = useMemo(() => (planCtx ? generateBriefing(planCtx) : ''), [planCtx]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshWeather(true);
    setRefreshing(false);
  }, [refreshWeather]);

  const heroHeight = Math.min(height * 0.52, 460);
  const headerOpacity = scrollY.interpolate({ inputRange: [heroHeight * 0.42, heroHeight * 0.72], outputRange: [0, 1], extrapolate: 'clamp' });
  const heroOpacity = scrollY.interpolate({ inputRange: [0, heroHeight * 0.55], outputRange: [1, 0], extrapolate: 'clamp' });
  const heroTranslate = scrollY.interpolate({ inputRange: [-120, 0, heroHeight], outputRange: [reduce ? 0 : -40, 0, reduce ? 0 : -70], extrapolate: 'clamp' });
  const heroScale = scrollY.interpolate({ inputRange: [-160, 0], outputRange: [reduce ? 1 : 1.1, 1], extrapolate: 'clamp' });

  const cur = weather?.current;
  const today = weather?.daily.find((d) => d.date === todayKey);
  const cond = cur ? condition(cur.code) : null;
  const hours = weather ? nextHours(weather, 12) : [];
  const comfort = cur ? comfortScore(cur) : 0;
  const window = weather ? bestOutdoorWindow(weather, todayKey) : null;

  const glass = { tint: settings.highContrast ? 'rgba(0,0,0,0.42)' : sky.glass, border: settings.highContrast ? 'rgba(255,255,255,0.55)' : sky.glassBorder };
  const onSky = sky.onSky;
  const onSkyMuted = settings.highContrast ? 'rgba(255,255,255,0.92)' : sky.onSkyMuted;

  const goSuggestion = (s: Suggestion) => {
    const k = s.action?.kind;
    if (k === 'tasks') navigation.navigate('Tasks');
    else if (k === 'calendar') navigation.navigate('Calendar');
    else if (k === 'weather') navigation.navigate('WeatherDetail');
    else if (k === 'reminders') navigation.navigate('Reminders');
    else if (k === 'addTask') navigation.navigate('TaskEditor', {});
    else if (k === 'moveEvent') {
      navigation.navigate('EventEditor', {
        preset: { title: s.action?.payload?.title ?? 'Focus block', startMinutes: s.action?.payload?.start ?? 9 * 60, date: todayKey, kind: 'focus' },
      });
    } else navigation.navigate('Tasks');
  };

  return (
    <View style={{ flex: 1, backgroundColor: sky.sky[1] }}>
      <WeatherBackground sky={sky} dayProgress={dayProgress} reduceMotion={reduce} scrim={settings.highContrast ? 0.18 : 0} />

      {/* Compact sticky header */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: Space.lg,
          opacity: headerOpacity,
          backgroundColor: 'rgba(0,0,0,0.24)',
          // @ts-ignore web
          backdropFilter: Platform.OS === 'web' ? 'blur(18px)' : undefined,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="location" size={14} color={onSky} />
          <Txt v="callout" w="700" c={onSky}>{activePlace.name}</Txt>
          <View style={{ flex: 1 }} />
          {cur && <Txt v="callout" w="700" c={onSky}>{fmtTemp(cur.temp, settings.tempUnit)}</Txt>}
          {cond && <Ionicons name={(cur?.isDay ? cond.icon : cond.iconNight) as any} size={17} color={onSky} />}
        </View>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        contentContainerStyle={{ paddingBottom: insets.bottom + 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={onSky} colors={[sky.accent]} progressBackgroundColor={sky.sky[0]} />}
      >
        {/* ---------------- Top bar ---------------- */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Touch onPress={() => navigation.navigate('Locations')} scale={0.96}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill,
                backgroundColor: glass.tint, borderWidth: 1, borderColor: glass.border,
              }}
            >
              <Ionicons name="location" size={13} color={onSky} />
              <Txt v="sub" w="600" c={onSky} numberOfLines={1} style={{ maxWidth: 160 }}>{activePlace.name}</Txt>
              <Ionicons name="chevron-down" size={12} color={onSkyMuted} />
            </View>
          </Touch>
          <View style={{ flex: 1 }} />
          <IconBtn icon="notifications-outline" size={38} color={onSky} bg={glass.tint} border={glass.border} onPress={() => navigation.navigate('Reminders')} label="Reminders" />
        </View>

        {/* ---------------- Hero ---------------- */}
        <Animated.View
          style={{
            minHeight: heroHeight,
            justifyContent: 'center',
            paddingHorizontal: Space.lg,
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslate }, { scale: heroScale }],
          }}
        >
          <Txt v="callout" c={onSkyMuted} w="500">{greeting()}{state.user ? `, ${state.user.name.split(' ')[0]}` : ''}</Txt>
          <Txt v="sub" c={onSkyMuted} style={{ marginTop: 2 }}>{formatDateLong(new Date())}</Txt>

          {weatherLoading && !weather ? (
            <View style={{ marginTop: 26, gap: 12 }}>
              <Skeleton w={200} h={86} r={18} />
              <Skeleton w={150} h={20} />
              <Skeleton w={220} h={16} />
            </View>
          ) : cur && cond ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 }}>
                <Txt
                  v="hero"
                  w="200"
                  c={onSky}
                  style={{
                    fontSize: Math.min(width * 0.34, 132),
                    lineHeight: Math.min(width * 0.36, 140),
                    fontWeight: '200',
                    letterSpacing: -6,
                    textShadowColor: 'rgba(0,0,0,0.22)',
                    textShadowRadius: 18,
                    textShadowOffset: { width: 0, height: 3 },
                  }}
                >
                  {fmtTemp(cur.temp, settings.tempUnit, false)}
                </Txt>
                <Txt v="title1" c={onSky} style={{ marginTop: 18, fontWeight: '200', fontSize: 44 }}>°</Txt>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -6 }}>
                <Ionicons name={(cur.isDay ? cond.icon : cond.iconNight) as any} size={22} color={sky.accent} />
                <Txt v="title3" w="600" c={onSky}>{cond.label}</Txt>
              </View>
              <Txt v="callout" c={onSkyMuted} style={{ marginTop: 6 }}>
                Feels like {fmtTemp(cur.feelsLike, settings.tempUnit)}
                {today ? `  ·  H:${fmtTemp(today.max, settings.tempUnit)}  L:${fmtTemp(today.min, settings.tempUnit)}` : ''}
              </Txt>
              <Txt v="sub" c={onSkyMuted} style={{ marginTop: 10, fontStyle: 'italic' }}>{sky.mood}</Txt>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <Chip label={`${todayEvents.length} ${pluralize(todayEvents.length, 'event')}`} icon="calendar" active tint={glass.tint} fg={onSky} onPress={() => navigation.navigate('Calendar')} small />
                <Chip label={`${openTasks.length} open ${pluralize(openTasks.length, 'task')}`} icon="checkmark-circle" active tint={glass.tint} fg={onSky} onPress={() => navigation.navigate('Tasks')} small />
                <Chip label={`Comfort ${comfort}`} icon="pulse" active tint={glass.tint} fg={onSky} onPress={() => navigation.navigate('WeatherDetail')} small />
              </View>
            </>
          ) : null}
        </Animated.View>

        {/* ---------------- Hourly ---------------- */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.md }}>
          <GlassCard tint={glass.tint} border={glass.border} padded={false}>
            <View style={{ paddingHorizontal: Space.md, paddingTop: Space.md, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time-outline" size={13} color={onSkyMuted} />
              <Txt v="micro" c={onSkyMuted} w="700" style={{ marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.9, flex: 1 }}>Next 12 hours</Txt>
              <Touch onPress={() => navigation.navigate('WeatherDetail')} scale={0.94}>
                <Txt v="micro" w="700" c={sky.accent}>DETAILS</Txt>
              </Touch>
            </View>

            {hours.length > 1 && (
              <View style={{ paddingHorizontal: Space.sm, marginTop: 4 }}>
                <TempCurve hours={hours} width={Math.min(width, 520) - Space.lg * 2 - Space.sm * 2} height={92} color={sky.accent} textColor={onSky} unit={settings.tempUnit} />
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Space.md, paddingBottom: Space.md, gap: 4 }}>
              {hours.length === 0
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w={54} h={82} r={14} />)
                : hours.map((h, i) => {
                    const c = condition(h.code);
                    const isNow = i === 0;
                    return (
                      <View
                        key={h.time}
                        style={{
                          width: 56, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md,
                          backgroundColor: isNow ? 'rgba(255,255,255,0.16)' : 'transparent',
                        }}
                      >
                        <Txt v="micro" c={onSkyMuted} w="600">{isNow ? 'Now' : formatHourShort(new Date(h.time), settings.use24h)}</Txt>
                        <Ionicons name={(h.isDay ? c.icon : c.iconNight) as any} size={18} color={onSky} />
                        {h.pop > 15 ? <Txt v="micro" c={sky.accent} w="700">{h.pop}%</Txt> : <View style={{ height: 13 }} />}
                        <Txt v="callout" w="600" c={onSky}>{fmtTemp(h.temp, settings.tempUnit)}</Txt>
                      </View>
                    );
                  })}
            </ScrollView>
          </GlassCard>
        </View>

        {/* ---------------- Gemini suggestions ---------------- */}
        <View style={{ marginTop: Space.xl }}>
          <View style={{ paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', marginBottom: Space.sm }}>
            <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <Ionicons name="sparkles" size={14} color={sky.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="headline" w="700" c={onSky}>Smart Suggestion</Txt>
              <Txt v="micro" c={onSkyMuted}>Weather × Calendar × Tasks, connected</Txt>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={width * 0.78 + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: Space.lg, gap: 12 }}
          >
            {suggestions.length === 0
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} w={width * 0.78} h={150} r={20} />)
              : suggestions.map((s) => (
                  <Touch key={s.id} onPress={() => goSuggestion(s)} scale={0.98}>
                    <GlassCard tint={glass.tint} border={glass.border} style={{ width: width * 0.78, maxWidth: 380, minHeight: 156 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: `${TONE_COLOR[s.tone]}33`, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={s.icon as any} size={15} color={TONE_COLOR[s.tone]} />
                        </View>
                        <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.7, flex: 1 }}>{s.tag}</Txt>
                        <Badge label={`${Math.round(s.confidence * 100)}%`} color={onSky} bg="rgba(255,255,255,0.16)" />
                      </View>
                      <Txt v="headline" w="700" c={onSky} style={{ lineHeight: 22 }}>{s.title}</Txt>
                      <Txt v="sub" c={onSkyMuted} style={{ marginTop: 6, lineHeight: 19 }} numberOfLines={4}>{s.body}</Txt>
                      {s.action && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
                          <Txt v="sub" w="700" c={sky.accent}>{s.action.label}</Txt>
                          <Ionicons name="arrow-forward" size={13} color={sky.accent} />
                        </View>
                      )}
                    </GlassCard>
                  </Touch>
                ))}
          </ScrollView>
        </View>

        {/* ---------------- Today's schedule ---------------- */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space.sm }}>
            <View style={{ flex: 1 }}>
              <Txt v="title3" w="700" c={onSky}>Today's schedule</Txt>
              <Txt v="micro" c={onSkyMuted} style={{ marginTop: 2 }}>
                {todayEvents.length ? `${todayEvents.length} ${pluralize(todayEvents.length, 'event')} · ${state.integrations.googleCalendar ? 'Google Calendar synced' : 'Local only'}` : 'Nothing scheduled'}
              </Txt>
            </View>
            <Touch onPress={() => navigation.navigate('Calendar')} scale={0.94}>
              <Txt v="sub" w="700" c={sky.accent}>All</Txt>
            </Touch>
          </View>

          <GlassCard tint={glass.tint} border={glass.border} padded={false}>
            {todayEvents.length === 0 ? (
              <View style={{ padding: Space.lg, alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-clear-outline" size={26} color={onSkyMuted} />
                <Txt v="callout" c={onSky} w="600">A clear calendar</Txt>
                <Txt v="sub" c={onSkyMuted} center>No events today. Add one or let the day stay open.</Txt>
                <Btn title="Add event" small kind="glass" tint="rgba(255,255,255,0.18)" onTint={onSky} onPress={() => navigation.navigate('EventEditor', {})} />
              </View>
            ) : (
              todayEvents.map((e, i) => {
                const cal = state.calendars.find((c) => c.id === e.calendarId);
                const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                const live = nowMin >= e.startMinutes && nowMin < e.endMinutes;
                const past = nowMin >= e.endMinutes;
                return (
                  <Touch key={e.id} onPress={() => navigation.navigate('EventEditor', { id: e.id })} scale={0.99}>
                    <View style={{ flexDirection: 'row', paddingHorizontal: Space.md, paddingVertical: 13, gap: 12, opacity: past ? 0.5 : 1 }}>
                      <View style={{ width: 58 }}>
                        <Txt v="sub" w="700" c={onSky}>{e.allDay ? 'All day' : minutesToLabel(e.startMinutes, settings.use24h).replace(' ', '')}</Txt>
                        {!e.allDay && <Txt v="micro" c={onSkyMuted}>{minutesToLabel(e.endMinutes, settings.use24h).replace(' ', '')}</Txt>}
                      </View>
                      <View style={{ width: 3, borderRadius: 3, backgroundColor: cal?.color ?? sky.accent }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Txt v="callout" w="600" c={onSky} numberOfLines={1} style={{ flex: 1 }}>{e.title}</Txt>
                          {live && <Badge label="NOW" color="#0B1533" bg={sky.accent} />}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name={KIND_ICON[e.kind] ?? 'ellipse'} size={11} color={onSkyMuted} />
                            <Txt v="micro" c={onSkyMuted}>{e.location ?? cal?.name ?? 'Event'}</Txt>
                          </View>
                          {e.isOutdoor && <Badge label="OUTDOOR" color={onSky} bg="rgba(255,255,255,0.18)" icon="leaf" />}
                          {e.source === 'google' && <Badge label="GOOGLE" color={onSkyMuted} bg="rgba(255,255,255,0.10)" />}
                        </View>
                      </View>
                    </View>
                    {i < todayEvents.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.16)', marginLeft: Space.md + 70 }} />}
                  </Touch>
                );
              })
            )}
          </GlassCard>
        </View>

        {/* ---------------- Today's tasks ---------------- */}
        <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space.sm }}>
            <View style={{ flex: 1 }}>
              <Txt v="title3" w="700" c={onSky}>Today's tasks</Txt>
              <Txt v="micro" c={onSkyMuted} style={{ marginTop: 2 }}>
                {todayTasks.length - openTasks.length}/{todayTasks.length} complete
                {window && openTasks.some((t) => t.context === 'outdoor') ? ` · outdoor window ${formatTime(window.start, settings.use24h)}` : ''}
              </Txt>
            </View>
            <Touch onPress={() => navigation.navigate('TaskEditor', {})} scale={0.94}>
              <Txt v="sub" w="700" c={sky.accent}>New</Txt>
            </Touch>
          </View>

          <GlassCard tint={glass.tint} border={glass.border} padded={false}>
            {todayTasks.length === 0 ? (
              <View style={{ padding: Space.lg, alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-done-circle-outline" size={26} color={onSkyMuted} />
                <Txt v="callout" c={onSky} w="600">Nothing on the list</Txt>
                <Txt v="sub" c={onSkyMuted} center>Add your first task for today.</Txt>
              </View>
            ) : (
              todayTasks.slice(0, 6).map((t, i) => {
                const list = state.lists.find((l) => l.id === t.listId);
                const overdue = !!t.dueDate && t.dueDate < todayKey && !t.done;
                return (
                  <View key={t.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 12, gap: 12 }}>
                      <Touch onPress={() => app.toggleTask(t.id)} scale={0.88} hitSlop={10} accessibilityLabel={`Toggle ${t.title}`}>
                        <View
                          style={{
                            width: 23, height: 23, borderRadius: 23, borderWidth: 2,
                            borderColor: t.done ? sky.accent : 'rgba(255,255,255,0.55)',
                            backgroundColor: t.done ? sky.accent : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {t.done && <Ionicons name="checkmark" size={14} color="#0B1533" />}
                        </View>
                      </Touch>
                      <Touch onPress={() => navigation.navigate('TaskEditor', { id: t.id })} style={{ flex: 1 }} scale={0.99}>
                        <Txt v="callout" w="500" c={onSky} numberOfLines={1} style={{ textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1 }}>
                          {t.title}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          <Txt v="micro" c={onSkyMuted}>{list?.name ?? 'Inbox'}</Txt>
                          {t.dueMinutes !== undefined && <Txt v="micro" c={onSkyMuted}>· {minutesToLabel(t.dueMinutes, settings.use24h)}</Txt>}
                          {t.context === 'outdoor' && <Badge label="OUTDOOR" color={onSky} bg="rgba(255,255,255,0.16)" icon="leaf" />}
                          {overdue && <Badge label="OVERDUE" color="#FFD3D3" bg="rgba(229,72,77,0.34)" />}
                        </View>
                      </Touch>
                      {(t.priority === 'urgent' || t.priority === 'high') && !t.done && (
                        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: t.priority === 'urgent' ? '#FF6B6B' : '#FFC46B' }} />
                      )}
                    </View>
                    {i < Math.min(todayTasks.length, 6) - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)', marginLeft: Space.md + 35 }} />}
                  </View>
                );
              })
            )}
            {todayTasks.length > 6 && (
              <Touch onPress={() => navigation.navigate('Tasks')}>
                <View style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)' }}>
                  <Txt v="sub" w="600" c={sky.accent}>Show all {todayTasks.length}</Txt>
                </View>
              </Touch>
            )}
          </GlassCard>
        </View>

        {/* ---------------- Conditions grid ---------------- */}
        {cur && (
          <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
            <Txt v="title3" w="700" c={onSky} style={{ marginBottom: Space.sm }}>Conditions</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { icon: 'water-outline', label: 'Humidity', value: `${Math.round(cur.humidity)}%`, sub: cur.humidity > 70 ? 'Muggy air' : cur.humidity < 35 ? 'Dry air' : 'Comfortable' },
                { icon: 'navigate-outline', label: 'Wind', value: fmtWind(cur.wind, settings.windUnit), sub: `From ${windCompass(cur.windDir)}` },
                { icon: 'sunny-outline', label: 'UV index', value: `${Math.round(cur.uv)}`, sub: uvLabel(cur.uv) },
                { icon: 'speedometer-outline', label: 'Pressure', value: `${Math.round(cur.pressure)}`, sub: 'hPa' },
                { icon: 'leaf-outline', label: 'Air', value: `${aqiFromWeather(cur)}`, sub: aqiLabel(aqiFromWeather(cur)) },
                { icon: 'eye-outline', label: 'Visibility', value: `${Math.round(cur.visibility)} km`, sub: cur.visibility > 12 ? 'Clear view' : 'Reduced' },
              ].map((m) => (
                <MetricTile
                  key={m.label}
                  width={(Math.min(width, 560) - Space.lg * 2 - 20) / 3}
                  icon={<Ionicons name={m.icon as any} size={13} color={onSkyMuted} />}
                  label={m.label}
                  value={m.value}
                  sub={m.sub}
                  textColor={onSky}
                  mutedColor={onSkyMuted}
                  bg={glass.tint}
                  border={glass.border}
                />
              ))}
            </View>
          </View>
        )}

        {/* ---------------- 7 day ---------------- */}
        {weather && (
          <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space.sm }}>
              <Txt v="title3" w="700" c={onSky} style={{ flex: 1 }}>7-day outlook</Txt>
              <Touch onPress={() => navigation.navigate('WeatherDetail')} scale={0.94}>
                <Txt v="sub" w="700" c={sky.accent}>Expand</Txt>
              </Touch>
            </View>
            <GlassCard tint={glass.tint} border={glass.border} padded={false}>
              {weather.daily.slice(0, 7).map((d, i) => {
                const c = condition(d.code);
                const allMin = Math.min(...weather.daily.slice(0, 7).map((x) => x.min));
                const allMax = Math.max(...weather.daily.slice(0, 7).map((x) => x.max));
                const range = Math.max(1, allMax - allMin);
                const left = ((d.min - allMin) / range) * 100;
                const w = ((d.max - d.min) / range) * 100;
                return (
                  <View key={d.date}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 11, gap: 10 }}>
                      <Txt v="callout" w={i === 0 ? '700' : '500'} c={onSky} style={{ width: 46 }}>
                        {i === 0 ? 'Today' : new Date(d.time).toLocaleDateString(undefined, { weekday: 'short' })}
                      </Txt>
                      <Ionicons name={c.icon as any} size={17} color={onSky} style={{ width: 22 }} />
                      <Txt v="micro" c={d.pop > 25 ? sky.accent : 'transparent'} w="700" style={{ width: 28 }}>{d.pop}%</Txt>
                      <Txt v="sub" c={onSkyMuted} style={{ width: 32, textAlign: 'right' }}>{fmtTemp(d.min, settings.tempUnit)}</Txt>
                      <View style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' }}>
                        <View style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(6, w)}%`, height: 4, borderRadius: 4, backgroundColor: sky.accent }} />
                      </View>
                      <Txt v="sub" w="600" c={onSky} style={{ width: 34, textAlign: 'right' }}>{fmtTemp(d.max, settings.tempUnit)}</Txt>
                    </View>
                    {i < 6 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.13)', marginLeft: Space.md }} />}
                  </View>
                );
              })}
            </GlassCard>
          </View>
        )}

        {/* ---------------- Daily briefing ---------------- */}
        {briefing ? (
          <View style={{ paddingHorizontal: Space.lg, marginTop: Space.xl }}>
            <GlassCard tint={glass.tint} border={glass.border}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="newspaper-outline" size={15} color={sky.accent} />
                <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.9, flex: 1 }}>Your daily briefing</Txt>
                <Badge label={weather?.source === 'live' ? 'LIVE DATA' : 'MODELLED'} color={onSky} bg="rgba(255,255,255,0.16)" />
              </View>
              <Txt v="body" c={onSky} style={{ lineHeight: 24 }}>{briefing}</Txt>
            </GlassCard>
          </View>
        ) : null}

        <View style={{ alignItems: 'center', marginTop: Space.xl, gap: 4 }}>
          <Txt v="micro" c={onSkyMuted}>
            {weather ? `Updated ${formatTime(weather.fetchedAt, settings.use24h)} · ${weather.source === 'live' ? 'Open-Meteo' : 'Offline model'}` : 'Loading conditions'}
          </Txt>
          <Txt v="micro" c={onSkyMuted} style={{ opacity: 0.7 }}>Pull down to refresh</Txt>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
