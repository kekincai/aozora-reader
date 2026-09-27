import { useEffect, useState } from 'react'
import { emptyState, migrateState, type ReaderState } from './model'

export * from './model'

const STORAGE_KEY = 'aozora-reader-state'

export function useReaderState() {
  const [state, setState] = useState<ReaderState>(() => {
    try { return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')) } catch { return emptyState() }
  })
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* storage may be unavailable */ } }, [state])
  return [state, setState] as const
}
