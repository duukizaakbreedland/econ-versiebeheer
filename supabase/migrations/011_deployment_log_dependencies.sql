-- ═══════════════════════════════════════════════════════════════════════════════
-- 011 — koppelingen die een release heeft omgezet
--
-- Een promotie zet niet alleen een versie actief, maar ook de aanroep om: in de
-- doelomgeving roept de ouder voortaan de gepromoveerde versie aan. Om dat bij
-- het terugdraaien te kunnen herstellen, legt de release per koppeling vast wat
-- er vóór stond. old_child_version_id = null betekent: de koppeling bestond nog
-- niet en gaat bij het terugdraaien weer weg. old_child_missing bewaart de
-- ontbreekt-vlag uit de export, die anders verloren zou gaan.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists deployment_log_dependencies (
  id                   uuid primary key default gen_random_uuid(),
  deployment_log_id    uuid not null references deployment_logs(id) on delete cascade,
  parent_version_id    uuid not null references model_versions(id) on delete cascade,
  interface_version_id uuid not null references model_versions(id) on delete cascade,
  child_model_id       uuid not null references models(id) on delete cascade,
  old_child_version_id uuid references model_versions(id) on delete cascade,
  old_child_missing    boolean not null default false,
  new_child_version_id uuid not null references model_versions(id) on delete cascade
);

create index if not exists deployment_log_dependencies_log_idx
  on deployment_log_dependencies (deployment_log_id);

-- Zelfde regel als de andere tabellen (zie 007): ingelogd mag alles, anoniem niets
alter table public.deployment_log_dependencies enable row level security;
drop policy if exists deployment_log_dependencies_authenticated_all on public.deployment_log_dependencies;
create policy deployment_log_dependencies_authenticated_all on public.deployment_log_dependencies
  for all to authenticated using (true) with check (true);
