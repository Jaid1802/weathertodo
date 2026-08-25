// Vercel Serverless Function: Google OAuth Authorization Code Exchange
// POST /api/auth/google/callback

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, code_verifier, redirect_uri } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
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
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirect_uri || '',
    });

    if (code_verifier) {
      params.append('code_verifier', code_verifier);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Google token exchange error:', tokenData);
      return res.status(tokenRes.status).json({
        error: tokenData.error_description || tokenData.error || 'Token exchange failed',
        details: tokenData,
      });
    }

    // Fetch user profile info using the new access token
    let userProfile = null;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        userProfile = await userRes.json();
      }
    } catch (profileErr) {
      console.warn('Failed to fetch user profile:', profileErr);
    }

    return res.status(200).json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token || null,
      id_token: tokenData.id_token || null,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      user: userProfile
        ? {
            email: userProfile.email,
            name: userProfile.name,
            picture: userProfile.picture,
            sub: userProfile.sub,
          }
        : null,
    });
  } catch (err: any) {
    console.error('Server error during token exchange:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
