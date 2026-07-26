// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchTopicExamples, searchWorks } from './catalog'

afterEach(() => vi.unstubAllGlobals())

function mockJson(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('catalog paging requests', () => {
  it('sends a direct topic page number instead of an opaque cursor', async () => {
    const fetchMock = mockJson({ examples: [], page: { page: 8, limit: 12, total: 90, totalPages: 8 } })
    await searchTopicExamples('kureru', '先生', 8, 12)
    const url = fetchMock.mock.calls[0][0] as URL
    expect(url.searchParams.get('page')).toBe('8')
    expect(url.searchParams.get('cursor')).toBeNull()
    expect(url.searchParams.get('form')).toBe('kureru')
    expect(url.searchParams.get('q')).toBe('先生')
  })

  it('preserves article filters and the offset used by numbered pages', async () => {
    const fetchMock = mockJson({ works: [], page: { offset: 60, limit: 30, total: 0, totalPages: 0, hasMore: false, nextOffset: null } })
    await searchWorks({ query: '猫', level: 'N2', genre: '短篇', offset: 60, limit: 30, sort: 'newest' })
    const url = fetchMock.mock.calls[0][0] as URL
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: '猫', level: 'N2', genre: '短篇', offset: '60', limit: '30', sort: 'newest' })
  })
})
