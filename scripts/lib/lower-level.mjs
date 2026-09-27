import { hiragana } from './learning-rules.mjs'

const tanosBase = 'https://raw.githubusercontent.com/tristcoil/hanabira.org/main/backend/express/json_data'
export const LOWER_LEVELS = ['N5', 'N4', 'N3']
const KANJI = /[一-龯々]/
const KANJI_ALL = /[一-龯々]/g
const STOP = new Set('the to a an of be is are and or in on at for with as by one some something someone thing way very not no it its that this'.split(' '))

function meaningWords(value = '') {
  return new Set((value.toLowerCase().match(/[a-z]+/g) || []).filter(word => word.length >= 3 && !STOP.has(word)))
}

function kanjiSet(value) {
  return [...new Set(value.match(KANJI_ALL) || [])].sort().join('')
}

export async function loadLowerLevelLists(fetchJson = url => fetch(url).then(response => {
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`)
  return response.json()
})) {
  const lists = {}
  for (const level of LOWER_LEVELS) lists[level] = await fetchJson(`${tanosBase}/wordsTanos_openai_JLPT_${level}_tanos_vocab_list.json`)
  return lists
}

/**
 * Maps N2/N1 entry ids to the lower level (N5, N4 or N3) where the same word already appears,
 * e.g. 面白い listed as N1 but おもしろい is N5. A match needs the same reading, the same
 * spelling (or kana, or the same kanji with different okurigana), and overlapping meanings,
 * so 肺(はい, lung) is not taken for はい(yes).
 */
export function findLowerLevelEntries(vocabulary, lists) {
  const byReading = new Map()
  for (const level of LOWER_LEVELS) for (const item of lists[level] || []) {
    const reading = hiragana(String(item.vocabulary_simplified || '').trim())
    const meaning = meaningWords(item.vocabulary_english)
    for (const spelling of String(item.vocabulary_original || '').replace(/[・･]/g, '').split('/')) {
      const term = spelling.trim()
      if (!term || !reading) continue
      if (!byReading.has(reading)) byReading.set(reading, [])
      byReading.get(reading).push({ term, level, meaning })
    }
  }
  const lower = new Map()
  for (const entry of vocabulary) {
    const meaning = meaningWords(entry.meaning)
    const match = (byReading.get(hiragana(entry.reading || '')) || []).find(item => {
      const sameSpelling = item.term === entry.term || (KANJI.test(item.term) && kanjiSet(item.term) === kanjiSet(entry.term))
      const kanaOnly = !KANJI.test(item.term)
      return (sameSpelling || kanaOnly) && [...meaning].some(word => item.meaning.has(word))
    })
    if (match) lower.set(entry.id, match.level)
  }
  return lower
}
