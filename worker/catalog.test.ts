import { describe, expect, it } from 'vitest'
import { dailyIndex } from './catalog'

describe('daily recommendation', () => {
  it('always rotates to the next curated work on adjacent Japan dates', () => {
    expect(dailyIndex('2026-07-24', 10)).not.toBe(dailyIndex('2026-07-25', 10))
    expect(dailyIndex('2026-07-25', 10)).toBe((dailyIndex('2026-07-24', 10) + 1) % 10)
  })
})
