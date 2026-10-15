import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Btn, GlassCard, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import { requestNotificationPermission } from '../lib/notifications';
import { resolveCurrentDevicePlace } from '../lib/locationService';

export default function OnboardingScreen({ navigation }: any) {
  const app = useApp();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const reduce = app.state.settings.reduceMotion;

  // Location permission state
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'resolved' | 'denied'>('idle');
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);

  // Notification permission state
  const [notifStatus, setNotifStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [notifBusy, setNotifBusy] = useState(false);

  const skies = ['clear-day', 'sunset', 'rain', 'clear-night'] as const;
  const currentSky = getSky(skies[page] || 'clear-day');

  const goToPage = (next: number) => {
    setPage(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  const handleRequestLocation = async () => {
    setLocating(true);
    try {
      const res = await resolveCurrentDevicePlace(true);
      if (res.place) {
        app.addPlace(res.place);
        app.setActivePlace('current');
        setResolvedCity(res.place.name);
        setLocationStatus('resolved');
      } else if (res.status === 'denied') {
        setLocationStatus('denied');
      } else {
        setLocationStatus('denied');
      }
    } catch {
      setLocationStatus('denied');
    } finally {
      setLocating(false);
    }
  };

  const handleRequestNotification = async () => {
    setNotifBusy(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        setNotifStatus('granted');
      } else {
        setNotifStatus('denied');
      }
    } catch {
      setNotifStatus('denied');
    } finally {
      setNotifBusy(false);
    }
  };

  const handleFinishOnboarding = async () => {
    try {
      app.setOnboarded(true);
    } catch (e) {
      console.warn('[Onboarding] Error completing onboarding:', e);
      app.setOnboarded(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: currentSky.sky[1] }}>
      <StatusBar style="light" />
      <WeatherBackground sky={currentSky} dayProgress={0.4} reduceMotion={reduce} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top Header with Skip */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingTop: Space.xs }}>
          <Touch onPress={handleFinishOnboarding} scale={0.95}>
            <Txt v="sub" w="600" c={currentSky.onSkyMuted}>Skip</Txt>
          </Touch>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {/* SLIDE 0: Introduction */}
          <View style={{ width, flex: 1, justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingBottom: Space.xl }}>
            <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg }}>
              <Ionicons name="partly-sunny" size={30} color={currentSky.onSky} />
            </View>
            <Txt v="title1" w="700" c={currentSky.onSky} style={{ lineHeight: 40 }}>
              {'The weather tells you\nwhat is happening outside'}
            </Txt>
            <Txt v="body" c={currentSky.onSkyMuted} style={{ marginTop: 14, lineHeight: 24, maxWidth: 400 }}>
              A living dashboard that changes with the sky. Rain falls, stars twinkle, fog drifts — so you feel the forecast before you read it.
            </Txt>
          </View>

          {/* SLIDE 1: Location Permission */}
          <View style={{ width, flex: 1, justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingBottom: Space.xl }}>
            <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg }}>
              <Ionicons name="navigate" size={30} color={currentSky.onSky} />
            </View>
            <Txt v="title1" w="700" c={currentSky.onSky} style={{ lineHeight: 40 }}>
              {'Automatic local weather\nwherever you are'}
            </Txt>
            <Txt v="body" c={currentSky.onSkyMuted} style={{ marginTop: 14, lineHeight: 24, maxWidth: 400 }}>
              Weather What To-Do uses your device location to provide real-time sky conditions, rain alerts, and hourly forecasts for your exact area.
            </Txt>

            {/* Location feedback box */}
            {locationStatus === 'resolved' ? (
              <GlassCard tint="rgba(255,255,255,0.18)" border="rgba(255,255,255,0.28)" style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="700" c={currentSky.onSky}>{resolvedCity || 'Current location'}</Txt>
                  <Txt v="micro" c={currentSky.onSkyMuted}>Weather forecast resolved for your device</Txt>
                </View>
              </GlassCard>
            ) : locationStatus === 'denied' ? (
              <GlassCard tint="rgba(255,255,255,0.18)" border="rgba(255,255,255,0.28)" style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={22} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="600" c={currentSky.onSky}>Location access not granted</Txt>
                  <Txt v="micro" c={currentSky.onSkyMuted}>You can search any city manually, or enable location in Settings.</Txt>
                </View>
              </GlassCard>
            ) : null}
          </View>

          {/* SLIDE 2: Notification Permission */}
          <View style={{ width, flex: 1, justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingBottom: Space.xl }}>
            <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg }}>
              <Ionicons name="notifications" size={30} color={currentSky.onSky} />
            </View>
            <Txt v="title1" w="700" c={currentSky.onSky} style={{ lineHeight: 40 }}>
              {'Smart alerts for\nchanging skies'}
            </Txt>
            <Txt v="body" c={currentSky.onSkyMuted} style={{ marginTop: 14, lineHeight: 24, maxWidth: 400 }}>
              Stay ahead of unexpected rain, receive morning daily briefings, and get timely reminders for outdoor commitments and tasks.
            </Txt>

            {/* Notification feedback box */}
            {notifStatus === 'granted' ? (
              <GlassCard tint="rgba(255,255,255,0.18)" border="rgba(255,255,255,0.28)" style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="700" c={currentSky.onSky}>Notifications enabled</Txt>
                  <Txt v="micro" c={currentSky.onSkyMuted}>You will receive weather warnings & schedule alerts</Txt>
                </View>
              </GlassCard>
            ) : notifStatus === 'denied' ? (
              <GlassCard tint="rgba(255,255,255,0.18)" border="rgba(255,255,255,0.28)" style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="information-circle-outline" size={22} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Txt v="callout" w="600" c={currentSky.onSky}>Notifications disabled</Txt>
                  <Txt v="micro" c={currentSky.onSkyMuted}>You can customize and enable notifications in Settings anytime.</Txt>
                </View>
              </GlassCard>
            ) : null}
          </View>

          {/* SLIDE 3: Aurelia & Wrap up */}
          <View style={{ width, flex: 1, justifyContent: 'flex-end', paddingHorizontal: Space.lg, paddingBottom: Space.xl }}>
            <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: Space.lg }}>
              <Ionicons name="sparkles" size={30} color={currentSky.onSky} />
            </View>
            <Txt v="title1" w="700" c={currentSky.onSky} style={{ lineHeight: 40 }}>
              {'Aurelia connects\nweather, schedule & tasks'}
            </Txt>
            <Txt v="body" c={currentSky.onSkyMuted} style={{ marginTop: 14, lineHeight: 24, maxWidth: 400 }}>
              One smart assistant reading weather, calendar and workload together — telling you the single most useful thing to do next.
            </Txt>
          </View>
        </ScrollView>

        {/* Footer Navigation Buttons */}
        <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.lg, gap: Space.lg }}>
          {/* Progress Indicators */}
          <View style={{ flexDirection: 'row', gap: 7, justifyContent: 'center' }}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={{
                  width: i === page ? 22 : 7,
                  height: 7,
                  borderRadius: 7,
                  backgroundColor: i === page ? currentSky.onSky : 'rgba(255,255,255,0.36)',
                }}
              />
            ))}
          </View>

          {/* Contextual Action Button */}
          {page === 0 ? (
            <Btn
              title="Continue"
              full
              kind="glass"
              tint="rgba(255,255,255,0.22)"
              onTint={currentSky.onSky}
              icon="arrow-forward"
              onPress={() => goToPage(1)}
            />
          ) : page === 1 ? (
            <View style={{ gap: 10 }}>
              {locationStatus === 'idle' ? (
                <>
                  <Btn
                    title={locating ? 'Locating device…' : 'Enable Location Access'}
                    full
                    loading={locating}
                    kind="glass"
                    tint="rgba(255,255,255,0.28)"
                    onTint={currentSky.onSky}
                    icon="navigate"
                    onPress={handleRequestLocation}
                  />
                  <Touch onPress={() => goToPage(2)} scale={0.96} style={{ alignSelf: 'center', paddingVertical: 4 }}>
                    <Txt v="sub" c={currentSky.onSkyMuted}>Set location manually later</Txt>
                  </Touch>
                </>
              ) : (
                <Btn
                  title="Continue"
                  full
                  kind="glass"
                  tint="rgba(255,255,255,0.22)"
                  onTint={currentSky.onSky}
                  icon="arrow-forward"
                  onPress={() => goToPage(2)}
                />
              )}
            </View>
          ) : page === 2 ? (
            <View style={{ gap: 10 }}>
              {notifStatus === 'idle' ? (
                <>
                  <Btn
                    title={notifBusy ? 'Requesting…' : 'Enable Notifications'}
                    full
                    loading={notifBusy}
                    kind="glass"
                    tint="rgba(255,255,255,0.28)"
                    onTint={currentSky.onSky}
                    icon="notifications"
                    onPress={handleRequestNotification}
                  />
                  <Touch onPress={() => goToPage(3)} scale={0.96} style={{ alignSelf: 'center', paddingVertical: 4 }}>
                    <Txt v="sub" c={currentSky.onSkyMuted}>Maybe later</Txt>
                  </Touch>
                </>
              ) : (
                <Btn
                  title="Continue"
                  full
                  kind="glass"
                  tint="rgba(255,255,255,0.22)"
                  onTint={currentSky.onSky}
                  icon="arrow-forward"
                  onPress={() => goToPage(3)}
                />
              )}
            </View>
          ) : (
            <Btn
              title="Get started"
              full
              kind="glass"
              tint="rgba(255,255,255,0.28)"
              onTint={currentSky.onSky}
              icon="arrow-forward"
              onPress={handleFinishOnboarding}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
