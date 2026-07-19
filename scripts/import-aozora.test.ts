import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

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

  it('builds complete N2/N1 learning indexes and annotated text', async () => {
    const index = JSON.parse(await readFile('public/learning/index.json', 'utf8'))
    const work = JSON.parse(await readFile('public/corpus/works/637.json', 'utf8'))
    expect(index.vocabulary.length).toBeGreaterThan(5_000)
    expect(index.grammar.length).toBeGreaterThan(400)
    expect(index.vocabulary.some((entry: { articles: unknown[] }) => entry.articles.length > 0)).toBe(true)
    expect(work.learning.vocabularyUnique).toBeGreaterThan(30)
    expect(work.learning.grammarUnique).toBeGreaterThan(5)
    expect(work.annotatedParagraphs.flat().some((token: { vocabId?: string }) => token.vocabId)).toBe(true)
  })

  it('persists the derived corpus and reverse index in SQLite', () => {
    const database = new DatabaseSync('data/aozora-learning.sqlite', { readOnly: true })
    const works = database.prepare('SELECT count(*) AS count FROM works').get() as { count: number }
    const occurrences = database.prepare('SELECT count(*) AS count FROM occurrences').get() as { count: number }
    database.close()
    expect(works.count).toBe(10)
    expect(occurrences.count).toBeGreaterThan(1_000)
  })
})
