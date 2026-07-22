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
type VocabularyOccurrence = { startOffset: number; endOffset: number; vocabId: string }
type GrammarOccurrence = { startOffset: number; endOffset: number; grammarId: string; ranges: [number, number][] }
type CatalogWorkResponse = {
  work: WorkSummary
  paragraphs: { ordinal: number; text: string; rubies: Ruby[]; vocabulary?: VocabularyOccurrence[]; grammar?: GrammarOccurrence[] }[]
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

export function annotateLearning(text: string, rubies: Ruby[], vocabulary: VocabularyOccurrence[] = [], grammar: GrammarOccurrence[] = []): AnnotatedToken[] {
  const characters = Array.from(text)
  const boundaries = new Set([0, characters.length])
  rubies.forEach(item => { boundaries.add(item.startOffset); boundaries.add(item.endOffset) })
  vocabulary.forEach(item => { boundaries.add(item.startOffset); boundaries.add(item.endOffset) })
  grammar.flatMap(item => item.ranges || [[item.startOffset, item.endOffset]]).forEach(([start, end]) => { boundaries.add(start); boundaries.add(end) })
  const points = [...boundaries].filter(point => point >= 0 && point <= characters.length).sort((a, b) => a - b)
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    const ruby = rubies.find(item => item.startOffset === start && item.endOffset === end)
    const vocab = vocabulary.find(item => item.startOffset <= start && item.endOffset >= end)
    const grammarIds = grammar.filter(item => (item.ranges || [[item.startOffset, item.endOffset]]).some(([rangeStart, rangeEnd]) => rangeStart < end && rangeEnd > start)).map(item => item.grammarId)
    return { text: characters.slice(start, end).join(''), ...(ruby ? { reading: ruby.reading } : {}), ...(vocab ? { vocabId: vocab.vocabId } : {}), ...(grammarIds.length ? { grammarIds } : {}) }
  }).filter(token => token.text)
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

export type WorkSearch = { query?: string; level?: string; genre?: string; maxCharacters?: number; sort?: 'shortest'|'title'|'newest'; offset?: number; limit?: number }

export async function searchWorks(filters: WorkSearch = {}) {
  const url = new URL('/api/catalog/works', window.location.origin)
  if (filters.query) url.searchParams.set('q', filters.query)
  if (filters.level) url.searchParams.set('level', filters.level)
  if (filters.genre) url.searchParams.set('genre', filters.genre)
  if (filters.maxCharacters) url.searchParams.set('maxCharacters', String(filters.maxCharacters))
  if (filters.sort) url.searchParams.set('sort', filters.sort)
  url.searchParams.set('offset', String(filters.offset || 0))
  url.searchParams.set('limit', String(filters.limit || 30))
  return json<{ works: WorkSummary[]; page: { offset: number; limit: number; hasMore: boolean; nextOffset: number | null } }>(await fetch(url))
}

export async function loadTodayWork() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  return json<{ date: string; work: WorkSummary | null }>(await fetch(`/api/catalog/today?date=${date}&rotation=v2`))
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
      annotatedParagraphs: api.paragraphs.map(paragraph => annotateLearning(paragraph.text, paragraph.rubies, paragraph.vocabulary, paragraph.grammar)),
    }
  } catch (error) {
    const curated = await curatedPromise
    if (curated) return curated
    throw error
  }
}
