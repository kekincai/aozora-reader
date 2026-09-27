import { describe, expect, it } from 'vitest'
import { annotationSafety, canAnnotateToken, kanaKey, readingMatches } from './learning-rules.mjs'

const token = (surface: string, pos = '名詞', detail = '一般') => ({ surface_form: surface, basic_form: surface, pos, pos_detail_1: detail })

describe('safe learning annotations', () => {
  it.each(['し', 'と', 'さん'])('does not annotate ambiguous kana %s', term => {
    expect(annotationSafety(term, token(term)).safe).toBe(false)
  })

  it('keeps searchable entries separate from annotation eligibility', () => {
    expect(canAnnotateToken({ term: 'し', annotationSafe: false }, token('し'))).toBe(false)
    expect(canAnnotateToken({ term: '暮らす', annotationSafe: true }, token('暮らす', '動詞'))).toBe(true)
  })

  it('rejects the same characters read as a different word', () => {
    const boku = { surface_form: '僕', basic_form: '僕', reading: 'ボク', pos: '名詞', pos_detail_1: '代名詞' }
    expect(canAnnotateToken({ term: '僕', reading: 'しもべ', annotationSafe: true }, boku)).toBe(false)
    const akari = { surface_form: '灯', basic_form: '灯', reading: 'アカリ', pos: '名詞', pos_detail_1: '一般' }
    expect(readingMatches({ term: '灯', reading: 'ともしび' }, akari)).toBe(false)
  })

  it('matches conjugated forms by the kanji stem', () => {
    const sasatta = { surface_form: '刺さっ', basic_form: '刺さる', reading: 'ササッ', pos: '動詞', pos_detail_1: '自立' }
    expect(canAnnotateToken({ term: '刺さる', reading: 'ささる', annotationSafe: true }, sasatta)).toBe(true)
    const tsutsun = { surface_form: '包ん', basic_form: '包む', reading: 'ツツン', pos: '動詞', pos_detail_1: '自立' }
    expect(readingMatches({ term: '包む', reading: 'つつむ' }, tsutsun)).toBe(true)
    const mabushii = { surface_form: '眩しい', basic_form: '眩しい', reading: 'マブシイ', pos: '形容詞', pos_detail_1: '自立' }
    expect(readingMatches({ term: '眩しい', reading: 'まぶしい' }, mabushii)).toBe(true)
  })

  it('keeps kana-only entries and tokens without a known reading', () => {
    expect(readingMatches({ term: 'あきれる', reading: 'あきれる' }, { surface_form: 'あきれ', reading: 'アキレ' })).toBe(true)
    expect(readingMatches({ term: '刺さる', reading: 'ささる' }, { surface_form: '刺さる' })).toBe(true)
  })

  it('folds voiced kana into a full gojuon key', () => {
    expect(kanaKey('がっこう')).toBe('か')
    expect(kanaKey('ぴかぴか')).toBe('ひ')
    expect(kanaKey('ん')).toBe('ん')
  })
})
