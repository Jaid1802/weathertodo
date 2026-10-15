import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import WeatherBackground from '../components/WeatherBackground';
import { Btn, GlassCard, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import {
  signInWithSupabaseGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from '../lib/supabase';

// Complete auth session if returning from web browser
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen({ navigation }: any) {
  const app = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hour = new Date().getHours();
  const sky = getSky(hour >= 6 && hour < 17 ? 'clear-day' : hour >= 17 && hour < 20 ? 'sunset' : 'clear-night');
  const onSky = sky.onSky;
  const onSkyMuted = sky.onSkyMuted;

  // Check URL parameters and sessionStorage for OAuth error upon mount (Web only)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        let err: string | null = null;
        if (window.location) {
          const url = new URL(window.location.href);
          err =
            url.searchParams.get('error_description') ||
            url.searchParams.get('error') ||
            url.searchParams.get('auth_error');

          if (err) {
            url.searchParams.delete('error');
            url.searchParams.delete('error_description');
            url.searchParams.delete('auth_error');
            if (typeof document !== 'undefined') {
              window.history.replaceState({}, document.title, url.pathname);
            }
          }
        }

        if (!err && window.sessionStorage) {
          err = window.sessionStorage.getItem('@weatherwhattodo/auth_error');
          if (err) {
            window.sessionStorage.removeItem('@weatherwhattodo/auth_error');
          }
        }

        if (err) {
          const cleanErr = decodeURIComponent(err);
          if (cleanErr.toLowerCase().includes('cancel') || cleanErr.toLowerCase().includes('closed')) {
            setError('Google login cancelled.');
          } else {
            setError(cleanErr);
          }
        }
      } catch {}
    }
  }, []);

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
    if (busy || googleBusy) return;
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

    try {
      if (mode === 'up') {
        const { data, error: supaErr } = await signUpWithEmailPassword(
          email.trim().toLowerCase(),
          password,
          name.trim()
        );
        if (supaErr) {
          setError(supaErr.message || 'Failed to create account.');
          setBusy(false);
          return;
        }
        if (data?.user) {
          app.signIn(data.user.email || email, name.trim(), 'email', data.user.id);
          if (navigation?.canGoBack?.()) navigation.goBack();
        }
      } else {
        const { data, error: supaErr } = await signInWithEmailPassword(
          email.trim().toLowerCase(),
          password
        );
        if (supaErr) {
          setError(supaErr.message || 'Invalid email or password.');
          setBusy(false);
          return;
        }
        if (data?.user) {
          const userName =
            data.user.user_metadata?.name ||
            data.user.user_metadata?.full_name ||
            email.split('@')[0];
          app.signIn(data.user.email || email, userName, 'email', data.user.id);
          if (navigation?.canGoBack?.()) navigation.goBack();
        }
      }
    } catch (err: any) {
      console.warn('Sign-in error:', err?.message || err);
      setError(err?.message || 'Authentication error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (busy || googleBusy) return;
    setError(null);
    setGoogleBusy(true);

    try {
      const res = await signInWithSupabaseGoogle();
      if (res.cancelled) {
        setError('Google login cancelled.');
        setGoogleBusy(false);
      } else if (res.error) {
        setError(res.error);
        setGoogleBusy(false);
      } else if (res.session?.user) {
        const u = res.session.user;
        const uName = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'User';
        const avatar = u.user_metadata?.avatar_url || u.user_metadata?.picture;
        app.signIn(u.email || '', uName, 'google', u.id, avatar);
        if (navigation?.canGoBack?.()) navigation.goBack();
      }
      // If web OAuth redirect was triggered, browser leaves page
    } catch (err: any) {
      console.error('[Google OAuth] Error starting sign-in:', err);
      setError(err?.message || 'Google sign-in is currently unavailable. Please try again.');
      setGoogleBusy(false);
    }
  };

  const handleContinueAsGuest = () => {
    app.signIn('guest@weatherwhattodo.app', 'Guest', 'guest');
    if (navigation?.canGoBack?.()) navigation.goBack();
  };

  const handleContinueSignedOut = () => {
    app.continueAsSignedOut();
    if (navigation?.canGoBack?.()) navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: sky.sky[1] }}>
      <StatusBar style="light" />
      <WeatherBackground sky={sky} dayProgress={0.5} reduceMotion={app.state.settings.reduceMotion} />
      <SafeAreaView style={{ flex: 1 }}>
        {navigation?.canGoBack?.() && (
          <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.xs }}>
            <Touch onPress={() => navigation.goBack()} scale={0.94} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="close" size={24} color={onSky} />
              <Txt v="sub" w="600" c={onSky}>Close</Txt>
            </Touch>
          </View>
        )}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: Space.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: Space.xl }}>
              <View style={{ width: 72, height: 72, borderRadius: 22, overflow: 'hidden', marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 }}>
                <Image source={require('../assets/icon.png')} style={{ width: 72, height: 72 }} resizeMode="cover" />
              </View>
              <Txt v="title1" w="700" c={onSky}>Weather What To-Do</Txt>
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
                disabled={busy || googleBusy}
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
                title={googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
                icon="logo-google"
                full
                loading={googleBusy}
                disabled={googleBusy || busy}
                kind="glass"
                tint="rgba(255,255,255,0.12)"
                onTint={onSky}
                onPress={handleGoogleSignIn}
              />
              <View style={{ height: 8 }} />
              <Btn
                title="Continue as guest"
                full
                disabled={googleBusy || busy}
                kind="glass"
                tint="transparent"
                onTint={onSkyMuted}
                onPress={handleContinueAsGuest}
              />
              <View style={{ height: 6 }} />
              <Btn
                title="Explore without an account"
                full
                disabled={googleBusy || busy}
                kind="glass"
                tint="transparent"
                onTint={onSkyMuted}
                onPress={handleContinueSignedOut}
              />
            </GlassCard>

            <Txt v="micro" c={onSkyMuted} center style={{ marginTop: Space.lg, lineHeight: 17, maxWidth: 320, alignSelf: 'center' }}>
              Signing in with Google enables secure cloud sync across devices. Guest and signed-out data remain stored locally on this device.
            </Txt>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
