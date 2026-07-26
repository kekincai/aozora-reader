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
      create table catalog.works(id bigint primary key, first_appearance text, published_on date);
      create table catalog.people(id bigint primary key, family_name text, given_name text);
      create table catalog.work_people(work_id bigint, person_id bigint, role text, ordinal smallint);
      create table catalog.bibliographic_sources(work_id bigint, first_published_text text);
      create table catalog.paragraphs(id bigserial primary key, work_id bigint not null, plain_text text not null);
      insert into catalog.works values (1, '1914年', '2001-01-01');
      insert into catalog.people values (1, '夏目', '漱石');
      insert into catalog.work_people values (1, 1, '著者', 1);
      insert into catalog.paragraphs(work_id, plain_text) values
        (1, '先生が推薦状を書いてくれた。'),
        (1, '先輩に一度見てもらいたい。'),
        (1, '子どもを遊ばせてあげた。'),
        (1, '先生が私に発表させてくれた。');
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

    const rankedMigration = await readFile(new URL('../../postgres/migrations/005_ranked_topic_examples.sql', import.meta.url), 'utf8')
    await database.exec(rankedMigration)
    await database.exec('select catalog.refresh_topic_examples()')
    const ranked = await database.query<{ editorial_rank: number; publication_year: number; ranked: number }>(`
      select max(editorial_rank)::integer as editorial_rank,
        max(publication_year)::integer as publication_year,
        count(*) filter (where topic_work_rank <= 2)::integer as ranked
      from catalog.topic_examples
    `)
    expect(ranked.rows[0]).toEqual({ editorial_rank: 100, publication_year: 1914, ranked: 2 })
  })
})
