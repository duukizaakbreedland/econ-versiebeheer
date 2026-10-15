# Database

Supabase-project: `econ-versiebeheer` (`nuayzeiewrrmhuqqumfb`, regio eu-central-1).

## Hoe de tabellen samenhangen

| Tabel | Betekenis |
|---|---|
| `organizations`, `environments` | Buva met TST, ACC en PROD |
| `models` | modellen en interfaces (`type`), met een vrije opmerking (`notes`) |
| `model_versions` | versies van een model, met `created_by` |
| `chains` | **een keten = een hoofdmodel** (`root_model_id`). De keten is alles wat vanaf dat hoofdmodel via de koppelingen bereikbaar is |
| `dependencies` | **de koppelingen (aanroepen)**: per omgeving roept ouderversie P via interfaceversie I versie C van submodel M aan. Sleutel `(environment_id, parent_version_id, child_model_id)`: één aanroep per ouderversie en submodel. `previous_child_version_id` onthoudt wat er stond vóór een registratie, zodat verwijderen daarop kan terugvallen |
| `environment_versions` | **aanwezigheid**: deze versie bestaat in deze omgeving. Voor een hoofdmodel is de laatst geactiveerde versie de actuele (`get_current_versions`); voor een submodel zegt de activering niets, want zijn versie in een keten is wat zijn ouder aanroept |
| `work_items` | wie werkt aan welke versie, met ticket en status |
| `deployment_logs` | een release: promotie naar een omgeving, met ticket, tester, `deployed_by`, en bij terugdraaien `rolled_back_at/by/reason` (de release blijft staan) |
| `deployment_log_versions` | welke versies de release activeerde (DEPLOYED) en verving (REPLACED), met `was_present` en `previous_activated_at` om exact terug te kunnen |
| `deployment_log_dependencies` | welke aanroepen de release omzette, met de oude waarden |
| `activity_log` | wie deed wat, wanneer: elke databasefunctie schrijft één regel; alleen-toevoegen |

`chain_nodes` en `chain_edges` zijn sinds migratie 013 niet meer in gebruik (de structuur volgt uit de koppelingen) en verdwijnen in 015.

## Schrijfacties: databasefuncties

Alles wat meer dan één rij raakt is een functie in `migrations/014_rpcs.sql`: één transactie, alles of niets, Nederlandse foutmelding, en een regel in `activity_log`.

| Functie | Doet |
|---|---|
| `register_version(model, versie, omgeving, consultant, ticket, omschrijving, inherit_from, callers)` | nieuwe versie + aanwezig in TST + kindaanroepen overnemen + ouders laten aanroepen + werk-item |
| `apply_release(omgeving, ticket, tester, notitie, versions, koppelingen)` | release: versies activeren, aanroepen omzetten, werkstatus door; weigert een lege release |
| `rollback_release(log, reden)` | alles terug zoals vóór de release; weigert als er een nieuwere release overheen ging of een aanroep sindsdien is gewijzigd |
| `delete_version(versie)` | weigert als de versie in een release zit, buiten TST staat of nog wordt aangeroepen zonder vorige versie |
| `set_dependency(targets, interface, interfaceversie, submodel, submodelversie)` / `remove_dependency(id)` | één aanroep vastleggen of weghalen |
| `get_snapshot(org)` | alles wat de app toont in één jsonb (omzeilt de limiet van 1000 rijen) |
| `get_current_versions(org)` | actuele versie per model en omgeving (laatste activering) |

Triggers: `dependencies_check` (integriteit van een koppeling, vult `child_model_id`), `dependencies_present` (elke versie in een koppeling is aanwezig in die omgeving, zonder ooit de actuele hoofdmodelversie te veranderen), `work_items_updated_at`.

## Migraties

Uitvoeren via de **Supabase CLI** (zie hieronder). Ze staan allemaal al op de live database.

| Bestand | Inhoud |
|---|---|
| `001_initial_schema.sql` | Basistabellen + Buva als eerste organisatie |
| `002_chains.sql` | Ketens: `chains`, `chain_nodes`, `chain_edges` |
| `003_functions.sql` | RPC `get_current_versions(p_org_id)` |
| `004_work_item_ticket.sql` | `work_items.ticket` |
| `005_dependencies_per_env.sql` | Koppelingen per omgeving |
| `006_backfill_dependencies.sql` | Eenmalige vulling van de koppelingen uit de ketenstructuur |
| `007_rls.sql` | Row Level Security op alle tabellen |
| `008_dependency_missing_flag.sql` | `dependencies.child_missing_in_export` |
| `009_model_opmerking.sql` | `models.notes` |
| `010_function_search_path.sql` | Vaste `search_path` voor `get_current_versions` |
| `011_deployment_log_dependencies.sql` | Aanroepen die een release omzette |
| `012_dependency_previous_child.sql` | `dependencies.previous_child_version_id` |
| `013_schema_ketens_koppelingen.sql` | Keten = hoofdmodel; strengere koppelingssleutel + triggers; aanwezigheid; historie voor terugdraaien; `activity_log`; indexen |
| `014_rpcs.sql` | De databasefuncties hierboven |
| `015_opruimen.sql` | `chain_nodes`, `chain_edges` en `model_versions.status` weg (pas na verificatie) |
| `seed.sql` | Minimale seed: organisatie en omgevingen |

## Supabase CLI

De CLI staat als devDependency in het project (`npx supabase`). Eenmalig per pc:

```bash
npx supabase login
npx supabase link --project-ref nuayzeiewrrmhuqqumfb
```

| Wat | Commando |
|---|---|
| Welke migraties staan lokaal en live | `npx supabase migration list --linked` |
| Nieuwe migraties doorvoeren | `npx supabase db push --linked --dry-run`, daarna zonder `--dry-run` |
| Losse query op live | `npx supabase db query --linked "select ..."` |
| Security- en performancecheck | `npx supabase db advisors --linked` |

## Werkafspraak

Elke schemawijziging krijgt een nieuw genummerd bestand in `migrations/` en gaat live met `db push`. Nooit rechtstreeks in de SQL-editor of via de MCP-tool `apply_migration`. Nummer met de hand door (`016_...sql`). Een functie wijzigen = `create or replace` in een nieuwe migratie.

## Beveiliging

Row Level Security staat aan op alle tabellen. Ingelogde gebruikers mogen alles (`activity_log` alleen lezen en toevoegen); met alleen de anon key krijg je nul rijen en worden schrijfacties en functies geweigerd.

Inloggen gaat met e-mailadres en wachtwoord. Openbare aanmelding staat uit; een nieuwe collega krijgt een account via het Supabase-dashboard (Authentication → Users).
