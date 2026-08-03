-- eCon Versiebeheer - Supabase schema
-- Uitvoeren in: Supabase Dashboard > SQL Editor

-- Organisaties (klanten)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz default now()
);

-- Omgevingen per organisatie (TST / ACC / PROD)
create table environments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,          -- 'TST', 'ACC', 'PROD'
  display_order int not null,  -- 1=PROD (boven), 2=ACC, 3=TST (onder)
  unique(organization_id, name)
);

-- Abstracte modellen (alleen naam + type)
create table models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('MODEL', 'INTERFACE')),
  unique(organization_id, name)
);

-- Concrete versies van modellen
create table model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  version text not null,       -- bijv. '25.09.17'
  status text not null default 'ACTIVE' check (status in ('IN_DEVELOPMENT', 'ACTIVE', 'DEPRECATED')),
  notes text,
  created_at timestamptz default now(),
  unique(model_id, version)
);

-- Relaties tussen versies: parent -> interface -> child
-- Dit is de edge in de DAG
create table dependencies (
  id uuid primary key default gen_random_uuid(),
  parent_version_id uuid not null references model_versions(id) on delete cascade,
  interface_version_id uuid not null references model_versions(id) on delete cascade,
  child_version_id uuid not null references model_versions(id) on delete cascade,
  created_at timestamptz default now(),
  unique(parent_version_id, interface_version_id, child_version_id)
);

-- Welke versies zijn actief per omgeving
create table environment_versions (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references environments(id) on delete cascade,
  model_version_id uuid not null references model_versions(id) on delete cascade,
  activated_at timestamptz default now(),
  unique(environment_id, model_version_id)
);

-- Wie werkt aan welke versie (de "branch")
create table work_items (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references model_versions(id) on delete cascade,
  consultant text not null,
  description text,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'REVIEW', 'DONE')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Livegang-log (deployment historie)
create table deployment_logs (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references environments(id) on delete cascade,
  deployed_at timestamptz default now(),
  ticket text,
  tested_by text,
  notes text
);

-- Welke versies gingen mee in een deployment (nieuw + vervangen)
create table deployment_log_versions (
  id uuid primary key default gen_random_uuid(),
  deployment_log_id uuid not null references deployment_logs(id) on delete cascade,
  model_version_id uuid not null references model_versions(id) on delete cascade,
  role text not null check (role in ('DEPLOYED', 'REPLACED'))
);

-- ─── Seed: Buva als eerste organisatie ───────────────────────────────────────
insert into organizations (name, slug) values ('Buva', 'buva');

insert into environments (organization_id, name, display_order)
select id, 'PROD', 1 from organizations where slug = 'buva'
union all
select id, 'ACC',  2 from organizations where slug = 'buva'
union all
select id, 'TST',  3 from organizations where slug = 'buva';
