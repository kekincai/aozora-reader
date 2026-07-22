import { describe, expect, it } from 'vitest'
import { annotateLearning, annotateRuby } from './catalog'

describe('catalog reader', () => {
  it('applies PostgreSQL code-point offsets to ruby without losing text', () => {
    expect(annotateRuby('🦊狐が棲む', [
      { startOffset: 1, endOffset: 2, baseText: '狐', reading: 'きつね' },
      { startOffset: 3, endOffset: 4, baseText: '棲', reading: 'す' },
    ])).toEqual([
      { text: '🦊' },
      { text: '狐', reading: 'きつね' },
      { text: 'が' },
      { text: '棲', reading: 'す' },
      { text: 'む' },
    ])
  })
})

describe('database learning annotations', () => {
  it('combines ruby and safe vocabulary spans without marking nearby kana', () => {
    const tokens = annotateLearning('狐と暮らす', [{ startOffset: 0, endOffset: 1, baseText: '狐', reading: 'きつね' }], [{ startOffset: 2, endOffset: 5, vocabId: 'v1' }], [])
    expect(tokens.map(token => token.text).join('')).toBe('狐と暮らす')
    expect(tokens.find(token => token.text === 'と')?.vocabId).toBeUndefined()
    expect(tokens.find(token => token.text === '暮らす')?.vocabId).toBe('v1')
  })
})
