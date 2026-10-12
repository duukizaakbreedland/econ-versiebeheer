"""Brengt de versiebeheer-tool in lijn met een nieuwe set eCon-exports, zonder de
bestaande historie weg te gooien.

Waar econ_naar_supabase.py alles leegmaakt en opnieuw laadt, vergelijkt dit script
de exports met de live database en voert alleen de verschillen door:

  - nieuwe modellen, interfaces, versies, ketens, keten-nodes en -edges komen erbij
  - staat een versie in een omgeving die er in de tool nog niet staat, dan
      * is het een PROMOTIE als die versie in de omgeving eronder al draait
        (TST -> ACC, ACC -> PROD; voor PROD ook TST). Dat gaat zoals in de app:
        een releaseregel met DEPLOYED/REPLACED, het ticket van het werk-item, en
        de status van dat werk-item schuift door (ACC -> REVIEW, PROD -> DONE);
      * anders een REGISTRATIE: de versie wordt actief gezet, zonder release.
    Versies worden nooit hernoemd; opmerkingen en werk-items blijven dus aan de
    juiste versie hangen.
  - koppelingen onder de actieve ouderversies worden gelijkgezet met de export;
    koppelingen onder oude ouderversies blijven als historie staan.

Niets wordt verwijderd behalve koppelingen die de export voor een actieve
ouderversie tegenspreekt. Modellen of keten-onderdelen die niet meer in de export
voorkomen worden alleen gemeld.

Invoer: één map met per omgeving een zip met modelexports en een Generic Model-
Excel met de actieve hoofdmodellen. De omgeving wordt uit de bestandsnaam gehaald
(PRD/PROD, ACC, TST), bijvoorbeeld "Export PRD 2.zip" en "Generic Model_PRD.xlsx".

Gebruik:
  python tools/sync_export.py export/2026-10-12                 alleen het verschil tonen
  python tools/sync_export.py export/2026-10-12 --sql sync.sql  ook de SQL wegschrijven

De SQL draait in één transactie:
  npx supabase db query --linked -f sync.sql
"""
import sys, os, re, json, glob, subprocess, tempfile, datetime
import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from econ_naar_supabase import lees_zip, verzamel, Dataset, slug, sorteersleutel, hoogste

OMGEVINGEN = ['TST', 'ACC', 'PROD']                      # volgorde van verwerken
BRONNEN    = {'ACC': ['TST'], 'PROD': ['ACC', 'TST']}    # waar een promotie vandaan komt
WI_STATUS  = {'ACC': ('REVIEW', ['IN_PROGRESS']), 'PROD': ('DONE', ['IN_PROGRESS', 'REVIEW'])}


# ─── Invoer ───────────────────────────────────────────────────────────────────
def omgeving_uit_naam(pad):
    naam = os.path.basename(pad).upper()
    for token, env in (('PROD', 'PROD'), ('PRD', 'PROD'), ('ACC', 'ACC'), ('TST', 'TST')):
        if re.search(rf'(^|[^A-Z]){token}([^A-Z]|$)', naam):
            return env
    return None


def zoek_invoer(map_in):
    zips, excels = {}, {}
    for pad in glob.glob(os.path.join(map_in, '*')):
        env = omgeving_uit_naam(pad)
        if not env:
            continue
        if pad.lower().endswith('.zip'):
            zips[env] = pad
        elif pad.lower().endswith('.xlsx'):
            excels[env] = pad
    ontbreekt = [f'{soort} {env}' for env in OMGEVINGEN
                 for soort, d in (('zip', zips), ('Excel', excels)) if env not in d]
    if ontbreekt:
        sys.exit(f'Ontbreekt in {map_in}: {", ".join(ontbreekt)}')
    return zips, excels


def lees_generic(pad):
    """Generic Model-export: kolommen naam | interface | actieve versie | omschrijving."""
    ws = openpyxl.load_workbook(pad, read_only=True, data_only=True).worksheets[0]
    rijen = []
    for naam, _iface, versie, oms in ws.iter_rows(min_row=2, max_col=4, values_only=True):
        if naam and versie:
            rijen.append({'naam': str(naam).strip(), 'versie': str(versie).strip(),
                          'groep': (oms or '').strip()})
    return rijen


def bouw_doel(map_in):
    zips, excels = zoek_invoer(map_in)
    ds, stats = Dataset(), {}
    for env in OMGEVINGEN:
        modellen, stuk = lees_zip(zips[env])
        for s in stuk:
            ds.meldingen.append(f'{env}: onleesbaar bestand {s}')
        roots = lees_generic(excels[env])
        verzamel(env, modellen, roots, ds)
        stats[env] = {'zip': os.path.basename(zips[env]), 'bestanden': len(modellen),
                      'hoofdmodellen': len(roots)}

    env_versie = {}
    for (env, naam), versies in ds.env_versies.items():
        env_versie[(env, naam)] = hoogste(versies)
        if len(versies) > 1:
            ds.meldingen.append(
                f'{env}: {naam} wordt aangeroepen op '
                f'{", ".join(sorted(versies, key=sorteersleutel))} -> {env_versie[(env, naam)]} actief')
    return ds, env_versie, stats


# ─── Live staat ───────────────────────────────────────────────────────────────
def db(sql):
    """Eén query tegen de gekoppelde database via de Supabase CLI."""
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write(sql)
    try:
        uit = subprocess.run(f'npx supabase db query --linked -f "{f.name}"', shell=True,
                             capture_output=True, text=True, encoding='utf-8')
    finally:
        os.unlink(f.name)
    if uit.returncode:
        sys.exit(f'Query mislukt:\n{uit.stderr or uit.stdout}')
    return json.loads(uit.stdout)['rows']


def lees_live():
    org = "(select id from organizations where slug = 'buva')"
    return {
        'models': {r['name']: r['type'] for r in db(
            f"select name, type from models where organization_id = {org}")},
        'versies': {(r['n'], r['v']) for r in db(
            f"select m.name n, mv.version v from model_versions mv "
            f"join models m on m.id = mv.model_id where m.organization_id = {org}")},
        'actief': {(r['env'], r['n']): r['v'] for r in db(
            f"select g.env_name env, m.name n, g.version v "
            f"from get_current_versions({org}) g join models m on m.id = g.model_id")},
        'deps': {(r['env'], r['pn'], r['pv'], r['inm'], r['iv'], r['cn']): (r['cv'], r['miss']) for r in db(
            "select e.name env, pm.name pn, pv.version pv, im.name inm, iv.version iv, "
            "cm.name cn, cv.version cv, d.child_missing_in_export miss "
            "from dependencies d join environments e on e.id = d.environment_id "
            "join model_versions pv on pv.id = d.parent_version_id join models pm on pm.id = pv.model_id "
            "join model_versions iv on iv.id = d.interface_version_id join models im on im.id = iv.model_id "
            "join model_versions cv on cv.id = d.child_version_id join models cm on cm.id = d.child_model_id")},
        'ketens': {r['key'] for r in db(f"select key from chains where organization_id = {org}")},
        'nodes': {(r['key'], r['node_key']) for r in db(
            "select c.key, n.node_key from chain_nodes n join chains c on c.id = n.chain_id")},
        'edges': {(r['key'], r['source_key'], r['target_key']) for r in db(
            "select c.key, e.source_key, e.target_key from chain_edges e join chains c on c.id = e.chain_id")},
    }


# ─── Verschil ─────────────────────────────────────────────────────────────────
def vergelijk(ds, env_versie, live):
    v = {}
    v['models'] = sorted((n, 'INTERFACE' if n in ds.interfaces else 'MODEL')
                         for n in ds.modelnamen if n not in live['models'])
    v['type_anders'] = sorted(n for n in ds.modelnamen if n in live['models']
                              and live['models'][n] != ('INTERFACE' if n in ds.interfaces else 'MODEL'))
    v['versies'] = sorted(ds.versies - live['versies'])

    doel_ketens = {slug(root): k for root, k in ds.ketens.items()}
    v['ketens'] = sorted((key, k['label']) for key, k in doel_ketens.items() if key not in live['ketens'])
    v['nodes'] = sorted((key, n) for key, k in doel_ketens.items() for n in k['nodes']
                        if (key, n) not in live['nodes'])
    v['edges'] = sorted((key, a, b) for key, k in doel_ketens.items() for a, b in k['edges']
                        if (key, a, b) not in live['edges'])
    v['nodes_weg'] = sorted((key, n) for key, n in live['nodes']
                            if key in doel_ketens and n not in doel_ketens[key]['nodes'])
    v['ketens_weg'] = sorted(key for key in live['ketens'] if key not in doel_ketens)

    # Versies per omgeving. Bronnen eerst, zodat "draait eronder al" ook de nieuwe
    # stand van de lagere omgeving meeneemt.
    v['promoties'], v['registraties'] = [], []
    for env in OMGEVINGEN:
        for (e, naam), doel in sorted(env_versie.items()):
            if e != env:
                continue
            nu = live['actief'].get((env, naam))
            if nu == doel:
                continue
            bron = next((b for b in BRONNEN.get(env, [])
                         if live['actief'].get((b, naam)) == doel or env_versie.get((b, naam)) == doel), None)
            rij = {'env': env, 'model': naam, 'van': nu, 'naar': doel, 'bron': bron,
                   'terug': nu is not None and sorteersleutel(doel) < sorteersleutel(nu)}
            (v['promoties'] if bron else v['registraties']).append(rij)
    v['niet_in_export'] = sorted((env, n, ver) for (env, n), ver in live['actief'].items()
                                 if (env, n) not in env_versie)

    # Koppelingen: alleen onder ouderversies die in de export echt zijn ingelezen
    ingelezen = {(env, n, ver) for (env, n), vs in ds.env_versies.items() for ver in vs
                 if (env, n, ver) not in ds.ontbreekt}
    doel_deps = {k: (cv, (k[0], k[5], cv) in ds.ontbreekt) for k, cv in ds.deps.items()}
    v['deps_nieuw'] = sorted((k, w) for k, w in doel_deps.items() if k not in live['deps'])
    v['deps_anders'] = sorted((k, w, live['deps'][k]) for k, w in doel_deps.items()
                              if k in live['deps'] and live['deps'][k] != w)
    v['deps_weg'] = sorted(k for k in live['deps']
                           if k not in doel_deps and (k[0], k[1], k[2]) in ingelezen)
    return v


# ─── SQL ──────────────────────────────────────────────────────────────────────
def t(w):
    return "'" + str(w).replace("'", "''") + "'"


def maak_sql(v, notitie):
    s = ['begin;', '',
         "-- Hulpjes, alleen binnen deze sessie",
         "create function pg_temp.org() returns uuid language sql stable as "
         "$$ select id from organizations where slug = 'buva' $$;",
         "create function pg_temp.env(n text) returns uuid language sql stable as "
         "$$ select id from environments where organization_id = pg_temp.org() and name = n $$;",
         "create function pg_temp.m(n text) returns uuid language sql stable as "
         "$$ select id from models where organization_id = pg_temp.org() and name = n $$;",
         "create function pg_temp.mv(n text, v text) returns uuid language sql stable as "
         "$$ select id from model_versions where model_id = pg_temp.m(n) and version = v $$;",
         "create function pg_temp.chain(k text) returns uuid language sql stable as "
         "$$ select id from chains where organization_id = pg_temp.org() and key = k $$;", '']

    if v['models']:
        s.append('-- Nieuwe modellen en interfaces')
        s += [f"insert into models (organization_id, name, type) values (pg_temp.org(), {t(n)}, {t(ty)});"
              for n, ty in v['models']]
    if v['versies']:
        s.append('\n-- Nieuwe versies')
        s += [f"insert into model_versions (model_id, version) values (pg_temp.m({t(n)}), {t(ver)});"
              for n, ver in v['versies']]
    if v['ketens'] or v['nodes'] or v['edges']:
        s.append('\n-- Ketens aanvullen')
        s += [f"insert into chains (organization_id, key, label) values (pg_temp.org(), {t(k)}, {t(l)});"
              for k, l in v['ketens']]
        s += [f"insert into chain_nodes (chain_id, node_key, model_id) values (pg_temp.chain({t(k)}), {t(n)}, pg_temp.m({t(n)}));"
              for k, n in v['nodes']]
        s += [f"insert into chain_edges (chain_id, source_key, target_key) values (pg_temp.chain({t(k)}), {t(a)}, {t(b)});"
              for k, a, b in v['edges']]

    def activeer(r):
        return (f"insert into environment_versions (environment_id, model_version_id, activated_at) "
                f"values (pg_temp.env({t(r['env'])}), pg_temp.mv({t(r['model'])}, {t(r['naar'])}), now()) "
                f"on conflict (environment_id, model_version_id) do update set activated_at = excluded.activated_at;")

    if v['promoties']:
        s.append('\n-- Promoties, zoals promoteModel in de app: release + activeren + werk-item door')
    for r in v['promoties']:
        nieuw = f"pg_temp.mv({t(r['model'])}, {t(r['naar'])})"
        s.append(f"-- {r['env']}: {r['model']} {r['van'] or '-'} -> {r['naar']} (uit {r['bron']})")
        vervangen = (f"\n  union all select id, pg_temp.mv({t(r['model'])}, {t(r['van'])}), 'REPLACED' from log"
                     if r['van'] else '')
        s.append(
            f"with log as (insert into deployment_logs (environment_id, ticket, notes) values ("
            f"pg_temp.env({t(r['env'])}), "
            f"(select ticket from work_items where model_version_id = {nieuw} and ticket is not null limit 1), "
            f"{t(notitie)}) returning id)\n"
            f"insert into deployment_log_versions (deployment_log_id, model_version_id, role)\n"
            f"  select id, {nieuw}, 'DEPLOYED' from log{vervangen};")
        s.append(activeer(r))
        status, van = WI_STATUS[r['env']]
        s.append(f"update work_items set status = {t(status)}, updated_at = now() "
                 f"where model_version_id = {nieuw} and status in ({', '.join(map(t, van))});")

    if v['registraties']:
        s.append('\n-- Registraties: versie actief zetten zonder release')
    for r in v['registraties']:
        s.append(f"-- {r['env']}: {r['model']} {r['van'] or '-'} -> {r['naar']}{' (TERUG)' if r['terug'] else ''}")
        s.append(activeer(r))

    def dep_sleutel(k):
        env, pn, pv, inm, iv, cn = k
        return (f"pg_temp.env({t(env)}), pg_temp.mv({t(pn)}, {t(pv)}), "
                f"pg_temp.mv({t(inm)}, {t(iv)}), pg_temp.m({t(cn)})")

    if v['deps_nieuw'] or v['deps_anders']:
        s.append('\n-- Koppelingen gelijkzetten met de export')
    for k, (cv, miss) in v['deps_nieuw'] + [(k, w) for k, w, _ in v['deps_anders']]:
        s.append(
            f"insert into dependencies (environment_id, parent_version_id, interface_version_id, child_model_id, "
            f"child_version_id, child_missing_in_export) values ({dep_sleutel(k)}, pg_temp.mv({t(k[5])}, {t(cv)}), "
            f"{'true' if miss else 'false'}) on conflict (environment_id, parent_version_id, interface_version_id, "
            f"child_model_id) do update set child_version_id = excluded.child_version_id, "
            f"child_missing_in_export = excluded.child_missing_in_export;")
    if v['deps_weg']:
        s.append('\n-- Koppelingen die de export niet meer kent, onder actieve ouderversies')
    for k in v['deps_weg']:
        s.append(f"delete from dependencies where (environment_id, parent_version_id, interface_version_id, "
                 f"child_model_id) = ({dep_sleutel(k)});")

    s += ['', 'commit;']
    return '\n'.join(s) + '\n'


# ─── Rapport ──────────────────────────────────────────────────────────────────
def rapport(ds, stats, v):
    print('=== Invoer')
    for env, st in stats.items():
        print(f"  {env:5} {st['zip']:22} {st['bestanden']:4} modelbestanden  {st['hoofdmodellen']:2} hoofdmodellen")

    def kop(titel, rijen):
        if rijen:
            print(f'\n=== {titel} ({len(rijen)})')
        return bool(rijen)

    if kop('Promoties', v['promoties']):
        for r in v['promoties']:
            print(f"  {r['env']:5} {r['model']:40} {r['van'] or '-':>10} -> {r['naar']:10} (uit {r['bron']})")
    if kop('Registraties', v['registraties']):
        for r in v['registraties']:
            print(f"  {r['env']:5} {r['model']:40} {r['van'] or '-':>10} -> {r['naar']:10}"
                  f"{'  ! TERUG naar oudere versie' if r['terug'] else ''}")
    if kop('Nieuwe modellen/interfaces', v['models']):
        for n, ty in v['models']:
            print(f'  {ty:9} {n}')
    if kop('Nieuwe versies', v['versies']):
        print('  ' + ', '.join(f'{n} {ver}' for n, ver in v['versies']))
    if kop('Nieuwe ketens', v['ketens']):
        for k, l in v['ketens']:
            print(f'  {l}')
    if kop('Nieuwe keten-nodes', v['nodes']):
        for k, n in v['nodes']:
            print(f'  {k}: {n}')
    kop('Nieuwe keten-edges', v['edges'])
    print(f"\n=== Koppelingen: {len(v['deps_nieuw'])} nieuw, {len(v['deps_anders'])} gewijzigd, "
          f"{len(v['deps_weg'])} weg")
    for k, (cv, miss), (oud, _) in v['deps_anders']:
        print(f'  {k[0]:5} {k[1]} {k[2]} -> {k[5]}: {oud} -> {cv}')

    print('\n--- Alleen gemeld, niet aangepast ---')
    if kop('Type wijkt af van de tool', v['type_anders']):
        print('  ' + ', '.join(v['type_anders']))
    if kop('Actief in de tool, niet in de export', v['niet_in_export']):
        for env, n, ver in v['niet_in_export']:
            print(f'  {env:5} {n} {ver}')
    if kop('Ketens in de tool zonder hoofdmodel in de export', v['ketens_weg']):
        print('  ' + ', '.join(v['ketens_weg']))
    if kop('Keten-nodes in de tool, niet meer in de export', v['nodes_weg']):
        for k, n in v['nodes_weg']:
            print(f'  {k}: {n}')
    if kop('Aangeroepen versies zonder exportbestand', sorted(ds.ontbreekt)):
        for env, n, ver in sorted(ds.ontbreekt):
            print(f'  {env:5} {n} {ver}')
    if kop('Meldingen bij het inlezen', list(dict.fromkeys(ds.meldingen))):
        for m in dict.fromkeys(ds.meldingen):
            print(f'  ! {m}')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    map_in = sys.argv[1]
    ds, env_versie, stats = bouw_doel(map_in)
    v = vergelijk(ds, env_versie, lees_live())
    rapport(ds, stats, v)

    if '--sql' in sys.argv:
        pad = sys.argv[sys.argv.index('--sql') + 1]
        notitie = f'Bijgewerkt uit eCon-export ({os.path.basename(os.path.normpath(map_in))})'
        with open(pad, 'w', encoding='utf-8') as f:
            f.write(maak_sql(v, notitie))
        print(f'\nSQL weggeschreven naar {pad} ({os.path.getsize(pad) / 1024:.1f} kB)')


if __name__ == '__main__':
    main()
