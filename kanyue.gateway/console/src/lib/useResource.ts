import { useCallback, useEffect, useRef, useState } from 'react'

import { errorText } from './api'

export interface Resource<T> {
  data: T | undefined
  error: string
  loading: boolean
  reload: () => void
}

// useResource runs load when key changes (and on reload) and keeps the latest
// result; a response for a stale key is ignored.
export function useResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const loadRef = useRef(load)
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ data?: T; error: string; loading: boolean }>({ error: '', loading: true })

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let live = true
    loadRef.current().then(
      (data) => { if (live) setState({ data, error: '', loading: false }) },
      (error: unknown) => { if (live) setState((prev) => ({ data: prev.data, error: errorText(error), loading: false })) },
    )
    return () => { live = false }
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data: state.data, error: state.error, loading: state.loading, reload }
}
