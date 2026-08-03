-- ═══════════════════════════════════════════════════════════════════════════════
-- 007 — Row Level Security
--
-- De anon key uit .env komt in de gebouwde JavaScript terecht en is dus openbaar.
-- Zonder RLS kan iedereen met die sleutel alles lezen en wijzigen. Hierna geldt:
-- ingelogde gebruikers mogen alles, niet-ingelogde bezoekers niets.
--
-- Let op: RLS aanzetten zonder policies zet alles op slot. Beide moeten in één
-- keer, anders werkt de app ook lokaal niet meer.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'environments', 'models', 'model_versions', 'dependencies',
    'environment_versions', 'work_items', 'deployment_logs', 'deployment_log_versions',
    'chains', 'chain_nodes', 'chain_edges'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
