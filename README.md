# eCon Versiebeheer

Welke versie van welk eCon-model draait in TST, ACC en PROD, en wie roept wat aan.
Vervangt een Excel met een tabblad per omgeving dat volledig handwerk was.

**Live:** https://duukizaakbreedland.github.io/econ-versiebeheer/

## Het idee in vijf zinnen

Een **keten** is een hoofdmodel uit eCon (Generic Model), met alles wat het aanroept.
Per omgeving draait het hoofdmodel op één versie; elk **submodel** eronder draait op
de versie die zijn **ouder aanroept**, via een **interface**. Hetzelfde submodel mag
door meerdere ouders en in meerdere ketens worden aangeroepen, ook op verschillende
versies tegelijk. Een nieuwe versie gaat altijd **Registreren in TST → Promoveren
naar ACC → Promoveren naar PROD**, elke stap met een ticket en terug te draaien.
Vóór elke actie zie je precies wat er verandert, ook in andere ketens.

Sinds 15-10-2026 is de tool leidend; een eCon-export is alleen nog een controle
(skill `econ-export-sync`).

## Wat het doet

- **Overzicht** — tegels, lopende zaken (werk in uitvoering, ketens klaar voor
  PROD), aandachtspunten (meerdere versies naast elkaar, versies die in eCon
  ontbreken, opmerkingen) en de recente activiteit
- **Ketens** — de keten als graph, afgeleid uit de aanroepen, met per model de
  versie in alle drie de omgevingen. Klik op een model voor het detailpaneel:
  waar draait het, acties, werk, aanroepen, waar gebruikt, releases, alle versies
- **Releases** — wat ging wanneer live, door wie, en terugdraaien met reden
- **Beheer** — ketens (hoofdmodel + naam) en modellen
- **?** — de uitleg, legenda en begrippenlijst

Het adres in de browser wijst naar de keten en het model (`#/ketens/<keten>/<model>`),
dus een link is door te sturen.

## Stack

React 18 + Vite + Tailwind, ReactFlow met dagre voor de graph, Supabase (Postgres +
Auth) als backend. Alle schrijfacties zijn databasefuncties (één transactie); de app
leest alles in één momentopname (`get_snapshot`). Zie [`supabase/`](supabase/).

## Lokaal draaien

```
npm install
cp .env.example .env    # vul de Supabase-gegevens in
npm run dev
```

## Deploy

Elke push naar `main` bouwt en publiceert via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). De Supabase-gegevens
komen uit de repository secrets `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`.

## Beveiliging

Inloggen met e-mailadres en wachtwoord. Row Level Security staat aan op alle tabellen:
zonder geldige sessie levert de publieke anon key nul rijen op. Die sleutel zit dus
bewust in de gebouwde JavaScript.

## Export controleren

`python tools/sync_export.py export/<datum>` vergelijkt een set eCon-exports met de
tool en rapporteert de verschillen; zie `.claude/skills/econ-export-sync/SKILL.md`.
