import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextProps, TextStyle, View, ViewStyle, useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';
import { useApp } from '../lib/store';
import { AppTheme, Radius, Space, Type, shadow } from '../lib/theme';

/* ------------------------------- Text ------------------------------- */

type TxtVariant = 'hero' | 'display' | 'title1' | 'title2' | 'title3' | 'headline' | 'body' | 'callout' | 'sub' | 'caption' | 'micro';

interface TxtProps extends TextProps {
  v?: TxtVariant;
  c?: string;
  w?: TextStyle['fontWeight'];
  center?: boolean;
  style?: TextStyle | TextStyle[] | any;
  tracking?: number;
}

export function Txt({ v = 'body', c, w, center, style, tracking, children, ...rest }: TxtProps) {
  const { theme, fontScale, state } = useApp();
  const bold = state.settings.boldText;
  const base: TextStyle = {
    fontSize: Type[v] * fontScale,
    color: c ?? theme.text,
    fontWeight: w ?? (bold ? '600' : '400'),
    letterSpacing: tracking ?? (v === 'hero' || v === 'display' ? -2.4 : v === 'title1' ? -0.8 : v === 'title2' ? -0.5 : v === 'caption' || v === 'micro' ? 0.2 : -0.1),
    textAlign: center ? 'center' : undefined,
  };
  if (bold && w && (w === '400' || w === '500')) base.fontWeight = '600';
  return (
    <Text {...rest} style={[base, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------- Cards ------------------------------- */

export function Card({ style, children, tint, padded = true }: { style?: ViewStyle | ViewStyle[]; children?: React.ReactNode; tint?: string; padded?: boolean }) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          backgroundColor: tint ?? theme.bgElevated,
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          padding: padded ? Space.lg : 0,
          ...shadow(1, theme.shadow),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function GlassCard({
  style, children, tint, border, intensity = 26, padded = true,
}: { style?: ViewStyle | ViewStyle[]; children?: React.ReactNode; tint: string; border: string; intensity?: number; padded?: boolean }) {
  const content = (
    <View style={{ padding: padded ? Space.lg : 0 }}>{children}</View>
  );
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          {
            backgroundColor: tint,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: border,
            overflow: 'hidden',
            // @ts-ignore web only
            backdropFilter: 'blur(22px) saturate(140%)',
          },
          style,
        ]}
      >
        {content}
      </View>
    );
  }
  return (
    <View style={[{ borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: border }, style]}>
      <BlurView intensity={intensity} tint="light" style={{ backgroundColor: tint }}>
        {content}
      </BlurView>
    </View>
  );
}

/* ------------------------------ Pressable ----------------------------- */

export function Touch({
  onPress, children, style, disabled, hitSlop, scale = 0.97, accessibilityLabel, accessibilityRole = 'button',
}: {
  onPress?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  disabled?: boolean;
  hitSlop?: number;
  scale?: number;
  accessibilityLabel?: string;
  accessibilityRole?: any;
}) {
  const { state } = useApp();
  const v = useRef(new Animated.Value(1)).current;
  const anim = (to: number) => {
    if (state.settings.reduceMotion) return;
    Animated.spring(v, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => anim(scale)}
      onPressOut={() => anim(1)}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed && state.settings.reduceMotion ? 0.7 : 1 }, style]}
    >
      <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>
    </Pressable>
  );
}

/* -------------------------------- Button ------------------------------ */

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';

export function Btn({
  title, onPress, kind = 'primary', icon, full, small, disabled, loading, tint, onTint, style,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  icon?: keyof typeof Ionicons.glyphMap;
  full?: boolean;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tint?: string;
  onTint?: string;
  style?: ViewStyle;
}) {
  const { theme, fontScale } = useApp();
  const palette: Record<BtnKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: tint ?? theme.accent, fg: onTint ?? theme.onAccent, border: 'transparent' },
    secondary: { bg: theme.surfaceAlt, fg: theme.text, border: 'transparent' },
    ghost: { bg: 'transparent', fg: tint ?? theme.accent, border: 'transparent' },
    danger: { bg: theme.danger, fg: '#fff', border: 'transparent' },
    glass: { bg: tint ?? 'rgba(255,255,255,0.18)', fg: onTint ?? '#fff', border: 'rgba(255,255,255,0.28)' },
  };
  const p = palette[kind];
  return (
    <Touch onPress={onPress} disabled={disabled || loading} style={[{ alignSelf: full ? 'stretch' : 'flex-start' }, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: p.border === 'transparent' ? 0 : 1,
          paddingVertical: small ? 9 : 15,
          paddingHorizontal: small ? 14 : 22,
          borderRadius: Radius.pill,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={p.fg} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={small ? 15 : 18} color={p.fg} />}
            <Text style={{ color: p.fg, fontSize: (small ? Type.sub : Type.headline) * fontScale, fontWeight: '600', letterSpacing: -0.2 }}>{title}</Text>
          </>
        )}
      </View>
    </Touch>
  );
}

export function IconBtn({
  icon, onPress, size = 40, color, bg, border, iconSize, label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  color?: string;
  bg?: string;
  border?: string;
  iconSize?: number;
  label?: string;
}) {
  const { theme } = useApp();
  return (
    <Touch onPress={onPress} accessibilityLabel={label ?? icon} hitSlop={8}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg ?? theme.surfaceAlt,
          borderWidth: border ? 1 : 0,
          borderColor: border,
        }}
      >
        <Ionicons name={icon} size={iconSize ?? size * 0.46} color={color ?? theme.text} />
      </View>
    </Touch>
  );
}

/* --------------------------------- Chip -------------------------------- */

export function Chip({
  label, active, onPress, icon, tint, fg, dim, small,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string;
  fg?: string;
  dim?: string;
  small?: boolean;
}) {
  const { theme, fontScale } = useApp();
  const bg = active ? tint ?? theme.accent : dim ?? theme.surfaceAlt;
  const color = active ? fg ?? theme.onAccent : theme.textSecondary;
  return (
    <Touch onPress={onPress} scale={0.95}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: small ? 11 : 14,
          paddingVertical: small ? 6 : 9,
          borderRadius: Radius.pill,
          backgroundColor: bg,
        }}
      >
        {icon && <Ionicons name={icon} size={small ? 12 : 14} color={color} />}
        <Text style={{ color, fontSize: (small ? Type.micro : Type.sub) * fontScale, fontWeight: '600', letterSpacing: -0.1 }}>{label}</Text>
      </View>
    </Touch>
  );
}

/* -------------------------------- Toggle -------------------------------- */

export function Toggle({ value, onChange, tint }: { value: boolean; onChange: (v: boolean) => void; tint?: string }) {
  const { theme, state } = useApp();
  const v = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: value ? 1 : 0, duration: state.settings.reduceMotion ? 0 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, v, state.settings.reduceMotion]);
  const bg = v.interpolate({ inputRange: [0, 1], outputRange: [theme.surfacePressed, tint ?? theme.accent] });
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} hitSlop={8}>
      <Animated.View style={{ width: 50, height: 30, borderRadius: 30, backgroundColor: bg, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 26, height: 26, borderRadius: 26, backgroundColor: '#fff',
            transform: [{ translateX: x }],
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

/* -------------------------------- Rows ---------------------------------- */

export function ListGroup({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: string }) {
  const { theme } = useApp();
  return (
    <View style={{ marginBottom: Space.lg }}>
      {title && (
        <Txt v="caption" c={theme.textTertiary} w="600" style={{ marginLeft: Space.md, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {title}
        </Txt>
      )}
      <View style={{ backgroundColor: theme.bgElevated, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        {children}
      </View>
      {footer && (
        <Txt v="caption" c={theme.textTertiary} style={{ marginLeft: Space.md, marginTop: 8, lineHeight: 16 }}>
          {footer}
        </Txt>
      )}
    </View>
  );
}

export function Row({
  icon, iconBg, title, subtitle, value, onPress, right, danger, last, chevron,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
  chevron?: boolean;
}) {
  const { theme } = useApp();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: 13, gap: 12 }}>
      {icon && (
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: iconBg ?? theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={17} color={iconBg ? '#fff' : theme.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt v="callout" w="500" c={danger ? theme.danger : theme.text}>{title}</Txt>
        {subtitle && <Txt v="caption" c={theme.textTertiary} style={{ marginTop: 2 }}>{subtitle}</Txt>}
      </View>
      {value && <Txt v="callout" c={theme.textSecondary}>{value}</Txt>}
      {right}
      {(chevron ?? (!!onPress && !right)) && <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />}
    </View>
  );
  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? theme.surfaceAlt : 'transparent' })}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      {!last && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: icon ? 58 : Space.md }} />}
    </View>
  );
}

/* ----------------------------- SegmentedControl -------------------------- */

export function Segmented<T extends string>({
  options, value, onChange, tint, bg, fg,
}: {
  options: { key: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
  tint?: string;
  bg?: string;
  fg?: string;
}) {
  const { theme, fontScale } = useApp();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: bg ?? theme.surfaceAlt, borderRadius: Radius.pill, padding: 3 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              borderRadius: Radius.pill,
              backgroundColor: active ? tint ?? theme.bgElevated : 'transparent',
              ...(active ? shadow(1, theme.shadow) : {}),
            }}
          >
            {o.icon && <Ionicons name={o.icon} size={14} color={active ? fg ?? theme.text : theme.textTertiary} />}
            <Text
              numberOfLines={1}
              style={{ fontSize: Type.sub * fontScale, fontWeight: active ? '600' : '500', color: active ? fg ?? theme.text : theme.textTertiary }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------- Ring ---------------------------------- */

export function Ring({
  progress, size = 64, stroke = 6, color, track, children,
}: { progress: number; size?: number; stroke?: number; color: string; track?: string; children?: React.ReactNode }) {
  const { theme } = useApp();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? theme.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * p} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

/* ------------------------------- Skeleton -------------------------------- */

export function Skeleton({ w, h, r = 10, style }: { w?: number | string; h: number; r?: number; style?: ViewStyle }) {
  const { theme, state } = useApp();
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (state.settings.reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.4, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [v, state.settings.reduceMotion]);
  return <Animated.View style={[{ width: w as any, height: h, borderRadius: r, backgroundColor: theme.surfaceAlt, opacity: v }, style]} />;
}

/* ------------------------------ EmptyState ------------------------------- */

export function EmptyState({
  icon, title, body, actionLabel, onAction, color,
}: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; actionLabel?: string; onAction?: () => void; color?: string }) {
  const { theme } = useApp();
  return (
    <View style={{ alignItems: 'center', paddingVertical: Space.xxl, paddingHorizontal: Space.xl, gap: 10 }}>
      <View style={{ width: 62, height: 62, borderRadius: 62, backgroundColor: color ? `${color}22` : theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={color ?? theme.accent} />
      </View>
      <Txt v="title3" w="600" center>{title}</Txt>
      <Txt v="callout" c={theme.textSecondary} center style={{ lineHeight: 21, maxWidth: 300 }}>{body}</Txt>
      {actionLabel && onAction && <Btn title={actionLabel} onPress={onAction} small style={{ marginTop: 6 }} />}
    </View>
  );
}

/* --------------------------------- Sheet ---------------------------------- */

export function Sheet({
  visible, onClose, title, children, height,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; height?: number }) {
  const { theme, state } = useApp();
  const { height: winH } = useWindowDimensions();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: visible ? 1 : 0,
      duration: state.settings.reduceMotion ? 0 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, v, state.settings.reduceMotion]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [winH * 0.6, 0] });
  const maxH = height ?? winH * 0.86;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay, opacity: v }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          maxHeight: maxH,
          backgroundColor: theme.bg,
          borderTopLeftRadius: Radius.xxl,
          borderTopRightRadius: Radius.xxl,
          transform: [{ translateY: ty }],
          paddingBottom: 28,
          ...shadow(3, theme.shadow),
        }}
      >
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 38, height: 5, borderRadius: 5, backgroundColor: theme.surfacePressed }} />
        </View>
        {title && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingTop: 6, paddingBottom: 10 }}>
            <Txt v="title3" w="700" style={{ flex: 1 }}>{title}</Txt>
            <IconBtn icon="close" size={32} onPress={onClose} label="Close" />
          </View>
        )}
        <ScrollView contentContainerStyle={{ paddingHorizontal: Space.lg, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/* -------------------------------- Badge ---------------------------------- */

export function Badge({ label, color, bg, icon }: { label: string; color?: string; bg?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { theme, fontScale } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: Radius.pill, backgroundColor: bg ?? theme.accentSoft }}>
      {icon && <Ionicons name={icon} size={11} color={color ?? theme.accent} />}
      <Text style={{ fontSize: Type.micro * fontScale, fontWeight: '700', color: color ?? theme.accent, letterSpacing: 0.1 }}>{label}</Text>
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { theme } = useApp();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: inset }} />;
}

export function SectionTitle({ title, action, onAction, color, sub }: { title: string; action?: string; onAction?: () => void; color?: string; sub?: string }) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: Space.sm, paddingHorizontal: 2 }}>
      <View style={{ flex: 1 }}>
        <Txt v="title3" w="700" c={color}>{title}</Txt>
        {sub && <Txt v="caption" c={color ? `${color}99` : theme.textTertiary} style={{ marginTop: 2 }}>{sub}</Txt>}
      </View>
      {action && onAction && (
        <Touch onPress={onAction} scale={0.94}>
          <Txt v="sub" w="600" c={color ?? theme.accent}>{action}</Txt>
        </Touch>
      )}
    </View>
  );
}

export function themedStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bg },
    pad: { paddingHorizontal: Space.lg },
  });
}
