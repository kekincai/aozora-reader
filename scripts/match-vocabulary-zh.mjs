import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hiragana } from './lib/learning-rules.mjs'

/**
 * Adds Chinese meanings to the N2/N1 lexicon from the Tomoshi open dictionary data
 * (JMdict-based, CC BY-SA 4.0, https://huggingface.co/datasets/yuany1z/tomoshi-dict-data).
 * An entry matches only on both spelling and reading, so 包む(つつむ) and 包む(くるむ) stay
 * apart; among a word's senses, the ones closest to our English meaning are used.
 *
 *   TOMOSHI_DB=/path/to/tomoshi-dict-open.db node scripts/match-vocabulary-zh.mjs
 */
const dbPath = process.env.TOMOSHI_DB
if (!dbPath) throw new Error('Set TOMOSHI_DB to the decompressed tomoshi-dict-open.db')
const indexPath = resolve('data/lexicon/index.json')
const outputPath = resolve('data/lexicon/vocabulary-zh.json')
const index = JSON.parse(await readFile(indexPath, 'utf8'))
const db = new DatabaseSync(dbPath, { readOnly: true })

const STOP = new Set('the to a an of be is are and or in on at for with as by one some something someone thing way very not no it its that this up out off'.split(' '))
const words = value => new Set((value.toLowerCase().match(/[a-z]+/g) || []).filter(word => word.length >= 3 && !STOP.has(word)))
const overlap = (a, b) => [...a].filter(word => b.has(word)).length

const byForm = db.prepare('SELECT e.id, e.is_common, e.data, z.data AS zh FROM forms f JOIN entries e ON e.id = f.entry_id JOIN zh_defs z ON z.entry_id = e.id AND z.locale = ? WHERE f.text = ?')

// The source list writes variants as 'アイデア/アイディア' and notes as 'しいんと (する)'.
const variants = value => value.replace(/[(（][^)）]*[)）]/g, '').split('/').map(part => part.trim()).filter(Boolean)

/** Candidate JMdict entries written as `term` and read as `reading`. */
function candidates(term, reading) {
  const wanted = new Set(variants(reading.normalize('NFKC')).map(hiragana))
  const seen = new Map()
  for (const spelling of variants(term)) {
    for (const row of byForm.all('zh-CN', spelling)) {
      if (seen.has(row.id)) continue
      const entry = JSON.parse(row.data)
      if (!entry.kana.some(kana => wanted.has(hiragana(kana.text)) || wanted.has(spelling))) continue
      seen.set(row.id, { id: row.id, common: row.is_common, entry, zh: JSON.parse(row.zh) })
    }
  }
  return [...seen.values()]
}

/** Chinese for the one or two senses that best match our English meaning. */
function chineseMeaning(match, meaning) {
  const ours = words(meaning)
  const senses = match.entry.senses.map((sense, position) => {
    const english = sense.glosses.filter(gloss => gloss.lang === 'eng').map(gloss => gloss.text).join(' ')
    const zh = (match.zh.senses?.[String(position)]?.glosses || []).map(gloss => gloss.text).join('；')
    return { position, score: overlap(ours, words(english)), zh }
  }).filter(sense => sense.zh)
  if (!senses.length) return null
  const best = Math.max(...senses.map(sense => sense.score))
  const chosen = (best > 0 ? senses.filter(sense => sense.score === best) : senses).slice(0, 2)
  const parts = [...new Set(chosen.flatMap(sense => sense.zh.split('；').map(part => part.trim()).filter(Boolean)))]
  return parts.slice(0, 5).join('；')
}

const result = {}
let unmatched = 0
for (const entry of index.vocabulary) {
  if (entry.lowerLevel) continue
  const found = candidates(entry.term, entry.reading)
  if (!found.length) { unmatched += 1; continue }
  const ours = words(entry.meaning)
  // Several JMdict entries can share spelling and reading; prefer common words, then meaning.
  found.sort((a, b) => b.common - a.common || overlap(ours, words(JSON.stringify(b.entry.senses))) - overlap(ours, words(JSON.stringify(a.entry.senses))))
  const meaningZh = chineseMeaning(found[0], entry.meaning)
  if (!meaningZh) { unmatched += 1; continue }
  result[entry.id] = { meaningZh, jmdict: found[0].id, source: 'tomoshi' }
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
const total = index.vocabulary.filter(entry => !entry.lowerLevel).length
console.log(`Chinese meanings: ${Object.keys(result).length} / ${total} (unmatched ${unmatched})`)
