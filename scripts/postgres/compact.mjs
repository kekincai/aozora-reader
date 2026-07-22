import { createClient } from './config.mjs'

const client = createClient(process.env.PGDATABASE || 'aozora_reader')
await client.connect()
try {
  for (const table of ['catalog.work_contents', 'catalog.chapters', 'catalog.paragraphs']) {
    console.log(`Compacting ${table}`)
    await client.query(`vacuum (full, analyze) ${table}`)
  }
  const size = await client.query('select pg_size_pretty(pg_database_size(current_database())) as database_size')
  console.log(`Compacted database size: ${size.rows[0].database_size}`)
} finally {
  await client.end()
}
