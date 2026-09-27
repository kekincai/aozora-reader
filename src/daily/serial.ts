import type { Pace, SerialPosition } from '../state/store'

/** The reading path, easiest first. Finishing one work starts the next. */
export const SERIAL_ORDER = ['637', '92', '628', '43754', '211', '2363', '1567', '799', '624', '45245']

/** Characters per page. Roughly 200 characters a minute for an N2 reader. */
export const PACE_CHARACTERS: Record<Pace, number> = { 3: 600, 5: 1000, 10: 2000 }

export type SerialParagraph = { ordinal: number; text: string }
export type DailyPage = { number: number; total: number; ordinals: number[]; characters: number; isLast: boolean }

/**
 * Splits a work into pages on paragraph boundaries. A short tail is folded into
 * the last page so nobody finishes a work on a two-line page.
 */
export function paginate(paragraphs: SerialParagraph[], pace: Pace) {
  const budget = PACE_CHARACTERS[pace]
  const pages: SerialParagraph[][] = []
  let current: SerialParagraph[] = []
  let size = 0
  for (const paragraph of paragraphs) {
    current.push(paragraph)
    size += Array.from(paragraph.text).length
    if (size >= budget) { pages.push(current); current = []; size = 0 }
  }
  if (current.length) {
    if (pages.length && size < budget * 0.4) pages[pages.length - 1].push(...current)
    else pages.push(current)
  }
  return pages
}

export function pageAt(paragraphs: SerialParagraph[], pace: Pace, ordinal: number): DailyPage | null {
  const pages = paginate(paragraphs, pace)
  const index = pages.findIndex(page => page.some(paragraph => paragraph.ordinal >= ordinal))
  if (index < 0) return null
  // Resume at the page containing the saved ordinal, even if the pace changed.
  const page = pages[index].filter(paragraph => paragraph.ordinal >= ordinal)
  return {
    number: index + 1,
    total: pages.length,
    ordinals: page.map(paragraph => paragraph.ordinal),
    characters: page.reduce((sum, paragraph) => sum + Array.from(paragraph.text).length, 0),
    isLast: index === pages.length - 1,
  }
}

/** Where the reader stands after finishing a page. */
export function advance(position: SerialPosition, page: DailyPage): { position: SerialPosition | null; finishedWork: string | null } {
  if (!page.isLast) return { position: { workId: position.workId, ordinal: page.ordinals[page.ordinals.length - 1] + 1 }, finishedWork: null }
  const next = SERIAL_ORDER[SERIAL_ORDER.indexOf(position.workId) + 1]
  return { position: next ? { workId: next, ordinal: 1 } : null, finishedWork: position.workId }
}

export function startingPosition(finished: string[]): SerialPosition | null {
  const next = SERIAL_ORDER.find(id => !finished.includes(id))
  return next ? { workId: next, ordinal: 1 } : null
}

export function sentences(text: string) {
  return text.match(/[^。！？!?]+[。！？!?」』]*/g)?.map(sentence => sentence.trim()).filter(Boolean) || []
}

export function firstSentence(text: string, max = 48) {
  const sentence = sentences(text)[0] || text
  return Array.from(sentence).length > max ? `${Array.from(sentence).slice(0, max).join('')}……` : sentence
}

/** The first real sentence, skipping chapter numbers and headings such as「一」. */
export function openingLine(texts: string[], max = 60) {
  const text = texts.find(value => Array.from(value.trim()).length >= 8) || texts[0] || ''
  return firstSentence(text.trim(), max)
}

/** A line worth keeping: prefers one that uses a word from today's quiz. */
export function pickQuote(texts: string[], preferred: string[] = []) {
  const candidates = texts.flatMap(sentences).filter(sentence => {
    const length = Array.from(sentence).length
    return length >= 16 && length <= 64
  })
  return candidates.find(sentence => preferred.some(word => sentence.includes(word)))
    || candidates.sort((a, b) => Array.from(b).length - Array.from(a).length)[0]
    || null
}

export type QuizSource = { id: string; surface: string; word: string; answer: string; context: string; level: string; kind: 'vocabulary' | 'grammar' }
export type QuizQuestion = QuizSource & { options: string[]; answerIndex: number }

function seeded(seed: string) {
  let hash = 2166136261
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296
  }
}

/**
 * Up to three questions from words that actually appear on the page. Options
 * are shuffled deterministically so a reload shows the same quiz.
 */
export function buildQuiz(sources: QuizSource[], distractors: Record<QuizSource['kind'], string[]>, seed: string, count = 3): QuizQuestion[] {
  const random = seeded(seed)
  const unique = sources.filter((source, index) => sources.findIndex(item => item.id === source.id) === index)
  const vocabulary = unique.filter(source => source.kind === 'vocabulary')
  const chosen = [...vocabulary, ...unique.filter(source => source.kind === 'grammar')].slice(0, count)
  return chosen.map(source => {
    const pool = Array.from(new Set(distractors[source.kind])).filter(option => option && option !== source.answer)
    const wrong: string[] = []
    while (wrong.length < 3 && pool.length) wrong.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
    const options = [source.answer, ...wrong]
    for (let index = options.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[options[index], options[swap]] = [options[swap], options[index]]
    }
    return { ...source, options, answerIndex: options.indexOf(source.answer) }
  })
}
