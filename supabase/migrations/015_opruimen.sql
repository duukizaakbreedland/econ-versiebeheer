-- ═══════════════════════════════════════════════════════════════════════════════
-- 015 — opruimen na de omslag naar "keten = hoofdmodel"
--
-- Sinds 013 volgt de structuur van een keten uit de koppelingen; chain_nodes en
-- chain_edges worden door niets meer gelezen (app noch sync-tool). Gecontroleerd
-- op 15-10-2026: de afgeleide graph is voor alle 16 ketens identiek aan de oude.
-- model_versions.status stond altijd op 'ACTIVE' en werd nergens gebruikt.
-- ═══════════════════════════════════════════════════════════════════════════════

drop table if exists chain_edges;
drop table if exists chain_nodes;

alter table model_versions drop column if exists status;
