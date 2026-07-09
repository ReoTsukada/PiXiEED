alter table if exists public.scores
  add column if not exists avatar text;
