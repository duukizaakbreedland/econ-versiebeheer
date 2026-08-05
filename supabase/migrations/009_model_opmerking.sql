-- ═══════════════════════════════════════════════════════════════════════════════
-- 009 — algemene opmerking bij een model
--
-- Vrije tekst kon tot nu toe alleen bij een versie (`model_versions.notes`), bij
-- een werk-item (`work_items.description`) of bij een release (`deployment_logs.notes`).
-- Wat ontbrak was een plek voor een opmerking die over het model als geheel gaat en
-- dus niet met een versie mee hoort te schuiven — bijvoorbeeld "dit model wordt
-- uitgefaseerd" of "prijsregels staan hier bewust hard gecodeerd".
--
-- Geldt ook voor interfaces: die staan in dezelfde tabel.
-- Geen extra RLS-policy nodig — 007 geeft `models` al `for all to authenticated`,
-- en dat is kolomonafhankelijk.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table models
  add column if not exists notes text;

comment on column models.notes is
  'Algemene opmerking bij het model, los van een versie.';
