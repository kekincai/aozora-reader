import { createClient, safeIdentifier } from './config.mjs'

const targetDatabase = process.env.PGTARGETDATABASE || 'aozora_reader'
const adminDatabase = process.env.PGADMIN_DATABASE || process.env.PGDATABASE || 'workers_vpc_demo'
const owner = process.env.PGTARGETOWNER || process.env.PGUSER
const client = createClient(adminDatabase)

await client.connect()
try {
  const existing = await client.query('select 1 from pg_database where datname = $1', [targetDatabase])
  if (existing.rowCount) {
    console.log(`Database ${targetDatabase} already exists`)
  } else {
    await client.query(
      `create database ${safeIdentifier(targetDatabase, 'database name')} owner ${safeIdentifier(owner, 'owner')} encoding 'UTF8' template template0`,
    )
    console.log(`Created database ${targetDatabase}`)
  }
} finally {
  await client.end()
}

