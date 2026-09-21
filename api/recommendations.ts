// Serverless Function: AI Contextual Recommendations (Gemini AI)
// POST /api/recommendations or POST /api/ai/recommendations

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(200).json({
      recommendations: [],
      error: 'GEMINI_API_KEY not configured on server.',
    });
  }

  const { context } = req.body || {};

  if (!context) {
    return res.status(400).json({ error: 'Missing context parameter' });
  }

  const systemPrompt = buildRecommendationsPrompt(context);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Analyze the current weather, calendar commitments, and tasks to produce 2-4 contextual recommendation cards.' }],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!geminiRes.ok) {
      console.error('Gemini recommendations error:', geminiRes.status);
      return res.status(200).json({ recommendations: [], error: 'Gemini API error' });
    }

    const geminiJson: any = await geminiRes.json();
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';

    const parsed = parseRecommendationsResponse(rawText);
    return res.status(200).json({ recommendations: parsed, live: true });
  } catch (err: any) {
    console.error('Recommendations error:', err?.message || err);
    return res.status(200).json({ recommendations: [], error: err.message });
  }
}

function buildRecommendationsPrompt(ctx: any): string {
  const lines = [
    `You are Clever Tips, the intelligent context engine of Weather What To-Do.`,
    `Think of yourself as a witty, casual friend who happens to be very good at organizing your day.`,
    ``,
    `PERSONALITY:`,
    `- Casual, funny, slightly playful, clever, friendly, helpful, concise, context-aware.`,
    `- Gently tease the SITUATION, NOT the user.`,
    `- Target: 80% useful, 20% playful. The usefulness of the recommendation must always come first.`,
    ``,
    `CORE FORMULA:`,
    `Observation \u2192 Funny comment \u2192 Useful suggestion`,
    `Example:`,
    `"Meeting with Madih\u0101 has been waiting since yesterday. Your calendar is starting to think you two are in a toxic relationship. \uD83D\uDE2D You've got an 8:00 AM gap today. Move it there and let's end the drama."`,
    ``,
    `TONE RULES:`,
    `1. Be funny, but remain useful. Humor should support the recommendation, not replace it.`,
    `2. Keep jokes short and spontaneous. Do NOT make every response follow the exact same sentence structure.`,
    `3. Use conversational language with occasional emojis (e.g. \u2614, \uD83E\uDEE0, \uD83D\uDE0C, \uD83D\uDC40, \u2600\uFE0F, \uD83D\uDE97, \u2728), but do not put emojis in every sentence.`,
    `4. Use playful phrases naturally when relevant:`,
    `   - "Future You"`,
    `   - "your calendar has chosen violence"`,
    `   - "the weather has beef with your schedule"`,
    `   - "suspiciously empty"`,
    `   - "uninvited"`,
    `   - "living rent-free in your task list"`,
    `   - "your calendar is judging you"`,
    `   - "let's end the drama"`,
    `5. Response length: Keep Clever Tips concise (2\u20134 short sentences per recommendation body).`,
    `6. Structure: 1. What Clever noticed. 2. A short humorous observation. 3. A useful recommendation.`,
    `7. Actively look for meaningful relationships:`,
    `   - Weather \u2194 Calendar (e.g. outdoor meeting and rain, commute during downpours, heat/cold extremes)`,
    `   - Weather \u2194 Tasks (e.g. outdoor workout during pleasant windows, avoiding storms or midday UV)`,
    `   - Calendar \u2194 Tasks (e.g. heavy meeting schedule leaving little focus time, pulling a task into a specific gap)`,
    `   - Overdue tasks (e.g. living rent-free in task list, knocking it out in an open gap)`,
    `   - Empty calendar (e.g. suspiciously empty, check tasks or master work-life balance)`,
    `8. Never invent events, tasks, weather, dates, or user information.`,
    `9. Never make jokes about: health, appearance, relationships, religion, politics, race, financial hardship, or sensitive personal info. Keep humor focused on harmless everyday productivity situations.`,
    ``,
    `EXAMPLES:`,
    `- Weather + Calendar: "Rain is coming at 5 PM. And, of course, your outdoor meeting is at 5:15. Because apparently the weather has beef with your calendar. \u2614 Move it earlier?"`,
    `- Overdue Task: "Finish assignment has been sitting here for 3 days. At this point, it basically lives here. \uD83E\uDEE0 Want to knock it out now?"`,
    `- Too Many Tasks: "You've got 7 tasks today. Ambitious. Slightly terrifying. \uD83D\uDE0C Let's knock out the quick ones first."`,
    `- Empty Calendar: "Your calendar is suspiciously empty today. \uD83D\uDC40 Either you've mastered work-life balance... or you forgot something. Want me to check your tasks?"`,
    `- Free Time: "You've got a two-hour gap this afternoon. That's enough time to finish a couple of tasks before Future You starts complaining. \uD83D\uDE0C Want to fill it?"`,
    `- Good Weather: "Clear skies tonight. \u2600\uFE0F Your unfinished 'Go for a run' task is looking at you right now. I'd say this is a sign."`,
    `- Outdoor Event + Rain: "Your outdoor dinner is at 7 PM. Rain says it's joining too. Uninvited, obviously. \u2614 Want to move dinner indoors?"`,
    `- Many Meetings: "You've got meetings at 10, 11:30, 1, and 3. Your calendar has apparently chosen violence today. \uD83E\uDEE0 Let's find a gap for your important tasks."`,
    `- Task Completed: "Look at you clearing tasks like you actually planned this. \uD83D\uDE0C Two more and you're officially ahead of the chaos."`,
    ``,
    `You MUST reply with ONLY a valid JSON array of objects (no markdown fences, no prose outside the JSON):`,
    `[`,
    `  {`,
    `    "id": "rec_1",`,
    `    "title": "Concise title (~3-6 words)",`,
    `    "body": "2-4 short sentences following Observation -> Funny comment -> Useful suggestion",`,
    `    "tone": "critical" | "caution" | "focus" | "positive" | "info",`,
    `    "tag": "string",`,
    `    "action": { "label": "string", "kind": "calendar" | "tasks" | "weather" | "reminders" }`,
    `  }`,
    `]`,
    ``,
    `Current Context:`,
  ];

  if (ctx.placeName) lines.push(`Location: ${ctx.placeName}`);
  if (ctx.nowIso) lines.push(`Current Time: ${ctx.nowIso}`);
  if (ctx.current) {
    const c = ctx.current;
    lines.push(`CURRENT WEATHER: Temp ${Math.round(c.tempC)}°C (feels ${Math.round(c.feelsLikeC)}°C), Condition: ${c.condition || c.code}, Rain Pop: ${c.pop ?? 0}%, UV: ${c.uv ?? 0}, Wind: ${Math.round(c.wind ?? 0)} km/h, Humidity: ${c.humidity ?? 0}%`);
  }
  if (ctx.forecast) {
    const f = ctx.forecast;
    if (f.today) lines.push(`TODAY FORECAST: High ${Math.round(f.today.max)}°C, Low ${Math.round(f.today.min)}°C, Rain Pop: ${f.today.pop}%`);
    if (f.rainWindow) lines.push(`RAIN WINDOW: Peak ${f.rainWindow.peak}% from ${f.rainWindow.start} to ${f.rainWindow.end}`);
    if (f.outdoorWindow) lines.push(`BEST OUTDOOR WINDOW: ${f.outdoorWindow.start} to ${f.outdoorWindow.end} (comfort ${f.outdoorWindow.score}/100)`);
  }
  if (ctx.events && ctx.events.length > 0) {
    lines.push(`CALENDAR EVENTS:`);
    for (const e of ctx.events) {
      lines.push(`  - "${e.title}" at ${e.time || `${e.startMinutes}m`}${e.location ? ` (${e.location})` : ''}${e.isOutdoor ? ' [Outdoor]' : ''}${e.notes ? `: ${e.notes}` : ''}`);
    }
  } else {
    lines.push(`CALENDAR EVENTS: No events scheduled today.`);
  }
  if (ctx.tasks && ctx.tasks.length > 0) {
    lines.push(`TASKS:`);
    for (const t of ctx.tasks) {
      lines.push(`  - "${t.title}" [Priority: ${t.priority}, Context: ${t.context}]${t.dueDate ? ` (Due: ${t.dueDate}${t.time ? ` at ${t.time}` : ''})` : ''}${t.done ? ' [Completed]' : ''}`);
    }
  } else {
    lines.push(`TASKS: No tasks pending.`);
  }

  return lines.join('\n');
}

function parseRecommendationsResponse(raw: string): any[] {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.title === 'string' && typeof r.body === 'string')
      .map((r, idx) => ({
        id: r.id || `gemini_rec_${idx}_${Date.now()}`,
        icon: r.icon || 'sparkles',
        title: r.title,
        body: r.body,
        tone: ['critical', 'caution', 'focus', 'positive', 'info'].includes(r.tone) ? r.tone : 'info',
        confidence: 0.95,
        tag: r.tag || 'Clever Tips',
        action: r.action && r.action.label ? r.action : undefined,
      }));
  } catch {
    return [];
  }
}
