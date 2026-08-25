// Vercel Serverless Function: Google OAuth Token Refresh
// POST /api/auth/google/refresh

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refresh_token } = req.body || {};

  if (!refresh_token) {
    return res.status(400).json({ error: 'Missing refresh_token parameter' });
  }

  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: 'Google OAuth credentials not configured on server (GOOGLE_WEB_CLIENT_ID / GOOGLE_WEB_CLIENT_SECRET missing)',
    });
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
      console.error('Google token refresh error:', tokenData);
      return res.status(tokenRes.status).json({
        error: tokenData.error_description || tokenData.error || 'Token refresh failed',
        details: tokenData,
      });
    }

    return res.status(200).json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
    });
  } catch (err: any) {
    console.error('Server error during token refresh:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
