import React, { useMemo, useRef, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Touch, Txt, IconBtn } from './ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { addDays, dateKey, minutesToLabel, monthName, relativeDay } from '../lib/utils';

export function DateStrip({
  value, onChange, allowNone = false, days = 21, startOffset = -2,
}: { value?: string; onChange: (v?: string) => void; allowNone?: boolean; days?: number; startOffset?: number }) {
  const { theme } = useApp();
  const list = useMemo(() => Array.from({ length: days }, (_, i) => addDays(new Date(), i + startOffset)), [days, startOffset]);
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const idx = list.findIndex((d) => dateKey(d) === value);
    if (idx > 2) setTimeout(() => ref.current?.scrollTo({ x: (idx - 2) * 68, animated: false }), 40);
  }, []);

  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {allowNone && (
        <Touch onPress={() => onChange(undefined)} scale={0.94}>
          <View
            style={{
              width: 60, height: 74, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 3,
              backgroundColor: !value ? theme.accent : theme.surfaceAlt,
            }}
          >
            <Ionicons name="infinite" size={17} color={!value ? theme.onAccent : theme.textSecondary} />
            <Txt v="micro" w="600" c={!value ? theme.onAccent : theme.textSecondary}>Anytime</Txt>
          </View>
        </Touch>
      )}
      {list.map((d) => {
        const k = dateKey(d);
        const active = k === value;
        const isToday = k === dateKey(new Date());
        return (
          <Touch key={k} onPress={() => onChange(k)} scale={0.94}>
            <View
              style={{
                width: 60, height: 74, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 2,
                backgroundColor: active ? theme.accent : theme.surfaceAlt,
              }}
            >
              <Txt v="micro" w="600" c={active ? theme.onAccent : theme.textTertiary}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Txt>
              <Txt v="title3" w="700" c={active ? theme.onAccent : isToday ? theme.accent : theme.text}>{d.getDate()}</Txt>
              <Txt v="micro" c={active ? theme.onAccent : theme.textTertiary}>{monthName(d, true)}</Txt>
            </View>
          </Touch>
        );
      })}
    </ScrollView>
  );
}

export function TimeStrip({
  value, onChange, use24h, from = 5 * 60, to = 23 * 60, step = 30, allowNone = false,
}: { value?: number; onChange: (v?: number) => void; use24h: boolean; from?: number; to?: number; step?: number; allowNone?: boolean }) {
  const { theme } = useApp();
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = from; m <= to; m += step) out.push(m);
    return out;
  }, [from, to, step]);
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (value === undefined) return;
    const idx = slots.findIndex((s) => s >= value);
    if (idx > 2) setTimeout(() => ref.current?.scrollTo({ x: (idx - 2) * 84, animated: false }), 40);
  }, []);

  return (
    <View style={{ gap: 10 }}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {allowNone && (
          <Touch onPress={() => onChange(undefined)} scale={0.94}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: Radius.pill, backgroundColor: value === undefined ? theme.accent : theme.surfaceAlt }}>
              <Txt v="sub" w="600" c={value === undefined ? theme.onAccent : theme.textSecondary}>No time</Txt>
            </View>
          </Touch>
        )}
        {slots.map((m) => {
          const active = value !== undefined && Math.abs(value - m) < step / 2;
          return (
            <Touch key={m} onPress={() => onChange(m)} scale={0.94}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: Radius.pill, backgroundColor: active ? theme.accent : theme.surfaceAlt }}>
                <Txt v="sub" w="600" c={active ? theme.onAccent : theme.textSecondary}>{minutesToLabel(m, use24h)}</Txt>
              </View>
            </Touch>
          );
        })}
      </ScrollView>

      {value !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBtn icon="remove" size={34} iconSize={16} onPress={() => onChange(Math.max(0, (value ?? 0) - 5))} label="Minus 5 minutes" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt v="title3" w="700">{minutesToLabel(value, use24h)}</Txt>
            <Txt v="micro" c={theme.textTertiary}>fine tune in 5 minute steps</Txt>
          </View>
          <IconBtn icon="add" size={34} iconSize={16} onPress={() => onChange(Math.min(24 * 60 - 5, (value ?? 0) + 5))} label="Plus 5 minutes" />
        </View>
      )}
    </View>
  );
}

export function OptionGrid<T extends string>({
  options, value, onChange, columns = 3,
}: { options: { key: T; label: string; icon?: keyof typeof Ionicons.glyphMap; color?: string }[]; value: T; onChange: (v: T) => void; columns?: number }) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.key === value;
        const color = o.color ?? theme.accent;
        return (
          <Touch key={o.key} onPress={() => onChange(o.key)} scale={0.95} style={{ flexGrow: 1, flexBasis: `${100 / columns - 4}%` }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: Radius.md,
                backgroundColor: active ? `${color}1F` : theme.surfaceAlt,
                borderWidth: 1.5, borderColor: active ? color : 'transparent',
              }}
            >
              {o.icon && <Ionicons name={o.icon} size={15} color={active ? color : theme.textTertiary} />}
              <Txt v="sub" w="600" c={active ? color : theme.textSecondary}>{o.label}</Txt>
            </View>
          </Touch>
        );
      })}
    </View>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const { theme } = useApp();
  return (
    <View style={{ marginBottom: Space.lg }}>
      <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Txt>
      {children}
      {hint ? <Txt v="micro" c={theme.textTertiary} style={{ marginTop: 6, lineHeight: 16 }}>{hint}</Txt> : null}
    </View>
  );
}
