# Google Calendar & Tasks Integration Setup Guide

This guide walks you through setting up real Google OAuth 2.0, Google Calendar API v3, and Google Tasks API v1 for the **Weather What To-Do** app.

---

## 1. Google Cloud Console Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your existing Google Cloud project or create a new project.
3. In the left navigation, go to **APIs & Services** → **Library**:
   - Search for **Google Calendar API** and click **Enable**.
   - Search for **Google Tasks API** and click **Enable**.

---

## 2. Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**.
2. Select **External** user type and click **Create**.
3. Fill in the App Information:
   - **App name**: `Weather What To-Do`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue** to advance to **Scopes**.
5. Click **Add or Remove Scopes** and add the following:
   - `.../auth/calendar` (Google Calendar API — read & write access)
   - `.../auth/tasks` (Google Tasks API — read & write access)
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
6. Click **Save and Continue**.
7. Under **Test Users**, add your Google email address (and any other test accounts) so you can authenticate during development.
8. Click **Save and Continue**.

---

## 3. Create OAuth 2.0 Credentials

### A. Web Client ID (Web Application)
1. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Set **Application type** to **Web application**.
3. Set **Name** to `Weather What To-Do Web & Mobile Proxy`.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8081` (Expo web local dev)
   - `https://weatherwhattodo.netlify.app` (Production Netlify frontend)
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:8081/auth/google/callback` (Local dev callback)
   - `https://weatherwhattodo.netlify.app/auth/google/callback` (Production frontend callback)
   - `weatherwhattodo://auth/google/callback` (for Expo custom scheme on native)
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

---

## 4. Environment Configuration

### Netlify Deployment Settings
In your Netlify Dashboard → **Site configuration** → **Environment variables**, add:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
```

### Render Deployment Settings (for `weatherwhattodo-backend`)
In your Render Dashboard for `weatherwhattodo-backend` → **Environment**, add:

```env
GOOGLE_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-web-client-secret>
GEMINI_API_KEY=<your-gemini-api-key>
```

---

## 5. How It Works (Security & Architecture)

- **Authorization Code + PKCE**: The app opens Google's OAuth consent screen with PKCE (`code_challenge`).
- **Serverless Token Exchange**: The app sends the auth `code` and `code_verifier` to `/api/auth/google/callback`. The server exchanges it with Google using `GOOGLE_WEB_CLIENT_SECRET`. **The client secret is never included in the app bundle or APK.**
- **Token Storage**:
  - **Native (Android/iOS)**: The `refresh_token` is stored securely in hardware-backed `expo-secure-store`.
  - **Web**: Persisted in local storage.
- **Proactive Token Refresh**: When the short-lived access token (~1 hour) is near expiration or returns a 401, `lib/googleAuth.ts` automatically calls `/api/auth/google/refresh` to mint a new access token without user friction.
- **Sync**: Pulls all calendars, events, task lists, and tasks, merging with local state while keeping `source: 'google'` tagged for clean synchronization and disconnection.
