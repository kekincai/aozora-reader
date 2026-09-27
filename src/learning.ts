import { annotateLearning, type AnnotatedToken, type WorkSummary } from './catalog'

export type ArticleRef = { id: string; title: string; author: string; count: number }
export type VocabularyEntry = { id: string; term: string; reading: string; meaning: string; meaningLanguage?: string; level: 'N1'|'N2'; kanaRow: string; kanaKey?: string; category?: string; annotationSafe?: boolean; articles: ArticleRef[] }
export type GrammarEntry = { id: string; title: string; pattern: string; meaning: string; meaningLanguage?: string; formation: string; level: 'N1'|'N2'; category: string; examples: {jp:string;zh?:string}[]; articles: ArticleRef[] }
export type LearningIndex = { notice: string; vocabulary: VocabularyEntry[]; grammar: GrammarEntry[] }
export type SelectedEntry = { kind: 'vocabulary'; entry: VocabularyEntry } | { kind: 'grammar'; entry: GrammarEntry }

let learningIndex: Promise<LearningIndex> | null = null

export function loadLearningIndex() {
  learningIndex ||= fetch('/learning/index.json').then(response => {
    if (!response.ok) throw new Error('learning index unavailable')
    return response.json() as Promise<LearningIndex>
  }).catch(error => { learningIndex = null; throw error })
  return learningIndex
}

export type SerialWork = WorkSummary & { paragraphs: { ordinal: number; text: string; tokens: AnnotatedToken[] }[] }

type Ruby = { startOffset: number; endOffset: number; baseText: string; reading: string }
type WorkResponse = {
  work: WorkSummary
  paragraphs: { ordinal: number; text: string; rubies: Ruby[]; vocabulary?: { startOffset: number; endOffset: number; vocabId: string }[]; grammar?: { startOffset: number; endOffset: number; grammarId: string; ranges: [number, number][] }[] }[]
}

const serialWorks = new Map<string, Promise<SerialWork>>()

/** The whole annotated work; serial works are short enough to paginate on the client. */
export function loadSerialWork(id: string) {
  if (!serialWorks.has(id)) {
    serialWorks.set(id, fetch(`/api/catalog/works/${encodeURIComponent(id)}?from=1&limit=800`).then(async response => {
      if (!response.ok) throw new Error('作品を読み込めませんでした。')
      const data = await response.json() as WorkResponse
      return {
        ...data.work,
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

export function entryWord(selected: SelectedEntry) {
  return selected.kind === 'vocabulary' ? selected.entry.term : selected.entry.pattern
}
