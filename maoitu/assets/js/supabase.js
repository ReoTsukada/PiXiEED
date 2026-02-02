// Supabase client for maoitu (ranking)
// 環境を切り替える場合はURLとキーを書き換えてください。
export const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
