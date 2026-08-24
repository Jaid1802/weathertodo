import React, { useRef, useState } from 'react';
import { Animated, Dimensions, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Btn, GlassCard, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Space, getSky } from '../lib/theme';

const PAGES = [
  {
    sky: 'clear-day' as const,
    icon: 'partly-sunny' as const,
    title: 'The weather tells you\nwhat is happening outside',
    body: 'A living dashboard that changes with the sky. Rain falls, stars twinkle, fog drifts — so you feel the forecast before you read it.',
  },
  {
    sky: 'sunset' as const,
    icon: 'calendar' as const,
    title: 'Your calendar tells you\nwhat is happening today',
    body: 'Google Calendar and local events in one timeline, with every outdoor commitment quietly checked against the forecast.',
  },
  {
    sky: 'rain' as const,
    icon: 'checkmark-circle' as const,
    title: 'Your tasks tell you\nwhat needs doing',
    body: 'Google Tasks and personal lists, tagged indoor or outdoor, so the right work lands in the right weather window.',
  },
  {
    sky: 'clear-night' as const,
    icon: 'sparkles' as const,
    title: 'Aurelia connects\nall three',
    body: 'One assistant reading weather, schedule and workload together — then telling you the single most useful thing to do next.',
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const app = useApp();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const sky = getSky(PAGES[page].sky);
  const reduce = app.state.settings.reduceMotion;

  return (
    <View style={{ flex: 1, backgroundColor: sky.sky[1] }}>
      <WeatherBackground sky={sky} dayProgress={0.4} reduceMotion={reduce} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingTop: Space.xs }}>
          <Touch onPress={() => app.setOnboarded(true)} scale={0.95}>
            <Txt v="sub" w="600" c={sky.onSkyMuted}>Skip</Txt>
          </Touch>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {PAGES.map((p, i) => (
            <View key={i} style={{ width, flex: 1, justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingBottom: Space.xl }}>
              <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg }}>
                <Ionicons name={p.icon} size={30} color={sky.onSky} />
              </View>
              <Txt v="title1" w="700" c={sky.onSky} style={{ lineHeight: 40 }}>{p.title}</Txt>
              <Txt v="body" c={sky.onSkyMuted} style={{ marginTop: 14, lineHeight: 24, maxWidth: 400 }}>{p.body}</Txt>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.lg, gap: Space.lg }}>
          <View style={{ flexDirection: 'row', gap: 7, justifyContent: 'center' }}>
            {PAGES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === page ? 22 : 7,
                  height: 7,
                  borderRadius: 7,
                  backgroundColor: i === page ? sky.onSky : 'rgba(255,255,255,0.36)',
                }}
              />
            ))}
          </View>

          <Btn
            title={page === PAGES.length - 1 ? 'Get started' : 'Continue'}
            full
            kind="glass"
            tint="rgba(255,255,255,0.22)"
            onTint={sky.onSky}
            icon={page === PAGES.length - 1 ? 'arrow-forward' : undefined}
            onPress={() => {
              if (page === PAGES.length - 1) app.setOnboarded(true);
              else {
                const next = page + 1;
                setPage(next);
                scrollRef.current?.scrollTo({ x: next * width, animated: true });
              }
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
