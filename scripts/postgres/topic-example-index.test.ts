import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

let database: PGlite | null = null

afterEach(async () => {
  await database?.close()
  database = null
})

describe('topic example index migration', () => {
  it('classifies giving, receiving, incoming benefit, and causative-benefactive paragraphs', async () => {
    database = new PGlite()
    await database.exec(`
      create schema catalog;
      create table catalog.paragraphs(id bigserial primary key, plain_text text not null);
      insert into catalog.paragraphs(plain_text) values
        ('先生が推薦状を書いてくれた。'),
        ('先輩に一度見てもらいたい。'),
        ('子どもを遊ばせてあげた。'),
        ('先生が私に発表させてくれた。');
    `)
    const migration = await readFile(new URL('../../postgres/migrations/004_topic_example_index.sql', import.meta.url), 'utf8')
    await database.exec(migration)
    const result = await database.query<{ form_key: string; count: number }>(`
      select form_key, count(*)::integer as count
      from catalog.topic_examples group by form_key order by form_key
    `)
    expect(result.rows).toEqual([
      { form_key: 'ageru', count: 1 },
      { form_key: 'causative', count: 2 },
      { form_key: 'kureru', count: 2 },
      { form_key: 'morau', count: 1 },
    ])
    const snippet = await database.query<{ position: number; text: string }>(`
      select regexp_instr('前置き。先生が私に発表させてくれた。後続。', '((させて)|([かがたなばまらわ]せて))(くれ|くださ|もら|いただ|あげ|やる)')::integer as position,
        substring('前置き。先生が私に発表させてくれた。後続。' from greatest(1, regexp_instr('前置き。先生が私に発表させてくれた。後続。', 'させてくれ') - 4) for 18) as text
    `)
    expect(snippet.rows[0].position).toBeGreaterThan(0)
    expect(snippet.rows[0].text).toContain('発表させてくれた')
  })
})
