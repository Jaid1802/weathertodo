# Weather What To-Do 🌤️

**Weather that understands your plans — powered by Ask Clever AI.**

Weather What To-Do brings together live weather forecasts, Google Calendar events, Google Tasks, reminders, and context-aware AI recommendations to help you answer: **what should you do, when should you do it, and how does the weather affect your plans?**

---

## Features

- **✨ Ask Clever AI Companion**: Intelligent, casual, witty personal planning assistant powered by Gemini 2.5 Flash.
- **🌦️ Live Weather & Hourly Forecasts**: Detailed forecasts, precipitation probability, outdoor activity scores, and hourly trends.
- **📅 Google Calendar Integration**: Seamless two-way schedule visibility with outdoor weather cross-referencing.
- **✅ Google Tasks & To-Dos**: Context-aware task management (indoor/outdoor, priorities, deadlines).
- **🎨 Living Sky UI**: Dynamic glassmorphism design with responsive weather particle effects and day/night transitions.
- **🚀 Netlify Ready**: Built with Next.js App Router and optimized for instant Netlify edge deployment.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Tech Stack
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **AI**: Google Gemini API (`gemini-2.5-flash`)
- **Styling**: Tailwind CSS & Glassmorphism design tokens
- **Integrations**: Google Calendar API & Google Tasks API (OAuth 2.0)
- **Deployment**: Netlify (`@netlify/plugin-nextjs`)
