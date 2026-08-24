import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Btn, Card, Chip, EmptyState, IconBtn, Ring, Segmented, Sheet, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { bestOutdoorWindow, condition } from '../lib/weather';
import { Priority, Task } from '../lib/types';
import { dateKey, formatTime, minutesToLabel, pluralize, relativeDay } from '../lib/utils';

const PRIORITY_COLOR: Record<Priority, string> = { urgent: '#E5484D', high: '#E8890C', normal: '#3B5BFF', low: '#8A93A6' };
type Filter = 'today' | 'upcoming' | 'all' | 'done';

export default function TasksScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, weather } = app;
  const settings = state.settings;
  const [filter, setFilter] = useState<Filter>('today');
  const [listFilter, setListFilter] = useState<string>('all');
  const [showLists, setShowLists] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newListName, setNewListName] = useState('');

  const todayKey = dateKey(new Date());
  const window = weather ? bestOutdoorWindow(weather, todayKey) : null;

  const filtered = useMemo(() => {
    let arr = state.tasks;
    if (listFilter !== 'all') arr = arr.filter((t) => t.listId === listFilter);
    if (filter === 'today') arr = arr.filter((t) => !t.done && (t.dueDate === todayKey || !t.dueDate || t.dueDate < todayKey));
    else if (filter === 'upcoming') arr = arr.filter((t) => !t.done && !!t.dueDate && t.dueDate > todayKey);
    else if (filter === 'done') arr = arr.filter((t) => t.done);
    else arr = arr.filter((t) => !t.done);
    const order: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return [...arr].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ad = a.dueDate ?? '9999';
      const bd = b.dueDate ?? '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return (a.dueMinutes ?? 1440) - (b.dueMinutes ?? 1440);
    });
  }, [state.tasks, filter, listFilter, todayKey]);

  const sections = useMemo(() => {
    if (filter !== 'today') return [{ title: '', data: filtered }];
    const overdue = filtered.filter((t) => t.dueDate && t.dueDate < todayKey);
    const scheduled = filtered.filter((t) => t.dueDate === todayKey);
    const anytime = filtered.filter((t) => !t.dueDate);
    return [
      { title: 'Overdue', data: overdue },
      { title: 'Today', data: scheduled },
      { title: 'Anytime', data: anytime },
    ].filter((s) => s.data.length);
  }, [filtered, filter, todayKey]);

  const todayAll = state.tasks.filter((t) => t.dueDate === todayKey);
  const doneCount = todayAll.filter((t) => t.done).length;
  const progress = todayAll.length ? doneCount / todayAll.length : 0;
  const outdoorOpen = state.tasks.filter((t) => !t.done && t.context === 'outdoor');

  const flat = sections.flatMap((s) => [{ __section: s.title, id: `s_${s.title}` } as any, ...s.data]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.xs, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt v="title1" w="700">Tasks</Txt>
          <Txt v="sub" c={theme.textTertiary}>{state.tasks.filter((t) => !t.done).length} open · {state.stats.completedTotal} completed all time</Txt>
        </View>
        <IconBtn icon="list-outline" onPress={() => setShowLists(true)} label="Lists" />
        <IconBtn icon="add" bg={theme.accent} color={theme.onAccent} onPress={() => navigation.navigate('TaskEditor', {})} label="New task" />
      </View>

      <FlatList
        data={flat}
        keyExtractor={(item: any) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: Space.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              app.setIntegrations({ lastSyncTasks: Date.now() });
              await new Promise((r) => setTimeout(r, 700));
              setRefreshing(false);
            }}
            tintColor={theme.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ marginTop: Space.md }}>
            {/* Progress card */}
            <Card style={{ marginBottom: Space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Ring progress={progress} size={64} stroke={7} color={theme.success}>
                  <Txt v="callout" w="700">{Math.round(progress * 100)}%</Txt>
                </Ring>
                <View style={{ flex: 1 }}>
                  <Txt v="headline" w="700">{doneCount} of {todayAll.length} done today</Txt>
                  <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 3, lineHeight: 19 }}>
                    {outdoorOpen.length > 0 && window
                      ? `${outdoorOpen.length} outdoor ${pluralize(outdoorOpen.length, 'task')} — best window ${formatTime(window.start, settings.use24h)}–${formatTime(window.end, settings.use24h)}.`
                      : weather
                        ? `${condition(weather.current.code).label} outside. ${outdoorOpen.length ? 'Outdoor tasks may need rescheduling.' : 'All remaining work is indoor-friendly.'}`
                        : 'Loading conditions…'}
                  </Txt>
                </View>
              </View>
            </Card>

            <Segmented
              options={[
                { key: 'today', label: 'Today' },
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'all', label: 'All' },
                { key: 'done', label: 'Done' },
              ]}
              value={filter}
              onChange={setFilter}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: Space.md }}>
              <Chip label="All lists" active={listFilter === 'all'} onPress={() => setListFilter('all')} small />
              {state.lists.map((l) => (
                <Chip
                  key={l.id}
                  label={l.name}
                  icon={l.icon as any}
                  active={listFilter === l.id}
                  tint={l.color}
                  fg="#fff"
                  onPress={() => setListFilter(listFilter === l.id ? 'all' : l.id)}
                  small
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }: any) => {
          if (item.__section !== undefined) {
            if (!item.__section) return null;
            return (
              <Txt v="caption" c={item.__section === 'Overdue' ? theme.danger : theme.textTertiary} w="700" style={{ marginTop: Space.sm, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {item.__section}
              </Txt>
            );
          }
          return <TaskRow task={item} onPress={() => navigation.navigate('TaskEditor', { id: item.id })} />;
        }}
        ListEmptyComponent={
          <Card style={{ marginTop: Space.md }}>
            <EmptyState
              icon={filter === 'done' ? 'trophy-outline' : 'checkmark-done-circle-outline'}
              title={filter === 'done' ? 'Nothing completed yet' : 'All clear'}
              body={filter === 'done' ? 'Completed tasks will collect here so you can see the day you actually had.' : 'No tasks in this view. Add one, or let Smart Suggestion suggest what to do with the free time.'}
              actionLabel={filter === 'done' ? undefined : 'Add a task'}
              onAction={() => navigation.navigate('TaskEditor', {})}
            />
          </Card>
        }
      />

      <Sheet visible={showLists} onClose={() => setShowLists(false)} title="Lists">
        {state.lists.map((l) => {
          const count = state.tasks.filter((t) => t.listId === l.id && !t.done).length;
          return (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${l.color}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={l.icon as any} size={16} color={l.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="callout" w="600">{l.name}</Txt>
                <Txt v="micro" c={theme.textTertiary}>{count} open · {l.source === 'google' ? 'Google Tasks' : 'Local'}</Txt>
              </View>
              {l.id !== 'inbox' && (
                <IconBtn icon="trash-outline" size={32} iconSize={15} color={theme.danger} onPress={() => app.deleteList(l.id)} label={`Delete ${l.name}`} />
              )}
            </View>
          );
        })}
        <View style={{ height: 12 }} />
        <Btn
          title="Create list"
          icon="add"
          kind="secondary"
          full
          onPress={() => {
            const palette = ['#3B5BFF', '#7B5BFF', '#0FA968', '#E8890C', '#E5484D', '#0C8CE9'];
            const icons = ['bookmark', 'star', 'flame', 'rocket', 'musical-notes', 'cart'];
            app.addList(`List ${state.lists.length + 1}`, palette[state.lists.length % palette.length], icons[state.lists.length % icons.length]);
          }}
        />
        <View style={{ height: 8 }} />
        <Btn title="Google Tasks settings" kind="ghost" icon="logo-google" full onPress={() => { setShowLists(false); navigation.navigate('Integrations'); }} />
      </Sheet>
    </SafeAreaView>
  );
}

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const app = useApp();
  const { state, theme } = app;
  const list = state.lists.find((l) => l.id === task.listId);
  const todayKey = dateKey(new Date());
  const overdue = !!task.dueDate && task.dueDate < todayKey && !task.done;
  const subDone = task.subtasks?.filter((s) => s.done).length ?? 0;

  return (
    <Card style={{ marginBottom: 8, opacity: task.done ? 0.62 : 1 }} padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: Space.md, gap: 12 }}>
        <Touch onPress={() => app.toggleTask(task.id)} hitSlop={10} scale={0.86} accessibilityLabel={`Toggle ${task.title}`}>
          <View
            style={{
              width: 23, height: 23, borderRadius: 23, borderWidth: 2, marginTop: 1,
              borderColor: task.done ? theme.success : PRIORITY_COLOR[task.priority],
              backgroundColor: task.done ? theme.success : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {task.done && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </Touch>

        <Touch style={{ flex: 1 }} onPress={onPress} scale={0.99}>
          <Txt v="callout" w="600" style={{ textDecorationLine: task.done ? 'line-through' : 'none' }}>{task.title}</Txt>
          {task.notes ? <Txt v="sub" c={theme.textTertiary} numberOfLines={1} style={{ marginTop: 2 }}>{task.notes}</Txt> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {list && <Badge label={list.name.toUpperCase()} color={list.color} bg={`${list.color}18`} />}
            {task.dueDate && (
              <Badge
                label={`${relativeDay(new Date(Number(task.dueDate.split('-')[0]), Number(task.dueDate.split('-')[1]) - 1, Number(task.dueDate.split('-')[2]))).toUpperCase()}${task.dueMinutes !== undefined ? ` ${minutesToLabel(task.dueMinutes, state.settings.use24h)}` : ''}`}
                color={overdue ? theme.danger : theme.textSecondary}
                bg={overdue ? `${theme.danger}1A` : theme.surfaceAlt}
                icon="time-outline"
              />
            )}
            {task.context === 'outdoor' && <Badge label="OUTDOOR" icon="leaf" color={theme.success} bg={`${theme.success}18`} />}
            {task.estimateMin ? <Badge label={`${task.estimateMin}M`} color={theme.textTertiary} bg={theme.surfaceAlt} /> : null}
            {task.subtasks?.length ? <Badge label={`${subDone}/${task.subtasks.length}`} icon="git-branch-outline" color={theme.textTertiary} bg={theme.surfaceAlt} /> : null}
            {task.source === 'google' && <Badge label="GOOGLE" color={theme.textTertiary} bg={theme.surfaceAlt} />}
          </View>
        </Touch>

        <View style={{ width: 4, height: 30, borderRadius: 4, backgroundColor: task.done ? 'transparent' : PRIORITY_COLOR[task.priority], opacity: 0.85 }} />
      </View>
    </Card>
  );
}
