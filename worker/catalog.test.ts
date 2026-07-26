import { describe, expect, it } from 'vitest'
import { dailyIndex, topicPageParams } from './catalog'

describe('daily recommendation', () => {
  it('always rotates to the next curated work on adjacent Japan dates', () => {
    expect(dailyIndex('2026-07-24', 10)).not.toBe(dailyIndex('2026-07-25', 10))
    expect(dailyIndex('2026-07-25', 10)).toBe((dailyIndex('2026-07-24', 10) + 1) % 10)
  })
})

describe('topic example page parameters', () => {
  it('converts a visible page number into an offset', () => {
    expect(topicPageParams(new URL('https://example.test?limit=12&page=6'))).toEqual({ page: 6, limit: 12, offset: 60 })
  })

  it('clamps unsafe or invalid values', () => {
    expect(topicPageParams(new URL('https://example.test?limit=999&page=-3'))).toEqual({ page: 1, limit: 24, offset: 0 })
    expect(topicPageParams(new URL('https://example.test?page=oops'))).toEqual({ page: 1, limit: 12, offset: 0 })
  })
})
