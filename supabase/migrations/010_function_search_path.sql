-- ═══════════════════════════════════════════════════════════════════════════════
-- 010 — vaste search_path voor get_current_versions
--
-- De Supabase-adviseur (lint 0011_function_search_path_mutable) waarschuwt dat de
-- functie de search_path van de aanroeper overneemt. Dan zou een gelijknamige tabel
-- in een ander schema de echte tabellen kunnen overschaduwen. Met een vaste
-- search_path zoekt de functie altijd alleen in `public`.
--
-- Alleen een instelling op de functie; de body en het resultaat blijven gelijk.
-- ═══════════════════════════════════════════════════════════════════════════════

alter function public.get_current_versions(uuid) set search_path = public;
