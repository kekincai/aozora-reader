import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import kuromoji from 'kuromoji'
import { createClient } from './config.mjs'
import { canAnnotateToken } from '../lib/learning-rules.mjs'

const root = resolve('.')
const database = process.env.PGDATABASE || 'aozora_reader'
const limit = Math.max(0, Number(process.env.AOZORA_LEARNING_LIMIT || 0))
const force = process.env.AOZORA_LEARNING_FORCE === 'true'
const progressEvery = Math.max(1, Number(process.env.AOZORA_LEARNING_PROGRESS_EVERY || 25))
const index = JSON.parse(await readFile(resolve(root, 'public/learning/index.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(root, 'public/corpus/manifest.json'), 'utf8'))
const version = `learning-v3:${index.generatedAt}`

const tokenizer = await new Promise((resolveTokenizer, reject) => kuromoji.builder({ dicPath: resolve(root, 'node_modules/kuromoji/dict') }).build((error, value) => error ? reject(error) : resolveTokenizer(value)))
const clean = (value = '') => value.normalize('NFKC').replace(/[・･]/g, '').trim()
const byTerm = new Map()
for (const entry of index.vocabulary) if (entry.annotationSafe && !byTerm.has(clean(entry.term))) byTerm.set(clean(entry.term), entry)
const grammar = index.grammar.filter(entry => entry.matchParts?.length && entry.matchParts.every(part => part.length >= 2))

function findAll(text, needle) {
  const ranges = []
  let from = 0
  while (needle && from < text.length) {
    const start = text.indexOf(needle, from)
    if (start < 0) break
    ranges.push([start, start + needle.length])
    from = start + needle.length
  }
  return ranges
}

function grammarMatches(text, entry) {
  const matches = []
  for (const [start, firstEnd] of findAll(text, entry.matchParts[0])) {
    let end = firstEnd
    const ranges = [[start, firstEnd]]
    let valid = true
    for (const part of entry.matchParts.slice(1)) {
      const next = text.indexOf(part, end)
      if (next < end || next - end > 18) { valid = false; break }
      end = next + part.length
      ranges.push([next, end])
    }
    if (valid) matches.push({ start, end, ranges })
  }
  return matches
}

function analyzeParagraph(paragraph) {
  const vocabulary = []
  const grammarOccurrences = []
  for (const token of tokenizer.tokenize(paragraph.plain_text)) {
    const base = clean(token.basic_form === '*' ? token.surface_form : token.basic_form)
    const surface = clean(token.surface_form)
    const entry = byTerm.get(base) || byTerm.get(surface)
    if (!entry || !canAnnotateToken(entry, token)) continue
    const start = Math.max(0, token.word_position - 1)
    vocabulary.push({ vocabulary_id: entry.id, start_offset: start, end_offset: start + token.surface_form.length, surface_form: token.surface_form })
  }
  for (const entry of grammar) for (const match of grammarMatches(paragraph.plain_text, entry)) grammarOccurrences.push({ grammar_id: entry.id, start_offset: match.start, end_offset: match.end, ranges: match.ranges })
  return { vocabulary, grammar: grammarOccurrences }
}

async function insertRows(client, table, fields, rows) {
  if (!rows.length) return
  await client.query(`insert into ${table} (${fields.map(([name]) => name).join(',')}) select ${fields.map(([name]) => name).join(',')} from jsonb_to_recordset($1::jsonb) as x(${fields.map(([name, type]) => `${name} ${type}`).join(',')})`, [JSON.stringify(rows)])
}

async function seedLexicon(client) {
  await client.query(`
    insert into learning.vocabulary(id,term,reading,meaning,meaning_language,jlpt_level,kana_key,category,annotation_safe,annotation_note,source_name)
    select id,term,reading,meaning,meaning_language,jlpt_level,kana_key,category,annotation_safe,annotation_note,source_name
    from jsonb_to_recordset($1::jsonb) as x(id text,term text,reading text,meaning text,meaning_language text,jlpt_level text,kana_key text,category text,annotation_safe boolean,annotation_note text,source_name text)
    on conflict(id) do update set term=excluded.term,reading=excluded.reading,meaning=excluded.meaning,meaning_language=excluded.meaning_language,jlpt_level=excluded.jlpt_level,kana_key=excluded.kana_key,category=excluded.category,annotation_safe=excluded.annotation_safe,annotation_note=excluded.annotation_note,source_name=excluded.source_name,updated_at=now()
  `, [JSON.stringify(index.vocabulary.map(entry => ({ id: entry.id, term: entry.term, reading: entry.reading, meaning: entry.meaning, meaning_language: entry.meaningLanguage || 'en', jlpt_level: entry.level, kana_key: entry.kanaKey, category: entry.category, annotation_safe: entry.annotationSafe, annotation_note: entry.annotationNote || null, source_name: entry.source })))])
  await client.query(`
    insert into learning.grammar_patterns(id,title,pattern,match_parts,meaning,meaning_language,formation,jlpt_level,category,examples,annotation_safe,source_name)
    select id,title,pattern,match_parts,meaning,meaning_language,formation,jlpt_level,category,examples,annotation_safe,source_name
    from jsonb_to_recordset($1::jsonb) as x(id text,title text,pattern text,match_parts text[],meaning text,meaning_language text,formation text,jlpt_level text,category text,examples jsonb,annotation_safe boolean,source_name text)
    on conflict(id) do update set title=excluded.title,pattern=excluded.pattern,match_parts=excluded.match_parts,meaning=excluded.meaning,meaning_language=excluded.meaning_language,formation=excluded.formation,jlpt_level=excluded.jlpt_level,category=excluded.category,examples=excluded.examples,annotation_safe=excluded.annotation_safe,source_name=excluded.source_name,updated_at=now()
  `, [JSON.stringify(index.grammar.map(entry => ({ id: entry.id, title: entry.title, pattern: entry.pattern, match_parts: entry.matchParts || [], meaning: entry.meaning, meaning_language: /[\u4e00-\u9fff]/.test(entry.meaning) ? 'zh' : 'en', formation: entry.formation, jlpt_level: entry.level, category: entry.category, examples: entry.examples || [], annotation_safe: grammar.includes(entry), source_name: entry.source })))])
  for (const work of manifest.works) await client.query(`
    insert into app.work_profiles(work_id,jlpt_level,genres,estimated_minutes,summary_ja,is_curated,is_published)
    select w.id,$2,$3,$4,$5,true,true from catalog.works w where w.aozora_work_id=$1
    on conflict(work_id) do update set jlpt_level=excluded.jlpt_level,genres=excluded.genres,estimated_minutes=excluded.estimated_minutes,summary_ja=excluded.summary_ja,is_curated=true,is_published=true,updated_at=now()
  `, [Number(work.id), work.level === 'N2' ? 'N2' : work.level === 'N1' ? 'N1' : 'N2+', [work.genre], work.minutes, work.summary])
}

const client = createClient(database)
await client.connect()
try {
  await seedLexicon(client)
  const works = await client.query(`
    select w.id,w.aozora_work_id,w.title from catalog.works w
    left join learning.work_analysis a on a.work_id=w.id and a.analysis_version=$1
    where w.copyright_status='なし' and w.has_content and ($2::boolean or a.work_id is null)
    order by w.id ${limit ? 'limit $3' : ''}
  `, limit ? [version, force, limit] : [version, force])
  console.log(`Learning analysis: ${works.rowCount} works pending; version ${version}`)
  const started = Date.now()
  for (const [workIndex, work] of works.rows.entries()) {
    const paragraphs = await client.query('select id,plain_text from catalog.paragraphs where work_id=$1 order by ordinal', [work.id])
    const vocabRows = []
    const grammarRows = []
    const vocabCounts = new Map()
    const grammarCounts = new Map()
    for (const paragraph of paragraphs.rows) {
      const analyzed = analyzeParagraph(paragraph)
      analyzed.vocabulary.forEach((row, ordinal) => { vocabRows.push({ paragraph_id: paragraph.id, ordinal: ordinal + 1, ...row }); vocabCounts.set(row.vocabulary_id, (vocabCounts.get(row.vocabulary_id) || 0) + 1) })
      analyzed.grammar.forEach((row, ordinal) => { grammarRows.push({ paragraph_id: paragraph.id, ordinal: ordinal + 1, ...row }); grammarCounts.set(row.grammar_id, (grammarCounts.get(row.grammar_id) || 0) + 1) })
    }
    await client.query('begin')
    try {
      await client.query('delete from learning.paragraph_vocabulary_occurrences where paragraph_id in (select id from catalog.paragraphs where work_id=$1)', [work.id])
      await client.query('delete from learning.paragraph_grammar_occurrences where paragraph_id in (select id from catalog.paragraphs where work_id=$1)', [work.id])
      await client.query('delete from learning.work_vocabulary_stats where work_id=$1', [work.id])
      await client.query('delete from learning.work_grammar_stats where work_id=$1', [work.id])
      for (let i = 0; i < vocabRows.length; i += 1000) await insertRows(client, 'learning.paragraph_vocabulary_occurrences', [['paragraph_id','bigint'],['vocabulary_id','text'],['ordinal','integer'],['start_offset','integer'],['end_offset','integer'],['surface_form','text']], vocabRows.slice(i, i + 1000))
      for (let i = 0; i < grammarRows.length; i += 1000) await insertRows(client, 'learning.paragraph_grammar_occurrences', [['paragraph_id','bigint'],['grammar_id','text'],['ordinal','integer'],['start_offset','integer'],['end_offset','integer'],['ranges','jsonb']], grammarRows.slice(i, i + 1000))
      await insertRows(client, 'learning.work_vocabulary_stats', [['work_id','bigint'],['vocabulary_id','text'],['occurrence_count','integer']], [...vocabCounts].map(([vocabulary_id, occurrence_count]) => ({ work_id: work.id, vocabulary_id, occurrence_count })))
      await insertRows(client, 'learning.work_grammar_stats', [['work_id','bigint'],['grammar_id','text'],['occurrence_count','integer']], [...grammarCounts].map(([grammar_id, occurrence_count]) => ({ work_id: work.id, grammar_id, occurrence_count })))
      await client.query(`insert into learning.work_analysis(work_id,analysis_version,vocabulary_count,vocabulary_unique,grammar_count,grammar_unique) values($1,$2,$3,$4,$5,$6) on conflict(work_id) do update set analysis_version=excluded.analysis_version,vocabulary_count=excluded.vocabulary_count,vocabulary_unique=excluded.vocabulary_unique,grammar_count=excluded.grammar_count,grammar_unique=excluded.grammar_unique,analyzed_at=now()`, [work.id, version, vocabRows.length, vocabCounts.size, grammarRows.length, grammarCounts.size])
      await client.query('commit')
    } catch (error) { await client.query('rollback'); throw error }
    if ((workIndex + 1) % progressEvery === 0 || workIndex + 1 === works.rowCount) console.log(`Learning progress ${workIndex + 1}/${works.rowCount}; ${work.aozora_work_id} ${work.title}; vocab ${vocabRows.length}, grammar ${grammarRows.length}; ${((Date.now() - started) / 60000).toFixed(1)} min`)
  }
  const counts = await client.query(`select (select count(*) from learning.vocabulary) vocabulary,(select count(*) from learning.grammar_patterns) grammar,(select count(*) from learning.work_analysis) works,(select count(*) from learning.paragraph_vocabulary_occurrences) vocabulary_occurrences,(select count(*) from learning.paragraph_grammar_occurrences) grammar_occurrences`)
  console.log(JSON.stringify(counts.rows[0], null, 2))
} finally { await client.end() }
