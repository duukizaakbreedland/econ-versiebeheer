# Database

Supabase-project: `econ-versiebeheer` (`nuayzeiewrrmhuqqumfb`, regio eu-central-1).

## Migraties

Uitvoeren in volgorde via **Supabase Dashboard → SQL Editor**. Ze zijn allemaal al
toegepast op de live database; ze staan hier zodat het schema reproduceerbaar is.

| Bestand | Inhoud |
|---|---|
| `migrations/001_initial_schema.sql` | Basistabellen + Buva als eerste organisatie |
| `migrations/002_chains.sql` | Ketens: `chains`, `chain_nodes`, `chain_edges` |
| `migrations/003_functions.sql` | RPC `get_current_versions(p_org_id)` |
| `migrations/004_work_item_ticket.sql` | `work_items.ticket` (liep achter op live) |
| `migrations/005_dependencies_per_env.sql` | Koppelingen per omgeving: `environment_id` + `child_model_id` op `dependencies` |
| `migrations/006_backfill_dependencies.sql` | Eenmalige vulling van de koppelingen uit de bestaande ketenstructuur |
| `migrations/007_rls.sql` | Row Level Security op alle tabellen: ingelogde gebruikers mogen alles, bezoekers niets |
| `seed.sql` | Buva-data uit het oorspronkelijke Excel-overzicht |

## Koppelingen

`dependencies` is het hart van het versiebeheer: per omgeving legt het vast welke
**childversie** er via welke **interfaceversie** onder welke **parentversie** hangt.
Daardoor kan dezelfde parentversie in TST een ander submodel aanspreken dan in PROD.

De sleutel is `(environment_id, parent_version_id, interface_version_id, child_model_id)`:
onder één parentversie hangt via één interface precies één versie van hetzelfde
submodel, terwijl twee verschillende submodellen onder dezelfde interface wél mag.

Bijhouden gebeurt vanzelf — elke promotie kopieert de koppelingen van de bron- naar
de doelomgeving. Rijen van oude parentversies blijven staan maar tellen niet mee:
de graph kijkt alleen naar de versie die op dat moment in de omgeving actief is.

## Werkafspraak

Elke schemawijziging krijgt een nieuw genummerd bestand in `migrations/`. Nooit meer
rechtstreeks in de SQL-editor wijzigen zonder het bestand toe te voegen — daar liep
`work_items.ticket` op stuk.

## Beveiliging

Row Level Security staat **aan** op alle twaalf tabellen (migratie `007`). Elke tabel
heeft één policy: `for all to authenticated using (true) with check (true)`. Ingelogde
gebruikers mogen dus alles; met alleen de anon key krijg je nul rijen terug en worden
schrijfacties genegeerd.

Inloggen gaat via een magic link (Supabase Auth, e-mail zonder wachtwoord). Wil je
fijnmaziger rechten — bijvoorbeeld lezen voor iedereen en schrijven alleen voor
consultants — dan vervang je die ene policy per tabel door aparte policies voor
`select` en `insert/update/delete`.

**Zet openbare aanmelding uit** in het Supabase-dashboard zodra jij en je collega's
een account hebben (Authentication → Sign In / Providers → "Allow new users to sign
up"). Anders kan iedereen die de URL kent zichzelf een account aanmaken en daarmee
alles lezen en wijzigen.
