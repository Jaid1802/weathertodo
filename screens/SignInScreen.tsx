import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import WeatherBackground from '../components/WeatherBackground';
import { Btn, GlassCard, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';

export default function SignInScreen() {
  const app = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hour = new Date().getHours();
  const sky = getSky(hour >= 6 && hour < 17 ? 'clear-day' : hour >= 17 && hour < 20 ? 'sunset' : 'clear-night');
  const onSky = sky.onSky;
  const onSkyMuted = sky.onSkyMuted;

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: Radius.md,
    paddingHorizontal: 44,
    paddingVertical: 15,
    color: onSky,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    // @ts-ignore
    outlineStyle: 'none',
  } as any;

  const submit = async () => {
    setError(null);
    if (!email.includes('@') || email.length < 5) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (mode === 'up' && name.trim().length < 2) {
      setError('Tell us your name.');
      return;
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 900));
    app.signIn(email.trim().toLowerCase(), mode === 'up' ? name.trim() : undefined, 'email');
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: sky.sky[1] }}>
      <WeatherBackground sky={sky} dayProgress={0.5} reduceMotion={app.state.settings.reduceMotion} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: Space.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: Space.xl }}>
              <View style={{ width: 66, height: 66, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Ionicons name="partly-sunny" size={32} color={onSky} />
              </View>
              <Txt v="title1" w="700" c={onSky}>Aurelia</Txt>
              <Txt v="callout" c={onSkyMuted} center style={{ marginTop: 6, maxWidth: 300, lineHeight: 21 }}>
                Weather, calendar and tasks — read together, so your day makes sense.
              </Txt>
            </View>

            <GlassCard tint={sky.glass} border={sky.glassBorder}>
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.pill, padding: 3, marginBottom: Space.lg }}>
                {(['in', 'up'] as const).map((m) => (
                  <Touch key={m} onPress={() => { setMode(m); setError(null); }} style={{ flex: 1 }} scale={0.97}>
                    <View style={{ paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: mode === m ? 'rgba(255,255,255,0.26)' : 'transparent', alignItems: 'center' }}>
                      <Txt v="sub" w="600" c={mode === m ? onSky : onSkyMuted}>{m === 'in' ? 'Sign in' : 'Create account'}</Txt>
                    </View>
                  </Touch>
                ))}
              </View>

              {mode === 'up' && (
                <View style={{ marginBottom: Space.sm }}>
                  <Ionicons name="person-outline" size={17} color={onSkyMuted} style={{ position: 'absolute', left: 15, top: 16, zIndex: 2 }} />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Full name"
                    placeholderTextColor={onSkyMuted}
                    style={inputStyle}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              )}

              <View style={{ marginBottom: Space.sm }}>
                <Ionicons name="mail-outline" size={17} color={onSkyMuted} style={{ position: 'absolute', left: 15, top: 16, zIndex: 2 }} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={onSkyMuted}
                  style={inputStyle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View style={{ marginBottom: Space.md }}>
                <Ionicons name="lock-closed-outline" size={17} color={onSkyMuted} style={{ position: 'absolute', left: 15, top: 16, zIndex: 2 }} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={onSkyMuted}
                  style={inputStyle}
                  secureTextEntry
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
              </View>

              {error && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Space.sm }}>
                  <Ionicons name="alert-circle" size={14} color="#FFB4B4" />
                  <Txt v="sub" c="#FFB4B4">{error}</Txt>
                </View>
              )}

              <Btn
                title={mode === 'in' ? 'Sign in' : 'Create account'}
                full
                loading={busy}
                kind="glass"
                tint="rgba(255,255,255,0.26)"
                onTint={onSky}
                onPress={submit}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: Space.md }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' }} />
                <Txt v="micro" c={onSkyMuted}>OR</Txt>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' }} />
              </View>

              <Btn
                title="Continue with Google"
                icon="logo-google"
                full
                kind="glass"
                tint="rgba(255,255,255,0.12)"
                onTint={onSky}
                onPress={() => app.signIn('you@gmail.com', 'Alex Rivera', 'google')}
              />
              <View style={{ height: 8 }} />
              <Btn
                title="Continue as guest"
                full
                kind="glass"
                tint="transparent"
                onTint={onSkyMuted}
                onPress={() => app.signIn('guest@aurelia.app', 'Guest', 'guest')}
              />
            </GlassCard>

            <Txt v="micro" c={onSkyMuted} center style={{ marginTop: Space.lg, lineHeight: 17, maxWidth: 320, alignSelf: 'center' }}>
              Accounts are stored locally on this device. No data is uploaded.
            </Txt>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
