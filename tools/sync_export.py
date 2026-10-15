"""Brengt de versiebeheer-tool in lijn met een nieuwe set eCon-exports, zonder de
bestaande historie weg te gooien.

Waar econ_naar_supabase.py alles leegmaakt en opnieuw laadt, vergelijkt dit script
de exports met de live database en voert alleen de verschillen door:

  - nieuwe modellen, interfaces, versies en ketens (hoofdmodellen) komen erbij
  - staat een HOOFDMODEL in een omgeving op een versie die er in de tool nog
    niet actief is, dan
      * is het een PROMOTIE als die versie in de omgeving eronder al draait
        (TST -> ACC, ACC -> PROD; voor PROD ook TST). Dat gaat zoals in de app:
        een releaseregel met DEPLOYED/REPLACED, het ticket van het werk-item, en
        de status van dat werk-item schuift door (ACC -> REVIEW, PROD -> DONE);
      * anders een REGISTRATIE: de versie wordt actief gezet, zonder release.
    Versies worden nooit hernoemd; opmerkingen en werk-items blijven dus aan de
    juiste versie hangen.
  - koppelingen onder de ingelezen ouderversies worden gelijkgezet met de export
    (submodelversies volgen daaruit); koppelingen onder oude ouderversies blijven
    als historie staan.
  - alles loopt via de databasefuncties van de app (apply_release, set_dependency,
    remove_dependency), dus het komt in het activiteitenlog en is terug te draaien.

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
    """De stand van de tool. Een keten is een hoofdmodel; de structuur eronder
    volgt uit de koppelingen, dus die wordt niet apart vergeleken."""
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
        # (env, ouder, ouderversie, submodel) -> (interface, interfaceversie, subversie, ontbreekt)
        'deps': {(r['env'], r['pn'], r['pv'], r['cn']): (r['inm'], r['iv'], r['cv'], r['miss']) for r in db(
            "select e.name env, pm.name pn, pv.version pv, im.name inm, iv.version iv, "
            "cm.name cn, cv.version cv, d.child_missing_in_export miss "
            "from dependencies d join environments e on e.id = d.environment_id "
            "join model_versions pv on pv.id = d.parent_version_id join models pm on pm.id = pv.model_id "
            "join model_versions iv on iv.id = d.interface_version_id join models im on im.id = iv.model_id "
            "join model_versions cv on cv.id = d.child_version_id join models cm on cm.id = d.child_model_id")},
        'ketens': {r['root']: r['key'] for r in db(
            f"select c.key, m.name root from chains c join models m on m.id = c.root_model_id "
            f"where c.organization_id = {org}")},
    }


# ─── Verschil ─────────────────────────────────────────────────────────────────
def vergelijk(ds, env_versie, live):
    v = {}
    v['models'] = sorted((n, 'INTERFACE' if n in ds.interfaces else 'MODEL')
                         for n in ds.modelnamen if n not in live['models'])
    v['type_anders'] = sorted(n for n in ds.modelnamen if n in live['models']
                              and live['models'][n] != ('INTERFACE' if n in ds.interfaces else 'MODEL'))
    v['versies'] = sorted(ds.versies - live['versies'])

    # Ketens: een hoofdmodel uit de Generic Model dat nog geen keten is
    hoofdmodellen = set(ds.ketens)
    v['ketens'] = sorted((slug(root), root) for root in hoofdmodellen if root not in live['ketens'])
    v['ketens_weg'] = sorted(key for root, key in live['ketens'].items() if root not in hoofdmodellen)

    # Versies per omgeving, alleen voor hoofdmodellen: een submodel draait op de
    # versie die zijn ouder aanroept, en dat zit in de koppelingen hieronder.
    v['promoties'], v['registraties'] = [], []
    for env in OMGEVINGEN:
        for (e, naam), doel in sorted(env_versie.items()):
            if e != env or naam not in hoofdmodellen:
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
                                 if n in live['ketens'] and (env, n) not in env_versie)

    # Koppelingen: alleen onder ouderversies die in de export echt zijn ingelezen
    ingelezen = {(env, n, ver) for (env, n), vs in ds.env_versies.items() for ver in vs
                 if (env, n, ver) not in ds.ontbreekt}
    doel_deps = {}
    for (env, pn, pv, inm, iv, cn), cv in ds.deps.items():
        doel_deps[(env, pn, pv, cn)] = (inm, iv, cv, (env, cn, cv) in ds.ontbreekt)
    v['deps_nieuw'] = sorted((k, w) for k, w in doel_deps.items() if k not in live['deps'])
    v['deps_anders'] = sorted((k, w, live['deps'][k]) for k, w in doel_deps.items()
                              if k in live['deps'] and live['deps'][k][:3] != w[:3])
    v['deps_weg'] = sorted(k for k in live['deps']
                           if k not in doel_deps and (k[0], k[1], k[2]) in ingelezen)
    return v


# ─── SQL ──────────────────────────────────────────────────────────────────────
# Alles loopt via dezelfde databasefuncties als de app (014_rpcs.sql), zodat een
# doorgevoerd verschil ook in het activiteitenlog staat en terug te draaien is.
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
         "$$ select id from model_versions where model_id = pg_temp.m(n) and version = v $$;", '']

    if v['models']:
        s.append('-- Nieuwe modellen en interfaces')
        s += [f"insert into models (organization_id, name, type) values (pg_temp.org(), {t(n)}, {t(ty)});"
              for n, ty in v['models']]
    if v['versies']:
        s.append('\n-- Nieuwe versies')
        s += [f"insert into model_versions (model_id, version, created_by) values (pg_temp.m({t(n)}), {t(ver)}, 'export-sync');"
              for n, ver in v['versies']]
    if v['ketens']:
        s.append('\n-- Nieuwe ketens (hoofdmodel uit de Generic Model)')
        s += [f"insert into chains (organization_id, key, label, root_model_id) values (pg_temp.org(), {t(k)}, {t(root)}, pg_temp.m({t(root)}));"
              for k, root in v['ketens']]

    if v['promoties']:
        s.append('\n-- Promoties van hoofdmodellen, via apply_release (release + activeren + werk-item door)')
    for r in v['promoties']:
        nieuw = f"pg_temp.mv({t(r['model'])}, {t(r['naar'])})"
        van = f"pg_temp.mv({t(r['model'])}, {t(r['van'])})" if r['van'] else 'null'
        s.append(f"-- {r['env']}: {r['model']} {r['van'] or '-'} -> {r['naar']} (uit {r['bron']})")
        s.append(
            f"select apply_release(pg_temp.env({t(r['env'])}), "
            f"coalesce((select ticket from work_items where model_version_id = {nieuw} and ticket is not null limit 1), 'export-sync'), "
            f"'export-sync', {t(notitie)}, "
            f"jsonb_build_array(jsonb_build_object('naar', {nieuw}, 'van', {van})), '[]'::jsonb);")

    if v['registraties']:
        s.append('\n-- Registraties van hoofdmodellen: versie actief zetten zonder release')
    for r in v['registraties']:
        s.append(f"-- {r['env']}: {r['model']} {r['van'] or '-'} -> {r['naar']}{' (TERUG)' if r['terug'] else ''}")
        s.append(f"insert into environment_versions (environment_id, model_version_id, activated_at) "
                 f"values (pg_temp.env({t(r['env'])}), pg_temp.mv({t(r['model'])}, {t(r['naar'])}), now()) "
                 f"on conflict (environment_id, model_version_id) do update set activated_at = excluded.activated_at;")

    if v['deps_nieuw'] or v['deps_anders']:
        s.append('\n-- Koppelingen gelijkzetten met de export, via set_dependency')
    for k, (inm, iv, cv, miss) in v['deps_nieuw'] + [(k, w) for k, w, _ in v['deps_anders']]:
        env, pn, pv, cn = k
        s.append(
            f"select set_dependency(jsonb_build_array(jsonb_build_object('env_id', pg_temp.env({t(env)}), "
            f"'parent_version_id', pg_temp.mv({t(pn)}, {t(pv)}))), pg_temp.m({t(inm)}), {t(iv)}, pg_temp.m({t(cn)}), {t(cv)});")
        if miss:
            s.append(f"update dependencies set child_missing_in_export = true where environment_id = pg_temp.env({t(env)}) "
                     f"and parent_version_id = pg_temp.mv({t(pn)}, {t(pv)}) and child_model_id = pg_temp.m({t(cn)});")
    if v['deps_weg']:
        s.append('\n-- Koppelingen die de export niet meer kent, onder ingelezen ouderversies')
    for env, pn, pv, cn in v['deps_weg']:
        s.append(f"select remove_dependency(id) from dependencies where environment_id = pg_temp.env({t(env)}) "
                 f"and parent_version_id = pg_temp.mv({t(pn)}, {t(pv)}) and child_model_id = pg_temp.m({t(cn)});")

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
    if kop('Nieuwe ketens (hoofdmodel zonder keten)', v['ketens']):
        for k, root in v['ketens']:
            print(f'  {root}')
    print(f"\n=== Koppelingen: {len(v['deps_nieuw'])} nieuw, {len(v['deps_anders'])} gewijzigd, "
          f"{len(v['deps_weg'])} weg")
    for k, (inm, iv, cv, miss), (oinm, oiv, ocv, _) in v['deps_anders']:
        print(f'  {k[0]:5} {k[1]} {k[2]} -> {k[3]}: {ocv} via {oinm} {oiv} -> {cv} via {inm} {iv}')
    for k, (inm, iv, cv, miss) in v['deps_nieuw']:
        print(f'  {k[0]:5} {k[1]} {k[2]} -> {k[3]}: nieuw {cv} via {inm} {iv}')
    for k in v['deps_weg']:
        print(f'  {k[0]:5} {k[1]} {k[2]} -> {k[3]}: weg')

    print('\n--- Alleen gemeld, niet aangepast ---')
    if kop('Type wijkt af van de tool', v['type_anders']):
        print('  ' + ', '.join(v['type_anders']))
    if kop('Actief in de tool, niet in de export', v['niet_in_export']):
        for env, n, ver in v['niet_in_export']:
            print(f'  {env:5} {n} {ver}')
    if kop('Ketens in de tool zonder hoofdmodel in de Generic Model', v['ketens_weg']):
        print('  ' + ', '.join(v['ketens_weg']))
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
