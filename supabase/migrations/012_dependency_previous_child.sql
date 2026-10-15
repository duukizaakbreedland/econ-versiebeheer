-- ═══════════════════════════════════════════════════════════════════════════════
-- 012 — vorige aangeroepen versie bij een koppeling
--
-- Registreer je in de tool een nieuwe versie, dan gaat de aanroep van de ouder
-- naar die versie. Verwijder je die versie daarna weer, dan nam de cascade de
-- hele koppeling mee: de ouder riep in die omgeving ineens niets meer aan. Met
-- de vorige versie erbij kan het verwijderen de aanroep terugzetten.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table dependencies
  add column if not exists previous_child_version_id uuid
    references model_versions(id) on delete set null;

comment on column dependencies.previous_child_version_id is
  'De versie die deze ouder aanriep vóór de laatste registratie in de tool; daarop valt de aanroep terug als die nieuwe versie wordt verwijderd.';
