import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { IconBtn, ListGroup, Row, Toggle, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';
import { ThemeMode } from '../lib/types';

export default function AppearanceScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme, scheme } = app;
  const s = state.settings;

  const modes: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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
            right={<Toggle value={s.dynamicWeatherTheme} onChange={(v) => app.setSettings({ dynamicWeatherTheme: v, weatherOverride: null })} />}
            last
          />
        </ListGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
