// Supabase client for PiXiEEDraw Lite contest
export const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.46.1/+esm';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
