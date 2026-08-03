-- ═══════════════════════════════════════════════════════════════════════════════
-- eCon Versiebeheer — database functies
-- Uitvoeren in: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Geeft de meest recente actieve versie per (model, omgeving)
-- Gebruikt DISTINCT ON om altijd de laatste activated_at te pakken
create or replace function get_current_versions(p_org_id uuid)
returns table(
  model_id         uuid,
  model_version_id uuid,
  env_name         text,
  version          text,
  activated_at     timestamptz
)
language sql stable as $$
  select distinct on (mv.model_id, e.name)
    mv.model_id,
    mv.id          as model_version_id,
    e.name         as env_name,
    mv.version,
    ev.activated_at
  from environment_versions ev
  join model_versions mv on mv.id = ev.model_version_id
  join environments   e  on e.id  = ev.environment_id
  where e.organization_id = p_org_id
  order by mv.model_id, e.name, ev.activated_at desc;
$$;
