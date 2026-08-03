-- ═══════════════════════════════════════════════════════════════════════════════
-- 005 — versie-specifieke koppelingen per omgeving
--
-- De tabel `dependencies` bestond al maar was leeg en omgevings-onafhankelijk.
-- Hij legt vast: onder welke parentversie hangt via welke interfaceversie welke
-- childversie. Door er een omgeving aan te hangen kan dezelfde parentversie in
-- TST een andere submodelversie aanspreken dan in PROD — precies het geval dat
-- in het Excel-overzicht altijd onzichtbaar bleef.
--
-- child_model_id is bewust redundant: zonder die kolom kun je niet afdwingen dat
-- er per (omgeving, parent, interface) precies één versie van hetzelfde submodel
-- hangt, terwijl twee verschillende submodellen onder dezelfde interface wél mag.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table dependencies
  add column if not exists environment_id uuid references environments(id) on delete cascade,
  add column if not exists child_model_id uuid references models(id) on delete cascade;

-- Tabel is leeg, dus not null kan direct
alter table dependencies alter column environment_id set not null;
alter table dependencies alter column child_model_id set not null;

alter table dependencies
  drop constraint if exists dependencies_parent_version_id_interface_version_id_child_v_key;

alter table dependencies
  add constraint dependencies_env_parent_iface_child_key
  unique (environment_id, parent_version_id, interface_version_id, child_model_id);

create index if not exists dependencies_env_idx    on dependencies (environment_id);
create index if not exists dependencies_parent_idx on dependencies (parent_version_id);
create index if not exists dependencies_child_idx  on dependencies (child_model_id);
