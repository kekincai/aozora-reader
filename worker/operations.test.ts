import { describe, expect, it } from 'vitest'
import { normalizeAnalyticsInput, normalizeFeedbackInput, normalizePath, OperationsError } from './operations'

describe('operations input boundaries', () => {
  it('groups article URLs without storing raw query strings', () => {
    expect(normalizePath('/read/3368?from=learn')).toBe('/read/:id')
    expect(normalizePath('/unknown?secret=value')).toBe('/other')
  })

  it('accepts only allowlisted analytics fields', () => {
    expect(normalizeAnalyticsInput({ eventName: 'read_start', eventID: 'e1', visitorID: '1234567890abcdef', path: '/read/3368', workID: '3368', label: '火星兵団' }))
      .toMatchObject({ eventName: 'read_start', pathGroup: '/read/:id', workID: '3368', label: '火星兵団' })
    expect(() => normalizeAnalyticsInput({ eventName: 'raw_click', visitorID: '1234567890abcdef' })).toThrow(OperationsError)
  })

  it('validates feedback and strips URL details', () => {
    expect(normalizeFeedbackInput({ category: 'bug', message: 'ふりがなが表示されません。', visitorID: '1234567890abcdef', pagePath: '/read/3368?token=secret' }))
      .toMatchObject({ category: 'bug', pagePath: '/read/3368' })
    expect(() => normalizeFeedbackInput({ category: 'bug', message: '短い', visitorID: '1234567890abcdef' })).toThrow(OperationsError)
  })
})
