# eCon Versiebeheer

Versiebeheer voor CPQ-modellen. Houdt bij welke versie van welk model in welke
omgeving (TST / ACC / PROD) draait, welke submodellen daaronder hangen en op welke
versie die worden aangesproken — inclusief de historie van elke livegang.

Ontstaan als vervanging van een Excel-overzicht dat per omgeving een tabblad had en
volledig handwerk was.

**Live:** https://duukizaakbreedland.github.io/econ-versiebeheer/

## Wat het doet

- **Overzicht** — statuskaart per keten: stabiel, in ontwikkeling of klaar voor productie
- **Dependency Graph** — de keten visueel, met per model de versies in alle drie de
  omgevingen. Wat afwijkt van PROD krijgt kleur. Modellen die in meerdere ketens
  worden gebruikt zijn gemarkeerd, en draait er ergens hetzelfde submodel op twee
  verschillende versies tegelijk, dan verschijnt een waarschuwing
- **Detailpaneel** — versies registreren, promoveren (TST → ACC → PROD), lopend werk
  bijhouden, en per omgeving zien welke submodelversie via welke interfaceversie
  wordt aangesproken. Alles is achteraf te corrigeren
- **Release geschiedenis** — wat ging wanneer live, wat verving het, en een knop om
  een promotie terug te draaien
- **Beheer** — ketens, modellen en hun onderlinge verbindingen onderhouden

## Stack

React 18 + Vite + Tailwind, ReactFlow met dagre voor de graph, Supabase (Postgres +
Auth) als backend. Geen eigen server.

## Lokaal draaien

```
npm install
cp .env.example .env    # vul de Supabase-gegevens in
npm run dev
```

Het databaseschema en de migraties staan in [`supabase/`](supabase/) — zie de README
daar voor de volgorde en de beveiliging.

## Deploy

Elke push naar `main` bouwt en publiceert via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). De Supabase-gegevens
komen uit de repository secrets `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`.

## Beveiliging

Inloggen gaat via een magic link. Row Level Security staat aan op alle tabellen: zonder
geldige sessie levert de publieke anon key nul rijen op. Die sleutel zit dus bewust in
de gebouwde JavaScript — dat is waar hij voor bedoeld is.
