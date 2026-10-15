// Versienummers vergelijken. Ze zien eruit als jj.mm.dd, soms met een suffix:
// 25.05.07HF, 21.11.30a. Staat los van de snapshot zodat beide kanten op
// geïmporteerd kan worden.

export const VERSIE_PATROON = /^(\d{2})\.(\d{2})\.(\d{2})(.*)$/

function ontleed(versie) {
  const m = VERSIE_PATROON.exec(versie ?? '')
  return m ? { datum: m[1] + m[2] + m[3], suffix: m[4] } : null
}

// -1 = a ouder, 0 = gelijk, 1 = a nieuwer, null = niet te vergelijken
export function vergelijkVersies(a, b) {
  if (a === b) return 0
  const pa = ontleed(a), pb = ontleed(b)
  if (!pa || !pb) return null
  if (pa.datum !== pb.datum) return pa.datum < pb.datum ? -1 : 1
  if (pa.suffix === pb.suffix) return 0
  return pa.suffix < pb.suffix ? -1 : 1
}

export function isGeldigeVersie(versie) {
  return VERSIE_PATROON.test(versie ?? '')
}

// Vandaag als jj.mm.dd: de gebruikelijke start van een nieuwe versie
export function versieVanVandaag() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getFullYear() % 100)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}
