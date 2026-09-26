import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import WeatherBackground from '../components/WeatherBackground';
import { Btn, GlassCard, Touch, Txt } from '../components/ui';
import { useApp } from '../lib/store';
import { Radius, Space, getSky } from '../lib/theme';
import {
  isSupabaseConfigured,
  signInWithSupabaseGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from '../lib/supabase';
import {
  googleDiscovery,
  GOOGLE_SCOPES,
  exchangeGoogleCode,
} from '../lib/googleAuth';

// Complete auth session if returning from web browser
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
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

  // Direct Google OAuth configuration (used if Supabase is not configured or for direct Google provider)
  const redirectUri =
    process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ||
    (Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/auth/google/callback`
      : AuthSession.makeRedirectUri({
          scheme: 'weatherwhattodo',
          path: 'auth/google/callback',
        }));

  const googleClientId =
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '';

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId,
      scopes: GOOGLE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    googleDiscovery
  );

  // Check URL parameters for OAuth error upon mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location) {
      try {
        const url = new URL(window.location.href);
        const err =
          url.searchParams.get('error_description') ||
          url.searchParams.get('error') ||
          url.searchParams.get('auth_error');

        if (err) {
          if (err.toLowerCase().includes('cancel') || err.toLowerCase().includes('closed')) {
            setError('Google login cancelled.');
          } else {
            setError('Google sign-in failed. Please try again.');
          }
          // Clean error parameter from URL
          url.searchParams.delete('error');
          url.searchParams.delete('error_description');
          url.searchParams.delete('auth_error');
          window.history.replaceState({}, document.title, url.pathname);
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
      if (isSupabaseConfigured()) {
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
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, 600));
        app.signIn(email.trim().toLowerCase(), mode === 'up' ? name.trim() : undefined, 'email');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (busy || googleBusy) return;
    setError(null);
    setGoogleBusy(true);

    try {
      // 1. If Supabase is configured, use Supabase OAuth flow
      if (isSupabaseConfigured()) {
        const res = await signInWithSupabaseGoogle();
        if (res.cancelled) {
          setError('Google login cancelled.');
          setGoogleBusy(false);
        } else if (res.error) {
          setError('Google sign-in failed. Please try again.');
          setGoogleBusy(false);
        }
        // If web OAuth redirect was triggered, browser navigates away
        return;
      }

      // 2. Fallback to direct Google OAuth if Supabase is not configured yet
      if (!googleClientId) {
        setError('Google OAuth is not configured. Please check .env.local.');
        setGoogleBusy(false);
        return;
      }

      if (!request) {
        setError('Preparing Google sign-in. Please try again in a moment.');
        setGoogleBusy(false);
        return;
      }

      const res = await promptAsync();

      if (res?.type === 'success' && res.params.code) {
        const tokens = await exchangeGoogleCode(
          res.params.code,
          request.codeVerifier,
          redirectUri
        );

        const userEmail = tokens.user?.email || 'user@gmail.com';
        const userName = tokens.user?.name || userEmail.split('@')[0];
        const userPicture = tokens.user?.picture;
        const userSub = tokens.user?.sub;

        app.signIn(userEmail, userName, 'google', userSub, userPicture);

        // Run Google integration sync in background
        app.syncGoogleData({ account: userEmail }).catch(() => {});
      } else if (res?.type === 'cancel' || res?.type === 'dismiss') {
        setError('Google login cancelled.');
      } else if (res?.type === 'error') {
        setError('Google sign-in failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
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
                onPress={() => app.signIn('guest@weatherwhattodo.app', 'Guest', 'guest')}
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
