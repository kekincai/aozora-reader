import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

describe('PostgreSQL catalog schema', () => {
  it('applies cleanly and contains the complete backend model', async () => {
    const database = new PGlite()
    const migration = await readFile('postgres/migrations/001_initial_catalog.sql', 'utf8')
    await database.exec(migration)
    const result = await database.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('ops', 'catalog', 'app')
      order by table_schema, table_name
    `)
    expect(result.rows.map(row => `${row.table_schema}.${row.table_name}`)).toEqual(expect.arrayContaining([
      'ops.import_runs', 'catalog.works', 'catalog.people', 'catalog.work_contents', 'catalog.chapters',
      'catalog.paragraphs', 'catalog.ruby_annotations', 'catalog.gaiji_annotations', 'app.work_profiles',
    ]))
    await database.close()
  }, 20_000)
})

