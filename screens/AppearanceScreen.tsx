import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Card, IconBtn, ListGroup, Row, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { ALL_SKIES, Radius, Space } from '../lib/theme';
import { ThemeMode } from '../lib/types';

export default function AppearanceScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const s = state.settings;
  const { width } = useWindowDimensions();

  const modes: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  ];

  const tileW = (Math.min(width, 560) - Space.lg * 2 - 20) / 3;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Appearance</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginLeft: 4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Interface theme</Txt>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: Space.xl }}>
          {modes.map((m) => {
            const active = s.themeMode === m.key;
            return (
              <Touch key={m.key} onPress={() => app.setSettings({ themeMode: m.key })} style={{ flex: 1 }} scale={0.96}>
                <View
                  style={{
                    borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 2,
                    borderColor: active ? theme.accent : theme.hairline,
                  }}
                >
                  <View style={{ height: 78, backgroundColor: m.key === 'dark' ? '#0B1020' : m.key === 'light' ? '#F2F5FC' : undefined }}>
                    {m.key === 'system' && (
                      <View style={{ flex: 1, flexDirection: 'row' }}>
                        <View style={{ flex: 1, backgroundColor: '#F2F5FC' }} />
                        <View style={{ flex: 1, backgroundColor: '#0B1020' }} />
                      </View>
                    )}
                    <View style={{ position: 'absolute', left: 10, top: 12, right: 10, gap: 5 }}>
                      <View style={{ height: 7, width: '62%', borderRadius: 7, backgroundColor: m.key === 'light' ? '#0E1526' : m.key === 'dark' ? '#F2F5FF' : '#8894B0', opacity: 0.85 }} />
                      <View style={{ height: 5, width: '85%', borderRadius: 5, backgroundColor: m.key === 'light' ? '#0E152655' : m.key === 'dark' ? '#F2F5FF55' : '#8894B055' }} />
                      <View style={{ height: 5, width: '45%', borderRadius: 5, backgroundColor: m.key === 'light' ? '#0E152633' : m.key === 'dark' ? '#F2F5FF33' : '#8894B033' }} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: theme.bgElevated }}>
                    <Ionicons name={m.icon} size={14} color={active ? theme.accent : theme.textTertiary} />
                    <Txt v="sub" w="600" c={active ? theme.accent : theme.textSecondary}>{m.label}</Txt>
                  </View>
                </View>
              </Touch>
            );
          })}
        </View>

        <ListGroup title="Home dashboard" footer="When dynamic atmosphere is on, the entire home screen background responds to live conditions — light, colour, motion and particles all change with the weather.">
          <Row
            icon="color-wand-outline"
            title="Dynamic weather atmosphere"
            subtitle="Background reacts to real conditions"
            right={<Toggle value={s.dynamicWeatherTheme} onChange={(v) => app.setSettings({ dynamicWeatherTheme: v, weatherOverride: v ? s.weatherOverride : null })} />}
            last
          />
        </ListGroup>

        <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginLeft: 4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Preview an atmosphere</Txt>
        <Txt v="sub" c={theme.textSecondary} style={{ marginLeft: 4, marginBottom: 12, lineHeight: 19 }}>
          Pin a specific sky to see how the dashboard adapts. Set back to Automatic to follow the live forecast.
        </Txt>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Touch onPress={() => app.setSettings({ weatherOverride: null })} scale={0.95}>
            <View
              style={{
                width: tileW, height: 108, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: theme.surfaceAlt, borderWidth: 2, borderColor: !s.weatherOverride ? theme.accent : 'transparent',
              }}
            >
              <Ionicons name="sync" size={20} color={theme.accent} />
              <Txt v="micro" w="700" c={theme.text}>Automatic</Txt>
            </View>
          </Touch>
          {ALL_SKIES.map((sk) => {
            const active = s.weatherOverride === sk.key;
            return (
              <Touch key={sk.key} onPress={() => app.setSettings({ weatherOverride: sk.key, dynamicWeatherTheme: true })} scale={0.95}>
                <View style={{ width: tileW, height: 108, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 2, borderColor: active ? theme.accent : 'transparent' }}>
                  <LinearGradient colors={sk.sky as any} style={{ flex: 1, padding: 10, justifyContent: 'flex-end' }}>
                    {sk.showOrb && (
                      <View style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 22, backgroundColor: sk.orb, opacity: 0.9 }} />
                    )}
                    <Txt v="micro" w="700" c={sk.onSky}>{sk.label}</Txt>
                    <Txt v="micro" c={sk.onSkyMuted} numberOfLines={1}>{sk.mood}</Txt>
                  </LinearGradient>
                  {active && (
                    <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: theme.accent, borderRadius: 20, padding: 3 }}>
                      <Ionicons name="checkmark" size={11} color={theme.onAccent} />
                    </View>
                  )}
                </View>
              </Touch>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
