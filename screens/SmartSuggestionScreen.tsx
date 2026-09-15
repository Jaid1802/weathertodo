import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../lib/store';
import { PlanContext, Suggestion, CleverAction, askGemini, generateSuggestions } from '../lib/gemini';
import { ChatMessage } from '../lib/types';
import { dateKey, uid } from '../lib/utils';

const ACCENT_COLORS: Record<string, string> = {
  critical: '#EF4444',
  caution: '#F59E0B',
  focus: '#6366F1',
  positive: '#10B981',
  info: '#3B82F6',
};

const QUICK_PROMPTS = [
  'What should I wear?',
  'What should I do first?',
  'When should I go outside?',
  'Do I need an umbrella?',
  'How should I plan my day?',
];

export default function SmartSuggestionScreen({ navigation }: any) {
  const app = useApp();
  const { state, weather, activePlace, scheme } = app;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = state.settings;
  const isDark = scheme === 'dark';

  const todayKey = dateKey(new Date());

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
      userName: state.user?.name ?? 'there',
      now: new Date(),
    };
  }, [weather, activePlace, todayEvents, state.events, todayTasks, state.tasks, state.reminders, state.integrations, settings, state.user]);

  // Proactive recommendations generated from user's real weather, calendar, and tasks
  const suggestions: Suggestion[] = useMemo(() => (planCtx ? generateSuggestions(planCtx) : []), [planCtx]);

  // Deduplicate recommendations so the exact same card is never displayed multiple times
  const uniqueSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return suggestions.filter((s) => {
      const key = `${s.title.trim()}|${s.body.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [suggestions]);

  // Conversational questions state
  const [askQuery, setAskQuery] = useState('');
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(
    async (q?: string) => {
      const question = (q ?? askQuery).trim();
      if (!question || !planCtx || asking) return;
      Keyboard.dismiss();
      setAskQuery('');
      setAsking(true);

      const userMsg: ChatMessage = {
        id: uid('msg'),
        role: 'user',
        text: question,
        timestamp: Date.now(),
      };

      const newHistory = [...answers, userMsg];
      setAnswers(newHistory);

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
        setAnswers((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          text: "I couldn't complete that request right now. Please try asking again in a moment.",
          timestamp: Date.now(),
        };
        setAnswers((prev) => [...prev, errorMsg]);
      } finally {
        setAsking(false);
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
    },
    [askQuery, planCtx, asking, answers]
  );

  const handleAction = (action?: CleverAction | { kind: string; payload?: any }) => {
    if (!action) return;
    if (action.kind === 'weather') {
      navigation.navigate('WeatherDetail');
    } else if (action.kind === 'reminders' || action.kind === 'addReminder') {
      navigation.navigate('Reminders');
    } else if (action.kind === 'addTask') {
      navigation.navigate('TaskEditor', {});
    } else if (action.kind === 'tasks') {
      navigation.navigate('Tasks');
    } else if (action.kind === 'calendar' || action.kind === 'addEvent') {
      navigation.navigate('Calendar');
    } else if (action.kind === 'moveEvent') {
      navigation.navigate('EventEditor', {
        preset: {
          title: (action as any).payload?.title ?? 'Focus block',
          startMinutes: (action as any).payload?.start ?? 9 * 60,
          date: todayKey,
          kind: 'focus',
        },
      });
    } else {
      navigation.navigate('Tasks');
    }
  };

  const bg = isDark ? '#0B1120' : '#F6F8FC';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const cardBorder = isDark ? '#334155' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textSecondary = isDark ? '#94A3B8' : '#475569';
  const pillBg = isDark ? '#334155' : '#F1F5F9';
  const pillText = isDark ? '#F1F5F9' : '#1E293B';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ---------------- Header ---------------- */}
        <View style={styles.header}>
          <View style={styles.contentContainer}>
            <Text style={[styles.title, { color: textPrimary }]}>Clever Tips</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 210,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentContainer}>
            {/* ---------------- Intro Bubble ---------------- */}
            <View style={styles.introRow}>
              {/* Sparkle Icon Badge */}
              <View style={[styles.sparkleBadge, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Ionicons name="sparkles" size={17} color="#4F46E5" />
              </View>

              {/* Intro Speech Bubble */}
              <View style={[styles.introBubble, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.introText, { color: textPrimary }]}>
                  Here is what I see for your day.
                </Text>
              </View>
            </View>

            {/* ---------------- Proactive Recommendation Cards List ---------------- */}
            <View style={styles.cardsList}>
              {uniqueSuggestions.map((s, index) => {
                const accentColor = ACCENT_COLORS[s.tone] || (index === 0 ? '#F59E0B' : index === 1 ? '#F59E0B' : '#3B82F6');

                return (
                  <View
                    key={s.id}
                    style={[
                      styles.recCard,
                      { backgroundColor: cardBg, borderColor: cardBorder },
                    ]}
                  >
                    {/* Left Colored Accent Bar */}
                    <View style={[styles.cardAccentBar, { backgroundColor: accentColor }]} />

                    <View style={styles.cardContent}>
                      {/* Card Title */}
                      <Text style={[styles.cardTitle, { color: textPrimary }]}>{s.title}</Text>

                      {/* Card Body */}
                      <Text style={[styles.cardBody, { color: textSecondary }]}>{s.body}</Text>

                      {/* Action Pill Button */}
                      {s.action && (
                        <Pressable
                          onPress={() => handleAction(s.action)}
                          style={({ pressed }) => [
                            styles.actionPill,
                            { backgroundColor: pillBg },
                            pressed && { opacity: 0.75 },
                          ]}
                        >
                          <Text style={[styles.actionPillText, { color: pillText }]}>
                            {s.action.label}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* When user asks questions: render them cleanly in card format */}
              {answers.map((ans) => {
                if (ans.role === 'user') {
                  return (
                    <View key={ans.id} style={styles.userBubbleContainer}>
                      <View style={styles.userBubble}>
                        <Text style={styles.userBubbleText}>{ans.text}</Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={ans.id}
                    style={[
                      styles.recCard,
                      { backgroundColor: cardBg, borderColor: cardBorder, marginTop: 4 },
                    ]}
                  >
                    <View style={[styles.cardAccentBar, { backgroundColor: '#4F46E5' }]} />
                    <View style={styles.cardContent}>
                      <View style={styles.answerHeaderRow}>
                        <Ionicons name="sparkles" size={14} color="#4F46E5" />
                        <Text style={styles.answerLabel}>Clever Tips</Text>
                      </View>
                      <Text style={[styles.cardBody, { color: textPrimary, marginTop: 4 }]}>
                        {ans.text}
                      </Text>

                      {ans.action && (
                        <Pressable
                          onPress={() => handleAction(ans.action)}
                          style={({ pressed }) => [
                            styles.actionPill,
                            { backgroundColor: pillBg },
                            pressed && { opacity: 0.75 },
                          ]}
                        >
                          <Text style={[styles.actionPillText, { color: pillText }]}>
                            {ans.action.kind === 'addTask' ? 'Add a task' : 'View details'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Loading Indicator */}
              {asking && (
                <View style={[styles.loadingCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text style={[styles.loadingText, { color: textSecondary }]}>
                    Clever Tips is checking your day...
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* ---------------- Pinned Bottom Input & Quick Prompts ---------------- */}
        <View
          style={[
            styles.bottomContainer,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 72,
              backgroundColor: bg,
            },
          ]}
        >
          <View style={styles.contentContainer}>
            {/* Quick Prompts Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickPromptsRow}
              style={styles.quickPromptsScroll}
            >
              {QUICK_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => handleSend(prompt)}
                  style={({ pressed }) => [
                    styles.quickPromptChip,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.quickPromptText, { color: textPrimary }]}>
                    {prompt}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Compact iOS-Style Question Input Box */}
            <View style={[styles.inputBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <TextInput
                ref={inputRef}
                placeholder="Ask anything about your day..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={askQuery}
                onChangeText={setAskQuery}
                onSubmitEditing={() => handleSend()}
                returnKeyType="send"
                editable={!asking}
                style={[styles.textInput, { color: textPrimary }]}
              />
              <Pressable
                onPress={() => handleSend()}
                disabled={!askQuery.trim() || asking}
                style={({ pressed }) => [
                  styles.sendButton,
                  {
                    backgroundColor: askQuery.trim() && !asking ? '#6366F1' : '#A5B4FC',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons name="send" size={15} color="#FFFFFF" style={{ marginLeft: 2 }} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 12 : 8,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingTop: 4,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sparkleBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      },
    }),
  },
  introBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    flex: 1,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  introText: {
    fontSize: 14.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  cardsList: {
    gap: 12,
  },
  recCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    width: '100%',
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardAccentBar: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '400',
    marginBottom: 10,
  },
  actionPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  actionPillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  userBubbleContainer: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    marginVertical: 4,
  },
  userBubble: {
    backgroundColor: '#6366F1',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '500',
  },
  answerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  loadingText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  bottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
  },
  quickPromptsScroll: {
    marginBottom: 8,
  },
  quickPromptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  quickPromptChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Platform.select({
      web: { whiteSpace: 'nowrap' } as any,
    }),
  },
  quickPromptText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  inputBox: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 0,
    marginRight: 8,
    // @ts-ignore web
    outlineStyle: 'none',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

