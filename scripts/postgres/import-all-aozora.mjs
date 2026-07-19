import { execFileSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import { createClient } from './config.mjs'
import { decodeAozoraBytes, extractAozoraDocument, metadataRowsToRecords, PARSER_VERSION, sha256 } from '../lib/aozora-corpus.mjs'

const sourceRoot = process.env.AOZORA_ROOT || '/Volumes/minipc-1/git/aozorabunko'
const metadataZip = resolve(sourceRoot, 'index_pages/list_person_all_extended_utf8.zip')
const database = process.env.PGDATABASE || 'aozora_reader'
const metadataBatchSize = Number(process.env.AOZORA_METADATA_BATCH || 500)
const contentBatchSize = Number(process.env.AOZORA_CONTENT_BATCH || 20)
const contentLimit = Number(process.env.AOZORA_CONTENT_LIMIT || 0)
const metadataOnly = process.env.AOZORA_METADATA_ONLY === 'true'

const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

async function upsertJson(client, { table, fields, rows, conflict, update = [], returning = '' }) {
  if (!rows.length) return []
  const names = fields.map(([name]) => name)
  const definitions = fields.map(([name, type]) => `${name} ${type}`).join(', ')
  const updates = update.length ? `do update set ${update.map(name => `${name} = excluded.${name}`).join(', ')}` : 'do nothing'
  const result = await client.query(`
    insert into ${table} (${names.join(', ')})
    select ${names.join(', ')} from jsonb_to_recordset($1::jsonb) as x(${definitions})
    on conflict ${conflict} ${updates}
    ${returning ? `returning ${returning}` : ''}
  `, [JSON.stringify(rows)])
  return result.rows
}

class GitBatchReader {
  constructor(root) {
    this.child = spawn('git', ['-C', root, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.iterator = this.child.stdout[Symbol.asyncIterator]()
    this.buffer = Buffer.alloc(0)
    this.stderr = ''
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => { this.stderr += chunk })
  }

  async fill() {
    const next = await this.iterator.next()
    if (next.done) throw new Error(`git cat-file ended unexpectedly: ${this.stderr}`)
    this.buffer = Buffer.concat([this.buffer, next.value])
  }

  async readLine() {
    while (true) {
      const newline = this.buffer.indexOf(10)
      if (newline >= 0) {
        const line = this.buffer.subarray(0, newline).toString('utf8')
        this.buffer = this.buffer.subarray(newline + 1)
        return line
      }
      await this.fill()
    }
  }

  async readBytes(size) {
    while (this.buffer.length < size) await this.fill()
    const bytes = this.buffer.subarray(0, size)
    this.buffer = this.buffer.subarray(size)
    return bytes
  }

  async read(path) {
    if (!path || !path.startsWith('cards/') || path.includes('..') || /[\r\n]/.test(path)) return null
    this.child.stdin.write(`HEAD:${path}\n`)
    const header = await this.readLine()
    if (header.endsWith(' missing')) return null
    const [objectId, type, sizeText] = header.split(' ')
    if (type !== 'blob') throw new Error(`Expected blob for ${path}, received ${header}`)
    const bytes = await this.readBytes(Number(sizeText))
    await this.readBytes(1)
    return { objectId, bytes: Buffer.from(bytes) }
  }

  async close() {
    this.child.stdin.end()
    await new Promise((resolveClose, reject) => {
      this.child.once('close', code => code === 0 ? resolveClose() : reject(new Error(`git cat-file exited ${code}: ${this.stderr}`)))
    })
  }
}

async function importMetadata(client, records) {
  const workFields = [
    ['aozora_work_id', 'integer'], ['title', 'text'], ['title_reading', 'text'], ['sort_reading', 'text'], ['subtitle', 'text'],
    ['subtitle_reading', 'text'], ['original_title', 'text'], ['first_appearance', 'text'], ['ndc_classifications', 'text[]'],
    ['orthography_type', 'text'], ['copyright_status', 'text'], ['published_on', 'date'], ['metadata_updated_on', 'date'],
    ['card_url', 'text'], ['has_text_file', 'boolean'], ['has_html_file', 'boolean'],
  ]
  const workUpdates = workFields.map(([name]) => name).filter(name => name !== 'aozora_work_id')
  for (const batch of chunks(records.works, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.works', fields: workFields, rows: batch, conflict: '(aozora_work_id)', update: workUpdates,
  })
  await client.query('update catalog.works set updated_at = now() where aozora_work_id = any($1::integer[])', [records.works.map(work => work.aozora_work_id)])

  const peopleFields = [
    ['aozora_person_id', 'integer'], ['family_name', 'text'], ['given_name', 'text'], ['family_name_reading', 'text'], ['given_name_reading', 'text'],
    ['family_name_sort', 'text'], ['given_name_sort', 'text'], ['family_name_roman', 'text'], ['given_name_roman', 'text'],
    ['birth_date', 'date'], ['death_date', 'date'], ['copyright_status', 'text'],
  ]
  for (const batch of chunks(records.people, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.people', fields: peopleFields, rows: batch, conflict: '(aozora_person_id)',
    update: peopleFields.map(([name]) => name).filter(name => name !== 'aozora_person_id'),
  })
  await client.query('update catalog.people set updated_at = now() where aozora_person_id = any($1::integer[])', [records.people.map(person => person.aozora_person_id)])

  const workRows = await client.query('select id, aozora_work_id from catalog.works')
  const personRows = await client.query('select id, aozora_person_id from catalog.people')
  const workIds = new Map(workRows.rows.map(row => [Number(row.aozora_work_id), row.id]))
  const personIds = new Map(personRows.rows.map(row => [Number(row.aozora_person_id), row.id]))

  const credits = records.credits.map(row => ({ work_id: workIds.get(row.workAozoraId), person_id: personIds.get(row.personAozoraId), role: row.role, ordinal: row.ordinal })).filter(row => row.work_id && row.person_id)
  for (const batch of chunks(credits, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.work_people', fields: [['work_id', 'bigint'], ['person_id', 'bigint'], ['role', 'text'], ['ordinal', 'smallint']], rows: batch,
    conflict: '(work_id, person_id, role)', update: ['ordinal'],
  })

  const editions = records.editions.map(({ workAozoraId, ...row }) => ({ work_id: workIds.get(workAozoraId), ...row })).filter(row => row.work_id)
  const editionFields = [['work_id', 'bigint'], ['source_number', 'smallint'], ['edition_title', 'text'], ['publisher', 'text'], ['first_published_text', 'text'], ['input_edition', 'text'], ['proofread_edition', 'text'], ['parent_edition_title', 'text'], ['parent_publisher', 'text'], ['parent_first_published_text', 'text']]
  for (const batch of chunks(editions, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.bibliographic_sources', fields: editionFields, rows: batch, conflict: '(work_id, source_number)', update: editionFields.slice(2).map(([name]) => name),
  })

  const contributors = records.contributors.map(({ workAozoraId, ...row }) => ({ work_id: workIds.get(workAozoraId), ...row })).filter(row => row.work_id)
  for (const batch of chunks(contributors, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.work_contributors', fields: [['work_id', 'bigint'], ['role', 'text'], ['name', 'text'], ['ordinal', 'smallint']], rows: batch,
    conflict: '(work_id, role, name)', update: ['ordinal'],
  })

  const files = records.files.map(({ workAozoraId, ...row }) => ({ work_id: workIds.get(workAozoraId), ...row })).filter(row => row.work_id)
  const fileFields = [['work_id', 'bigint'], ['format', 'text'], ['source_url', 'text'], ['repository_path', 'text'], ['source_updated_on', 'date'], ['declared_encoding', 'text'], ['declared_charset', 'text'], ['revision_count', 'integer']]
  for (const batch of chunks(files, metadataBatchSize)) await upsertJson(client, {
    table: 'catalog.source_files', fields: fileFields, rows: batch, conflict: '(work_id, format, source_url)', update: fileFields.slice(3).map(([name]) => name),
  })
  return { workIds }
}

async function flushContentBatch(client, batch) {
  if (!batch.length) return
  const workIds = batch.map(item => item.content.work_id)
  await client.query('begin')
  try {
    await client.query('delete from catalog.chapters where work_id = any($1::bigint[])', [workIds])
    const contentFields = [
      ['work_id', 'bigint'], ['source_file_id', 'bigint'], ['source_encoding', 'text'], ['raw_html', 'text'], ['body_html', 'text'], ['plain_text', 'text'],
      ['content_sha256', 'text'], ['parser_version', 'text'], ['character_count', 'integer'], ['paragraph_count', 'integer'], ['chapter_count', 'integer'], ['ruby_count', 'integer'], ['gaiji_count', 'integer'],
    ]
    await upsertJson(client, {
      table: 'catalog.work_contents', fields: contentFields, rows: batch.map(item => item.content), conflict: '(work_id)',
      update: contentFields.slice(1).map(([name]) => name),
    })
    await client.query('update catalog.work_contents set parsed_at = now() where work_id = any($1::bigint[])', [workIds])

    const chapterRows = batch.flatMap(item => item.chapters)
    const insertedChapters = await upsertJson(client, {
      table: 'catalog.chapters',
      fields: [['work_id', 'bigint'], ['ordinal', 'integer'], ['heading_level', 'smallint'], ['title', 'text'], ['title_reading', 'text'], ['heading_html', 'text'], ['plain_text', 'text'], ['character_count', 'integer']],
      rows: chapterRows, conflict: '(work_id, ordinal)', update: ['heading_level', 'title', 'title_reading', 'heading_html', 'plain_text', 'character_count'], returning: 'id, work_id, ordinal',
    })
    const chapterIds = new Map(insertedChapters.map(row => [`${row.work_id}:${row.ordinal}`, row.id]))
    const paragraphRows = batch.flatMap(item => item.paragraphs.map(row => ({ ...row, chapter_id: chapterIds.get(`${row.work_id}:${row.chapter_ordinal}`) })))
    const insertedParagraphs = await upsertJson(client, {
      table: 'catalog.paragraphs',
      fields: [['work_id', 'bigint'], ['chapter_id', 'bigint'], ['ordinal', 'integer'], ['chapter_ordinal', 'integer'], ['html', 'text'], ['plain_text', 'text'], ['character_count', 'integer']],
      rows: paragraphRows.map(({ chapter_paragraph_ordinal, ...row }) => ({ ...row, chapter_ordinal: chapter_paragraph_ordinal })),
      conflict: '(work_id, ordinal)', update: ['chapter_id', 'chapter_ordinal', 'html', 'plain_text', 'character_count'], returning: 'id, work_id, ordinal',
    })
    const paragraphIds = new Map(insertedParagraphs.map(row => [`${row.work_id}:${row.ordinal}`, row.id]))
    const rubyRows = batch.flatMap(item => item.rubies.map(({ work_id, paragraph_ordinal, ...row }) => ({ paragraph_id: paragraphIds.get(`${work_id}:${paragraph_ordinal}`), ...row })))
    const gaijiRows = batch.flatMap(item => item.gaiji.map(({ work_id, paragraph_ordinal, ...row }) => ({ paragraph_id: paragraphIds.get(`${work_id}:${paragraph_ordinal}`), ...row })))
    for (const rows of chunks(rubyRows, 1000)) await upsertJson(client, {
      table: 'catalog.ruby_annotations', fields: [['paragraph_id', 'bigint'], ['ordinal', 'integer'], ['start_offset', 'integer'], ['end_offset', 'integer'], ['base_text', 'text'], ['reading', 'text']],
      rows, conflict: '(paragraph_id, ordinal)', update: ['start_offset', 'end_offset', 'base_text', 'reading'],
    })
    for (const rows of chunks(gaijiRows, 1000)) await upsertJson(client, {
      table: 'catalog.gaiji_annotations', fields: [['paragraph_id', 'bigint'], ['ordinal', 'integer'], ['start_offset', 'integer'], ['end_offset', 'integer'], ['display_text', 'text'], ['description', 'text'], ['image_source', 'text']],
      rows, conflict: '(paragraph_id, ordinal)', update: ['start_offset', 'end_offset', 'display_text', 'description', 'image_source'],
    })
    const fileUpdates = batch.map(item => item.file)
    await client.query(`
      update catalog.source_files sf set
        repository_object_id = x.repository_object_id,
        content_sha256 = x.content_sha256,
        byte_size = x.byte_size,
        is_available = true,
        parse_error = null,
        checked_at = now()
      from jsonb_to_recordset($1::jsonb) as x(id bigint, repository_object_id text, content_sha256 text, byte_size bigint)
      where sf.id = x.id
    `, [JSON.stringify(fileUpdates)])
    await client.query(`
      update catalog.works w set
        has_content = true,
        character_count = c.character_count,
        paragraph_count = c.paragraph_count,
        chapter_count = c.chapter_count,
        ruby_count = c.ruby_count,
        gaiji_count = c.gaiji_count,
        updated_at = now()
      from catalog.work_contents c where c.work_id = w.id and w.id = any($1::bigint[])
    `, [workIds])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

async function importContents(client) {
  const sourceFiles = await client.query(`
    select sf.id, sf.work_id, sf.repository_path, sf.declared_encoding, sf.content_sha256,
           wc.parser_version as existing_parser_version
    from catalog.source_files sf
    left join catalog.work_contents wc on wc.work_id = sf.work_id
    where sf.format = 'html' and sf.repository_path is not null
    order by sf.work_id
    ${contentLimit > 0 ? 'limit $1' : ''}
  `, contentLimit > 0 ? [contentLimit] : [])
  const reader = new GitBatchReader(sourceRoot)
  const stats = { considered: sourceFiles.rowCount, imported: 0, unchanged: 0, missing: 0, failed: 0, paragraphs: 0, rubies: 0, gaiji: 0 }
  let batch = []
  try {
    for (const [index, file] of sourceFiles.rows.entries()) {
      try {
        const object = await reader.read(file.repository_path)
        if (!object) {
          stats.missing += 1
          await client.query('update catalog.source_files set is_available = false, parse_error = $2, checked_at = now() where id = $1', [file.id, 'Repository path is missing from HEAD'])
          continue
        }
        const contentHash = sha256(object.bytes)
        if (file.content_sha256 === contentHash && file.existing_parser_version === PARSER_VERSION) { stats.unchanged += 1; continue }
        const decoded = decodeAozoraBytes(object.bytes, file.declared_encoding || '')
        const parsed = extractAozoraDocument(decoded.source)
        const workId = file.work_id
        batch.push({
          content: {
            work_id: workId, source_file_id: file.id, source_encoding: decoded.encoding, raw_html: decoded.source, body_html: parsed.bodyHtml, plain_text: parsed.plainText,
            content_sha256: contentHash, parser_version: PARSER_VERSION, character_count: parsed.characterCount, paragraph_count: parsed.paragraphs.length,
            chapter_count: parsed.chapters.length, ruby_count: parsed.rubies.length, gaiji_count: parsed.gaiji.length,
          },
          chapters: parsed.chapters.map(chapter => ({ work_id: workId, ...chapter })),
          paragraphs: parsed.paragraphs.map(paragraph => ({ work_id: workId, ...paragraph })),
          rubies: parsed.rubies.map(ruby => ({ work_id: workId, ...ruby })),
          gaiji: parsed.gaiji.map(item => ({ work_id: workId, ...item })),
          file: { id: file.id, repository_object_id: object.objectId, content_sha256: contentHash, byte_size: object.bytes.length },
        })
        stats.paragraphs += parsed.paragraphs.length
        stats.rubies += parsed.rubies.length
        stats.gaiji += parsed.gaiji.length
        if (batch.length >= contentBatchSize) {
          await flushContentBatch(client, batch)
          stats.imported += batch.length
          batch = []
        }
      } catch (error) {
        if (batch.length >= contentBatchSize) throw error
        stats.failed += 1
        await client.query('update catalog.source_files set is_available = true, parse_error = $2, checked_at = now() where id = $1', [file.id, String(error.message || error).slice(0, 2000)])
      }
      if ((index + 1) % 250 === 0) console.log(`Content progress ${index + 1}/${sourceFiles.rowCount}; imported ${stats.imported}, failed ${stats.failed}`)
    }
    if (batch.length) { await flushContentBatch(client, batch); stats.imported += batch.length }
  } finally {
    await reader.close()
  }
  return stats
}

const client = createClient(database)
let importRunId
await client.connect()
try {
  const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const run = await client.query(`insert into ops.import_runs(source_name, source_root, source_commit, parser_version) values ('aozorabunko', $1, $2, $3) returning id`, [sourceRoot, sourceCommit, PARSER_VERSION])
  importRunId = run.rows[0].id
  const archive = new AdmZip(metadataZip)
  const entry = archive.getEntry('list_person_all_extended_utf8.csv')
  if (!entry) throw new Error('Metadata CSV is missing from list_person_all_extended_utf8.zip')
  const csv = entry.getData().toString('utf8')
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true })
  const records = metadataRowsToRecords(rows)
  console.log(`Metadata: ${records.works.length} works, ${records.people.length} people, ${records.credits.length} credits`)
  await importMetadata(client, records)
  const content = metadataOnly ? { considered: 0, imported: 0, unchanged: 0, missing: 0, failed: 0, paragraphs: 0, rubies: 0, gaiji: 0 } : await importContents(client)
  const counts = { metadataRows: rows.length, works: records.works.length, people: records.people.length, credits: records.credits.length, ...content }
  await client.query(`update ops.import_runs set status = 'completed', counts = $2::jsonb, finished_at = now() where id = $1`, [importRunId, JSON.stringify(counts)])
  await client.query('analyze catalog.works; analyze catalog.people; analyze catalog.work_people; analyze catalog.work_contents; analyze catalog.paragraphs')
  console.log(JSON.stringify(counts, null, 2))
} catch (error) {
  if (importRunId) await client.query(`update ops.import_runs set status = 'failed', error_message = $2, finished_at = now() where id = $1`, [importRunId, String(error.stack || error).slice(0, 8000)]).catch(() => {})
  throw error
} finally {
  await client.end()
}
