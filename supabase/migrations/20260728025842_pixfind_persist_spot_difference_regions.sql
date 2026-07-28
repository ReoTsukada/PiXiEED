-- Preserve creator-approved difference bounds so player-side analysis cannot
-- change the published number of findings.
alter table public.pixfind_puzzles
  add column if not exists regions jsonb;
