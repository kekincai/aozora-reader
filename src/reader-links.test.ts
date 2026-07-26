import { describe, expect, it } from 'vitest'
import { findTopicFocusRange, parseReaderTarget, topicExampleReaderLink, topicFocusText } from './reader-links'

describe('topic reader deep links', () => {
  it('preserves the work, paragraph, and recognized topic form', () => {
    expect(topicExampleReaderLink('755', 1842, 'kureru')).toBe('/read/755?paragraph=1842&view=reader&focus=kureru')
    expect(topicExampleReaderLink('755', 1842, 'kureru', 'てくれ')).toBe('/read/755?paragraph=1842&view=reader&focus=kureru&text=%E3%81%A6%E3%81%8F%E3%82%8C')
  })

  it('extracts and locates the selected grammar form', () => {
    expect(topicFocusText('先生が説明してくれた。', 'kureru')).toBe('てくれ')
    expect(topicFocusText('蓄音器を聴かせてもらった。', 'morau')).toBe('てもら')
    expect(findTopicFocusRange('先生が説明してくれた。', 'てくれ')).toEqual({ start: 6, end: 9 })
    expect(findTopicFocusRange('見つからない', 'てくれ')).toBeNull()
  })

  it('drops unknown focus values and normalizes unsafe ordinals', () => {
    expect(topicExampleReaderLink('12/3', -4, 'unknown')).toBe('/read/12%2F3?paragraph=1&view=reader')
  })

  it('accepts only positive integer paragraph targets', () => {
    expect(parseReaderTarget('1842')).toBe(1842)
    expect(parseReaderTarget('0')).toBeNull()
    expect(parseReaderTarget('2.5')).toBeNull()
    expect(parseReaderTarget('abc')).toBeNull()
  })
})
