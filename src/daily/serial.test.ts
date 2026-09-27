import { describe, expect, it } from 'vitest'
import { advance, buildQuiz, firstSentence, openingLine, pageAt, paginate, pickQuote, SERIAL_ORDER } from './serial'

const paragraphs = Array.from({ length: 10 }, (_, index) => ({ ordinal: index + 1, text: 'あ'.repeat(250) }))

describe('paginate', () => {
  it('splits on paragraph boundaries at the pace budget', () => {
    expect(paginate(paragraphs, 5).map(page => page.map(p => p.ordinal))).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]])
  })

  it('folds a short tail into the last page', () => {
    const withTail = [...paragraphs.slice(0, 8), { ordinal: 9, text: 'い'.repeat(100) }]
    expect(paginate(withTail, 5).map(page => page.length)).toEqual([4, 5])
  })
})

describe('pageAt', () => {
  it('resumes mid-page when the pace changed', () => {
    const page = pageAt(paragraphs, 5, 3)
    expect(page).toMatchObject({ number: 1, total: 3, ordinals: [3, 4], isLast: false })
  })

  it('returns null past the end', () => {
    expect(pageAt(paragraphs, 5, 11)).toBeNull()
  })
})

describe('advance', () => {
  it('moves to the next paragraph, then to the next work', () => {
    const first = pageAt(paragraphs, 5, 1)!
    expect(advance({ workId: '637', ordinal: 1 }, first)).toEqual({ position: { workId: '637', ordinal: 5 }, finishedWork: null })
    const last = pageAt(paragraphs, 5, 9)!
    expect(advance({ workId: '637', ordinal: 9 }, last)).toEqual({ position: { workId: SERIAL_ORDER[1], ordinal: 1 }, finishedWork: '637' })
  })
})

describe('text helpers', () => {
  it('takes the first sentence', () => {
    expect(firstSentence('やがて、行手にぽっつりあかりが一つ見え始めました。それを子供の狐が見つけて')).toBe('やがて、行手にぽっつりあかりが一つ見え始めました。')
  })

  it('skips chapter numbers for the opening line', () => {
    expect(openingLine(['一', 'これは、私が小さいときに、村の茂平というおじいさんからきいたお話です。'])).toBe('これは、私が小さいときに、村の茂平というおじいさんからきいたお話です。')
  })

  it('prefers a quote that uses a quiz word', () => {
    expect(pickQuote(['短い。雪はあまり白いので、包んでも包んでも白く浮びあがっていました。母さん狐は洞穴の入口から外へ出て始めてわけが解りました。'], ['浮びあがって']))
      .toBe('雪はあまり白いので、包んでも包んでも白く浮びあがっていました。')
  })
})

describe('buildQuiz', () => {
  const sources = [
    { id: 'v1', surface: '包んで', word: '包む', answer: 'to wrap', context: '手で包んで', level: 'N2', kind: 'vocabulary' as const },
    { id: 'v1', surface: '包み', word: '包む', answer: 'to wrap', context: '包みに', level: 'N2', kind: 'vocabulary' as const },
    { id: 'g1', surface: 'てやる', word: 'てやる', answer: '为别人做', context: '買ってやろう', level: 'N2', kind: 'grammar' as const },
  ]

  it('deduplicates, keeps the answer among four options and is stable per seed', () => {
    const quiz = buildQuiz(sources, { vocabulary: ['to push', 'to dry', 'to hold', 'to wrap', 'to run'], grammar: ['表示原因', '表示对比', '表示条件'] }, '2026-09-27')
    expect(quiz.map(question => question.id)).toEqual(['v1', 'g1'])
    expect(quiz[0].options).toHaveLength(4)
    expect(quiz[0].options[quiz[0].answerIndex]).toBe('to wrap')
    expect(new Set(quiz[0].options).size).toBe(4)
    expect(quiz[1].options).toContain('为别人做')
    expect(quiz[1].options).not.toContain('to push')
    const again = buildQuiz(sources, { vocabulary: ['to push', 'to dry', 'to hold', 'to wrap', 'to run'], grammar: ['表示原因', '表示对比', '表示条件'] }, '2026-09-27')
    expect(again).toEqual(quiz)
  })
})
