// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWork, searchTopicExamples, searchWorks } from './catalog'

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

describe('reader paragraph windows', () => {
  it('loads a window around a deep-linked paragraph and preserves database ordinals', async () => {
    const apiPayload = {
      work: { id: '755', title: '文芸の哲学的基礎', author: '夏目 漱石', level: 'N1', genre: '評論', minutes: 30, summary: '', sourceUrl: '', attribution: '青空文庫', paragraphCount: 2500 },
      paragraphs: [{ ordinal: 1842, text: '先生が説明してくれた。', rubies: [], vocabulary: [], grammar: [] }],
      page: { from: 1822, limit: 80, hasMore: true, nextFrom: 1902 },
    }
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      return Promise.resolve(url.startsWith('/api/')
        ? new Response(JSON.stringify(apiPayload), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response('', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const work = await loadWork('755', 1842)
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toContain('/api/catalog/works/755?from=1822&limit=80')
    expect(work.paragraphOrdinals).toEqual([1842])
    expect(work.paragraphs[0]).toContain('くれた')
  })
})
