import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

describe('PostgreSQL catalog schema', () => {
  it('applies cleanly and contains the complete backend model', async () => {
    const database = new PGlite()
    const migrations = (await readdir('postgres/migrations')).filter(name => name.endsWith('.sql')).sort()
    for (const migration of migrations) await database.exec(await readFile(`postgres/migrations/${migration}`, 'utf8'))
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
    const compactColumns = await database.query(`
      select column_name from information_schema.columns
      where table_schema = 'catalog' and table_name = 'work_contents'
    `)
    expect(compactColumns.rows.map(row => row.column_name)).not.toEqual(expect.arrayContaining(['raw_html', 'body_html']))
    await database.close()
  }, 20_000)
})
