import { describe, expect, it } from 'vitest'
import { parseReaderTarget, topicExampleReaderLink } from './reader-links'

describe('topic reader deep links', () => {
  it('preserves the work, paragraph, and recognized topic form', () => {
    expect(topicExampleReaderLink('755', 1842, 'kureru')).toBe('/read/755?paragraph=1842&view=reader&focus=kureru')
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
