-- ═══════════════════════════════════════════════════════════════════════════════
-- 008 — markeren dat een aangeroepen versie niet in de export voorkwam
--
-- Bij het inlezen van de eCon-exports blijkt dat sommige modellen verwijzen naar
-- een submodelversie die in de export van diezelfde omgeving niet bestaat.
-- Voorbeeld: RoostermodelEDI 25.10.29 roept in ACC zes submodellen aan op
-- versies uit 2022, terwijl daar alleen versies uit 2024 en 2025 van bestaan.
--
-- De koppeling wordt gewoon vastgelegd — hij staat immers zo in het model — maar
-- krijgt deze markering, zodat de app erop kan waarschuwen.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table dependencies
  add column if not exists child_missing_in_export boolean not null default false;

comment on column dependencies.child_missing_in_export is
  'De aangeroepen childversie kwam niet voor in de eCon-export van deze omgeving.';
