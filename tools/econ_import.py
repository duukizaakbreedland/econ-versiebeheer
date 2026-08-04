"""Leest een map met eCon-model-exports (XML) en bouwt daaruit de ketenstructuur.

Vorm van een export:
  <CLASS XSLDATASOURCE="Modelnaam" VERSION="jj.mm.dd" ISINTERFACE="false">
    <REFERENCES>
      <REFERENCE INTERFACE="IInterfacenaam" VERSION="jj.mm.dd">   <- interface + versie
        <TEMPLATE INCLUDE="IInterfacenaam" .../>                  <- interfacedefinitie
        <CLASS    INCLUDE="Submodelnaam" VERSION="jj.mm.dd"/>     <- submodel + versie
      </REFERENCE>
    </REFERENCES>
    <INTERFACES>
      <INTERFACE INTERFACE="IEigenInterface" VERSION="jj.mm.dd"/> <- wat het model aanbiedt
    </INTERFACES>
  </CLASS>

Gebruik:
  python econ_import.py <map> --roots "HoofdmodelA,HoofdmodelB"     leesbare boom
  python econ_import.py <map> --roots "..." --json                   machineleesbaar

Zonder --roots leidt het script de hoofdmodellen zelf af: alles wat nergens
als submodel wordt aangeroepen.
"""
import sys, os, glob, json
import xml.etree.ElementTree as ET


# ─── Inlezen ──────────────────────────────────────────────────────────────────
def parse_model(pad):
    root = ET.parse(pad).getroot()
    if root.tag != 'CLASS' or not root.get('XSLDATASOURCE'):
        return None                      # geen modelexport (bijv. een extractiebestand)

    model = {
        'bestand':   pad,
        'naam':      root.get('XSLDATASOURCE'),
        'versie':    root.get('VERSION'),
        'biedt_aan': [{'interface': i.get('INTERFACE'), 'versie': i.get('VERSION')}
                      for i in root.findall('./INTERFACES/INTERFACE')],
        'links':     [],
    }

    for ref in root.findall('./REFERENCES/REFERENCE'):
        iface = ref.get('INTERFACE')
        if not iface:
            continue
        for kind in ref.findall('./CLASS'):
            if kind.get('INCLUDE'):
                model['links'].append({
                    'interface':       iface,
                    'interfaceversie': ref.get('VERSION'),
                    'submodel':        kind.get('INCLUDE'),
                    'submodelversie':  kind.get('VERSION'),
                    'referentie':      ref.get('ID'),
                })
                break                    # één submodel per referentie

    return model


def lees_map(map_pad):
    modellen, overgeslagen, stuk = [], [], []
    for pad in sorted(glob.glob(os.path.join(map_pad, '**', '*.xml'), recursive=True)):
        try:
            m = parse_model(pad)
            if m:
                modellen.append(m)
            else:
                overgeslagen.append(os.path.basename(pad))
        except Exception as e:
            stuk.append(f'{os.path.basename(pad)}: {e}')
    return modellen, overgeslagen, stuk


# ─── Index ────────────────────────────────────────────────────────────────────
class Index:
    """Zoekt modellen op naam en versie. Staat dezelfde naam meerdere keren in de
       export, dan pakken we de versie die de ouder daadwerkelijk aanroept."""

    def __init__(self, modellen):
        self.per_naam_versie = {(m['naam'], m['versie']): m for m in modellen}
        self.per_naam = {}
        for m in modellen:
            self.per_naam.setdefault(m['naam'], []).append(m)

    def zoek(self, naam, versie=None):
        if versie and (naam, versie) in self.per_naam_versie:
            return self.per_naam_versie[(naam, versie)], True
        kandidaten = self.per_naam.get(naam, [])
        if len(kandidaten) == 1:
            return kandidaten[0], kandidaten[0]['versie'] == versie
        if kandidaten:
            nieuwste = sorted(kandidaten, key=lambda m: m['versie'] or '')[-1]
            return nieuwste, False
        return None, False


# ─── Boom opbouwen ────────────────────────────────────────────────────────────
def bouw_keten(naam, versie, index, gezien, waarschuwingen):
    model, exact = index.zoek(naam, versie)

    knoop = {
        'model':    naam,
        'versie':   (model or {}).get('versie') or versie,
        'gevonden': model is not None,
        'kinderen': [],
    }

    if model is None:
        waarschuwingen.append(f'export ontbreekt: {naam} {versie or ""}'.strip())
        return knoop
    if versie and not exact:
        waarschuwingen.append(
            f'{naam}: aangeroepen als {versie}, in de export staat {model["versie"]}')
    if naam in gezien:
        knoop['kringloop'] = True
        return knoop

    gezien = gezien | {naam}
    for l in model['links']:
        knoop['kinderen'].append({
            'interface':       l['interface'],
            'interfaceversie': l['interfaceversie'],
            'submodel': bouw_keten(l['submodel'], l['submodelversie'], index, gezien, waarschuwingen),
        })
    return knoop


def toon(knoop, diepte=0):
    merk = '' if knoop['gevonden'] else '   <- export ontbreekt'
    if knoop.get('kringloop'):
        merk = '   <- al eerder uitgewerkt'
    print('   ' * diepte + f"{knoop['model']}  {knoop['versie'] or '?'}{merk}")
    for k in knoop['kinderen']:
        print('   ' * (diepte + 1) + f"[{k['interface']} {k['interfaceversie']}]")
        toon(k['submodel'], diepte + 2)


# ─── Hoofdprogramma ───────────────────────────────────────────────────────────
def main():
    map_pad = sys.argv[1]
    als_json = '--json' in sys.argv

    roots = []
    if '--roots' in sys.argv:
        roots = [r.strip() for r in sys.argv[sys.argv.index('--roots') + 1].split(',') if r.strip()]

    modellen, overgeslagen, stuk = lees_map(map_pad)
    index = Index(modellen)

    if not roots:
        aangeroepen = {l['submodel'] for m in modellen for l in m['links']}
        roots = sorted(m['naam'] for m in modellen if m['naam'] not in aangeroepen)

    waarschuwingen = []
    ketens = []
    for naam in roots:
        model, _ = index.zoek(naam)
        if model is None:
            waarschuwingen.append(f'hoofdmodel niet in de export gevonden: {naam}')
            continue
        ketens.append(bouw_keten(naam, model['versie'], index, set(), waarschuwingen))

    if als_json:
        print(json.dumps({'ketens': ketens, 'waarschuwingen': waarschuwingen,
                          'aantal_modellen': len(modellen)}, indent=2, ensure_ascii=False))
        return

    print(f'{len(modellen)} modelexports gelezen uit {map_pad}')
    if overgeslagen:
        print(f'{len(overgeslagen)} bestand(en) overgeslagen (geen modelexport)')
    if stuk:
        print('Niet te lezen:')
        for s in stuk:
            print(f'  ! {s}')

    for keten in ketens:
        print(f"\n================ KETEN: {keten['model']} ================")
        toon(keten)

    # Modellen die wel in de export zitten maar in geen enkele keten voorkomen
    in_keten = set()

    def verzamel(k):
        in_keten.add(k['model'])
        for kind in k['kinderen']:
            verzamel(kind['submodel'])

    for keten in ketens:
        verzamel(keten)

    zwevend = sorted({m['naam'] for m in modellen} - in_keten)
    if zwevend:
        print(f'\nIn de export maar in geen enkele keten ({len(zwevend)}):')
        for n in zwevend:
            print(f'  - {n}')

    if waarschuwingen:
        print(f'\nAandachtspunten ({len(waarschuwingen)}):')
        for w in dict.fromkeys(waarschuwingen):
            print(f'  ! {w}')


if __name__ == '__main__':
    main()
