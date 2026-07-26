import { createClient } from './config.mjs'

const client = createClient(process.env.PGDATABASE || 'aozora_reader')
await client.connect()
try {
  const result = await client.query('select catalog.refresh_topic_examples() as count')
  await client.query('analyze catalog.topic_examples')
  console.log(`Topic examples refreshed: ${result.rows[0].count}`)
} finally {
  await client.end()
}
