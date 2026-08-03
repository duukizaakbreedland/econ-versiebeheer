import { useState, useEffect, useCallback } from 'react'
import { fetchChains } from '../lib/api.js'

const POLL_INTERVAL = 30_000

export function useChains(orgSlug = 'buva') {
  const [chains,  setChains]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!orgSlug) return          // niet ingelogd: niets ophalen
    setLoading(true)
    setError(null)
    try {
      const data = await fetchChains(orgSlug)
      setChains(data)
    } catch (e) {
      setError(e.message ?? 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    if (!orgSlug) return
    load()
    const id = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [load, orgSlug])

  return { chains, loading, error, refresh: load }
}
