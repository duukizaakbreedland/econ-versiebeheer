import { useState, useEffect, useCallback } from 'react'
import { fetchDependencies } from '../lib/api.js'

// Alle vastgelegde koppelingen, over alle omgevingen heen.
export function useDependencies() {
  const [deps,    setDeps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDeps(await fetchDependencies())
    } catch (e) {
      setError(e.message ?? 'Kon koppelingen niet laden')
      setDeps([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { deps, loading, error, refresh: load }
}
