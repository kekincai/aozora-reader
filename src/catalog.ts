export type LearningStats = { vocabularyCount: number; vocabularyUnique: number; grammarCount: number; grammarUnique: number }
export type WorkSummary = {
  id: string
  title: string
  author: string
  level: string
  genre: string
  minutes: number
  summary: string
  sourceUrl: string
  attribution: string
  paragraphCount: number
  characterCount?: number
  learning?: LearningStats
}
export type AnnotatedToken = { text: string; reading?: string; vocabId?: string; grammarIds?: string[] }
export type ReaderWork = WorkSummary & { paragraphs: string[]; annotatedParagraphs: AnnotatedToken[][] }

type Ruby = { startOffset: number; endOffset: number; baseText: string; reading: string }
type CatalogWorkResponse = {
  work: WorkSummary
  paragraphs: { ordinal: number; text: string; rubies: Ruby[] }[]
  page: { hasMore: boolean }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || '作品を読み込めませんでした。')
  }
  return response.json() as Promise<T>
}

export function annotateRuby(text: string, rubies: Ruby[]): AnnotatedToken[] {
  const characters = Array.from(text)
  const tokens: AnnotatedToken[] = []
  let cursor = 0
  for (const ruby of [...rubies].sort((a, b) => a.startOffset - b.startOffset)) {
    if (ruby.startOffset < cursor || ruby.endOffset > characters.length) continue
    if (ruby.startOffset > cursor) tokens.push({ text: characters.slice(cursor, ruby.startOffset).join('') })
    tokens.push({ text: characters.slice(ruby.startOffset, ruby.endOffset).join(''), reading: ruby.reading })
    cursor = ruby.endOffset
  }
  if (cursor < characters.length) tokens.push({ text: characters.slice(cursor).join('') })
  return tokens.length ? tokens : [{ text }]
}

export async function loadWorks(query = '') {
  if (!query.trim()) {
    const curated = await fetch('/corpus/manifest.json').then(response => response.ok ? response.json() : { works: [] }) as { works: WorkSummary[] }
    return curated.works
  }
  const url = new URL('/api/catalog/works', window.location.origin)
  url.searchParams.set('limit', '50')
  url.searchParams.set('q', query.trim())
  const api = await json<{ works: WorkSummary[] }>(await fetch(url))
  return api.works
}

export async function loadWork(id: string): Promise<ReaderWork> {
  const apiPromise = fetch(`/api/catalog/works/${encodeURIComponent(id)}?limit=220`).then(json<CatalogWorkResponse>)
  const curatedPromise = fetch(`/corpus/works/${encodeURIComponent(id)}.json`).then(response => response.ok ? response.json() as Promise<ReaderWork> : null).catch(() => null)
  try {
    const [api, curated] = await Promise.all([apiPromise, curatedPromise])
    if (curated) return { ...curated, ...api.work, learning: curated.learning }
    return {
      ...api.work,
      paragraphs: api.paragraphs.map(paragraph => paragraph.text),
      annotatedParagraphs: api.paragraphs.map(paragraph => annotateRuby(paragraph.text, paragraph.rubies)),
    }
  } catch (error) {
    const curated = await curatedPromise
    if (curated) return curated
    throw error
  }
}
