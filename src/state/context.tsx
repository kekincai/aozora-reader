import { createContext, useContext, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { useAuth } from '../auth'
import { newCard, type ReaderState, type WordCard } from './store'

export type AuthState = ReturnType<typeof useAuth>
export type SyncStatus = 'local' | 'saving' | 'saved' | 'error'
export type AppContextValue = {
  state: ReaderState
  setState: Dispatch<SetStateAction<ReaderState>>
  auth: AuthState
  syncStatus: SyncStatus
  openAuth: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppContext is missing')
  return value
}

export function addCard(state: ReaderState, input: Parameters<typeof newCard>[0]): ReaderState {
  const card: WordCard = newCard(input)
  if (state.cards[card.key]) return state
  return { ...state, cards: { ...state.cards, [card.key]: card } }
}

/**
 * Counts seconds while the tab is visible and hands them to `onFlush` when the
 * component unmounts, capped so a page left open overnight does not count.
 */
export function useReadingTimer(onFlush: (seconds: number) => void, cap = 45 * 60) {
  const seconds = useRef(0)
  const flush = useRef(onFlush)
  flush.current = onFlush
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') seconds.current += 5 }, 5000)
    return () => {
      window.clearInterval(timer)
      if (seconds.current) flush.current(Math.min(cap, seconds.current))
      seconds.current = 0
    }
  }, [cap])
  /** Takes the seconds counted so far; they are not flushed again on unmount. */
  return () => {
    const taken = Math.min(cap, seconds.current)
    seconds.current = 0
    return taken
  }
}
