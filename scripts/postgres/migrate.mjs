import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from './config.mjs'

const database = process.env.PGDATABASE || 'aozora_reader'
const migrationsRoot = resolve('postgres/migrations')
const migrations = (await readdir(migrationsRoot)).filter(name => name.endsWith('.sql')).sort()
const client = createClient(database)

await client.connect()
try {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `)
  for (const migration of migrations) {
    const applied = await client.query('select 1 from public.schema_migrations where version = $1', [migration])
    if (applied.rowCount) continue
    const sql = await readFile(resolve(migrationsRoot, migration), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into public.schema_migrations(version) values ($1)', [migration])
      await client.query('commit')
      console.log(`Applied ${migration}`)
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }
} finally {
  await client.end()
}

