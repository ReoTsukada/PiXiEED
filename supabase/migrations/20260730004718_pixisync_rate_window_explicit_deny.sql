-- This table is only touched by SECURITY DEFINER RPCs. Keep the deny rule
-- explicit so the database advisor and future maintainers cannot mistake it
-- for an accidentally policy-less exposed table.
create policy pixisync_rate_windows_client_deny on collab_v1.rate_windows
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
