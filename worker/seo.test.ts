import { describe, expect, it } from 'vitest'
import { isInteractiveReaderRequest, sitemapXml } from './seo'

describe('sitemapXml', () => {
  it('includes the public discovery pages and every supplied work', () => {
    const xml = sitemapXml('https://example.jp', [
      { id: '637', updatedOn: '2026-07-23' },
      { id: '42', updatedOn: null },
    ])

    expect(xml).toContain('<loc>https://example.jp/</loc>')
    expect(xml).toContain('<loc>https://example.jp/articles</loc>')
    expect(xml).toContain('<loc>https://example.jp/learn</loc>')
    expect(xml).toContain('<loc>https://example.jp/topics</loc>')
    expect(xml).toContain('<loc>https://example.jp/topics/giving-receiving</loc>')
    expect(xml).toContain('<loc>https://example.jp/read/637</loc><lastmod>2026-07-23</lastmod>')
    expect(xml).toContain('<loc>https://example.jp/read/42</loc></url>')
    expect(xml).not.toContain('/admin')
    expect(xml).not.toContain('/record')
  })

  it('escapes an origin before inserting it into XML', () => {
    const xml = sitemapXml('https://example.jp?language=ja&mode=read', [])
    expect(xml).toContain('language=ja&amp;mode=read')
  })
})

describe('interactive reader shell', () => {
  it('recognizes only explicit paragraph deep links', () => {
    expect(isInteractiveReaderRequest(new URL('https://example.jp/read/755?paragraph=1842&view=reader&focus=kureru'))).toBe(true)
    expect(isInteractiveReaderRequest(new URL('https://example.jp/read/755?paragraph=1842'))).toBe(false)
    expect(isInteractiveReaderRequest(new URL('https://example.jp/topics?paragraph=1842&view=reader'))).toBe(false)
  })
})
