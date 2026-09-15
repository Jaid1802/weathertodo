import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
  Circle,
  Path,
} from 'react-native-svg';
import { WeatherThemeConfig } from '../lib/weatherTheme';
import { seeded } from '../lib/utils';

interface Props {
  theme: WeatherThemeConfig;
  reduceMotion?: boolean;
}

/* -------------------------------- Particles -------------------------------- */

function RainParticles({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const count = reduceMotion ? 0 : 32;
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: seeded(i * 3.7 + 11) * w,
        len: 16 + seeded(i * 7.1 + 19) * 22,
        dur: 650 + seeded(i * 2.9 + 5) * 600,
        delay: seeded(i * 5.3 + 23) * 1200,
        op: 0.22 + seeded(i * 9.7 + 31) * 0.40,
        thick: seeded(i * 11.3) > 0.65 ? 1.5 : 1,
      })),
    [count, w]
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d, i) => (
        <RainDrop key={i} {...d} h={h} />
      ))}
    </View>
  );
}

function RainDrop({ x, len, dur, delay, op, thick, h }: any) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: dur,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, dur, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-50, h + 30] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: thick,
        height: len,
        borderRadius: thick,
        backgroundColor: '#CFE4FA',
        opacity: op,
        transform: [{ translateY }, { translateX }, { rotate: '12deg' }],
      }}
    />
  );
}

function SnowParticles({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const count = reduceMotion ? 0 : 28;
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: seeded(i * 4.3 + 17) * w,
        size: 3 + seeded(i * 8.9 + 7) * 4.5,
        dur: 4800 + seeded(i * 2.1 + 13) * 5500,
        delay: seeded(i * 6.7 + 29) * 5000,
        op: 0.35 + seeded(i * 3.7 + 3) * 0.55,
        drift: (seeded(i * 12.3 + 41) - 0.5) * 80,
      })),
    [count, w]
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flakes.map((f, i) => (
        <SnowFlake key={i} {...f} h={h} />
      ))}
    </View>
  );
}

function SnowFlake({ x, size, dur, delay, op, drift, h }: any) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: dur,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, dur, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity: op,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

function StarParticles({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 45 }, (_, i) => ({
        x: seeded(i * 3.1 + 5) * w,
        y: seeded(i * 6.7 + 11) * h * 0.65,
        size: 1.2 + seeded(i * 4.3 + 9) * 2.2,
        dur: 1600 + seeded(i * 9.1 + 3) * 2800,
        base: 0.25 + seeded(i * 5.9 + 17) * 0.55,
      })),
    [w, h]
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <StarItem key={i} {...s} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function StarItem({ x, y, size, dur, base, reduceMotion }: any) {
  const anim = useRef(new Animated.Value(base)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: Math.min(1, base + 0.4),
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: base * 0.6,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, dur, base, reduceMotion]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity: anim,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.9,
        shadowRadius: 3,
      }}
    />
  );
}

function MistBands({ w, h, reduceMotion }: { w: number; h: number; reduceMotion: boolean }) {
  const bands = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        y: h * (0.16 + i * 0.16),
        dur: 15000 + i * 4500,
        op: 0.16 + i * 0.05,
        hh: 65 + i * 20,
      })),
    [h]
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bands.map((b, i) => (
        <MistBandItem key={i} {...b} w={w} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function MistBandItem({ y, dur, op, hh, w, reduceMotion }: any) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: dur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, dur, reduceMotion]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.2, w * 0.2] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: -w * 0.25,
        top: y,
        width: w * 1.5,
        height: hh,
        transform: [{ translateX }],
      }}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', `rgba(255,255,255,${op})`, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: hh }}
      />
    </Animated.View>
  );
}

function SunRaysLayer({ w, h, color, reduceMotion }: { w: number; h: number; color: string; reduceMotion: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 5500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 5500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -h * 0.2,
        left: w * 0.35,
        width: w * 0.9,
        height: h * 0.65,
        borderRadius: w * 0.5,
        backgroundColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

function LightningFlash({ reduceMotion }: { reduceMotion: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;

    const flash = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 60, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.08, duration: 80, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.65, duration: 60, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start(() => {
        if (!cancelled) {
          // Occasional subtle lightning every 8-16 seconds
          setTimeout(flash, 8000 + Math.random() * 8000);
        }
      });
    };

    const timer = setTimeout(flash, 3500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [anim, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: '#EDE7FF', opacity: anim }]}
    />
  );
}

/* --------------------------- Single Atmosphere Layer --------------------------- */

function AtmosphereLayer({
  theme,
  w,
  h,
  reduceMotion,
}: {
  theme: WeatherThemeConfig;
  w: number;
  h: number;
  reduceMotion: boolean;
}) {
  const { orb, skyGradients, cloudOpacity, particles, hasLightning, scrimColors } = theme;

  const orbPosX = (w * orb.xPercent) / 100 - orb.size / 2;
  const orbPosY = (h * orb.yPercent) / 100;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 1. Full-bleed sky gradient */}
      <LinearGradient colors={skyGradients as any} style={StyleSheet.absoluteFill} />

      {/* 2. Celestial Atmospheric Radial Glow */}
      {orb.show && orb.type === 'sun' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: orbPosX - orb.size * 0.75,
            top: orbPosY - orb.size * 0.75,
            width: orb.size * 2.5,
            height: orb.size * 2.5,
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <SvgRadialGradient id="sunBloom" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#FFF9C4" stopOpacity="0.45" />
                <Stop offset="35%" stopColor="#FDE047" stopOpacity="0.20" />
                <Stop offset="70%" stopColor="#F59E0B" stopOpacity="0.06" />
                <Stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </SvgRadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#sunBloom)" />
          </Svg>
        </View>
      )}

      {orb.show && orb.type === 'moon' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: orbPosX - orb.size * 0.75,
            top: orbPosY - orb.size * 0.75,
            width: orb.size * 2.5,
            height: orb.size * 2.5,
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <SvgRadialGradient id="moonBloom" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.25" />
                <Stop offset="45%" stopColor="#818CF8" stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
              </SvgRadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#moonBloom)" />
          </Svg>
        </View>
      )}

      {/* 3. Sunrays */}
      {particles === 'sunrays' && (
        <SunRaysLayer w={w} h={h} color={orb.glowColor} reduceMotion={reduceMotion} />
      )}

      {/* 4. Atmospheric Cloud Veil */}
      {cloudOpacity > 0.05 && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: h * 0.45,
            opacity: cloudOpacity,
          }}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.06)', 'transparent']}
            style={{ position: 'absolute', top: h * 0.08, left: 0, right: 0, height: h * 0.25 }}
          />
          <LinearGradient
            colors={['rgba(240,245,255,0.14)', 'transparent']}
            style={{ position: 'absolute', top: h * 0.20, left: 0, right: 0, height: h * 0.18 }}
          />
        </View>
      )}

      {/* 5. Particles */}
      {particles === 'stars' && <StarParticles w={w} h={h} reduceMotion={reduceMotion} />}
      {particles === 'rain' && <RainParticles w={w} h={h} reduceMotion={reduceMotion} />}
      {particles === 'snow' && <SnowParticles w={w} h={h} reduceMotion={reduceMotion} />}
      {particles === 'mist' && <MistBands w={w} h={h} reduceMotion={reduceMotion} />}

      {/* 6. Lightning Flash for Stormy */}
      {hasLightning && <LightningFlash reduceMotion={reduceMotion} />}

      {/* 7. Subtle Contrast & Readability Scrims */}
      <LinearGradient
        colors={[scrimColors[0], 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h * 0.36 }}
      />
      <LinearGradient
        colors={['transparent', scrimColors[1]]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h * 0.55 }}
      />
    </View>
  );
}

/* ------------------------------- Main Export ------------------------------- */

export default function DynamicWeatherAtmosphere({ theme, reduceMotion = false }: Props) {
  const { width, height } = useWindowDimensions();

  // Crossfade state between current theme and outgoing theme
  const [currentTheme, setCurrentTheme] = useState<WeatherThemeConfig>(theme);
  const [outgoingTheme, setOutgoingTheme] = useState<WeatherThemeConfig | null>(null);
  const crossfadeAnim = useRef(new Animated.Value(1)).current;

  const currentThemeKey = `${theme.id}-${theme.timeOfDay}-${theme.skyGradients.join(',')}`;
  const activeThemeKeyRef = useRef(currentThemeKey);

  useEffect(() => {
    if (activeThemeKeyRef.current !== currentThemeKey) {
      // Begin smooth 750ms crossfade
      activeThemeKeyRef.current = currentThemeKey;
      setOutgoingTheme(currentTheme);
      setCurrentTheme(theme);

      crossfadeAnim.setValue(0);
      Animated.timing(crossfadeAnim, {
        toValue: 1,
        duration: reduceMotion ? 0 : 750,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setOutgoingTheme(null);
      });
    }
  }, [currentThemeKey, theme, currentTheme, crossfadeAnim, reduceMotion]);

  const outgoingOpacity = crossfadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Outgoing theme fading out */}
      {outgoingTheme && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: outgoingOpacity }]}>
          <AtmosphereLayer theme={outgoingTheme} w={width} h={height} reduceMotion={reduceMotion} />
        </Animated.View>
      )}

      {/* Current theme fading in */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: crossfadeAnim }]}>
        <AtmosphereLayer theme={currentTheme} w={width} h={height} reduceMotion={reduceMotion} />
      </Animated.View>
    </View>
  );
}
