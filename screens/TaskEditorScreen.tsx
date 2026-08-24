import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, IconBtn, Toggle, Touch, Txt } from '../components/ui';
import { DateStrip, Field, OptionGrid, TimeStrip } from '../components/Pickers';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { Priority, TaskContext } from '../lib/types';
import { bestOutdoorWindow, condition, fmtTemp } from '../lib/weather';
import { dateKey, formatTime, uid } from '../lib/utils';

export default function TaskEditorScreen({ navigation, route }: any) {
  const app = useApp();
  const { state, theme, weather } = app;
  const id: string | undefined = route?.params?.id;
  const existing = id ? state.tasks.find((t) => t.id === id) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [listId, setListId] = useState(existing?.listId ?? 'inbox');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'normal');
  const [context, setContext] = useState<TaskContext>(existing?.context ?? 'anywhere');
  const [dueDate, setDueDate] = useState<string | undefined>(existing?.dueDate ?? dateKey(new Date()));
  const [dueMinutes, setDueMinutes] = useState<number | undefined>(existing?.dueMinutes);
  const [estimate, setEstimate] = useState<number>(existing?.estimateMin ?? 30);
  const [subtasks, setSubtasks] = useState(existing?.subtasks ?? []);
  const [subInput, setSubInput] = useState('');

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

  const dayWeather = useMemo(() => weather?.daily.find((d) => d.date === dueDate), [weather, dueDate]);
  const window = useMemo(() => (weather && dueDate ? bestOutdoorWindow(weather, dueDate) : null), [weather, dueDate]);

  const save = () => {
    const payload = {
      title: title.trim() || 'Untitled task',
      notes: notes.trim() || undefined,
      listId,
      priority,
      context,
      dueDate,
      dueMinutes,
      estimateMin: estimate,
      subtasks,
      done: existing?.done ?? false,
      source: existing?.source ?? ('local' as const),
    };
    if (existing) app.updateTask(existing.id, payload);
    else app.addTask({ ...payload, completedAt: undefined } as any);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="close" onPress={() => navigation.goBack()} label="Cancel" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>{existing ? 'Edit task' : 'New task'}</Txt>
        {existing && <IconBtn icon="trash-outline" color={theme.danger} onPress={() => { app.deleteTask(existing.id); navigation.goBack(); }} label="Delete task" />}
        <Btn title="Save" small onPress={save} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="What needs doing">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Draft the launch email"
              placeholderTextColor={theme.textTertiary}
              style={[inputStyle, { fontSize: 18, fontWeight: '600' }]}
              autoFocus={!existing}
              returnKeyType="next"
            />
          </Field>

          <Field label="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Context, links, next step…"
              placeholderTextColor={theme.textTertiary}
              style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' }]}
              multiline
            />
          </Field>

          <Field label="List">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {state.lists.map((l) => {
                const active = l.id === listId;
                return (
                  <Touch key={l.id} onPress={() => setListId(l.id)} scale={0.95}>
                    <View
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10,
                        borderRadius: Radius.pill, backgroundColor: active ? l.color : theme.surfaceAlt,
                      }}
                    >
                      <Ionicons name={l.icon as any} size={14} color={active ? '#fff' : theme.textTertiary} />
                      <Txt v="sub" w="600" c={active ? '#fff' : theme.textSecondary}>{l.name}</Txt>
                    </View>
                  </Touch>
                );
              })}
            </ScrollView>
          </Field>

          <Field label="Priority">
            <OptionGrid<Priority>
              value={priority}
              onChange={setPriority}
              columns={4}
              options={[
                { key: 'low', label: 'Low', color: '#8A93A6' },
                { key: 'normal', label: 'Normal', color: '#3B5BFF' },
                { key: 'high', label: 'High', color: '#E8890C' },
                { key: 'urgent', label: 'Urgent', color: '#E5484D' },
              ]}
            />
          </Field>

          <Field label="Where" hint="Outdoor tasks are scheduled around the weather forecast automatically.">
            <OptionGrid<TaskContext>
              value={context}
              onChange={setContext}
              columns={3}
              options={[
                { key: 'anywhere', label: 'Anywhere', icon: 'globe-outline' },
                { key: 'indoor', label: 'Indoor', icon: 'home-outline' },
                { key: 'outdoor', label: 'Outdoor', icon: 'leaf-outline', color: theme.success },
              ]}
            />
          </Field>

          <Field label="Due date">
            <DateStrip value={dueDate} onChange={setDueDate} allowNone />
          </Field>

          {dueDate && (
            <Field label="Due time">
              <TimeStrip value={dueMinutes} onChange={setDueMinutes} use24h={state.settings.use24h} allowNone />
            </Field>
          )}

          <Field label={`Estimate · ${estimate} min`}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[10, 15, 30, 45, 60, 90, 120].map((m) => (
                <Touch key={m} onPress={() => setEstimate(m)} scale={0.94}>
                  <View style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: estimate === m ? theme.accent : theme.surfaceAlt }}>
                    <Txt v="sub" w="600" c={estimate === m ? theme.onAccent : theme.textSecondary}>{m}m</Txt>
                  </View>
                </Touch>
              ))}
            </View>
          </Field>

          <Field label="Subtasks">
            <View style={{ gap: 8 }}>
              {subtasks.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.bgElevated, borderRadius: Radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }}>
                  <Touch onPress={() => setSubtasks(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} hitSlop={8} scale={0.9}>
                    <View style={{ width: 20, height: 20, borderRadius: 20, borderWidth: 2, borderColor: s.done ? theme.success : theme.border, backgroundColor: s.done ? theme.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {s.done && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                  </Touch>
                  <Txt v="callout" style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.title}</Txt>
                  <IconBtn icon="close" size={26} iconSize={13} onPress={() => setSubtasks(subtasks.filter((x) => x.id !== s.id))} label="Remove subtask" />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={subInput}
                  onChangeText={setSubInput}
                  placeholder="Add a step"
                  placeholderTextColor={theme.textTertiary}
                  style={[inputStyle, { flex: 1, paddingVertical: 11 }]}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!subInput.trim()) return;
                    setSubtasks([...subtasks, { id: uid('s'), title: subInput.trim(), done: false }]);
                    setSubInput('');
                  }}
                />
                <IconBtn
                  icon="add"
                  size={46}
                  bg={theme.accent}
                  color={theme.onAccent}
                  onPress={() => {
                    if (!subInput.trim()) return;
                    setSubtasks([...subtasks, { id: uid('s'), title: subInput.trim(), done: false }]);
                    setSubInput('');
                  }}
                  label="Add subtask"
                />
              </View>
            </View>
          </Field>

          {/* Weather intelligence */}
          {dayWeather && (
            <Card style={{ backgroundColor: theme.accentSoft, borderColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name="sparkles" size={17} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="700" c={theme.accent}>Weather check</Txt>
                  <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                    {condition(dayWeather.code).label} on this date, {fmtTemp(dayWeather.min, state.settings.tempUnit)}–{fmtTemp(dayWeather.max, state.settings.tempUnit)} with {dayWeather.pop}% chance of rain.
                    {context === 'outdoor'
                      ? window
                        ? ` Best outdoor window is ${formatTime(window.start, state.settings.use24h)}–${formatTime(window.end, state.settings.use24h)} — I'd schedule it then.`
                        : ' Conditions look poor for outdoor work; consider another day.'
                      : ' Weather will not affect this task.'}
                  </Txt>
                  {context === 'outdoor' && window && (
                    <Btn
                      title={`Set due time to ${formatTime(window.start, state.settings.use24h)}`}
                      small
                      kind="secondary"
                      style={{ marginTop: 10 }}
                      onPress={() => {
                        const d = new Date(window.start);
                        setDueMinutes(d.getHours() * 60 + d.getMinutes());
                      }}
                    />
                  )}
                </View>
              </View>
            </Card>
          )}

          {existing?.source === 'google' && (
            <View style={{ marginTop: Space.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="logo-google" size={14} color={theme.textTertiary} />
              <Txt v="micro" c={theme.textTertiary}>Synced from Google Tasks · changes stay local in this demo</Txt>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
