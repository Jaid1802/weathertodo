# Weather What To-Do 🌤️

**Weather that understands your plans — powered by Ask Clever AI.**

Weather What To-Do unites live weather forecasting, Google Calendar events, Google Tasks, personal reminders, and context-aware AI recommendations to answer: **what should you do, when should you do it, and how does the weather affect your plans?**

Available as an **Android Application (APK)** and a **Web Application (Netlify)** with seamless multi-device cloud synchronization.

---

## 🌟 Key Features

- **✨ Ask Clever AI Companion**: Context-aware personal planning assistant powered by Google Gemini AI with task and calendar awareness.
- **🌦️ Live Weather & Hourly Forecasts**: Real-time WMO weather models, hourly trends, precipitation probabilities, and outdoor activity suitability scoring.
- **☁️ Multi-Device Cloud Sync**: Authoritative Supabase PostgreSQL cloud database with Row Level Security (RLS) and real-time cross-device data synchronization.
- **📅 Google Calendar Integration**: View and schedule events with outdoor window optimization.
- **✅ Google Tasks & Personal Lists**: Filter by indoor/outdoor tags, prioritize work, and manage checklists.
- **🔔 Resilient Notifications**: Native Android Notification Channels (exact alarms and boot persistence) and Web Push service worker.
- **🎨 Living Atmosphere UI**: Adaptive themes reflecting current sky conditions, high-contrast mode, and reduce-motion accessibility.
- **🛡️ Rock-Solid Offline Resilience**: Graceful fallback to cached data, offline weather synthesis, and protected startup timeouts.

---

## 🏗️ Architecture & Tech Stack

- **Mobile & Web Framework**: Expo SDK 57 / React Native 0.86 / React 19 / TypeScript
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS), PKCE Auth flow, Realtime websockets
- **Native Android**: Android 14+ compatible, New Architecture (Fabric), CMake/C++ NDK, Hermes Bytecode engine
- **Web Runtime**: React Native Web with Netlify static/edge routing
- **AI Engine**: Google Gemini API (`gemini-2.5-flash`) via secure backend proxy
- **Productivity APIs**: Google Calendar v3 API & Google Tasks v1 API

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local` and provide your credentials:
```bash
cp .env.example .env.local
```

### 3. Run Development Server
```bash
# Start Metro bundler (interactive menu)
npm start

# Run in Web browser
npm run web

# Run on Android device/emulator
npm run android
```

---

## 📱 Building the Android APK

### Option A: Local Native Build
Generate a standalone release APK directly via Gradle:
```powershell
cd android
.\gradlew.bat assembleRelease
```
The output APK is generated at:
`android/app/build/outputs/apk/release/app-release.apk`

To install directly to a connected Android phone or emulator:
```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Option B: Cloud Build with EAS
```bash
npm run build:apk
```

---

## 🌐 Web Deployment

```bash
# Export static web production bundle
npm run build:web
```
Configured for automatic deployment to Netlify via `netlify.toml`.

---

## 🔒 Security Best Practices

- All client-side environment variables must use the `EXPO_PUBLIC_` or `NEXT_PUBLIC_` prefix.
- Never store service-role keys, private keys, or OAuth client secrets in the frontend bundle.
- Server-side operations (token exchange, AI proxy) are isolated in the `/server` backend service.
