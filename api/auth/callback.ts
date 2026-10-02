// OAuth Callback Route: redirects to Expo web SPA callback handler
// In Supabase PKCE flow, the authorization code must be exchanged by the client
// browser holding the code_verifier, NOT on the server.

export default async function handler(req: any, res: any) {
  const { code, error, error_description } = req.query || {};

  const siteUrl = 'https://weatherwhattodo.netlify.app';

  const params = new URLSearchParams();
  if (code) params.set('code', String(code));
  if (error) params.set('error', String(error));
  if (error_description) params.set('error_description', String(error_description));

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  return res.redirect(`${siteUrl}/auth/callback${queryStr}`);
}
