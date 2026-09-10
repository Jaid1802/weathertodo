import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Badge, Btn, Chip, GlassCard, IconBtn, Skeleton, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import { condition, skyFor } from '../lib/weather';
import {
  PlanContext, Suggestion, CleverAction,
  askGemini, generateSuggestions, STARTER_PROMPTS,
} from '../lib/gemini';
import { ChatMessage } from '../lib/types';
import { dateKey, formatTime, uid } from '../lib/utils';

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
  const glass = {
    tint: settings.highContrast ? 'rgba(0,0,0,0.42)' : sky.glass,
    border: settings.highContrast ? 'rgba(255,255,255,0.55)' : sky.glassBorder,
  };
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

  // Ask Clever conversation state
  const [askQuery, setAskQuery] = useState('');
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [activeAction, setActiveAction] = useState<CleverAction | null>(null);
  const [actionDone, setActionDone] = useState(false);
  const [followupChips, setFollowupChips] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = useCallback(async (q?: string) => {
    const question = (q ?? askQuery).trim();
    if (!question || !planCtx || asking) return;
    Keyboard.dismiss();
    setAskQuery('');
    setAsking(true);
    setActiveAction(null);
    setActionDone(false);

    const userMsg: ChatMessage = {
      id: uid('msg'),
      role: 'user',
      text: question,
      timestamp: Date.now(),
    };

    const newHistory = [...conversation, userMsg];
    setConversation(newHistory);

    try {
      const result = await askGemini(question, planCtx, newHistory);
      const assistantMsg: ChatMessage = {
        id: uid('msg'),
        role: 'assistant',
        text: result.text,
        timestamp: Date.now(),
        action: result.action,
        chips: result.chips,
      };
      setConversation((prev) => [...prev, assistantMsg]);
      if (result.action) {
        setActiveAction(result.action);
      }
      setFollowupChips(result.chips || []);
    } catch {
      const errorMsg: ChatMessage = {
        id: uid('msg'),
        role: 'assistant',
        text: 'Sorry, I ran into an issue getting that answer. Please try again!',
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, errorMsg]);
    } finally {
      setAsking(false);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [askQuery, planCtx, asking, conversation]);

  const executeAction = (action: CleverAction) => {
    if (action.kind === 'addTask' && action.task) {
      app.addTask({
        title: action.task.title,
        priority: action.task.priority || 'normal',
        context: action.task.context || 'anywhere',
        dueDate: action.task.dueDate || todayKey,
        dueMinutes: action.task.dueMinutes,
        listId: 'inbox',
        done: false,
        source: 'local',
      });
      setActionDone(true);
    } else if (action.kind === 'addEvent' && action.event) {
      app.addEvent({
        title: action.event.title,
        date: action.event.date || todayKey,
        startMinutes: action.event.startMinutes || 9 * 60,
        endMinutes: action.event.endMinutes || 10 * 60,
        allDay: Boolean(action.event.allDay),
        isOutdoor: Boolean(action.event.isOutdoor),
        kind: 'personal',
        calendarId: state.calendars[0]?.id ?? 'cal_personal',
        source: 'local',
      });
      setActionDone(true);
    } else if (action.kind === 'addReminder' && action.reminder) {
      app.addReminder({
        title: action.reminder.title,
        date: action.reminder.date || todayKey,
        minutes: action.reminder.minutes || 9 * 60,
        trigger: action.reminder.trigger || 'time',
        repeat: action.reminder.repeat || 'none',
        enabled: true,
      });
      setActionDone(true);
    } else if (action.kind === 'confirmAction') {
      setActionDone(true);
    }
  };

  const TONE_COLOR: Record<string, string> = {
    critical: '#FF6B6B', caution: '#FFC46B', focus: '#9DB4FF', positive: '#6FE0A8', info: '#CFE3FF',
  };

  const QUICK_PROMPTS = [
    "What's my day looking like?",
    'Can I go outside today?',
    'What should I prioritize?',
    "When's the best time for a walk?",
    'Will the weather affect my plans?',
    'Remind me tomorrow at 8 AM to buy groceries',
  ];

  return (
    <View style={{ flex: 1 }}>
      <WeatherBackground sky={sky} reduceMotion={settings.reduceMotion} scrim={settings.highContrast ? 0.18 : 0} />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: Space.lg, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        {navigation.canGoBack() && (
          <IconBtn
            icon="arrow-back"
            onPress={() => navigation.goBack()}
            size={36}
            bg="rgba(255,255,255,0.16)"
            color={onSky}
          />
        )}
        <View style={{ flex: 1, marginLeft: navigation.canGoBack() ? 12 : 0 }}>
          <Txt v="title3" w="700" c={onSky}>Ask Clever</Txt>
          <Txt v="micro" c={onSkyMuted}>Your weather-aware planning assistant</Txt>
        </View>
        <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={15} color={sky.accent} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: insets.bottom + 90 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty state when no conversation */}
        {conversation.length === 0 && !asking && (
          <GlassCard tint={glass.tint} border={glass.border} style={{ marginTop: Space.sm, marginBottom: Space.lg }}>
            <View style={{ alignItems: 'center', paddingVertical: 14, gap: 8 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Ionicons name="sparkles" size={24} color={sky.accent} />
              </View>
              <Txt v="headline" w="700" c={onSky} center>Ask Clever</Txt>
              <Txt v="sub" c={onSkyMuted} center style={{ maxWidth: 280 }}>
                Your weather-aware planning assistant. Ask about your day, weather conflicts, or quick tasks.
              </Txt>
            </View>

            <View style={{ marginTop: 12 }}>
              <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                Quick Prompts
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {QUICK_PROMPTS.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    onPress={() => {
                      setAskQuery(p);
                      handleSend(p);
                    }}
                    tint={sky.accent}
                    fg="#0B1533"
                    dim="rgba(255,255,255,0.16)"
                    small
                  />
                ))}
              </View>
            </View>
          </GlassCard>
        )}

        {/* Conversation messages */}
        {conversation.map((msg) => (
          <View key={msg.id} style={{ marginBottom: Space.md }}>
            {msg.role === 'user' ? (
              <View style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                <View
                  style={{
                    backgroundColor: sky.accent,
                    borderRadius: 18,
                    borderBottomRightRadius: 4,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Txt v="body" w="600" c="#0B1533">{msg.text}</Txt>
                </View>
                <Txt v="micro" c={onSkyMuted} style={{ alignSelf: 'flex-end', marginTop: 3, marginRight: 4 }}>
                  {formatTime(msg.timestamp, settings.use24h)}
                </Txt>
              </View>
            ) : (
              <GlassCard tint={glass.tint} border={glass.border} style={{ maxWidth: '95%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="sparkles" size={12} color={sky.accent} />
                  </View>
                  <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 }}>
                    Clever
                  </Txt>
                  <Badge label="GEMINI 2.5" color={onSky} bg="rgba(255,255,255,0.16)" />
                </View>
                <Txt v="body" c={onSky} style={{ lineHeight: 23 }}>{msg.text}</Txt>

                {/* Message Action Card */}
                {msg.action && !actionDone && (
                  <View style={{ marginTop: 14, padding: 12, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons
                        name={
                          msg.action.kind === 'addTask'
                            ? 'checkmark-circle-outline'
                            : msg.action.kind === 'addEvent'
                            ? 'calendar-outline'
                            : msg.action.kind === 'addReminder'
                            ? 'alarm-outline'
                            : 'alert-circle-outline'
                        }
                        size={16}
                        color={sky.accent}
                      />
                      <Txt v="sub" w="700" c={onSky}>
                        {msg.action.kind === 'addTask'
                          ? `Add "${msg.action.task?.title}" as a task?`
                          : msg.action.kind === 'addEvent'
                          ? `Add "${msg.action.event?.title}" to calendar?`
                          : msg.action.kind === 'addReminder'
                          ? `Set reminder for "${msg.action.reminder?.title}"?`
                          : msg.action.description || 'Confirm action?'}
                      </Txt>
                    </View>
                    <Btn
                      title={
                        msg.action.kind === 'addTask'
                          ? 'Add task'
                          : msg.action.kind === 'addEvent'
                          ? 'Add event'
                          : msg.action.kind === 'addReminder'
                          ? 'Set reminder'
                          : 'Confirm'
                      }
                      icon="checkmark"
                      kind="glass"
                      tint="rgba(255,255,255,0.22)"
                      onTint={onSky}
                      small
                      onPress={() => executeAction(msg.action!)}
                    />
                  </View>
                )}

                {msg.action && actionDone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                    <Ionicons name="checkmark-circle" size={15} color={sky.accent} />
                    <Txt v="sub" w="600" c={onSky}>Action completed.</Txt>
                  </View>
                )}

                {/* Followup prompt chips */}
                {msg.chips && msg.chips.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 14 }}>
                    {msg.chips.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        onPress={() => {
                          setAskQuery(c);
                          handleSend(c);
                        }}
                        tint={sky.accent}
                        fg="#0B1533"
                        dim="rgba(255,255,255,0.16)"
                        small
                      />
                    ))}
                  </ScrollView>
                )}
              </GlassCard>
            )}
          </View>
        ))}

        {/* Loading skeleton */}
        {asking && (
          <GlassCard tint={glass.tint} border={glass.border} style={{ marginBottom: Space.md, maxWidth: '95%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ActivityIndicator size="small" color={sky.accent} />
              <Txt v="micro" w="700" c={onSkyMuted} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Clever is thinking...
              </Txt>
            </View>
            <View style={{ gap: 8 }}>
              <Skeleton w={width - Space.lg * 4} h={15} r={8} />
              <Skeleton w={(width - Space.lg * 4) * 0.75} h={15} r={8} />
              <Skeleton w={(width - Space.lg * 4) * 0.5} h={15} r={8} />
            </View>
          </GlassCard>
        )}

        {/* Today's insights section */}
        {conversation.length === 0 && (
          <View style={{ marginTop: Space.xs }}>
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
        )}
      </ScrollView>

      {/* Input Bar pinned above tabs */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom + 68,
          paddingHorizontal: Space.lg,
          paddingVertical: 6,
        }}
      >
        <GlassCard tint={glass.tint} border={glass.border} padded={false} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={onSkyMuted} />
            <TextInput
              ref={inputRef}
              placeholder="Ask Clever anything..."
              placeholderTextColor={onSkyMuted}
              value={askQuery}
              onChangeText={setAskQuery}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              editable={!asking}
              style={{
                flex: 1,
                color: onSky,
                fontSize: 15,
                fontWeight: '500',
                letterSpacing: -0.1,
                paddingVertical: Platform.OS === 'web' ? 6 : 4,
                // @ts-ignore web
                outlineStyle: 'none',
              }}
            />
            <Touch
              onPress={() => handleSend()}
              disabled={!askQuery.trim() || asking}
              scale={0.9}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 32,
                  backgroundColor: askQuery.trim() && !asking ? sky.accent : 'rgba(255,255,255,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="arrow-up"
                  size={16}
                  color={askQuery.trim() && !asking ? '#0B1533' : onSkyMuted}
                />
              </View>
            </Touch>
          </View>
        </GlassCard>
      </View>
    </View>
  );
}
