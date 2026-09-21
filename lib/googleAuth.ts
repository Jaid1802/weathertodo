// Storage keys
const ACCESS_TOKEN_KEY = '@weatherwhattodo/google_access_token';
const REFRESH_TOKEN_KEY = '@weatherwhattodo/google_refresh_token';
const EXPIRES_AT_KEY = '@weatherwhattodo/google_expires_at';
const USER_INFO_KEY = '@weatherwhattodo/google_user_info';

export function getBackendBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
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

function getLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocal(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function removeLocal(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
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

  setLocal(ACCESS_TOKEN_KEY, data.access_token);
  setLocal(EXPIRES_AT_KEY, String(expiresAt));

  if (data.refresh_token) {
    inMemoryRefreshToken = data.refresh_token;
    setLocal(REFRESH_TOKEN_KEY, data.refresh_token);
  }

  if (data.user) {
    setLocal(USER_INFO_KEY, JSON.stringify(data.user));
  }
}

/** Get stored Google user profile */
export async function getStoredGoogleUser(): Promise<GoogleUser | null> {
  try {
    const raw = getLocal(USER_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Check if user currently has stored tokens */
export async function hasStoredGoogleAuth(): Promise<boolean> {
  if (inMemoryAccessToken && Date.now() < inMemoryExpiresAt) return true;
  const refreshToken = getLocal(REFRESH_TOKEN_KEY);
  if (refreshToken) return true;
  const token = getLocal(ACCESS_TOKEN_KEY);
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
  let res = await fetch(`${baseUrl}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  }).catch(() => null);

  // Fallback to standalone backend endpoints if same-origin is not serving /api (e.g. dev Metro)
  if (!res || !res.ok) {
    const fallbacks = ['http://localhost:4000', 'https://weatherwhattodo-backend.onrender.com'];
    for (const fb of fallbacks) {
      if (baseUrl === fb) continue;
      try {
        const fbRes = await fetch(`${fb}/api/auth/google/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
          }),
        });
        if (fbRes.ok) {
          res = fbRes;
          break;
        }
      } catch {}
    }
  }

  if (!res || !res.ok) {
    const errJson = res ? await res.json().catch(() => ({})) : {};
    throw new Error(errJson.error || `Failed to exchange auth code${res ? `: HTTP ${res.status}` : ''}`);
  }

  const data = await res.json();
  await saveGoogleTokens(data);
  return data;
}

/**
 * Refreshes access token via backend proxy
 */
export async function refreshGoogleAccessToken(): Promise<string | null> {
  const refreshToken = inMemoryRefreshToken || getLocal(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return null;
  }

  try {
    const baseUrl = getBackendBaseUrl();
    let res = await fetch(`${baseUrl}/api/auth/google/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const fallbacks = ['http://localhost:4000', 'https://weatherwhattodo-backend.onrender.com'];
      for (const fb of fallbacks) {
        if (baseUrl === fb) continue;
        try {
          const fbRes = await fetch(`${fb}/api/auth/google/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (fbRes.ok) {
            res = fbRes;
            break;
          }
        } catch {}
      }
    }

    if (!res || !res.ok) {
      if (res && (res.status === 400 || res.status === 401)) {
        await clearStoredGoogleTokens();
      }
      return null;
    }

    const data = await res.json();
    if (data.access_token) {
      const expiresAt = Date.now() + ((data.expires_in || 3600) - 120) * 1000;
      inMemoryAccessToken = data.access_token;
      inMemoryExpiresAt = expiresAt;

      setLocal(ACCESS_TOKEN_KEY, data.access_token);
      setLocal(EXPIRES_AT_KEY, String(expiresAt));
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

  if (inMemoryAccessToken && now < inMemoryExpiresAt) {
    return inMemoryAccessToken;
  }

  const storedToken = getLocal(ACCESS_TOKEN_KEY);
  const storedExpiresAt = Number(getLocal(EXPIRES_AT_KEY) || '0');

  if (storedToken && now < storedExpiresAt) {
    inMemoryAccessToken = storedToken;
    inMemoryExpiresAt = storedExpiresAt;
    return storedToken;
  }

  return await refreshGoogleAccessToken();
}

/**
 * Clears stored tokens locally
 */
export async function clearStoredGoogleTokens(): Promise<void> {
  inMemoryAccessToken = null;
  inMemoryExpiresAt = 0;
  inMemoryRefreshToken = null;

  removeLocal(ACCESS_TOKEN_KEY);
  removeLocal(EXPIRES_AT_KEY);
  removeLocal(USER_INFO_KEY);
  removeLocal(REFRESH_TOKEN_KEY);
}

/**
 * Disconnects Google account, revoking access token and clearing storage
 */
export async function disconnectGoogleAccount(): Promise<void> {
  const token = inMemoryAccessToken || getLocal(ACCESS_TOKEN_KEY);
  const refreshToken = inMemoryRefreshToken || getLocal(REFRESH_TOKEN_KEY);
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
