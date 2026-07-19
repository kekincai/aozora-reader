import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import kuromoji from 'kuromoji'
import * as cheerio from 'cheerio'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const corpusRoot = resolve(root, 'public/corpus')
const learningRoot = resolve(root, 'public/learning')
const dataRoot = resolve(root, 'data')
const rawBase = 'https://raw.githubusercontent.com/tristcoil/hanabira.org/main/backend/express/json_data'
const sources = {
  vocabulary: {
    N2: `${rawBase}/wordsTanos_openai_JLPT_N2_tanos_vocab_list.json`,
    N1: `${rawBase}/wordsTanos_openai_JLPT_N1_tanos_vocab_list.json`,
  },
  grammar: {
    N2: `${rawBase}/grammar_ja_JLPT_N2_0001.json`,
    N1: `${rawBase}/grammar_ja_JLPT_N1_0001.json`,
  },
}

const stopPatterns = new Set(['する', 'です', 'ます', 'ある', 'いる', 'なる', 'こと', 'もの', 'ところ', 'よう', 'ため'])
const categoryRules = [
  ['追加・並列', /addition|moreover|besides|furthermore|also|listing|alternatives/i],
  ['条件・仮定', /condition|even if|whether|unless|provided|assuming|regardless/i],
  ['逆接・対比', /contrast|although|despite|however|but |whereas|contrary/i],
  ['原因・理由', /reason|cause|because|due to|result|consequence/i],
  ['時・場面', /time|when|while|occasion|moment|during|before|after/i],
  ['推量・判断', /guess|assumption|seem|appear|probably|must be|judgment|certain/i],
  ['程度・強調', /degree|extent|emphasis|extreme|only|nothing but|even more/i],
  ['目的・手段', /purpose|means|in order to|method|way of/i],
  ['限定・評価', /limitation|restriction|evaluation|worth|deserve|no more than/i],
]

const hiragana = (value = '') => value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
const clean = (value = '') => value.normalize('NFKC').replace(/[・･]/g, '').trim()
const kanaRow = (reading) => {
  const first = hiragana(reading)[0] || '他'
  const rows = [['あ','あいうえお'],['か','かきくけこがぎぐげご'],['さ','さしすせそざじずぜぞ'],['た','たちつてとだぢづでど'],['な','なにぬねの'],['は','はひふへほばびぶべぼぱぴぷぺぽ'],['ま','まみむめも'],['や','やゆよ'],['ら','らりるれろ'],['わ','わをん']]
  return rows.find(([, chars]) => chars.includes(first))?.[0] || '他'
}

async function loadJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`)
  return response.json()
}

function grammarPattern(title) {
  const japanese = title
    .replace(/\([^)]*[A-Za-z][^)]*\)/g, '')
    .replace(/(?:Noun|Verb|Adjective|Phrase|Sentence|Statement|Plain form|dictionary form|て-form|ない-form|ます-stem|Volitional form|Number|Counter|Question word)/gi, ' ')
  const parts = (japanese.match(/[ぁ-んァ-ヶ一-龯々]+/g) || [])
    .map(clean)
    .filter(item => item && !stopPatterns.has(item))
  if (!parts.length || (parts.length === 1 && parts[0].length < 2)) return { display: '', parts: [] }
  return { display: parts.join('…'), parts }
}

function grammarCategory(entry) {
  const haystack = `${entry.short_explanation} ${entry.long_explanation}`
  return categoryRules.find(([, pattern]) => pattern.test(haystack))?.[0] || '表現・文末'
}

function buildTokenizer() {
  return new Promise((resolveTokenizer, reject) => kuromoji.builder({ dicPath: resolve(root, 'node_modules/kuromoji/dict') }).build((error, tokenizer) => error ? reject(error) : resolveTokenizer(tokenizer)))
}

function plainText(html) {
  const $ = cheerio.load(`<div id="root">${html}</div>`)
  $('rt, rp').remove()
  return $('#root').text().replace(/\s+/g, ' ').trim()
}

function findAll(text, needle) {
  const ranges = []
  if (!needle) return ranges
  let from = 0
  while (from < text.length) {
    const index = text.indexOf(needle, from)
    if (index < 0) break
    ranges.push([index, index + needle.length])
    from = index + needle.length
  }
  return ranges
}

function indexLexicon(entries) {
  const byTerm = new Map()
  for (const entry of entries) {
    const term = clean(entry.term)
    if (term && !byTerm.has(term)) byTerm.set(term, entry)
  }
  return { byTerm }
}

function findGrammarMatches(text, entry) {
  if (entry.matchParts.length === 1) return findAll(text, entry.matchParts[0]).map(range => [range])
  const matches = []
  const first = entry.matchParts[0]
  for (const [start, firstEnd] of findAll(text, first)) {
    let end = firstEnd
    let valid = true
    const ranges = [[start, firstEnd]]
    for (const part of entry.matchParts.slice(1)) {
      const next = text.indexOf(part, end)
      if (next < end || next - end > 18) { valid = false; break }
      end = next + part.length
      ranges.push([next, end])
    }
    if (valid) matches.push(ranges)
  }
  return matches
}

function annotateParagraph(html, tokenizer, vocabIndex, grammarEntries, counters) {
  const text = plainText(html)
  const tokens = tokenizer.tokenize(text)
  const grammarMatches = grammarEntries.flatMap(entry => findGrammarMatches(text, entry).map(ranges => ({ ranges, id: entry.id })))
  for (const match of grammarMatches) counters.grammar.set(match.id, (counters.grammar.get(match.id) || 0) + 1)
  const grammarRanges = grammarMatches.flatMap(match => match.ranges.map(([start, end]) => ({ start, end, id: match.id })))
  return tokens.map(token => {
    const start = Math.max(0, token.word_position - 1)
    const end = start + token.surface_form.length
    const base = clean(token.basic_form === '*' ? token.surface_form : token.basic_form)
    const surface = clean(token.surface_form)
    const reading = hiragana(token.reading === '*' ? '' : token.reading)
    let vocab = vocabIndex.byTerm.get(base) || vocabIndex.byTerm.get(surface)
    const grammarIds = grammarRanges.filter(range => range.start < end && range.end > start).map(range => range.id)
    if (vocab) counters.vocabulary.set(vocab.id, (counters.vocabulary.get(vocab.id) || 0) + 1)
    const showReading = /[一-龯々]/.test(token.surface_form) && reading && hiragana(token.surface_form) !== reading
    return { text: token.surface_form, ...(showReading ? { reading } : {}), ...(vocab ? { vocabId: vocab.id } : {}), ...(grammarIds.length ? { grammarIds } : {}) }
  })
}

const [rawN2Vocab, rawN1Vocab, rawN2Grammar, rawN1Grammar, manifest, tokenizer] = await Promise.all([
  loadJson(sources.vocabulary.N2), loadJson(sources.vocabulary.N1), loadJson(sources.grammar.N2), loadJson(sources.grammar.N1),
  readFile(resolve(corpusRoot, 'manifest.json'), 'utf8').then(JSON.parse), buildTokenizer(),
])

const vocabulary = [...rawN2Vocab.map(item => [item, 'N2']), ...rawN1Vocab.map(item => [item, 'N1'])].map(([item, level], index) => ({
  id: `v${index + 1}`,
  term: clean(item.vocabulary_original || item.vocabulary_simplified),
  reading: hiragana(clean(item.vocabulary_simplified || item.vocabulary_original)),
  meaning: item.vocabulary_english,
  level,
  kanaRow: kanaRow(item.vocabulary_simplified || item.vocabulary_original),
  source: 'Tanos JLPT reference list via Hanabira',
}))

const grammar = [...rawN2Grammar.map(item => [item, 'N2']), ...rawN1Grammar.map(item => [item, 'N1'])].map(([item, level], index) => ({
  id: `g${index + 1}`,
  title: item.title,
  pattern: grammarPattern(item.title).display,
  matchParts: grammarPattern(item.title).parts,
  meaning: item.short_explanation,
  formation: item.formation,
  level,
  category: grammarCategory(item),
  examples: (item.examples || []).slice(0, 2).map(example => ({ jp: example.jp, en: example.en })),
  source: 'Hanabira Japanese content',
})).filter(entry => entry.pattern)

const vocabIndex = indexLexicon(vocabulary)
const articleRefs = Object.fromEntries([...vocabulary, ...grammar].map(entry => [entry.id, []]))
const works = []
for (const summary of manifest.works) {
  const path = resolve(corpusRoot, 'works', `${summary.id}.json`)
  const work = JSON.parse(await readFile(path, 'utf8'))
  const counters = { vocabulary: new Map(), grammar: new Map() }
  const annotatedParagraphs = work.paragraphs.map(paragraph => annotateParagraph(paragraph, tokenizer, vocabIndex, grammar, counters))
  for (const [entryId, count] of [...counters.vocabulary, ...counters.grammar]) articleRefs[entryId].push({ id: work.id, title: work.title, author: work.author, count })
  const learning = {
    vocabularyCount: [...counters.vocabulary.values()].reduce((sum, count) => sum + count, 0),
    vocabularyUnique: counters.vocabulary.size,
    grammarCount: [...counters.grammar.values()].reduce((sum, count) => sum + count, 0),
    grammarUnique: counters.grammar.size,
  }
  const next = { ...work, annotatedParagraphs, learning }
  await writeFile(path, `${JSON.stringify(next)}\n`)
  works.push({ ...summary, learning })
}

const withRefs = entry => ({ ...entry, articles: articleRefs[entry.id] })
await mkdir(learningRoot, { recursive: true })
await mkdir(dataRoot, { recursive: true })
await writeFile(resolve(learningRoot, 'index.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  notice: 'JLPT公式は完全な語彙・文法リストを公開していません。N1/N2は公開学習資料に基づく参考分類です。',
  sources: [
    { name: 'Tanos JLPT vocabulary lists', url: 'https://www.tanos.co.uk/jlpt/', license: 'CC BY' },
    { name: 'Hanabira Japanese content', url: 'https://github.com/tristcoil/hanabira.org-japanese-content', license: 'Creative Commons (attribution required)' },
    { name: 'kuromoji.js', url: 'https://github.com/takuyaa/kuromoji.js', license: 'Apache-2.0' },
  ],
  vocabulary: vocabulary.map(withRefs),
  grammar: grammar.map(withRefs),
}, null, 2)}\n`)
await writeFile(resolve(corpusRoot, 'manifest.json'), `${JSON.stringify({ ...manifest, generatedAt: new Date().toISOString(), works }, null, 2)}\n`)

const database = new DatabaseSync(resolve(dataRoot, 'aozora-learning.sqlite'))
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, level TEXT NOT NULL, genre TEXT NOT NULL, source_url TEXT NOT NULL, source_path TEXT NOT NULL, paragraphs_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS vocabulary (id TEXT PRIMARY KEY, term TEXT NOT NULL, reading TEXT NOT NULL, meaning TEXT NOT NULL, level TEXT NOT NULL, kana_row TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS grammar (id TEXT PRIMARY KEY, title TEXT NOT NULL, pattern TEXT NOT NULL, meaning TEXT NOT NULL, formation TEXT NOT NULL, level TEXT NOT NULL, category TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS occurrences (work_id TEXT NOT NULL, entry_id TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (work_id, entry_id));
  CREATE INDEX IF NOT EXISTS occurrence_entry_idx ON occurrences(entry_id, work_id);
`)
const insertWork = database.prepare('INSERT OR REPLACE INTO works VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
const insertVocabulary = database.prepare('INSERT OR REPLACE INTO vocabulary VALUES (?, ?, ?, ?, ?, ?)')
const insertGrammar = database.prepare('INSERT OR REPLACE INTO grammar VALUES (?, ?, ?, ?, ?, ?, ?)')
const insertOccurrence = database.prepare('INSERT OR REPLACE INTO occurrences VALUES (?, ?, ?, ?)')
const clearWorkOccurrences = database.prepare('DELETE FROM occurrences WHERE work_id = ?')
database.exec('BEGIN')
try {
  for (const summary of works) {
    const work = JSON.parse(await readFile(resolve(corpusRoot, 'works', `${summary.id}.json`), 'utf8'))
    clearWorkOccurrences.run(work.id)
    insertWork.run(work.id, work.title, work.author, work.level, work.genre, work.sourceUrl, work.sourcePath, JSON.stringify(work.annotatedParagraphs), new Date().toISOString())
  }
  for (const entry of vocabulary) insertVocabulary.run(entry.id, entry.term, entry.reading, entry.meaning, entry.level, entry.kanaRow)
  for (const entry of grammar) insertGrammar.run(entry.id, entry.title, entry.pattern, entry.meaning, entry.formation, entry.level, entry.category)
  for (const [entryId, refs] of Object.entries(articleRefs)) for (const ref of refs) insertOccurrence.run(ref.id, entryId, entryId.startsWith('v') ? 'vocabulary' : 'grammar', ref.count)
  database.exec('COMMIT')
} catch (error) {
  database.exec('ROLLBACK')
  throw error
} finally {
  database.close()
}

const stats = {
  vocabularyEntries: vocabulary.length,
  grammarEntries: grammar.length,
  vocabularyInCorpus: vocabulary.filter(entry => articleRefs[entry.id].length).length,
  grammarInCorpus: grammar.filter(entry => articleRefs[entry.id].length).length,
  vocabularyOccurrences: Object.entries(articleRefs).filter(([id]) => id.startsWith('v')).flatMap(([, refs]) => refs).reduce((sum, ref) => sum + ref.count, 0),
  grammarOccurrences: Object.entries(articleRefs).filter(([id]) => id.startsWith('g')).flatMap(([, refs]) => refs).reduce((sum, ref) => sum + ref.count, 0),
}
console.log(JSON.stringify(stats, null, 2))
