/* ═══════════════════════════════════════════════
   SUPABASE CLIENT — shared instance for all pages
   Replace the placeholders below with values from
   https://app.supabase.com → your project → Settings → API
   ═══════════════════════════════════════════════ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://crkqknjorcylefquoqyk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_x3JWCu6LLr6QcBTNGSZQjg_nF0vkb3G';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,  // needed for OAuth (Google) redirect flow
  },
});
