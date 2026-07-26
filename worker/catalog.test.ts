import { describe, expect, it } from 'vitest'
import { dailyIndex, parseTopicCursor } from './catalog'

describe('daily recommendation', () => {
  it('always rotates to the next curated work on adjacent Japan dates', () => {
    expect(dailyIndex('2026-07-24', 10)).not.toBe(dailyIndex('2026-07-25', 10))
    expect(dailyIndex('2026-07-25', 10)).toBe((dailyIndex('2026-07-24', 10) + 1) % 10)
  })
})

describe('topic example cursor', () => {
  it('accepts only the stable editorial sort tuple', () => {
    expect(parseTopicCursor('98|1924|12345')).toEqual({ editorialRank: 98, publicationYear: 1924, paragraphID: '12345' })
    expect(parseTopicCursor('98|1924|12345 extra')).toBeNull()
    expect(parseTopicCursor(null)).toBeNull()
  })
})
