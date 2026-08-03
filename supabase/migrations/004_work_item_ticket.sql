-- ═══════════════════════════════════════════════════════════════════════════════
-- 004 — work_items.ticket
-- Deze kolom is destijds rechtstreeks in de Supabase-editor toegevoegd en stond
-- daardoor niet in 001_initial_schema.sql. Hiermee lopen de bestanden weer gelijk
-- met de live database.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table work_items add column if not exists ticket text;
