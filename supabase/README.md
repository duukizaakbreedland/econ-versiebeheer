# Database

Supabase-project: `econ-versiebeheer` (`nuayzeiewrrmhuqqumfb`, regio eu-central-1).

## Migraties

Uitvoeren via de **Supabase CLI** (zie hieronder). Ze zijn allemaal al toegepast op
de live database en staan ook zo in de migratiegeschiedenis
(`supabase_migrations.schema_migrations`).

| Bestand | Inhoud |
|---|---|
| `migrations/001_initial_schema.sql` | Basistabellen + Buva als eerste organisatie |
| `migrations/002_chains.sql` | Ketens: `chains`, `chain_nodes`, `chain_edges` |
| `migrations/003_functions.sql` | RPC `get_current_versions(p_org_id)` |
| `migrations/004_work_item_ticket.sql` | `work_items.ticket` (liep achter op live) |
| `migrations/005_dependencies_per_env.sql` | Koppelingen per omgeving: `environment_id` + `child_model_id` op `dependencies` |
| `migrations/006_backfill_dependencies.sql` | Eenmalige vulling van de koppelingen uit de bestaande ketenstructuur |
| `migrations/007_rls.sql` | Row Level Security op alle tabellen: ingelogde gebruikers mogen alles, bezoekers niets |
| `migrations/008_dependency_missing_flag.sql` | `dependencies.child_missing_in_export`: aangeroepen versie ontbrak in de export |
| `migrations/009_model_opmerking.sql` | `models.notes`: algemene opmerking bij een model, los van een versie |
| `migrations/010_function_search_path.sql` | Vaste `search_path` voor `get_current_versions` (adviseur-waarschuwing) |
| `seed.sql` | Buva-data uit het oorspronkelijke Excel-overzicht |

## Supabase CLI

De CLI staat als devDependency in het project (`npx supabase`). Eenmalig per pc:

```bash
npx supabase login
npx supabase link --project-ref nuayzeiewrrmhuqqumfb
```

Bij `link` mag je de vraag om het databasewachtwoord overslaan: alles hieronder loopt
via de Management API, zonder wachtwoord en zonder Docker.

| Wat | Commando |
|---|---|
| Welke migraties staan lokaal en live | `npx supabase migration list --linked` |
| Nieuwe migraties doorvoeren | `npx supabase db push --linked --dry-run`, daarna zonder `--dry-run` |
| Losse query op live | `npx supabase db query --linked "select ..."` |
| Security- en performancecheck | `npx supabase db advisors --linked` |

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

Elke schemawijziging krijgt een nieuw genummerd bestand in `migrations/` en gaat live
met `db push`. Nooit meer rechtstreeks in de SQL-editor wijzigen — daar liep
`work_items.ticket` op stuk, en de CLI weet dan niet dat de wijziging er al is.

Nummer met de hand door (`011_...sql`), niet met `supabase migration new`: dat maakt
een naam met een tijdstempel, en dan raakt de nummering door elkaar.

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
