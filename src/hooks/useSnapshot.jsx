import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSnapshotRaw, fetchReleases, fetchActivity } from '../lib/api.js'
import { bouwSnapshot } from '../lib/snapshot.js'
import { alleKetens } from '../lib/chainUtils.js'

const POLL_INTERVAL = 30_000

const SnapshotContext = createContext({ snap: null, ketens: null, loading: true, error: null, refresh: async () => {} })

// Eén momentopname voor de hele app: ketens, versies, aanroepen, werk, releases
// en activiteit komen samen binnen, zodat geen enkele view een mix van oud en
// nieuw ziet. Elke 30 seconden opnieuw, en direct na elke actie via refresh().
export function SnapshotProvider({ orgSlug, children }) {
  const [snap,    setSnap]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const volgnr = useRef(0)

  const load = useCallback(async () => {
    if (!orgSlug) return
    const mijn = ++volgnr.current
    setLoading(true)
    try {
      const [raw, releases, activity] = await Promise.all([
        fetchSnapshotRaw(orgSlug), fetchReleases(orgSlug), fetchActivity(100),
      ])
      // Een oudere aanvraag die later binnenkomt mag een nieuwere niet overschrijven
      if (mijn !== volgnr.current) return
      setSnap(bouwSnapshot(raw, releases, activity))
      setError(null)
    } catch (e) {
      if (mijn !== volgnr.current) return
      setError(e.message ?? 'Onbekende fout')
    } finally {
      if (mijn === volgnr.current) setLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    if (!orgSlug) { setSnap(null); return }
    load()
    const id = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [load, orgSlug])

  // De afgeleide ketens (graph per keten, status, waar elke versie draait) één
  // keer per snapshot, voor alle views samen
  const ketens = useMemo(() => snap ? alleKetens(snap) : null, [snap])

  const value = useMemo(() => ({ snap, ketens, loading, error, refresh: load }), [snap, ketens, loading, error, load])
  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>
}

export function useSnapshot() {
  return useContext(SnapshotContext)
}
