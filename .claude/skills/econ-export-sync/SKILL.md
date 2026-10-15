---
name: econ-export-sync
description: Controleer de eCon-versiebeheer-tool (Supabase) tegen een eCon-export per omgeving (TST/ACC/PRD) en rapporteer de verschillen. Sinds 15-10-2026 wordt de tool handmatig bijgehouden en is een export alleen nog een check; doorvoeren alleen per verschil na akkoord. Gebruik zodra iemand modelexports (zips) en/of Generic Model-Excels aanlevert, of vraagt om "de tool te checken tegen eCon", "klopt de tool nog met eCon", "de exports te vergelijken".
---

# De versiebeheer-tool controleren tegen een eCon-export

**Sinds 15 oktober 2026 is de tool leidend.** Het team houdt versies, koppelingen en
releases handmatig bij; een export is alleen nog een controle. Dat betekent:

- Standaard **alleen vergelijken en rapporteren** (stap 1–4). Geen SQL draaien.
- Leg de verschillen voor als lijst: per verschil wat de tool zegt en wat eCon zegt.
  Een verschil kan betekenen dat de tool achterloopt, maar ook dat eCon nog moet worden
  aangepast; dat beslist de gebruiker.
- Pas na akkoord, en alleen voor de verschillen die de gebruiker aanwijst, iets doorvoeren
  (stap 5–7). Haal uit `sync.sql` alleen de regels die bij die verschillen horen; draai nooit
  de hele `sync.sql`, want die zet ook handmatige wijzigingen terug.

Hieronder de volledige werkwijze, zoals die gold toen exports nog de waarheid waren. Voor een
check zijn alleen de stappen tot en met 4 nodig.

Al het werk loopt via `tools/sync_export.py` en de Supabase CLI. Gebruik niet de
Supabase MCP voor het schrijven: de SQL is tientallen kB en gaat dan volledig door de
context.

## Invoer

Per omgeving twee bestanden; de omgeving staat in de bestandsnaam (`PRD`/`PROD`,
`ACC`, `TST`):

- een zip met alle modelexports (XML), bijv. `Export PRD 2.zip`
- een Generic Model-Excel met de actieve hoofdmodellen, bijv. `Generic Model_PRD.xlsx`
  (kolommen: naam | interface | actieve versie | omschrijving)

Vanuit elk hoofdmodel loopt het script de boom af via de `REFERENCES` in de XML. Ontbreekt
er een bestand, stop dan en vraag erom; het script weigert ook.

## Stappen

1. **Klaarzetten.** Kopieer de zes bestanden naar `export/<jjjj-mm-dd>/`. `export/` staat in
   `.gitignore` en dat moet zo blijven: de repo is openbaar en dit is klantdata.

2. **CLI-check.** `npx supabase migration list --linked` moet werken. Geeft dat een fout over
   een access token of een niet-gekoppeld project, dan moet de gebruiker zelf
   `npx supabase login` en `npx supabase link --project-ref nuayzeiewrrmhuqqumfb` draaien.

3. **Back-up.** Het gratis plan heeft geen back-up die je terug kunt zetten, dus maak er zelf een:
   ```bash
   B=export/backup/<jjjj-mm-dd>; mkdir -p $B; for t in organizations environments models model_versions environment_versions dependencies chains chain_nodes chain_edges work_items deployment_logs deployment_log_versions; do npx supabase db query --linked "select * from $t" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).rows;require('fs').writeFileSync(process.argv[1],JSON.stringify(r,null,1));console.log(process.argv[1], r.length)})" "$B/$t.json"; done
   ```

4. **Verschil bepalen.**
   ```bash
   python tools/sync_export.py export/<datum> --sql export/<datum>/sync.sql
   ```
   Lees het rapport kritisch en let vooral op:
   - **`! TERUG naar oudere versie`.** In eCon staat een oudere versie actief dan in de
     tool. Dat kan kloppen (bijv. een teruggedraaide versie), maar het kan ook betekenen
     dat er in de tool eerder iets onder het verkeerde model is geregistreerd. Noem het
     altijd apart. Kijk in de zips welke ouderversie het submodel aanroept, in alle
     omgevingen. Roept **dezelfde** ouderversie het submodel per omgeving op een andere
     versie aan, dan is die ouderversie in eCon zonder nieuw versienummer aangepast.
     Voorbeeld (okt 2026): Dorpelmodel 25.10.22 riep SubHefSchuifDorpelModel in TST aan
     op 25.10.22 en in ACC/PROD op 26.08.21. Volg de export, maar laat de gebruiker
     het in eCon nakijken.
     ```bash
     python -c "import sys; sys.path.insert(0,'tools'); from econ_naar_supabase import lees_zip; m,_=lees_zip(sys.argv[1]); d=m[(sys.argv[2],sys.argv[3])]; print([(l['submodel'],l['submodelversie']) for l in d['links']])" "export/<datum>/Export TST 2.zip" Dorpelmodel 25.10.22
     ```
   - **Promoties zonder werk-item of ticket.** Die zijn prima, maar de release krijgt dan geen ticket.
   - **"Actief in de tool, niet in de export" en ketens zonder hoofdmodel.** Het script
     ruimt die niet op. Vraag de gebruiker of ze weg mogen; zie "Opruimen" hieronder.
   - **Meldingen "wordt aangeroepen op X, Y"** zijn normaal: modellen die per keten een
     andere versie aanroepen. De koppelingen houden hun eigen versie.

5. **Droog testen tegen live.** Draai de SQL in een transactie die eindigt met `rollback`,
   met een telling erbij:
   ```bash
   D=export/<datum>; sed 's/^commit;$//' $D/sync.sql > $D/sync_test.sql
   echo "select (select count(*) from model_versions) mv, (select count(*) from dependencies) deps, (select count(*) from deployment_logs) logs; rollback;" >> $D/sync_test.sql
   npx supabase db query --linked -f $D/sync_test.sql
   ```
   De toename moet kloppen met het rapport. Elke promotie geeft één release met één
   DEPLOYED-regel, plus een REPLACED-regel als er al een versie stond. Verwijder
   `sync_test.sql` daarna weer.

6. **Doorvoeren.** `npx supabase db query --linked -f export/<datum>/sync.sql` draait als één
   transactie, met `begin`/`commit` in het bestand zelf. Vraag eerst akkoord als het rapport
   iets onverwachts bevat, zoals TERUG-gevallen of grote aantallen promoties.

7. **Controleren.** Draai stap 4 nogmaals zonder `--sql`. Er mogen geen promoties,
   registraties of koppelingsverschillen meer over zijn. Draai ook `npx supabase db advisors --linked`.

8. **Rapporteren** aan de gebruiker:
   - welke promoties er zijn gedaan (per omgeving: model, van, naar)
   - welke registraties en TERUG-gevallen er waren
   - welke werk-items van status zijn veranderd
   - wat alleen is gemeld en niet aangepast
   - waar de back-up staat

## Opruimen (alleen na akkoord van de gebruiker)

Ketens zonder hoofdmodel in de export zijn meestal oude testketens. Kijk eerst waar het
hoofdmodel nog aan hangt. Doe dit op één regel: een `db query` met een meerregelige
SQL-string als argument geeft geen resultaat. Gebruik voor langere SQL `-f`.

```bash
npx supabase db query --linked "select m.name, (select string_agg(c.key, ',') from chain_nodes n join chains c on c.id=n.chain_id where n.model_id=m.id) ketens, (select count(*) from work_items wi join model_versions mv on mv.id=wi.model_version_id where mv.model_id=m.id) wi, (select count(*) from deployment_log_versions d join model_versions mv on mv.id=d.model_version_id where mv.model_id=m.id) releases from models m where m.name in ('<Hoofdmodel>')"
```

Zit het hoofdmodel alleen in zijn eigen keten en heeft het geen werk-items en geen releases,
dan mogen keten en hoofdmodel samen weg. De cascade ruimt dan versies, actieve versies en
koppelingen op. Submodellen en interfaces die het met andere ketens deelt, blijven staan.

```sql
begin;
delete from chains where key in ('<ketenkey>');
delete from models where name in ('<Hoofdmodel>') and organization_id = (select id from organizations where slug = 'buva');
commit;
```

Heeft het wel werk-items of releases, verwijder dan alleen de keten en meld het model.
Draai daarna stap 4 nog eens: de lijsten "niet in de export" moeten leeg zijn.

## Wat het script doet (en niet doet)

| Situatie | Actie |
|---|---|
| Nieuw model, nieuwe interface, versie, keten, node of edge | toevoegen |
| Versie in de omgeving eronder al actief (in de tool of in de export) | promotie: release + activeren + werk-item `REVIEW` (ACC) of `DONE` (PROD) |
| Andere versie, niet eronder gezien | registratie: alleen activeren |
| Koppeling onder een actieve ouderversie wijkt af of ontbreekt | upsert vanuit de export |
| Koppeling onder een actieve ouderversie die de export niet kent | verwijderen |
| Koppelingen onder oude ouderversies | laten staan (historie) |
| Model, keten of node niet meer in de export | alleen melden |

Promoties volgen `promoteModel` in `src/lib/api.js`. Wijzigt die logica in de app, pas dan
`maak_sql` in `tools/sync_export.py` mee aan.
