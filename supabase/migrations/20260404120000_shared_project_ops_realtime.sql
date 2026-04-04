do $$
begin
  begin
    alter publication supabase_realtime add table public.shared_project_ops;
  exception
    when duplicate_object then
      null;
  end;
end
$$;
