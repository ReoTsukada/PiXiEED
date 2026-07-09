// Supabase client for maoitu (ranking)
// 環境を切り替える場合はURLとキーを書き換えてください。
export const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';

function getClientId() {
  try {
    const saved = localStorage.getItem('pixieed_client_id');
    if (saved) return saved;
    const id = crypto.randomUUID ? crypto.randomUUID() : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('pixieed_client_id', id);
    return id;
  } catch (_) {
    return `guest-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    headers: { 'x-client-id': getClientId() },
  },
});
