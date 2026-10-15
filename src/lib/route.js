import { useCallback, useEffect, useState } from 'react'

// Het adres van de app staat in de hash, zodat tab en keten blijven staan bij
// herladen en je een collega een link naar precies één node kunt sturen:
//   #/overzicht
//   #/ketens/<ketenkey>/<modelId>
//   #/releases?env=ACC
//   #/beheer

export const TABS = ['overzicht', 'ketens', 'releases', 'beheer']

export function leesRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [pad, query = ''] = hash.split('?')
  const delen = pad.split('/').filter(Boolean).map(decodeURIComponent)
  const tab = TABS.includes(delen[0]) ? delen[0] : 'overzicht'
  return {
    tab,
    keten: tab === 'ketens' ? delen[1] ?? null : null,
    model: tab === 'ketens' ? delen[2] ?? null : null,
    query: Object.fromEntries(new URLSearchParams(query)),
  }
}

export function maakHash({ tab = 'overzicht', keten, model, query }) {
  let h = `#/${tab}`
  if (tab === 'ketens' && keten) {
    h += `/${encodeURIComponent(keten)}`
    if (model) h += `/${encodeURIComponent(model)}`
  }
  const q = new URLSearchParams(Object.entries(query ?? {}).filter(([, v]) => v != null && v !== '')).toString()
  if (q) h += `?${q}`
  return h
}

export function useRoute() {
  const [route, setRoute] = useState(leesRoute)

  useEffect(() => {
    const op = () => setRoute(leesRoute())
    window.addEventListener('hashchange', op)
    return () => window.removeEventListener('hashchange', op)
  }, [])

  const ga = useCallback((naar, { vervang = false } = {}) => {
    const hash = maakHash({ ...leesRoute(), ...naar })
    if (hash === window.location.hash) return
    if (vervang) history.replaceState(null, '', hash)
    else window.location.hash = hash
    setRoute(leesRoute())
  }, [])

  return { route, ga }
}
