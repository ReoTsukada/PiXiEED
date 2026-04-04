do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_projects;
  exception
    when duplicate_object then
      null;
  end;
end
$$;
