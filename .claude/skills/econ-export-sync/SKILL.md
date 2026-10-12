---
name: econ-export-sync
description: Werk de eCon-versiebeheer-tool (Supabase) bij op basis van nieuwe eCon-exports per omgeving (TST/ACC/PRD), met promoties in plaats van overschrijven. Gebruik zodra iemand nieuwe modelexports (zips) en/of Generic Model-Excels aanlevert, of vraagt om "de versies in de tool gelijk te zetten met eCon", "de exports te verwerken", "versiebeheer bijwerken".
---

# eCon-exports verwerken in de versiebeheer-tool

De tool moet weergeven wat er werkelijk in eCon draait. Een export is daarbij de
waarheid; de tool houdt de historie (releases, opmerkingen, werk-items) bij. Daarom
wordt er nooit leeggemaakt of een versie hernoemd: alleen het verschil gaat erin, en
een versie die in de omgeving eronder al draaide wordt als **promotie** vastgelegd.

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
     altijd apart.
   - **Promoties zonder werk-item of ticket.** Die zijn prima, maar de release krijgt dan geen ticket.
   - **"Actief in de tool, niet in de export" en ketens zonder hoofdmodel.** Het script
     ruimt die niet op. Vraag de gebruiker of ze weg mogen; dat gaat via de app
     (verwijderen uit omgeving, keten verwijderen).
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
