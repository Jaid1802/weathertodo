import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// Complete any pending auth session in web browser if applicable
WebBrowser.maybeCompleteAuthSession();

const getEnvVar = (keys: string[]): string => {
  for (const k of keys) {
    const val = process.env[k];
    if (val && typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
};

export const SUPABASE_URL = getEnvVar([
  'EXPO_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
]);

export const SUPABASE_ANON_KEY = getEnvVar([
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
]);

export function isSupabaseConfigured(): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (
    SUPABASE_URL.includes('your-project') ||
    SUPABASE_URL.includes('your_supabase_url') ||
    SUPABASE_ANON_KEY.includes('your-anon-key') ||
    SUPABASE_ANON_KEY.includes('your_supabase_anon_key')
  ) {
    return false;
  }
  return SUPABASE_URL.startsWith('http://') || SUPABASE_URL.startsWith('https://');
}

export function getPublicSiteUrl(): string {
  const envUrl = getEnvVar([
    'NEXT_PUBLIC_SITE_URL',
    'EXPO_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_APP_URL',
    'EXPO_PUBLIC_APP_URL',
  ]);
  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:3000';
}

export function getOAuthRedirectUrl(): string {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getPublicSiteUrl();
    return `${origin}/auth/callback`;
  }

  return AuthSession.makeRedirectUri({
    scheme: 'weatherwhattodo',
    path: 'auth/callback',
  });
}

// Storage adapter: on web prefer localStorage, on mobile use AsyncStorage
const authStorage = Platform.OS === 'web' && typeof window !== 'undefined'
  ? window.localStorage
  : AsyncStorage;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: authStorage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client:', err);
    return null;
  }
}

/**
 * Initiates Google OAuth using Supabase
 */
export async function signInWithSupabaseGoogle(redirectOverride?: string): Promise<{
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase is not configured yet.' };
  }

  const redirectTo = redirectOverride || getOAuthRedirectUrl();

  try {
    if (Platform.OS === 'web') {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message || 'Google sign-in failed. Please try again.' };
      }

      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      }
      return { success: true };
    } else {
      // Mobile (Expo Native)
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message || 'Google sign-in failed. Please try again.' };
      }

      if (!data?.url) {
        return { success: false, error: 'Failed to generate Google login URL.' };
      }

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (res.type === 'success' && res.url) {
        const parsed = new URL(res.url);
        const code = parsed.searchParams.get('code');
        if (code) {
          const { error: exchangeErr } = await client.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            return { success: false, error: exchangeErr.message };
          }
          return { success: true };
        }
        return { success: true };
      } else if (res.type === 'cancel' || res.type === 'dismiss') {
        return { success: false, cancelled: true };
      } else {
        return { success: false, error: 'Google sign-in was not completed.' };
      }
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Google sign-in failed. Please try again.' };
  }
}

/**
 * Exchange code for session in Supabase PKCE flow
 */
export async function exchangeSupabaseCode(code: string): Promise<{ session: Session | null; error: any }> {
  const client = getSupabaseClient();
  if (!client) {
    return { session: null, error: new Error('Supabase client not initialized') };
  }
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  return { session: data.session, error };
}

/**
 * Sign in with email and password
 */
export async function signInWithEmailPassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }
  return await client.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmailPassword(email: string, password: string, name?: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }
  return await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        full_name: name,
      },
    },
  });
}

/**
 * Supabase Sign Out
 */
export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (err) {
    console.warn('[Supabase] SignOut error:', err);
  }
}

/**
 * Get current Supabase session
 */
export async function getSupabaseSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}
