import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SkyTheme } from '../lib/theme';
import { seeded } from '../lib/utils';

interface Props {
  sky: SkyTheme;
  /** 0..1 progress of daylight, drives the orb position */
  dayProgress?: number;
  reduceMotion?: boolean;
  /** dim overlay for readability on content-heavy screens */
  scrim?: number;
  children?: React.ReactNode;
}

/* ------------------------------- Particles ------------------------------- */

function Rain({ w, h, dense, reduceMotion, color }: { w: number; h: number; dense: boolean; reduceMotion: boolean; color: string }) {
  const count = reduceMotion ? 0 : dense ? 58 : 34;
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: seeded(i * 3.1) * w,
        len: 14 + seeded(i * 7.7) * 26,
        dur: 700 + seeded(i * 2.3) * 700,
        delay: seeded(i * 5.5) * 1400,
        op: 0.18 + seeded(i * 9.1) * 0.42,
        thick: seeded(i * 11.3) > 0.7 ? 1.6 : 1,
      })),
    [count, w]
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d, i) => (
        <Drop key={i} {...d} h={h} color={color} />
      ))}
    </View>
  );
}

function Drop({ x, len, dur, delay, op, thick, h, color }: any) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [dur, delay, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-60, h + 40] });
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, 26] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: thick,
        height: len,
        borderRadius: thick,
        backgroundColor: color,
        opacity: op,
        transform: [{ translateY }, { translateX }, { rotate: '12deg' }],
      }}
    />
  );
}

function Snow({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const count = reduceMotion ? 0 : 40;
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: seeded(i * 4.4) * w,
        size: 2.5 + seeded(i * 8.2) * 5,
        dur: 5200 + seeded(i * 1.9) * 6200,
        delay: seeded(i * 6.6) * 6000,
        op: 0.35 + seeded(i * 3.3) * 0.55,
        drift: (seeded(i * 12.1) - 0.5) * 90,
      })),
    [count, w]
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flakes.map((f, i) => (
        <Flake key={i} {...f} h={h} />
      ))}
    </View>
  );
}

function Flake({ x, size, dur, delay, op, drift, h }: any) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [dur, delay, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-30, h + 30] });
  const translateX = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: '#FFFFFF',
        opacity: op,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

function Stars({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 62 }, (_, i) => ({
        x: seeded(i * 2.7) * w,
        y: seeded(i * 5.9) * h * 0.72,
        size: 1 + seeded(i * 3.7) * 2.3,
        dur: 1800 + seeded(i * 9.3) * 3400,
        base: 0.25 + seeded(i * 6.1) * 0.6,
      })),
    [w, h]
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Star key={i} {...s} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function Star({ x, y, size, dur, base, reduceMotion }: any) {
  const v = useRef(new Animated.Value(base)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: Math.min(1, base + 0.35), duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: base * 0.55, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [dur, base, v, reduceMotion]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: '#FFFFFF',
        opacity: v,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.8,
        shadowRadius: 4,
      }}
    />
  );
}

function Mist({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const bands = useMemo(
    () => Array.from({ length: 5 }, (_, i) => ({ y: h * (0.24 + i * 0.15), dur: 16000 + i * 5200, op: 0.1 + i * 0.045, hh: 70 + i * 24 })),
    [h]
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bands.map((b, i) => (
        <Band key={i} {...b} w={w} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function Band({ y, dur, op, hh, w, reduceMotion }: any) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [dur, v, reduceMotion]);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.5, w * 0.5] });
  return (
    <Animated.View style={{ position: 'absolute', left: -w * 0.3, top: y, width: w * 1.6, height: hh, transform: [{ translateX }] }}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', `rgba(255,255,255,${op})`, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: hh }}
      />
    </Animated.View>
  );
}

function Clouds({ w, h, opacity, reduceMotion }: { w: number; h: number; opacity: number; reduceMotion: boolean }) {
  const puffs = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        y: h * (0.06 + seeded(i * 4.1) * 0.42),
        size: w * (0.45 + seeded(i * 2.2) * 0.6),
        dur: 42000 + seeded(i * 7.3) * 46000,
        delay: -seeded(i * 3.9) * 40000,
        op: opacity * (0.5 + seeded(i * 6.4) * 0.6),
      })),
    [w, h, opacity]
  );
  if (opacity <= 0.03) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {puffs.map((p, i) => (
        <Puff key={i} {...p} w={w} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function Puff({ y, size, dur, delay, op, w, reduceMotion }: any) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(Math.max(0, delay + dur)),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    v.setValue(0);
    anim.start();
    return () => anim.stop();
  }, [dur, delay, v, reduceMotion]);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-size, w + size * 0.4] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: y,
        left: 0,
        width: size,
        height: size * 0.34,
        borderRadius: size,
        backgroundColor: `rgba(255,255,255,${op})`,
        transform: [{ translateX }],
      }}
    />
  );
}

function SunRays({ w, h, color, reduceMotion }: { w: number; h: number; color: string; reduceMotion: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 6200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 6200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [v, reduceMotion]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.6] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -h * 0.18,
        left: -w * 0.25,
        width: w * 1.5,
        height: h * 0.8,
        borderRadius: w,
        backgroundColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

function Lightning({ reduceMotion }: { reduceMotion: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const flash = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(v, { toValue: 0.85, duration: 70, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.05, duration: 90, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start(() => {
        if (!cancelled) setTimeout(flash, 4200 + Math.random() * 7000);
      });
    };
    const t = setTimeout(flash, 2200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [v, reduceMotion]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#D8CCFF', opacity: v }]} />;
}

/* ------------------------------ Main export ------------------------------ */

export default function WeatherBackground({ sky, dayProgress = 0.5, reduceMotion = false, scrim = 0, children }: Props) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: reduceMotion ? 0 : 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sky.key, fade, reduceMotion]);

  const orbX = 0.14 + Math.min(1, Math.max(0, dayProgress)) * 0.68;
  const orbY = 0.08 + Math.sin(Math.min(1, Math.max(0, dayProgress)) * Math.PI) * -0.02 + (1 - Math.sin(Math.min(1, Math.max(0, dayProgress)) * Math.PI)) * 0.16;
  const orbSize = width * 0.42;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <LinearGradient colors={sky.sky as any} locations={[0, 0.36, 0.68, 1]} style={StyleSheet.absoluteFill} />

        {sky.particles === 'sunrays' && <SunRays w={width} h={height} color={sky.orbGlow} reduceMotion={reduceMotion} />}

        {sky.showOrb && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: width * orbX - orbSize / 2,
              top: height * orbY,
              width: orbSize,
              height: orbSize,
              borderRadius: orbSize,
              backgroundColor: sky.orbGlow,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: orbSize * 0.46,
                height: orbSize * 0.46,
                borderRadius: orbSize,
                backgroundColor: sky.orb,
                shadowColor: sky.orb,
                shadowOpacity: 0.9,
                shadowRadius: 42,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          </View>
        )}

        <Clouds w={width} h={height} opacity={sky.cloudOpacity} reduceMotion={reduceMotion} />

        {sky.particles === 'stars' && <Stars w={width} h={height} reduceMotion={reduceMotion} />}
        {sky.particles === 'rain' && <Rain w={width} h={height} dense color="#DCEBFF" reduceMotion={reduceMotion} />}
        {sky.particles === 'drizzle' && <Rain w={width} h={height} dense={false} color="#CFE4F5" reduceMotion={reduceMotion} />}
        {sky.particles === 'snow' && <Snow w={width} h={height} reduceMotion={reduceMotion} />}
        {sky.particles === 'mist' && <Mist w={width} h={height} reduceMotion={reduceMotion} />}
        {sky.key === 'thunder' && <Lightning reduceMotion={reduceMotion} />}

        {/* readability scrims */}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.34 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.42)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.42 }}
          pointerEvents="none"
        />
        {scrim > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${scrim})` }]} />}
      </Animated.View>
      {children}
    </View>
  );
}
