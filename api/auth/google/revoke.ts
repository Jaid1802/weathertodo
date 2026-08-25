// Vercel Serverless Function: Google OAuth Token Revocation
// POST /api/auth/google/revoke

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

  const { token } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Missing token parameter' });
  }

  try {
    const revokeRes = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return res.status(200).json({ success: true, revoked: revokeRes.ok });
  } catch (err: any) {
    console.error('Server error during token revocation:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
