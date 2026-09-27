import { useEffect, useState } from 'react'
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'

export type Pace = 3 | 5 | 10
export type DayRecord = { workId: string; pages: number; correct: number; total: number; seconds: number }
export type StoredCard = Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string }
export type WordCard = {
  key: string
  kind: 'vocabulary' | 'grammar'
  entryId?: string
  word: string
  reading: string
  meaning: string
  level: string
  context?: string
  workId?: string
  ordinal?: number
  addedAt: number
  srs: StoredCard
}
export type SerialPosition = { workId: string; ordinal: number }
export type ReaderState = {
  version: 2
  pace: Pace
  serial: SerialPosition | null
  finished: string[]
  days: Record<string, DayRecord>
  cards: Record<string, WordCard>
  progress: Record<string, number>
  readingSeconds: number
}

type LegacyWord = { word: string; reading: string; meaning: string; level: string; savedAt: number }
type LegacyState = { progress?: Record<string, number>; words?: LegacyWord[]; minutes?: number }

const STORAGE_KEY = 'aozora-reader-state'
const scheduler = fsrs({ enable_fuzz: false })

export function emptyState(): ReaderState {
  return { version: 2, pace: 5, serial: null, finished: [], days: {}, cards: {}, progress: {}, readingSeconds: 0 }
}

/** Calendar date in Japan, which is the day boundary for the daily page. */
export function japanDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function mondayOf(date: string) {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return shiftDate(date, -weekday)
}

function storeCard(card: Card): StoredCard {
  return { ...card, due: new Date(card.due).toISOString(), last_review: card.last_review ? new Date(card.last_review).toISOString() : undefined }
}

function loadCard(card: StoredCard): Card {
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined }
}

export function newCard(input: Omit<WordCard, 'srs' | 'addedAt' | 'key'> & { key?: string }, now = new Date()): WordCard {
  return { ...input, key: input.key || `${input.kind}:${input.entryId || input.word}`, addedAt: now.getTime(), srs: storeCard(createEmptyCard(now)) }
}

export function reviewCard(card: WordCard, grade: Grade, now = new Date()): WordCard {
  return { ...card, srs: storeCard(scheduler.next(loadCard(card.srs), now, grade).card) }
}

export function dueCards(state: ReaderState, now = new Date()) {
  return Object.values(state.cards).filter(card => new Date(card.srs.due) <= now).sort((a, b) => a.srs.due.localeCompare(b.srs.due))
}

export function isLearned(card: WordCard) {
  return card.srs.state === State.Review && card.srs.stability >= 21
}

export { Rating }

/**
 * Streak with one automatic rest day per Monday-start week, so a single missed
 * day does not reset a habit. Today only counts once it is done.
 */
export function streakSummary(days: Record<string, DayRecord>, today = japanDate()) {
  const total = Object.keys(days).length
  const first = Object.keys(days).sort()[0]
  const restDays = new Set<string>()
  let current = 0
  let pendingRest: string | null = null
  let cursor = days[today] ? today : shiftDate(today, -1)
  while (first && cursor >= first) {
    if (days[cursor]) {
      current += 1
      if (pendingRest) restDays.add(pendingRest)
      pendingRest = null
    } else {
      // A rest only bridges one missed day, and at most once per week.
      if (pendingRest || [...restDays].some(day => mondayOf(day) === mondayOf(cursor))) break
      pendingRest = cursor
    }
    cursor = shiftDate(cursor, -1)
  }
  const thisWeek = mondayOf(today)
  const restLeft = [...restDays].some(day => mondayOf(day) === thisWeek) ? 0 : 1
  return { total, current, restDays, restLeft }
}

export function migrateState(raw: unknown): ReaderState {
  if (!raw || typeof raw !== 'object') return emptyState()
  const value = raw as Partial<ReaderState> & LegacyState
  if (value.version === 2) return { ...emptyState(), ...value, version: 2 }
  const state = emptyState()
  const progress = { ...(value.progress || {}) }
  // v1 shipped a placeholder of 42% for 蜘蛛の糸 to every new visitor.
  if (progress['92'] === 42) delete progress['92']
  state.progress = progress
  state.readingSeconds = Math.max(0, Math.round((value.minutes || 0) * 60))
  for (const word of value.words || []) {
    const card = newCard({ kind: word.reading === '文法' ? 'grammar' : 'vocabulary', word: word.word, reading: word.reading === '文法' ? '' : word.reading, meaning: word.meaning, level: word.level }, new Date(word.savedAt || Date.now()))
    state.cards[card.key] = card
  }
  return state
}

function serialRank(position: SerialPosition | null, finished: string[], order: string[]) {
  if (!position) return finished.length * 100_000
  return (Math.max(0, order.indexOf(position.workId)) * 100_000) + position.ordinal
}

/** Merges two devices' records without losing reading days, cards or progress. */
export function mergeStates(localRaw: unknown, cloudRaw: unknown, serialOrder: string[] = []): ReaderState {
  const local = migrateState(localRaw)
  if (!cloudRaw) return local
  const cloud = migrateState(cloudRaw)
  const days = { ...cloud.days }
  for (const [date, record] of Object.entries(local.days)) {
    const other = days[date]
    days[date] = !other || record.pages >= other.pages ? { ...record, seconds: Math.max(record.seconds, other?.seconds || 0) } : other
  }
  const cards = { ...cloud.cards }
  for (const [key, card] of Object.entries(local.cards)) {
    const other = cards[key]
    cards[key] = !other || (card.srs.last_review || '') >= (other.srs.last_review || '') ? card : other
  }
  const progress = { ...cloud.progress }
  for (const [id, value] of Object.entries(local.progress)) progress[id] = Math.max(value, progress[id] || 0)
  const localAhead = serialRank(local.serial, local.finished, serialOrder) >= serialRank(cloud.serial, cloud.finished, serialOrder)
  return {
    version: 2,
    pace: local.pace,
    serial: localAhead ? local.serial : cloud.serial,
    finished: Array.from(new Set([...cloud.finished, ...local.finished])),
    days,
    cards,
    progress,
    readingSeconds: Math.max(local.readingSeconds, cloud.readingSeconds),
  }
}

export function useReaderState() {
  const [state, setState] = useState<ReaderState>(() => {
    try { return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')) } catch { return emptyState() }
  })
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* storage may be unavailable */ } }, [state])
  return [state, setState] as const
}
