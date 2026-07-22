import { describe, expect, it } from 'vitest'
import { annotateRuby } from './catalog'

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
