import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Storage keys
const ACCESS_TOKEN_KEY = '@agon/google_access_token';
const REFRESH_TOKEN_KEY = 'agon_google_refresh_token';
const EXPIRES_AT_KEY = '@agon/google_expires_at';
const USER_INFO_KEY = '@agon/google_user_info';

// Production / Dev backend base URL for auth proxy
// On web production it uses window.location.origin, on native it uses configured backend URL
export function getBackendBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    // If running on custom domain or Vercel
    return window.location.origin;
  }
  return 'https://weatherwhattodo-backend.onrender.com';
}

// Google OAuth Discovery Endpoints
export const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

// Required Google Scopes
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

export interface GoogleUser {
  email: string;
  name?: string;
  picture?: string;
  sub?: string;
}

export interface StoredTokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string | null;
  user?: GoogleUser | null;
}

// In-memory token cache for fast synchronous checks
let inMemoryAccessToken: string | null = null;
let inMemoryExpiresAt: number = 0;
let inMemoryRefreshToken: string | null = null;

// Secure storage helpers (SecureStore for native, AsyncStorage fallback for web)
async function saveSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return await AsyncStorage.getItem(key);
  }
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val) return val;
  } catch {}
  return await AsyncStorage.getItem(key);
}

async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
  } else {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
    await AsyncStorage.removeItem(key);
  }
}

/** Store tokens and user profile after successful code exchange */
export async function saveGoogleTokens(data: {
  access_token: string;
  expires_in: number;
  refresh_token?: string | null;
  user?: GoogleUser | null;
}): Promise<void> {
  const expiresAt = Date.now() + (data.expires_in - 120) * 1000; // 2 min buffer

  inMemoryAccessToken = data.access_token;
  inMemoryExpiresAt = expiresAt;

  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  await AsyncStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));

  if (data.refresh_token) {
    inMemoryRefreshToken = data.refresh_token;
    await saveSecureItem(REFRESH_TOKEN_KEY, data.refresh_token);
  }

  if (data.user) {
    await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(data.user));
  }
}

/** Get stored Google user profile */
export async function getStoredGoogleUser(): Promise<GoogleUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Check if user currently has stored tokens */
export async function hasStoredGoogleAuth(): Promise<boolean> {
  if (inMemoryAccessToken && Date.now() < inMemoryExpiresAt) return true;
  const refreshToken = await getSecureItem(REFRESH_TOKEN_KEY);
  if (refreshToken) return true;
  const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  return Boolean(token);
}

/**
 * Exchanges authorization code with the backend proxy
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier?: string,
  redirectUri?: string
): Promise<{ access_token: string; expires_in: number; refresh_token?: string; user?: GoogleUser }> {
  const baseUrl = getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      platform: Platform.OS,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `Failed to exchange auth code: HTTP ${res.status}`);
  }

  const data = await res.json();
  await saveGoogleTokens(data);
  return data;
}

/**
 * Refreshes access token via backend proxy
 */
export async function refreshGoogleAccessToken(): Promise<string | null> {
  const refreshToken = inMemoryRefreshToken || (await getSecureItem(REFRESH_TOKEN_KEY));
  if (!refreshToken) {
    return null;
  }

  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(`${baseUrl}/api/auth/google/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        // Token was revoked or expired
        await clearStoredGoogleTokens();
      }
      return null;
    }

    const data = await res.json();
    if (data.access_token) {
      const expiresAt = Date.now() + ((data.expires_in || 3600) - 120) * 1000;
      inMemoryAccessToken = data.access_token;
      inMemoryExpiresAt = expiresAt;

      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      await AsyncStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
      return data.access_token;
    }
  } catch (err) {
    console.warn('Error refreshing Google token:', err);
  }

  return null;
}

/**
 * Returns a valid access token, auto-refreshing via proxy if expired or close to expiry.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const now = Date.now();

  // 1. Check in-memory token
  if (inMemoryAccessToken && now < inMemoryExpiresAt) {
    return inMemoryAccessToken;
  }

  // 2. Check AsyncStorage token
  const storedToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  const storedExpiresAt = Number((await AsyncStorage.getItem(EXPIRES_AT_KEY)) || '0');

  if (storedToken && now < storedExpiresAt) {
    inMemoryAccessToken = storedToken;
    inMemoryExpiresAt = storedExpiresAt;
    return storedToken;
  }

  // 3. Proactively refresh access token
  return await refreshGoogleAccessToken();
}

/**
 * Clears stored tokens locally
 */
export async function clearStoredGoogleTokens(): Promise<void> {
  inMemoryAccessToken = null;
  inMemoryExpiresAt = 0;
  inMemoryRefreshToken = null;

  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(EXPIRES_AT_KEY);
  await AsyncStorage.removeItem(USER_INFO_KEY);
  await deleteSecureItem(REFRESH_TOKEN_KEY);
}

/**
 * Disconnects Google account, revoking access token and clearing storage
 */
export async function disconnectGoogleAccount(): Promise<void> {
  const token = inMemoryAccessToken || (await AsyncStorage.getItem(ACCESS_TOKEN_KEY));
  const refreshToken = inMemoryRefreshToken || (await getSecureItem(REFRESH_TOKEN_KEY));
  const tokenToRevoke = refreshToken || token;

  if (tokenToRevoke) {
    try {
      const baseUrl = getBackendBaseUrl();
      await fetch(`${baseUrl}/api/auth/google/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToRevoke }),
      });
    } catch (err) {
      console.warn('Revocation error:', err);
    }
  }

  await clearStoredGoogleTokens();
}
