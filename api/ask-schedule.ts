// Vercel Serverless Function: Ask Schedule (Gemini AI)
// POST /api/ask-schedule

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

  const systemPrompt = buildSystemPrompt(context);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
      console.error('Gemini API error:', geminiRes.status, await geminiRes.text().catch(() => ''));
      return res.status(200).json({
        type: 'answer',
        text: "I couldn't reach Gemini just now.",
        chips: [],
        task: null,
        event: null,
        error: true,
      });
    }

    const geminiJson: any = await geminiRes.json();
    const rawText =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';

    const parsed = parseModelResponse(rawText);
    return res.status(200).json(parsed);
  } catch (err: any) {
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
}

function buildSystemPrompt(context: any): string {
  const ctx = context || {};
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

function parseModelResponse(raw: string): {
  type: string;
  text: string;
  chips: string[];
  task: any;
  event: any;
  error?: boolean;
} {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.type || typeof parsed.text !== 'string') {
      throw new Error('Missing required fields');
    }

    // Normalize
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
    // Fallback: return raw text trimmed
    return {
      type: 'answer',
      text: raw.trim().slice(0, 400),
      chips: [],
      task: null,
      event: null,
    };
  }
}
