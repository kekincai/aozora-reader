import { describe, expect, it } from 'vitest'
import { annotationSafety, canAnnotateToken, kanaKey } from './learning-rules.mjs'

const token = (surface: string, pos = '名詞', detail = '一般') => ({ surface_form: surface, basic_form: surface, pos, pos_detail_1: detail })

describe('safe learning annotations', () => {
  it.each(['し', 'と', 'さん'])('does not annotate ambiguous kana %s', term => {
    expect(annotationSafety(term, token(term)).safe).toBe(false)
  })

  it('keeps searchable entries separate from annotation eligibility', () => {
    expect(canAnnotateToken({ term: 'し', annotationSafe: false }, token('し'))).toBe(false)
    expect(canAnnotateToken({ term: '暮らす', annotationSafe: true }, token('暮らす', '動詞'))).toBe(true)
  })

  it('folds voiced kana into a full gojuon key', () => {
    expect(kanaKey('がっこう')).toBe('か')
    expect(kanaKey('ぴかぴか')).toBe('ひ')
    expect(kanaKey('ん')).toBe('ん')
  })
})
