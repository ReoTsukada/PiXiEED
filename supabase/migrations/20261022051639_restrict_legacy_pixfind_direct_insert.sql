-- Stop legacy clients from creating public puzzles by writing directly to the
-- table. Existing puzzle rows, reads, play, ownership repair, and service-side
-- administration remain available. New publication goes through the SNS
-- Function flow, which records and verifies current posting consent.
revoke insert on table public.pixfind_puzzles from public, anon, authenticated;

-- Remove the old permissive policies as well, so a later accidental table
-- grant does not silently restore the legacy public-write path.
drop policy if exists "Public insert pixfind puzzles" on public.pixfind_puzzles;
drop policy if exists pixfind_puzzles_insert on public.pixfind_puzzles;

-- Rollback guidance: restoring direct INSERT would re-enable publication
-- without the current consent receipt. Do not regrant it as an automatic
-- rollback; restore only through a separately reviewed, consent-compatible
-- publication boundary. This migration changes no rows, so there is no data
-- rollback to perform.
