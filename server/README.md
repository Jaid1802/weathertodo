# WeatherTodo Backend Service

Backend service for the WeatherTodo app, hosted on Render.

## Features
- **Health check endpoint**: `/health` (used for Render health checks and uptime monitoring).
- **Gemini AI Proxy**: `/api/ai/ask` (proxies requests to Google Gemini 2.0 Flash with secure API key management).
- **Weather Proxy & Cache**: `/api/weather` (fetches and caches 14-day forecasts from Open-Meteo).
- **Sync & Backup**: `/api/sync/:userId` (stores and retrieves tasks, events, and settings).

## Deployment on Render
- **Type**: Web Service
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: `server`
- **Health Check Path**: `/health`
