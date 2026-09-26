// OAuth Callback Route: handles Supabase / Google OAuth redirection
// GET /auth/callback or GET /api/auth/callback

import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  const { code, error, error_description } = req.query || {};

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.EXPO_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.EXPO_PUBLIC_APP_URL ||
    'http://localhost:3000';

  if (error) {
    const errorMsg = encodeURIComponent(error_description || error || 'Google login cancelled');
    return res.redirect(`${siteUrl}/?auth_error=${errorMsg}`);
  }

  if (code) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL;

    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          console.error('[OAuth Callback] Code exchange error:', exchangeErr);
          return res.redirect(`${siteUrl}/?auth_error=${encodeURIComponent(exchangeErr.message)}`);
        }
      } catch (err: any) {
        console.error('[OAuth Callback] Server error:', err);
      }
    }

    // Redirect to frontend passing code or directly to home
    return res.redirect(`${siteUrl}/?code=${encodeURIComponent(code)}`);
  }

  return res.redirect(siteUrl);
}
