import { describe, expect, it } from 'vitest'
import { sitemapXml } from './seo'

describe('sitemapXml', () => {
  it('includes the public discovery pages and every supplied work', () => {
    const xml = sitemapXml('https://example.jp', [
      { id: '637', updatedOn: '2026-07-23' },
      { id: '42', updatedOn: null },
    ])

    expect(xml).toContain('<loc>https://example.jp/</loc>')
    expect(xml).toContain('<loc>https://example.jp/articles</loc>')
    expect(xml).toContain('<loc>https://example.jp/learn</loc>')
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
