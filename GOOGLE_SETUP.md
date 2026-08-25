# Google Calendar & Tasks Integration Setup Guide

This guide walks you through setting up real Google OAuth 2.0, Google Calendar API v3, and Google Tasks API v1 for the **Agon Preview / WeatherTodo** app.

---

## 1. Google Cloud Console Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Agon App`) or select your existing project.
3. In the left navigation, go to **APIs & Services** → **Library**:
   - Search for **Google Calendar API** and click **Enable**.
   - Search for **Google Tasks API** and click **Enable**.

---

## 2. Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**.
2. Select **External** user type and click **Create**.
3. Fill in the App Information:
   - **App name**: `Agon` (or `Arcada Agon`)
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

### A. Web Client ID (Primary / Unified)
1. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Set **Application type** to **Web application**.
3. Set **Name** to `Agon Web & Mobile Proxy`.
4. Under **Authorized JavaScript origins**, add:
   - `https://arcada.app` (your production domain)
   - `https://<your-vercel-deployment>.vercel.app`
   - `http://localhost:8081` (Expo web local dev)
   - `http://localhost:19006` (Expo dev)
5. Under **Authorized redirect URIs**, add:
   - `https://arcada.app/auth/google/callback`
   - `https://<your-vercel-deployment>.vercel.app/auth/google/callback`
   - `http://localhost:8081/auth/google/callback`
   - `agon://auth/google/callback` (for Expo custom scheme on native)
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

---

## 4. Serverless & Environment Configuration

### Vercel Deployment Settings
In your Vercel Project Dashboard → **Settings** → **Environment Variables**, add:

```env
GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_SECRET=<your-web-client-secret>
```

### Render Deployment Settings (if using Render backend)
In your Render Dashboard for `weathertodo-backend` → **Environment**, add:

```env
GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_SECRET=<your-web-client-secret>
```

### Expo Client Environment Variables (Optional / Build Time)
If you want to configure the client-side Web Client ID at build time:
```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
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
