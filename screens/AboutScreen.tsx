import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, IconBtn, ListGroup, Row, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space } from '../lib/theme';

export default function AboutScreen({ navigation }: any) {
  const { theme } = useApp();

  const pillars = [
    { icon: 'partly-sunny', title: 'The weather', body: 'tells me what is happening outside.', color: '#0C8CE9' },
    { icon: 'calendar', title: 'My calendar', body: 'tells me what is happening today.', color: '#7B5BFF' },
    { icon: 'checkmark-circle', title: 'My tasks', body: 'tell me what I need to accomplish.', color: '#0FA968' },
    { icon: 'sparkles', title: 'Gemini', body: 'connects all three and helps me make better decisions.', color: '#E8890C' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: 10 }}>
        <IconBtn icon="chevron-back" onPress={() => navigation.goBack()} label="Back" />
        <Txt v="headline" w="700" style={{ flex: 1 }}>About</Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Space.lg }}>
          <LinearGradient colors={['#1D6FE0', '#7B5BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: Space.xl, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="partly-sunny" size={32} color="#fff" />
            </View>
            <Txt v="title2" w="700" c="#fff">Aurelia</Txt>
            <Txt v="callout" c="rgba(255,255,255,0.82)" center style={{ marginTop: 6, lineHeight: 21 }}>
              Understand the weather. Understand your schedule. Plan a better day.
            </Txt>
          </LinearGradient>
        </View>

        {pillars.map((p) => (
          <Card key={p.title} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${p.color}1C`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={p.icon as any} size={19} color={p.color} />
              </View>
              <Txt v="callout" style={{ flex: 1, lineHeight: 21 }}>
                <Txt v="callout" w="700" c={p.color}>{p.title} </Txt>
                {p.body}
              </Txt>
            </View>
          </Card>
        ))}

        <View style={{ height: Space.lg }} />

        <ListGroup title="Privacy" footer="Aurelia is built local-first. Weather comes from Open-Meteo without an account. Your tasks, events, reminders and conversations never leave this device unless you add your own Gemini key.">
          <Row icon="phone-portrait-outline" title="Storage" value="On device" chevron={false} />
          <Row icon="cloud-offline-outline" title="Analytics" value="None" chevron={false} />
          <Row icon="lock-closed-outline" title="Account data" value="Local only" chevron={false} last />
        </ListGroup>

        <ListGroup title="Credits">
          <Row icon="partly-sunny-outline" title="Weather data" value="Open-Meteo" chevron={false} />
          <Row icon="map-outline" title="Geocoding" value="Open-Meteo" chevron={false} />
          <Row icon="sparkles-outline" title="Reasoning" value="Gemini / on-device" chevron={false} last />
        </ListGroup>

        <Txt v="micro" c={theme.textTertiary} center>Version 1.0.0 · Build 2024.1</Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
