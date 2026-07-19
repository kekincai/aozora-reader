import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Aozora corpus', () => {
  it('contains a curated public-domain starter library', async () => {
    const manifest = JSON.parse(await readFile('public/corpus/manifest.json', 'utf8'))
    expect(manifest.works).toHaveLength(10)
    expect(manifest.works.every((work: { attribution: string }) => work.attribution.includes('著作権なし'))).toBe(true)
    expect(manifest.works.some((work: { level: string }) => work.level === 'N1')).toBe(true)
    expect(manifest.works.some((work: { level: string }) => work.level.startsWith('N2'))).toBe(true)
  })

  it('preserves ruby markup in the source text', async () => {
    const work = JSON.parse(await readFile('public/corpus/works/637.json', 'utf8'))
    expect(work.paragraphs.join('')).toContain('<ruby>')
    expect(work.sourceUrl).toMatch(/^https:\/\/www\.aozora\.gr\.jp\//)
  })
})
