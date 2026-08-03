-- ═══════════════════════════════════════════════════════════════════════════════
-- eCon Versiebeheer — schema uitbreiding v2
-- Uitvoeren in: Supabase Dashboard > SQL Editor
-- Vereiste: supabase-schema.sql is al uitgevoerd
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Keten definities ────────────────────────────────────────────────────────
-- Welke ketens (batch model chains) bestaan er per organisatie
create table if not exists chains (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null,    -- 'cilinder', 'profiel', etc.
  label           text not null,    -- 'CilinderSleutelregelsBatch'
  unique(organization_id, key)
);

-- ─── Keten nodes ─────────────────────────────────────────────────────────────
-- Welke modellen/interfaces zitten in een keten (topologie, versie-onafhankelijk)
create table if not exists chain_nodes (
  id        uuid primary key default gen_random_uuid(),
  chain_id  uuid not null references chains(id) on delete cascade,
  node_key  text not null,          -- lokale key binnen de keten: 'hm', 'i1', 'sm1', etc.
  model_id  uuid not null references models(id),
  unique(chain_id, node_key)
);

-- ─── Keten edges ─────────────────────────────────────────────────────────────
-- Richtings-relaties tussen nodes in een keten
create table if not exists chain_edges (
  id         uuid primary key default gen_random_uuid(),
  chain_id   uuid not null references chains(id) on delete cascade,
  source_key text not null,
  target_key text not null,
  unique(chain_id, source_key, target_key)
);
