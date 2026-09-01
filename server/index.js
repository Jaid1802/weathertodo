const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// In-memory store for sync/backup (can be swapped with DB)
const syncStore = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 1. Health Check (Render Uptime Check)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'weathertodo-backend',
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    hasGeminiKey: Boolean(GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// 2. Gemini AI Proxy Endpoint
app.post('/api/ai/ask', async (req, res) => {
  const { question, systemContext, apiKey: clientApiKey } = req.body;
  const key = clientApiKey || GEMINI_API_KEY;

  if (!key) {
    return res.status(400).json({
      error: 'GEMINI_API_KEY is not configured on server or client.',
      live: false,
    });
  }

  if (!question) {
    return res.status(400).json({ error: 'Missing question parameter' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    
    const bodyPayload = {
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
    };

    if (systemContext) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemContext }],
      };
    }

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(geminiRes.status).json({
        error: `Gemini API returned error: ${errText}`,
        status: geminiRes.status,
      });
    }

    const json = await geminiRes.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

    return res.json({
      text: text.trim(),
      chips: ['Plan my day', 'Free blocks', 'What should I wear?'],
      live: true,
    });
  } catch (error) {
    console.error('Error calling Gemini:', error);
    return res.status(500).json({ error: 'Internal Server Error proxying AI request' });
  }
});

// 2b. Ask Schedule – structured Gemini endpoint for task/event creation
app.post('/api/ask-schedule', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(200).json({
      type: 'answer',
      text: "I couldn't reach Gemini just now.",
      chips: [],
      task: null,
      event: null,
      error: true,
    });
  }

  const { question, context } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "question" field' });
  }

  const systemPrompt = buildAskSchedulePrompt(context || {});

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status);
      return res.status(200).json({
        type: 'answer',
        text: "I couldn't reach Gemini just now.",
        chips: [],
        task: null,
        event: null,
        error: true,
      });
    }

    const geminiJson = await geminiRes.json();
    const rawText =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

    return res.json(parseAskScheduleResponse(rawText));
  } catch (err) {
    console.error('Ask Schedule error:', err?.message || err);
    return res.status(200).json({
      type: 'answer',
      text: "I couldn't reach Gemini just now.",
      chips: [],
      task: null,
      event: null,
      error: true,
    });
  }
});
// 3. Weather Proxy & Cache
const weatherCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

app.get('/api/weather', async (req, res) => {
  const { latitude, longitude, timezone = 'auto' } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'latitude and longitude query parameters required' });
  }

  const cacheKey = `${Number(latitude).toFixed(2)},${Number(longitude).toFixed(2)},${timezone}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json({ ...cached.data, fromCache: true });
  }

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index,surface_pressure',
      hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,surface_pressure,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,uv_index,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant',
      timezone: String(timezone),
      forecast_days: '14',
    });

    const apiUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: 'Failed to fetch from Open-Meteo' });
    }

    const data = await apiRes.json();
    weatherCache.set(cacheKey, { timestamp: Date.now(), data });

    return res.json({ ...data, fromCache: false });
  } catch (err) {
    console.error('Weather fetch error:', err);
    return res.status(500).json({ error: 'Error fetching weather data' });
  }
});

// 4. Data Sync / Backup Endpoints
app.get('/api/sync/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = syncStore.get(userId);
  if (!userData) {
    return res.status(404).json({ error: 'User data not found', userId });
  }
  return res.json({ userId, data: userData, syncedAt: userData.updatedAt });
});

app.post('/api/sync/:userId', (req, res) => {
  const { userId } = req.params;
  const { tasks, events, settings } = req.body;

  const payload = {
    tasks: tasks || [],
    events: events || [],
    settings: settings || {},
    updatedAt: new Date().toISOString(),
  };

  syncStore.set(userId, payload);
  return res.json({ success: true, userId, updatedAt: payload.updatedAt });
});

// 5. Google OAuth Proxy Endpoints
app.post('/api/auth/google/callback', async (req, res) => {
  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'GOOGLE_WEB_CLIENT_ID or GOOGLE_WEB_CLIENT_SECRET not configured on server' });
  }

  try {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirect_uri || '',
    });
    if (code_verifier) params.append('code_verifier', code_verifier);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({ error: tokenData.error_description || tokenData.error || 'Token exchange failed', details: tokenData });
    }

    let userProfile = null;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) userProfile = await userRes.json();
    } catch {}

    return res.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token || null,
      id_token: tokenData.id_token || null,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      user: userProfile ? { email: userProfile.email, name: userProfile.name, picture: userProfile.picture, sub: userProfile.sub } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/auth/google/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token parameter' });

  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'GOOGLE_WEB_CLIENT_ID or GOOGLE_WEB_CLIENT_SECRET not configured on server' });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token,
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({ error: tokenData.error_description || tokenData.error || 'Token refresh failed', details: tokenData });
    }

    return res.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/auth/google/revoke', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token parameter' });
  try {
    const revokeRes = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res.json({ success: true, revoked: revokeRes.ok });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});


// --- Ask Schedule helpers ---

function buildAskSchedulePrompt(ctx) {
  const lines = [
    `You are "Ask Schedule", a calm, precise daily-planning assistant. You have access to the user's weather, calendar, and task data.`,
    ``,
    `You MUST reply with ONLY a single raw JSON object (no markdown fences, no prose outside the JSON) matching exactly this schema:`,
    `{`,
    `  "type": "answer" | "addTask" | "addEvent",`,
    `  "text": string,       // conversational reply, always present, max ~120 words`,
    `  "chips": string[],    // 2-3 short follow-up prompts the user might ask next`,
    `  "task": {             // only non-null when type is "addTask"`,
    `    "title": string,`,
    `    "priority": "low" | "normal" | "high" | "urgent",`,
    `    "context": "indoor" | "outdoor" | "anywhere",`,
    `    "dueMinutes": number | undefined   // minutes from midnight`,
    `  } | null,`,
    `  "event": {            // only non-null when type is "addEvent"`,
    `    "title": string,`,
    `    "startMinutes": number,`,
    `    "endMinutes": number,`,
    `    "isOutdoor": boolean`,
    `  } | null`,
    `}`,
    ``,
    `Rules:`,
    `- "task" must be null when type is NOT "addTask".`,
    `- "event" must be null when type is NOT "addEvent".`,
    `- Only choose "addTask" or "addEvent" when the user is CLEARLY asking to add, create, or schedule something. Otherwise use "answer".`,
    `- Infer priority, context, and times sensibly from the question and the supplied weather/calendar/task context.`,
    `- If the user says a time like "6pm", convert to minutes from midnight (e.g. 6pm = 1080).`,
    `- For tasks with a time, set dueMinutes. For events, set startMinutes and endMinutes (default 30-60 minute duration if not specified).`,
    `- Keep "text" concise and conversational (max ~120 words).`,
    `- "chips" should be 2-3 short follow-up prompts.`,
    ``,
    `Current context:`,
  ];

  if (ctx.placeName) lines.push(`Location: ${ctx.placeName}`);
  if (ctx.nowIso) lines.push(`Local time: ${ctx.nowIso}`);
  if (ctx.tempUnit) lines.push(`Temperature unit: ${ctx.tempUnit}, Wind unit: ${ctx.windUnit || 'kmh'}, 24h clock: ${ctx.use24h ?? false}`);

  if (ctx.current) {
    const c = ctx.current;
    lines.push(`Current weather: ${Math.round(c.tempC)}°C (feels ${Math.round(c.feelsLikeC)}°C), weather code ${c.code}, UV ${c.uv}, wind ${Math.round(c.wind)} km/h`);
  }

  if (ctx.events && ctx.events.length > 0) {
    lines.push(`Today's events:`);
    for (const e of ctx.events) {
      lines.push(`  - "${e.title}" ${e.startMinutes}-${e.endMinutes} min${e.isOutdoor ? ' (outdoor)' : ''}${e.allDay ? ' (all day)' : ''}`);
    }
  } else {
    lines.push(`Today's events: none`);
  }

  if (ctx.tasks && ctx.tasks.length > 0) {
    lines.push(`Today's tasks:`);
    for (const t of ctx.tasks) {
      lines.push(`  - "${t.title}" [${t.priority}, ${t.context}]${t.dueMinutes !== undefined ? ` due at ${t.dueMinutes} min` : ''}${t.done ? ' (done)' : ''}`);
    }
  } else {
    lines.push(`Today's tasks: none`);
  }

  return lines.join('\n');
}

function parseAskScheduleResponse(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.type || typeof parsed.text !== 'string') {
      throw new Error('Missing required fields');
    }
    const validTypes = ['answer', 'addTask', 'addEvent'];
    const type = validTypes.includes(parsed.type) ? parsed.type : 'answer';
    return {
      type,
      text: parsed.text,
      chips: Array.isArray(parsed.chips) ? parsed.chips : [],
      task: type === 'addTask' && parsed.task ? parsed.task : null,
      event: type === 'addEvent' && parsed.event ? parsed.event : null,
    };
  } catch {
    return {
      type: 'answer',
      text: raw.trim().slice(0, 400),
      chips: [],
      task: null,
      event: null,
    };
  }
}

// Fallback Route
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`WeatherTodo backend running on port ${PORT}`);
});
