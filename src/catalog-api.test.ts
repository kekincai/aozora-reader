// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchTopicExamples, searchWorks } from './catalog'
import { loadWorkWindow } from './learning'

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
    await searchWorks({ query: '猫', level: 'N2', kind: '小説', offset: 60, limit: 30, sort: 'easiest' })
    const url = fetchMock.mock.calls[0][0] as URL
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: '猫', level: 'N2', kind: '小説', offset: '60', limit: '30', sort: 'easiest' })
  })
})

describe('reader paragraph windows', () => {
  it('loads a window from a deep-linked paragraph and keeps database ordinals and entries', async () => {
    const apiPayload = {
      work: { id: '755', title: '文芸の哲学的基礎', author: '夏目 漱石', level: 'N1', genre: '評論', minutes: 30, summary: '', sourceUrl: '', attribution: '青空文庫', paragraphCount: 2500 },
      paragraphs: [{ ordinal: 1842, text: '先生が説明してくれた。', rubies: [], vocabulary: [], grammar: [] }],
      entries: { vocabulary: [{ id: 'v1', term: '説明', reading: 'せつめい', meaning: 'explanation', meaningZh: '说明', level: 'N2' }], grammar: [] },
      page: { from: 1822, limit: 60, hasMore: true, nextFrom: 1882 },
    }
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(apiPayload), { status: 200, headers: { 'content-type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const window = await loadWorkWindow('755', 1822, 60)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/catalog/works/755?from=1822&limit=60')
    expect(window.paragraphs.map(paragraph => paragraph.ordinal)).toEqual([1842])
    expect(window.entries.vocabulary[0].meaningZh).toBe('说明')
    expect(window.nextFrom).toBe(1882)
  })
})
