import { annotateLearning, type AnnotatedToken, type WorkSummary } from './catalog'

export type ArticleRef = { id: string; title: string; author: string; count: number; ordinal?: number | null; text?: string | null }
export type VocabularyEntry = { id: string; term: string; reading: string; meaning: string; meaningZh?: string | null; meaningLanguage?: string; level: 'N1'|'N2'; kanaKey?: string; category?: string; annotationSafe?: boolean; articles?: ArticleRef[]; workCount?: number }
export type GrammarEntry = { id: string; title: string; pattern: string; meaning: string; meaningLanguage?: string; formation: string; level: 'N1'|'N2'; category: string; examples: {jp:string;zh?:string}[]; articles?: ArticleRef[]; workCount?: number }
/** The dictionary entries a work (or a window of it) actually uses. */
export type WorkEntries = { vocabulary: VocabularyEntry[]; grammar: GrammarEntry[] }
export type LearningSummary = { vocabulary: number; grammar: number; vocabularyCategories: string[]; grammarCategories: string[] }
export type SelectedEntry = { kind: 'vocabulary'; entry: VocabularyEntry } | { kind: 'grammar'; entry: GrammarEntry }

let summary: Promise<LearningSummary> | null = null

export function loadLearningSummary() {
  summary ||= fetch('/api/learning/summary').then(response => {
    if (!response.ok) throw new Error('learning summary unavailable')
    return response.json() as Promise<LearningSummary>
  }).catch(error => { summary = null; throw error })
  return summary
}

const articleCache = new Map<string, Promise<ArticleRef[]>>()

export function loadEntryArticles(kind: SelectedEntry['kind'], id: string) {
  const key = `${kind}:${id}`
  if (!articleCache.has(key)) articleCache.set(key, fetch(`/api/learning/${kind}/${encodeURIComponent(id)}/articles`)
    .then(response => response.ok ? response.json() as Promise<{ articles: ArticleRef[] }> : { articles: [] })
    .then(result => result.articles)
    .catch(() => { articleCache.delete(key); return [] }))
  return articleCache.get(key)!
}

export type SerialWork = WorkSummary & { paragraphs: { ordinal: number; text: string; tokens: AnnotatedToken[] }[]; entries: WorkEntries }

type Ruby = { startOffset: number; endOffset: number; baseText: string; reading: string }
type WorkResponse = {
  work: WorkSummary
  entries?: WorkEntries
  paragraphs: { ordinal: number; text: string; rubies: Ruby[]; vocabulary?: { startOffset: number; endOffset: number; vocabId: string }[]; grammar?: { startOffset: number; endOffset: number; grammarId: string; ranges: [number, number][] }[] }[]
}

const serialWorks = new Map<string, Promise<SerialWork>>()

export type WorkWindow = { work: WorkSummary; paragraphs: SerialWork['paragraphs']; entries: WorkEntries; nextFrom: number | null }

/** A window of paragraphs from `from`, for the full-text reader to load as the reader scrolls. */
export async function loadWorkWindow(id: string, from: number, limit = 60): Promise<WorkWindow> {
  const response = await fetch(`/api/catalog/works/${encodeURIComponent(id)}?from=${from}&limit=${limit}`)
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || '作品を読み込めませんでした。')
  }
  const data = await response.json() as WorkResponse & { page: { nextFrom: number | null } }
  return {
    work: data.work,
    entries: data.entries || { vocabulary: [], grammar: [] },
    paragraphs: data.paragraphs.map(paragraph => ({ ordinal: paragraph.ordinal, text: paragraph.text, tokens: annotateLearning(paragraph.text, paragraph.rubies, paragraph.vocabulary, paragraph.grammar) })),
    nextFrom: data.page.nextFrom,
  }
}

/** The whole annotated work; serial works are short enough to paginate on the client. */
export function loadSerialWork(id: string) {
  if (!serialWorks.has(id)) {
    serialWorks.set(id, fetch(`/api/catalog/works/${encodeURIComponent(id)}?from=1&limit=1200`).then(async response => {
      if (!response.ok) throw new Error('作品を読み込めませんでした。')
      const data = await response.json() as WorkResponse
      return {
        ...data.work,
        entries: data.entries || { vocabulary: [], grammar: [] },
        paragraphs: data.paragraphs.map(paragraph => ({ ordinal: paragraph.ordinal, text: paragraph.text, tokens: annotateLearning(paragraph.text, paragraph.rubies, paragraph.vocabulary, paragraph.grammar) })),
      }
    }).catch(error => { serialWorks.delete(id); throw error }))
  }
  return serialWorks.get(id)!
}

export function entryForToken(token: AnnotatedToken, vocabulary: Map<string, VocabularyEntry>, grammar: Map<string, GrammarEntry>): SelectedEntry | null {
  const vocab = token.vocabId ? vocabulary.get(token.vocabId) : undefined
  if (vocab) return { kind: 'vocabulary', entry: vocab }
  const pattern = token.grammarIds?.map(id => grammar.get(id)).find(Boolean)
  return pattern ? { kind: 'grammar', entry: pattern } : null
}

/** The sentence around a character offset, used as card context. */
export function sentenceAround(text: string, offset: number) {
  const characters = Array.from(text)
  let start = offset
  let end = offset
  while (start > 0 && !'。！？'.includes(characters[start - 1])) start -= 1
  while (end < characters.length && !'。！？'.includes(characters[end])) end += 1
  return characters.slice(start, Math.min(characters.length, end + 1)).join('').trim()
}

/** Chinese when the lexicon has it (grammar always does), otherwise the English reference meaning. */
export function meaningOf(entry: VocabularyEntry | GrammarEntry) {
  return 'meaningZh' in entry && entry.meaningZh ? entry.meaningZh : entry.meaning
}

/** The English meaning to show under a Chinese one, if there is one. */
export function englishMeaning(entry: VocabularyEntry | GrammarEntry) {
  return 'meaningZh' in entry && entry.meaningZh ? entry.meaning : null
}

export function entryWord(selected: SelectedEntry) {
  return selected.kind === 'vocabulary' ? selected.entry.term : selected.entry.pattern
}
