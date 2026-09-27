import { describe, expect, it } from 'vitest'
import { dueCards, emptyState, mergeStates, migrateState, newCard, Rating, reviewCard, streakSummary, type DayRecord } from './store'

const day: DayRecord = { workId: '637', pages: 1, correct: 3, total: 3, seconds: 240 }
const days = (...dates: string[]) => Object.fromEntries(dates.map(date => [date, day]))

describe('streakSummary', () => {
  it('counts consecutive days and waits for today', () => {
    expect(streakSummary(days('2026-09-24', '2026-09-25', '2026-09-26'), '2026-09-27')).toMatchObject({ total: 3, current: 3, restLeft: 1 })
    expect(streakSummary(days('2026-09-25', '2026-09-26', '2026-09-27'), '2026-09-27').current).toBe(3)
  })

  it('bridges one missed day per week', () => {
    // 2026-09-22 is a Tuesday; the miss on 09-23 is covered by this week's rest.
    const summary = streakSummary(days('2026-09-22', '2026-09-24', '2026-09-25'), '2026-09-25')
    expect(summary.current).toBe(3)
    expect([...summary.restDays]).toEqual(['2026-09-23'])
    expect(summary.restLeft).toBe(0)
  })

  it('breaks on two missed days in a row', () => {
    expect(streakSummary(days('2026-09-20', '2026-09-23'), '2026-09-23').current).toBe(1)
  })

  it('does not spend a rest that bridges nothing', () => {
    expect(streakSummary(days('2026-09-26'), '2026-09-27')).toMatchObject({ current: 1, restLeft: 1 })
    expect(streakSummary({}, '2026-09-27')).toMatchObject({ total: 0, current: 0, restLeft: 1 })
  })
})

describe('migrateState', () => {
  it('drops the v1 placeholder progress and turns saved words into cards', () => {
    const state = migrateState({ progress: { '92': 42, '637': 18 }, words: [{ word: '暮らす', reading: 'くらす', meaning: 'to live', level: 'N2', savedAt: 1 }], minutes: 3 })
    expect(state.progress).toEqual({ '637': 18 })
    expect(Object.values(state.cards).map(card => card.word)).toEqual(['暮らす'])
    expect(state.readingSeconds).toBe(180)
  })
})

describe('cards', () => {
  it('schedules a new card later after a good review', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    const card = newCard({ kind: 'vocabulary', entryId: 'v1', word: '包む', reading: 'つつむ', meaning: 'to wrap', level: 'N2' }, now)
    const state = { ...emptyState(), cards: { [card.key]: card } }
    expect(dueCards(state, now)).toHaveLength(1)
    const reviewed = reviewCard(card, Rating.Good, now)
    expect(new Date(reviewed.srs.due).getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('mergeStates', () => {
  it('keeps days from both devices and the furthest serial position', () => {
    const local = { ...emptyState(), days: days('2026-09-26'), serial: { workId: '637', ordinal: 20 } }
    const cloud = { ...emptyState(), days: days('2026-09-25'), serial: { workId: '637', ordinal: 10 } }
    const merged = mergeStates(local, cloud, ['637', '92'])
    expect(Object.keys(merged.days).sort()).toEqual(['2026-09-25', '2026-09-26'])
    expect(merged.serial).toEqual({ workId: '637', ordinal: 20 })
  })
})
