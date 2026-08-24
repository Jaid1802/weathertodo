import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, IconBtn, ListGroup, Row, Toggle, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Space } from '../lib/theme';

export default function AccessibilityScreen({ navigation }: any) {
  const app = useApp();
  const { state, theme } = app;
  const s = state.settings;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>Accessibility</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <Card style={{ marginBottom: Space.lg, backgroundColor: theme.accentSoft, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="accessibility" size={18} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Txt v="callout" w="700" c={theme.accent}>Designed to be readable everywhere</Txt>
              <Txt v="sub" c={theme.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
                The weather dashboard uses layered scrims so text always clears 4.5:1 contrast, even over bright skies. These controls push it further.
              </Txt>
            </View>
          </View>
        </Card>

        <ListGroup title="Vision" footer="High contrast replaces translucent glass with solid surfaces and strengthens every border.">
          <Row
            icon="contrast-outline"
            title="High contrast"
            subtitle="Stronger borders, solid surfaces"
            right={<Toggle value={s.highContrast} onChange={(v) => app.setSettings({ highContrast: v })} />}
          />
          <Row
            icon="text-outline"
            title="Larger text"
            subtitle="Scale typography by 14%"
            right={<Toggle value={s.largeText} onChange={(v) => app.setSettings({ largeText: v })} />}
          />
          <Row
            icon="text"
            title="Bold text"
            subtitle="Increase font weight throughout"
            right={<Toggle value={s.boldText} onChange={(v) => app.setSettings({ boldText: v })} />}
            last
          />
        </ListGroup>

        <ListGroup title="Motion" footer="Reduced motion disables rain, snow, drifting clouds, star twinkle and all spring animations. Content and information stay identical.">
          <Row
            icon="pause-circle-outline"
            title="Reduce motion"
            subtitle="Disable weather particles and transitions"
            right={<Toggle value={s.reduceMotion} onChange={(v) => app.setSettings({ reduceMotion: v })} />}
            last
          />
        </ListGroup>

        <Txt v="caption" c={theme.textTertiary} w="700" style={{ marginLeft: 4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Preview</Txt>
        <Card>
          <Txt v="title2" w="700">Aa</Txt>
          <Txt v="headline" w="600" style={{ marginTop: 6 }}>Rain arriving around 4:00 PM</Txt>
          <Txt v="callout" c={theme.textSecondary} style={{ marginTop: 6, lineHeight: 21 }}>
            Peak chance 72%. If you have anything outside, the window before 4:00 PM is your cleanest run.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: theme.accentSoft }}>
              <Txt v="micro" w="700" c={theme.accent}>WEATHER × CALENDAR</Txt>
            </View>
          </View>
        </Card>

        <ListGroup title="Assistive technology" footer="Every control exposes an accessibility role and label, and lists announce their counts.">
          <Row icon="volume-high-outline" title="Screen reader labels" value="Enabled" chevron={false} />
          <Row icon="resize-outline" title="Minimum tap target" value="44 pt" chevron={false} last />
        </ListGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
