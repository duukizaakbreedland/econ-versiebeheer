"""Leest de eCon-exports per omgeving en bouwt daaruit de complete dataset voor de
versiebeheer-tool: ketens, modellen, interfaces, versies per omgeving en de
versie-specifieke koppelingen.

Bron:
  export/Versies Hoofdmodellen per omgeving.xlsx   tabs PRD / ACC / TST met de
                                                   actieve hoofdmodellen per omgeving
  export/Export Prod.zip, Export ACC.zip, Export TST.zip
                                                   alle modelexports (XML) per omgeving

De zips worden in het geheugen gelezen; er wordt niets uitgepakt.

Gebruik:
  python tools/econ_naar_supabase.py --dry-run          alleen tonen wat eruit komt
  python tools/econ_naar_supabase.py --sql import.sql   SQL wegschrijven
"""
import sys, os, re, json, zipfile
import xml.etree.ElementTree as ET
import openpyxl

HIER   = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.join(os.path.dirname(HIER), 'export')

ZIPS = {'PROD': 'Export Prod.zip', 'ACC': 'Export ACC.zip', 'TST': 'Export TST.zip'}
TABS = {'PROD': 'PRD', 'ACC': 'ACC', 'TST': 'TST'}
EXCEL = 'Versies Hoofdmodellen per omgeving.xlsx'


# ─── Inlezen ──────────────────────────────────────────────────────────────────
def parse_model(data):
    """Eén modelexport. Geeft None terug als het geen modelbestand is."""
    root = ET.fromstring(data)
    if root.tag != 'CLASS' or not root.get('XSLDATASOURCE'):
        return None

    links = []
    for ref in root.findall('./REFERENCES/REFERENCE'):
        iface = ref.get('INTERFACE')
        if not iface:
            continue
        for kind in ref.findall('./CLASS'):
            if kind.get('INCLUDE'):
                links.append({
                    'interface':       iface,
                    'interfaceversie': ref.get('VERSION'),
                    'submodel':        kind.get('INCLUDE'),
                    'submodelversie':  kind.get('VERSION'),
                })
                break                       # één submodel per referentie
    return {
        'naam':   root.get('XSLDATASOURCE'),
        'versie': root.get('VERSION'),
        'links':  links,
    }


def lees_zip(pad):
    modellen, stuk = {}, []
    with zipfile.ZipFile(pad) as z:
        for naam in z.namelist():
            if not naam.lower().endswith('.xml'):
                continue
            try:
                m = parse_model(z.read(naam))
                if m:
                    modellen[(m['naam'], m['versie'])] = m
            except Exception as e:
                stuk.append(f'{naam}: {e}')
    return modellen, stuk


def lees_hoofdmodellen():
    wb = openpyxl.load_workbook(os.path.join(EXPORT, EXCEL), data_only=True)
    per_env = {}
    for env, tab in TABS.items():
        rijen = []
        for naam, iface, versie, oms in wb[tab].iter_rows(min_row=2, values_only=True):
            if naam and versie:
                rijen.append({'naam': str(naam).strip(),
                              'versie': str(versie).strip(),
                              'groep': (oms or '').strip()})
        per_env[env] = rijen
    return per_env


# ─── Hulpjes ──────────────────────────────────────────────────────────────────
def slug(naam):
    s = re.sub(r'[^a-z0-9]+', '_', naam.lower()).strip('_')
    return s or 'x'


def sql_tekst(w):
    return "'" + str(w).replace("'", "''") + "'"


def sorteersleutel(versie):
    """Versienummers zijn jj.mm.dd, soms met een suffix: 25.05.07HF, 21.11.30a.
       Sorteer op de datum en pas daarna op het suffix; alles wat niet met een
       datum begint komt achteraan."""
    m = re.match(r'^(\d{2})\.(\d{2})\.(\d{2})(.*)$', versie or '')
    if m:
        return (1, m.group(1), m.group(2), m.group(3), m.group(4))
    return (0, '', '', '', versie or '')


def hoogste(versies):
    return sorted(versies, key=sorteersleutel)[-1]


# ─── Verzamelen ───────────────────────────────────────────────────────────────
class Dataset:
    def __init__(self):
        self.interfaces   = set()                 # namen die als interface worden gebruikt
        self.modelnamen   = set()
        self.versies      = set()                 # (naam, versie)
        self.ketens       = {}                    # rootnaam -> {'label','nodes':set,'edges':set}
        self.env_versies  = {}                    # (env, naam) -> set(versies)
        self.deps         = {}                    # (env,pn,pv,in,iv,cn) -> cv
        self.meldingen    = []
        self.ontbreekt    = set()

    def keten(self, root):
        return self.ketens.setdefault(root, {'label': root, 'nodes': set(), 'edges': set()})


def verzamel(env, modellen, roots, ds):
    """Loopt per hoofdmodel de boom af en vult de dataset."""
    for r in roots:
        keten = ds.keten(r['naam'])
        gezien = set()

        def loop(naam, versie):
            ds.modelnamen.add(naam)
            ds.versies.add((naam, versie))
            ds.env_versies.setdefault((env, naam), set()).add(versie)
            keten['nodes'].add(naam)

            if (naam, versie) in gezien:
                return
            gezien.add((naam, versie))

            m = modellen.get((naam, versie))
            if m is None:
                ds.ontbreekt.add((env, naam, versie))
                return

            for l in m['links']:
                iface, ifv = l['interface'], l['interfaceversie']
                sub,   sv  = l['submodel'],  l['submodelversie']

                ds.interfaces.add(iface)
                ds.modelnamen.add(iface)
                ds.versies.add((iface, ifv))
                ds.env_versies.setdefault((env, iface), set()).add(ifv)

                keten['nodes'].add(iface)
                keten['edges'].add((naam, iface))
                keten['edges'].add((iface, sub))

                sleutel = (env, naam, versie, iface, ifv, sub)
                if sleutel in ds.deps and ds.deps[sleutel] != sv:
                    ds.meldingen.append(
                        f'{env}: {naam} {versie} verwijst via {iface} {ifv} naar {sub} '
                        f'op zowel {ds.deps[sleutel]} als {sv} — eerste aangehouden')
                else:
                    ds.deps[sleutel] = sv

                loop(sub, sv)

        if (r['naam'], r['versie']) not in modellen:
            ds.meldingen.append(f'{env}: hoofdmodel {r["naam"]} {r["versie"]} niet in de export')
        loop(r['naam'], r['versie'])


def bouw():
    hoofdmodellen = lees_hoofdmodellen()
    ds = Dataset()
    per_env_stats = {}

    for env, zipnaam in ZIPS.items():
        modellen, stuk = lees_zip(os.path.join(EXPORT, zipnaam))
        for s in stuk:
            ds.meldingen.append(f'{env}: onleesbaar bestand {s}')
        voor = len(ds.deps)
        verzamel(env, modellen, hoofdmodellen[env], ds)
        per_env_stats[env] = {
            'exportbestanden': len(modellen),
            'hoofdmodellen':   len(hoofdmodellen[env]),
            'koppelingen':     len(ds.deps) - voor,
            'modellen':        len({n for (e, n) in ds.env_versies if e == env}),
        }

    # Eén actieve versie per model per omgeving; bij meerdere de hoogste
    env_versie = {}
    for (env, naam), versies in ds.env_versies.items():
        if len(versies) > 1:
            gekozen = hoogste(versies)
            ds.meldingen.append(
                f'{env}: {naam} wordt aangeroepen op '
                f'{", ".join(sorted(versies, key=sorteersleutel))} -> '
                f'{gekozen} als actieve versie (de koppelingen houden hun eigen versie)')
        else:
            gekozen = next(iter(versies))
        env_versie[(env, naam)] = gekozen

    return ds, env_versie, per_env_stats


# ─── SQL ──────────────────────────────────────────────────────────────────────
# Elke tabel krijgt één statement met de rijen als regels in een tekstblok
# ("a|b|c"), dat Postgres zelf uit elkaar trekt. Dat is fors compacter dan een
# VALUES-lijst met aanhalingstekens per veld.
def blok(regels):
    return "$D$\n" + "\n".join(regels) + "\n$D$"


def deel(n):
    return f"split_part(r, '|', {n})"


def maak_sql(ds, env_versie):
    stukken = {}

    stukken['00_leegmaken'] = "\n".join(
        f'delete from {t};' for t in [
            'deployment_log_versions', 'deployment_logs', 'work_items', 'dependencies',
            'environment_versions', 'chain_edges', 'chain_nodes', 'chains',
            'model_versions', 'models'])

    stukken['01_models'] = f"""insert into models (organization_id, name, type)
select o.id, {deel(1)}, {deel(2)}
from organizations o, unnest(string_to_array({blok(
    f"{n}|{'INTERFACE' if n in ds.interfaces else 'MODEL'}" for n in sorted(ds.modelnamen))}, E'\n')) as r
where o.slug = 'buva' and r <> '';"""

    stukken['02_model_versions'] = f"""insert into model_versions (model_id, version)
select m.id, {deel(2)}
from unnest(string_to_array({blok(f'{n}|{v}' for n, v in sorted(ds.versies))}, E'\n')) as r
join models m on m.name = {deel(1)}
where r <> '';"""

    stukken['03_chains'] = f"""insert into chains (organization_id, key, label)
select o.id, {deel(1)}, {deel(2)}
from organizations o, unnest(string_to_array({blok(
    f'{slug(root)}|{k["label"]}' for root, k in sorted(ds.ketens.items()))}, E'\n')) as r
where o.slug = 'buva' and r <> '';"""

    nodes = [f'{slug(root)}|{naam}'
             for root, k in sorted(ds.ketens.items()) for naam in sorted(k['nodes'])]
    stukken['04_chain_nodes'] = f"""insert into chain_nodes (chain_id, node_key, model_id)
select c.id, {deel(2)}, m.id
from unnest(string_to_array({blok(nodes)}, E'\n')) as r
join chains c on c.key = {deel(1)}
join models m on m.name = {deel(2)}
where r <> '';"""

    edges = [f'{slug(root)}|{a}|{b}'
             for root, k in sorted(ds.ketens.items()) for a, b in sorted(k['edges'])]
    stukken['05_chain_edges'] = f"""insert into chain_edges (chain_id, source_key, target_key)
select c.id, {deel(2)}, {deel(3)}
from unnest(string_to_array({blok(edges)}, E'\n')) as r
join chains c on c.key = {deel(1)}
where r <> '';"""

    ev = [f'{env}|{naam}|{ver}' for (env, naam), ver in sorted(env_versie.items())]
    stukken['06_environment_versions'] = f"""insert into environment_versions (environment_id, model_version_id)
select e.id, mv.id
from unnest(string_to_array({blok(ev)}, E'\n')) as r
join environments e on e.name = {deel(1)}
join models m on m.name = {deel(2)}
join model_versions mv on mv.model_id = m.id and mv.version = {deel(3)}
where r <> '';"""

    deps = [f'{env}|{pn}|{pver}|{iname}|{iver}|{cn}|{cver}|'
            f'{"t" if (env, cn, cver) in ds.ontbreekt else "f"}'
            for (env, pn, pver, iname, iver, cn), cver in sorted(ds.deps.items())]
    stukken['07_dependencies'] = f"""insert into dependencies (environment_id, parent_version_id,
       interface_version_id, child_version_id, child_model_id, child_missing_in_export)
select e.id, pv.id, iv.id, cv.id, cm.id, {deel(8)} = 't'
from unnest(string_to_array({blok(deps)}, E'\n')) as r
join environments e on e.name = {deel(1)}
join models pm on pm.name = {deel(2)}
join model_versions pv on pv.model_id = pm.id and pv.version = {deel(3)}
join models im on im.name = {deel(4)}
join model_versions iv on iv.model_id = im.id and iv.version = {deel(5)}
join models cm on cm.name = {deel(6)}
join model_versions cv on cv.model_id = cm.id and cv.version = {deel(7)}
where r <> '';"""

    return stukken


# ─── Rapport ──────────────────────────────────────────────────────────────────
def rapport(ds, env_versie, stats):
    print('=== Per omgeving')
    for env, s in stats.items():
        print(f"  {env:5} {s['exportbestanden']:4} exportbestanden | "
              f"{s['hoofdmodellen']:2} hoofdmodellen | {s['modellen']:3} modellen | "
              f"{s['koppelingen']:3} koppelingen")

    print(f'\n=== Totalen')
    print(f'  ketens            {len(ds.ketens)}')
    print(f'  modellen          {len(ds.modelnamen - ds.interfaces)}')
    print(f'  interfaces        {len(ds.interfaces)}')
    print(f'  modelversies      {len(ds.versies)}')
    print(f'  actieve versies   {len(env_versie)}')
    print(f'  koppelingen       {len(ds.deps)}')
    print(f'  keten-nodes       {sum(len(k["nodes"]) for k in ds.ketens.values())}')
    print(f'  keten-edges       {sum(len(k["edges"]) for k in ds.ketens.values())}')

    print('\n=== Ketens')
    for root, k in sorted(ds.ketens.items()):
        print(f'  {root:42} {len(k["nodes"]):3} nodes  {len(k["edges"]):3} edges')

    if ds.ontbreekt:
        print(f'\n=== Aangeroepen versies zonder exportbestand ({len(ds.ontbreekt)})')
        print('    (de koppeling wordt wel vastgelegd; alleen dieper graven kan niet)')
        for env, naam, versie in sorted(ds.ontbreekt):
            print(f'  {env:5} {naam} {versie}')

    if ds.meldingen:
        print(f'\n=== Meldingen ({len(ds.meldingen)})')
        for m in dict.fromkeys(ds.meldingen):
            print(f'  ! {m}')


def main():
    ds, env_versie, stats = bouw()
    rapport(ds, env_versie, stats)

    if '--sql' in sys.argv:
        map_uit = sys.argv[sys.argv.index('--sql') + 1]
        os.makedirs(map_uit, exist_ok=True)
        print(f'\nSQL weggeschreven naar {map_uit}:')
        for naam, sql in sorted(maak_sql(ds, env_versie).items()):
            pad = os.path.join(map_uit, naam + '.sql')
            with open(pad, 'w', encoding='utf-8') as f:
                f.write(sql + '\n')
            print(f'  {naam + ".sql":28} {os.path.getsize(pad) / 1024:6.1f} kB')
    elif '--json' in sys.argv:
        print(json.dumps({'ketens': {r: sorted(k['nodes']) for r, k in ds.ketens.items()}},
                         indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
