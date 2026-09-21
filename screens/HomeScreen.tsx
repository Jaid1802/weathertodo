import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherIllustration from '../components/WeatherIllustration';
import DynamicWeatherAtmosphere from '../components/DynamicWeatherAtmosphere';
import { Btn, Touch } from '../components/ui';
import { useApp } from '../lib/store';
import {
  condition,
  fmtTemp,
  fmtWind,
  skyFor,
  uvLabel,
} from '../lib/weather';
import { resolveWeatherTheme } from '../lib/weatherTheme';
import { PlanContext, Suggestion, generateSuggestions, fetchSmartRecommendations } from '../lib/gemini';
import { dateKey } from '../lib/utils';

const KIND_COLOR: Record<string, string> = {
  meeting: '#3B82F6',
  focus: '#8B5CF6',
  personal: '#10B981',
  travel: '#F59E0B',
  health: '#EF4444',
  social: '#EC4899',
};

export default function HomeScreen({ navigation }: any) {
  const app = useApp();
  const { state, weather, refreshWeather, activePlace, scheme } = app;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const settings = state.settings;
  const isDark = scheme === 'dark';

  const isWide = width >= 768;
  const todayKey = dateKey(new Date());
  const cur = weather?.current;
  const todayForecast = weather?.daily.find((d) => d.date === todayKey);
  const cond = cur ? condition(cur.code) : null;

  const weatherTheme = useMemo(() => {
    if (!settings.dynamicWeatherTheme) {
      return resolveWeatherTheme(scheme === 'dark' ? 0 : 0, scheme !== 'dark', new Date(), scheme === 'dark' ? 'clear-night' : 'clear-day');
    }
    return resolveWeatherTheme(
      cur?.code,
      cur?.isDay,
      new Date(),
      settings.weatherOverride
    );
  }, [cur?.code, cur?.isDay, settings.dynamicWeatherTheme, settings.weatherOverride, scheme]);

  const effectiveCode = settings.weatherOverride ? weatherTheme.illustrationCode : (cur?.code ?? weatherTheme.illustrationCode);
  const effectiveIsDay = settings.weatherOverride ? weatherTheme.isDay : (cur?.isDay ?? weatherTheme.isDay);
  const effectiveConditionLabel = settings.weatherOverride ? weatherTheme.label : (cond?.label || weatherTheme.label);

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

  const todayEvents = useMemo(() => {
    const visible = new Set(state.calendars.filter((c) => c.visible).map((c) => c.id));
    return state.events
      .filter((e) => e.date === todayKey && visible.has(e.calendarId))
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [state.events, state.calendars, todayKey]);

  const todayTasks = useMemo(
    () => state.tasks.filter((t) => t.dueDate === todayKey || (!t.dueDate && !t.done) || (t.dueDate && t.dueDate < todayKey && !t.done)),
    [state.tasks, todayKey]
  );

  const planCtx: PlanContext | null = useMemo(() => {
    if (!weather) return null;
    return {
      place: activePlace,
      weather,
      events: todayEvents,
      allEvents: state.events,
      tasks: todayTasks,
      allTasks: state.tasks,
      reminders: state.reminders,
      integrations: state.integrations,
      settings,
      userName: state.user?.name ?? 'Guest',
      now: new Date(),
    };
  }, [weather, activePlace, todayEvents, state.events, todayTasks, state.tasks, state.reminders, state.integrations, settings, state.user]);

  const [smartRecommendations, setSmartRecommendations] = useState<Suggestion[] | null>(null);

  // Fetch live contextual recommendations via Gemini
  React.useEffect(() => {
    if (!planCtx) return;
    let active = true;
    fetchSmartRecommendations(planCtx)
      .then((recs) => {
        if (active && recs && recs.length > 0) {
          setSmartRecommendations(recs);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [planCtx]);

  const suggestions: Suggestion[] = useMemo(() => {
    if (smartRecommendations && smartRecommendations.length > 0) {
      return smartRecommendations;
    }
    return planCtx ? generateSuggestions(planCtx) : [];
  }, [smartRecommendations, planCtx]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      refreshWeather(true),
      app.syncGoogleData(),
    ]);
    if (planCtx) {
      const recs = await fetchSmartRecommendations(planCtx);
      if (recs && recs.length > 0) setSmartRecommendations(recs);
    }
    setRefreshing(false);
  }, [refreshWeather, app, planCtx]);

  // Format greeting matching Reference 2 ("Good morning, Zaid")
  const greetingTime = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const formattedDate = useMemo(() => {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }, []);

  const userName = state.user?.name ? state.user.name.split(' ')[0] : 'Guest';

  // Find hourly weather for scheduled events
  const getEventWeather = useCallback(
    (startMinutes: number) => {
      if (!weather?.hourly || weather.hourly.length === 0) return null;
      const eventHour = Math.floor(startMinutes / 60);
      const found = weather.hourly.find((h) => new Date(h.time).getHours() === eventHour) || weather.hourly[0];
      if (!found) return null;
      const c = condition(found.code);
      return {
        tempStr: fmtTemp(found.temp, settings.tempUnit),
        icon: (found.isDay ? c.icon : c.iconNight) as any,
      };
    },
    [weather, settings.tempUnit]
  );

  const formatEventTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    if (settings.use24h) {
      return `${h < 10 ? `0${h}` : h}:${mStr}`;
    }
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${mStr} ${period}`;
  };

  // Primary Clever recommendation to display
  const primaryTip = suggestions[0];
  const tipText =
    primaryTip?.body ||
    (todayEvents.length > 0 && cur && cur.code >= 51
      ? "Rain says it's joining your scheduled commitments uninvited today. ☔ Pack an umbrella so Future You stays dry."
      : "Conditions look great outside today. ☀️ Pick an anchor task, take an outdoor break, and stay ahead of the chaos.");

  const illustrationSize = isWide ? 120 : 105;

  return (
    <View style={styles.root}>
      {/* Full-bleed dynamic weather atmosphere background with smooth crossfade */}
      <DynamicWeatherAtmosphere
        theme={weatherTheme}
        reduceMotion={settings.reduceMotion}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: isWide ? 28 : 18,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={['#3B82F6']}
          />
        }
      >
        {/* Responsive Content Container: 100% on mobile, max-width 860px centered on desktop */}
        <View style={styles.contentWrapper}>
          {/* ---------------- Top Area ---------------- */}
          <View style={styles.topArea}>
            {/* Location Selector Pill */}
            <Touch onPress={() => navigation.navigate('Locations')} scale={0.97}>
              <View style={[styles.locationPill, { backgroundColor: weatherTheme.glassTint, borderColor: weatherTheme.glassBorder }]}>
                <Ionicons name="location-sharp" size={14} color="#FFFFFF" />
                <Text numberOfLines={1} style={styles.locationText}>
                  {activePlace.name}
                </Text>
                <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.85)" />
              </View>
            </Touch>

            <View style={{ flex: 1 }} />

            {/* Notification Icon Button with Red Dot */}
            <Touch onPress={() => navigation.navigate('Reminders')} scale={0.95}>
              <View style={[styles.notificationBtn, { backgroundColor: weatherTheme.glassTint, borderColor: weatherTheme.glassBorder }]}>
                <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
                <View style={styles.notificationDot} />
              </View>
            </Touch>
          </View>

          {/* ---------------- Greeting & Date ---------------- */}
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              {greetingTime},{' '}
              <Text style={styles.greetingName}>{userName}</Text>
            </Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>

          {/* ---------------- Weather Hero ---------------- */}
          <View style={styles.heroSection}>
            <View style={styles.heroLeft}>
              <Text style={[styles.tempText, isWide && { fontSize: 94, lineHeight: 98 }]}>
                {cur ? `${Math.round(cur.temp)}°` : '25°'}
              </Text>
              <Text style={[styles.conditionText, isWide && { fontSize: 24 }]}>
                {effectiveConditionLabel}
              </Text>
              <Text style={[styles.rangeText, isWide && { fontSize: 14 }]}>
                {todayForecast
                  ? `↑ ${Math.round(todayForecast.max)}°   ↓ ${Math.round(todayForecast.min)}°   `
                  : '↑ 28°   ↓ 21°   '}
                Feels like {cur ? `${Math.round(cur.feelsLike)}°` : '27°'}
              </Text>
              <Text style={[styles.subtitleText, isWide && { fontSize: 14 }]}>
                {weatherTheme.subtitle}
              </Text>
            </View>

            <View style={styles.heroRight}>
              <WeatherIllustration
                code={effectiveCode}
                isDay={effectiveIsDay}
                size={illustrationSize}
              />
            </View>
          </View>

          {/* ---------------- Weather Metric Cards ---------------- */}
          <View style={[styles.metricsRow, isWide && { gap: 14 }]}>
            {/* Humidity */}
            <View style={[styles.metricCard, { backgroundColor: weatherTheme.glassTint, borderColor: weatherTheme.glassBorder }]}>
              <Ionicons name="water-outline" size={16} color="#FFFFFF" style={styles.metricIcon} />
              <Text style={styles.metricLabel}>Humidity</Text>
              <Text style={[styles.metricValue, isWide && { fontSize: 16 }]}>
                {cur ? `${cur.humidity}%` : '70%'}
              </Text>
            </View>

            {/* Wind */}
            <View style={[styles.metricCard, { backgroundColor: weatherTheme.glassTint, borderColor: weatherTheme.glassBorder }]}>
              <Ionicons name="speedometer-outline" size={16} color="#FFFFFF" style={styles.metricIcon} />
              <Text style={styles.metricLabel}>Wind</Text>
              <Text style={[styles.metricValue, isWide && { fontSize: 16 }]}>
                {cur ? fmtWind(cur.wind, settings.windUnit) : '11 km/h'}
              </Text>
            </View>

            {/* UV Index */}
            <View style={[styles.metricCard, { backgroundColor: weatherTheme.glassTint, borderColor: weatherTheme.glassBorder }]}>
              <Ionicons name="sunny-outline" size={16} color="#FFFFFF" style={styles.metricIcon} />
              <Text style={styles.metricLabel}>UV Index</Text>
              <Text style={[styles.metricValue, isWide && { fontSize: 16 }]}>
                {cur ? `${Math.round(cur.uv)} ${uvLabel(cur.uv)}` : '6 Moderate'}
              </Text>
            </View>
          </View>

          {/* View More weather information link */}
          <Touch
            onPress={() => navigation.navigate('WeatherDetail')}
            style={styles.viewMoreRow}
            scale={0.98}
          >
            <Text style={styles.viewMoreText}>View More →</Text>
          </Touch>

          {/* ---------------- Clever Tips Recommendation Card ---------------- */}
          <View style={[styles.cleverCard, isWide && { padding: 20 }]}>
            <View style={styles.cleverHeader}>
              <View style={styles.cleverTitleRow}>
                <Ionicons name="sparkles" size={17} color="#3B82F6" />
                <Text style={styles.cleverTitle}>Clever Tips</Text>
              </View>
              <Touch onPress={() => navigation.navigate('Clever')} scale={0.96}>
                <Text style={styles.seeAllText}>See All →</Text>
              </Touch>
            </View>

            <Text style={styles.cleverBody}>{tipText}</Text>

            {/* Action buttons */}
            <View style={styles.cleverActions}>
              <Pressable
                onPress={() => navigation.navigate('Clever')}
                style={({ pressed }) => [styles.whyButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.whyButtonText}>Why?</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (primaryTip?.action?.kind === 'weather') {
                    navigation.navigate('WeatherDetail');
                  } else if (primaryTip?.action?.kind === 'tasks') {
                    navigation.navigate('Tasks');
                  } else if (primaryTip?.action?.kind === 'calendar') {
                    navigation.navigate('Calendar');
                  } else {
                    navigation.navigate('Reminders');
                  }
                }}
                style={({ pressed }) => [styles.primaryActionBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons
                  name={
                    primaryTip?.action?.kind === 'tasks'
                      ? 'checkbox-outline'
                      : primaryTip?.action?.kind === 'calendar'
                      ? 'calendar-outline'
                      : primaryTip?.action?.kind === 'weather'
                      ? 'partly-sunny-outline'
                      : 'notifications'
                  }
                  size={13}
                  color="#FFFFFF"
                />
                <Text style={styles.primaryActionText}>
                  {primaryTip?.action?.label || 'See forecast'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ---------------- Schedule & Tasks (Responsive: 2 columns on tablet/desktop, stacked on mobile) ---------------- */}
          {isWide ? (
            <View style={styles.wideRow}>
              {/* Today's Schedule Column */}
              <View style={styles.wideCol}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Today's Schedule</Text>
                  <Touch onPress={() => navigation.navigate('Calendar')} scale={0.96}>
                    <Text style={styles.seeAllText}>See All →</Text>
                  </Touch>
                </View>

                <View style={styles.roundedSectionCard}>
                  {todayEvents.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
                      <Text style={styles.emptyStateTitle}>No events scheduled today</Text>
                      <Text style={styles.emptyStateSub}>Your schedule is wide open.</Text>
                      <Btn
                        title="Add Event"
                        small
                        kind="primary"
                        onPress={() => navigation.navigate('EventEditor', {})}
                      />
                    </View>
                  ) : (
                    todayEvents.map((ev, index) => {
                      const cal = state.calendars.find((c) => c.id === ev.calendarId);
                      const barColor = cal?.color || KIND_COLOR[ev.kind] || '#3B82F6';
                      const evWeather = getEventWeather(ev.startMinutes);

                      return (
                        <View key={ev.id}>
                          <Touch
                            onPress={() => navigation.navigate('EventEditor', { id: ev.id })}
                            scale={0.99}
                          >
                            <View style={styles.scheduleRow}>
                              <View style={[styles.verticalColorBar, { backgroundColor: barColor }]} />
                              <View style={styles.scheduleTimeCol}>
                                <Text style={styles.scheduleTimeText}>
                                  {ev.allDay ? 'All day' : formatEventTime(ev.startMinutes)}
                                </Text>
                              </View>
                              <View style={styles.scheduleDetailsCol}>
                                <Text numberOfLines={1} style={styles.scheduleTitleText}>
                                  {ev.title}
                                </Text>
                                <View style={styles.scheduleLocationRow}>
                                  <Ionicons
                                    name={ev.location?.includes('Zoom') || ev.location?.includes('Meet') ? 'videocam' : 'location-sharp'}
                                    size={11}
                                    color="#94A3B8"
                                  />
                                  <Text numberOfLines={1} style={styles.scheduleLocationText}>
                                    {ev.location || 'No location'}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.scheduleWeatherCol}>
                                {evWeather && (
                                  <View style={styles.scheduleWeatherBadge}>
                                    <Ionicons name={evWeather.icon} size={15} color="#64748B" />
                                    <Text style={styles.scheduleWeatherTemp}>
                                      {evWeather.tempStr}
                                    </Text>
                                  </View>
                                )}
                                <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                              </View>
                            </View>
                          </Touch>
                          {index < todayEvents.length - 1 && <View style={styles.divider} />}
                        </View>
                      );
                    })
                  )}
                </View>
              </View>

              {/* Today's Tasks Column */}
              <View style={styles.wideCol}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Today's Tasks</Text>
                  <Touch onPress={() => navigation.navigate('Tasks')} scale={0.96}>
                    <Text style={styles.seeAllText}>See All →</Text>
                  </Touch>
                </View>

                <View style={styles.roundedSectionCard}>
                  {todayTasks.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Ionicons name="checkmark-circle-outline" size={24} color="#94A3B8" />
                      <Text style={styles.emptyStateTitle}>All tasks completed</Text>
                      <Text style={styles.emptyStateSub}>No open tasks for today.</Text>
                      <Btn
                        title="Add Task"
                        small
                        kind="primary"
                        onPress={() => navigation.navigate('TaskEditor', {})}
                      />
                    </View>
                  ) : (
                    todayTasks.map((t, index) => {
                      const isHigh = t.priority === 'urgent' || t.priority === 'high';
                      const isMedium = t.priority === 'normal';

                      const priorityBg = isHigh ? '#FEE2E2' : isMedium ? '#DBEAFE' : '#DCFCE7';
                      const priorityText = isHigh ? '#EF4444' : isMedium ? '#3B82F6' : '#10B981';
                      const priorityLabel = isHigh ? 'High' : isMedium ? 'Medium' : 'Low';

                      return (
                        <View key={t.id}>
                          <View style={styles.taskRow}>
                            <Pressable
                              onPress={() => app.toggleTask(t.id)}
                              hitSlop={8}
                              style={styles.checkboxTouch}
                            >
                              <Ionicons
                                name={t.done ? 'checkmark-circle' : 'ellipse-outline'}
                                size={22}
                                color={t.done ? '#10B981' : '#94A3B8'}
                              />
                            </Pressable>
                            <Touch
                              onPress={() => navigation.navigate('TaskEditor', { id: t.id })}
                              style={styles.taskTitleContainer}
                              scale={0.99}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.taskTitleText,
                                  t.done && styles.taskTitleDone,
                                ]}
                              >
                                {t.title}
                              </Text>
                            </Touch>
                            <View style={[styles.priorityBadge, { backgroundColor: priorityBg }]}>
                              <Text style={[styles.priorityBadgeText, { color: priorityText }]}>
                                {priorityLabel}
                              </Text>
                            </View>
                            <Text style={styles.dueTodayText}>Today</Text>
                            <Touch onPress={() => navigation.navigate('TaskEditor', { id: t.id })}>
                              <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                            </Touch>
                          </View>
                          {index < todayTasks.length - 1 && <View style={styles.divider} />}
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>
          ) : (
            <>
              {/* Today's Schedule (Stacked on mobile) */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Today's Schedule</Text>
                <Touch onPress={() => navigation.navigate('Calendar')} scale={0.96}>
                  <Text style={styles.seeAllText}>See All →</Text>
                </Touch>
              </View>

              <View style={styles.roundedSectionCard}>
                {todayEvents.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
                    <Text style={styles.emptyStateTitle}>No events scheduled today</Text>
                    <Text style={styles.emptyStateSub}>Your schedule is wide open.</Text>
                    <Btn
                      title="Add Event"
                      small
                      kind="primary"
                      onPress={() => navigation.navigate('EventEditor', {})}
                    />
                  </View>
                ) : (
                  todayEvents.map((ev, index) => {
                    const cal = state.calendars.find((c) => c.id === ev.calendarId);
                    const barColor = cal?.color || KIND_COLOR[ev.kind] || '#3B82F6';
                    const evWeather = getEventWeather(ev.startMinutes);

                    return (
                      <View key={ev.id}>
                        <Touch
                          onPress={() => navigation.navigate('EventEditor', { id: ev.id })}
                          scale={0.99}
                        >
                          <View style={styles.scheduleRow}>
                            <View style={[styles.verticalColorBar, { backgroundColor: barColor }]} />
                            <View style={styles.scheduleTimeCol}>
                              <Text style={styles.scheduleTimeText}>
                                {ev.allDay ? 'All day' : formatEventTime(ev.startMinutes)}
                              </Text>
                            </View>
                            <View style={styles.scheduleDetailsCol}>
                              <Text numberOfLines={1} style={styles.scheduleTitleText}>
                                {ev.title}
                              </Text>
                              <View style={styles.scheduleLocationRow}>
                                <Ionicons
                                  name={ev.location?.includes('Zoom') || ev.location?.includes('Meet') ? 'videocam' : 'location-sharp'}
                                  size={11}
                                  color="#94A3B8"
                                />
                                <Text numberOfLines={1} style={styles.scheduleLocationText}>
                                  {ev.location || 'No location'}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.scheduleWeatherCol}>
                              {evWeather && (
                                <View style={styles.scheduleWeatherBadge}>
                                  <Ionicons name={evWeather.icon} size={15} color="#64748B" />
                                  <Text style={styles.scheduleWeatherTemp}>
                                    {evWeather.tempStr}
                                  </Text>
                                </View>
                              )}
                              <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                            </View>
                          </View>
                        </Touch>
                        {index < todayEvents.length - 1 && <View style={styles.divider} />}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Today's Tasks (Stacked on mobile) */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Today's Tasks</Text>
                <Touch onPress={() => navigation.navigate('Tasks')} scale={0.96}>
                  <Text style={styles.seeAllText}>See All →</Text>
                </Touch>
              </View>

              <View style={styles.roundedSectionCard}>
                {todayTasks.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#94A3B8" />
                    <Text style={styles.emptyStateTitle}>All tasks completed</Text>
                    <Text style={styles.emptyStateSub}>No open tasks for today.</Text>
                    <Btn
                      title="Add Task"
                      small
                      kind="primary"
                      onPress={() => navigation.navigate('TaskEditor', {})}
                    />
                  </View>
                ) : (
                  todayTasks.map((t, index) => {
                    const isHigh = t.priority === 'urgent' || t.priority === 'high';
                    const isMedium = t.priority === 'normal';

                    const priorityBg = isHigh ? '#FEE2E2' : isMedium ? '#DBEAFE' : '#DCFCE7';
                    const priorityText = isHigh ? '#EF4444' : isMedium ? '#3B82F6' : '#10B981';
                    const priorityLabel = isHigh ? 'High' : isMedium ? 'Medium' : 'Low';

                    return (
                      <View key={t.id}>
                        <View style={styles.taskRow}>
                          <Pressable
                            onPress={() => app.toggleTask(t.id)}
                            hitSlop={8}
                            style={styles.checkboxTouch}
                          >
                            <Ionicons
                              name={t.done ? 'checkmark-circle' : 'ellipse-outline'}
                              size={22}
                              color={t.done ? '#10B981' : '#94A3B8'}
                            />
                          </Pressable>
                          <Touch
                            onPress={() => navigation.navigate('TaskEditor', { id: t.id })}
                            style={styles.taskTitleContainer}
                            scale={0.99}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.taskTitleText,
                                t.done && styles.taskTitleDone,
                              ]}
                            >
                              {t.title}
                            </Text>
                          </Touch>
                          <View style={[styles.priorityBadge, { backgroundColor: priorityBg }]}>
                            <Text style={[styles.priorityBadgeText, { color: priorityText }]}>
                              {priorityLabel}
                            </Text>
                          </View>
                          <Text style={styles.dueTodayText}>Today</Text>
                          <Touch onPress={() => navigation.navigate('TaskEditor', { id: t.id })}>
                            <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                          </Touch>
                        </View>
                        {index < todayTasks.length - 1 && <View style={styles.divider} />}
                      </View>
                    );
                  })
                )}
              </View>
            </>
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    ...Platform.select({
      web: {
        objectFit: 'cover',
        objectPosition: 'center',
      } as any,
    }),
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 860,
  },
  topArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' } as any,
    }),
  },
  locationText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#FFFFFF',
    maxWidth: 160,
  },
  notificationBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' } as any,
    }),
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  greetingSection: {
    marginTop: 2,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 21,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  greetingName: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  heroLeft: {
    flex: 1,
  },
  heroRight: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempText: {
    fontSize: 80,
    lineHeight: 86,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: -3,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 2 },
  },
  conditionText: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: -3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  rangeText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.90)',
    marginTop: 4,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.18)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    ...Platform.select({
      web: { backdropFilter: 'blur(20px)' } as any,
    }),
  },
  metricIcon: {
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 3,
  },
  viewMoreRow: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    marginTop: 3,
    marginBottom: 3,
  },
  viewMoreText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  cleverCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 22,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
        elevation: 4,
      },
    }),
  },
  cleverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cleverTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cleverTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  cleverBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: '#334155',
    fontWeight: '400',
    marginTop: 8,
  },
  cleverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  whyButton: {
    paddingHorizontal: 15,
    paddingVertical: 6.5,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  whyButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#3B82F6',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
  primaryActionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  wideRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  wideCol: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  roundedSectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
        elevation: 4,
      },
    }),
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  verticalColorBar: {
    width: 3.5,
    height: 30,
    borderRadius: 2,
    marginRight: 9,
  },
  scheduleTimeCol: {
    width: 66,
  },
  scheduleTimeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  scheduleDetailsCol: {
    flex: 1,
    paddingRight: 6,
  },
  scheduleTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  scheduleLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1.5,
  },
  scheduleLocationText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  scheduleWeatherCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleWeatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  scheduleWeatherTemp: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 9,
  },
  checkboxTouch: {
    padding: 2,
  },
  taskTitleContainer: {
    flex: 1,
  },
  taskTitleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  priorityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  priorityBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  dueTodayText: {
    fontSize: 11.5,
    color: '#94A3B8',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 5,
  },
  emptyStateTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  emptyStateSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
});
