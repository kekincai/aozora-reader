import { createClient } from './config.mjs'

const client = createClient(process.env.PGDATABASE || 'aozora_reader')
await client.connect()
try {
  const summary = await client.query(`
    select
      (select count(*)::integer from catalog.works) as works,
      (select count(*)::integer from catalog.works where copyright_status = 'なし') as public_domain_works,
      (select count(*)::integer from catalog.people) as people,
      (select count(*)::integer from catalog.work_people) as credits,
      (select count(*)::integer from catalog.work_contents) as contents,
      (select count(*)::integer from catalog.chapters) as chapters,
      (select count(*)::integer from catalog.paragraphs) as paragraphs,
      (select count(*)::integer from catalog.ruby_annotations) as ruby_annotations,
      (select count(*)::integer from catalog.gaiji_annotations) as gaiji_annotations,
      (select count(*)::integer from catalog.source_files where parse_error is not null) as file_errors,
      pg_size_pretty(pg_database_size(current_database())) as database_size
  `)
  const integrity = await client.query(`
    select
      (select count(*)::integer from catalog.paragraphs p left join catalog.works w on w.id = p.work_id where w.id is null) as orphan_paragraphs,
      (select count(*)::integer from catalog.ruby_annotations where end_offset < start_offset) as invalid_ruby_offsets,
      (select count(*)::integer from catalog.gaiji_annotations where end_offset < start_offset) as invalid_gaiji_offsets,
      (select count(*)::integer from catalog.works where has_content and (character_count = 0 or paragraph_count = 0)) as empty_contents,
      (select count(*)::integer from (select aozora_work_id from catalog.works group by aozora_work_id having count(*) > 1) duplicates) as duplicate_works
  `)
  const result = { ...summary.rows[0], ...integrity.rows[0] }
  console.log(JSON.stringify(result, null, 2))
  if (result.works < 17_000) throw new Error(`Expected the complete catalog, received ${result.works} works`)
  if (result.orphan_paragraphs || result.invalid_ruby_offsets || result.invalid_gaiji_offsets || result.empty_contents || result.duplicate_works) {
    throw new Error('Database integrity verification failed')
  }
} finally {
  await client.end()
}

