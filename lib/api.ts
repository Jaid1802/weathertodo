// Backend API client for WeatherTodo

// Default Render backend URL (can be customized via settings or env)
export const DEFAULT_BACKEND_URL = 'https://weatherwhattodo-backend.onrender.com';

export interface BackendHealth {
  status: string;
  hasGeminiKey?: boolean;
  uptime?: number;
  timestamp?: string;
}

export async function checkBackendHealth(baseUrl = DEFAULT_BACKEND_URL): Promise<BackendHealth | null> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function askBackendAi(
  question: string,
  systemContext: string,
  apiKey?: string,
  baseUrl = DEFAULT_BACKEND_URL
): Promise<{ text: string; chips: string[]; live: boolean } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, systemContext, apiKey }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncUserData(
  userId: string,
  data: { tasks: any[]; events: any[]; settings: any },
  baseUrl = DEFAULT_BACKEND_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/sync/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
