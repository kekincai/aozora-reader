import { describe, expect, it } from 'vitest'
import { findLowerLevelEntries } from './lower-level.mjs'

const lists = {
  N5: [
    { vocabulary_original: 'おもしろい', vocabulary_simplified: 'おもしろい', vocabulary_english: 'interesting, funny' },
    { vocabulary_original: '明い', vocabulary_simplified: 'あかるい', vocabulary_english: 'bright, cheerful' },
    { vocabulary_original: 'はい', vocabulary_simplified: 'はい', vocabulary_english: 'yes' },
  ],
  N4: [{ vocabulary_original: '包む', vocabulary_simplified: 'つつむ', vocabulary_english: 'to wrap' }],
  N3: [{ vocabulary_original: '意見', vocabulary_simplified: 'いけん', vocabulary_english: 'opinion, view' }],
}

describe('findLowerLevelEntries', () => {
  it('finds basic words listed as N1 under another spelling', () => {
    const found = findLowerLevelEntries([
      { id: 'v1', term: '面白い', reading: 'おもしろい', meaning: 'interesting, amusing' },
      { id: 'v2', term: '明るい', reading: 'あかるい', meaning: 'bright, colourful' },
    ], lists)
    expect(Object.fromEntries(found)).toEqual({ v1: 'N5', v2: 'N5' })
  })

  it('keeps homophones and different readings of the same kanji', () => {
    const found = findLowerLevelEntries([
      { id: 'v3', term: '肺', reading: 'はい', meaning: 'lung' },
      { id: 'v4', term: '包む', reading: 'くるむ', meaning: 'to be wrapped up' },
      { id: 'v5', term: '異見', reading: 'いけん', meaning: 'different opinion, objection' },
    ], lists)
    expect(found.size).toBe(0)
  })
})
