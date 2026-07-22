import { Client } from 'pg'

export interface CatalogEnv {
  HYPERDRIVE: Hyperdrive
}

const publicHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
}

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: publicHeaders })

async function queryCatalog<T>(env: CatalogEnv, run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString })
  await client.connect()
  try { return await run(client) }
  finally { await client.end() }
}

function numberParam(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

export async function catalogHealth(env: CatalogEnv) {
  const result = await queryCatalog(env, client => client.query(`
    select
      (select count(*)::integer from catalog.works) as works,
      (select count(*)::integer from catalog.work_contents) as contents,
      (select count(*)::integer from catalog.paragraphs) as paragraphs,
      (select count(*)::integer from catalog.source_files where parse_error is not null) as file_errors
  `))
  return response({ ok: true, database: result.rows[0] })
}

export async function listWorks(request: Request, env: CatalogEnv) {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') || '').trim().slice(0, 80)
  const limit = numberParam(url.searchParams.get('limit'), 30, 1, 50)
  const offset = numberParam(url.searchParams.get('offset'), 0, 0, 20_000)
  const level = (url.searchParams.get('level') || '').slice(0, 4)
  const genre = (url.searchParams.get('genre') || '').trim().slice(0, 30)
  const maxCharacters = numberParam(url.searchParams.get('maxCharacters'), 2_000_000, 500, 2_000_000)
  const sort = url.searchParams.get('sort') === 'title' ? 'title' : url.searchParams.get('sort') === 'newest' ? 'newest' : 'shortest'
  const result = await queryCatalog(env, client => client.query(`
    select
      w.aozora_work_id::text as id,
      w.title,
      coalesce(
        string_agg(concat_ws(' ', p.family_name, p.given_name), '・' order by wp.ordinal) filter (where wp.role = '著者'),
        string_agg(concat_ws(' ', p.family_name, p.given_name), '・' order by wp.ordinal),
        '作者不詳'
      ) as author,
      coalesce(pr.jlpt_level, '未分類') as level,
      coalesce(pr.genres[1], '文学') as genre,
      greatest(1, ceil(w.character_count / 500.0))::integer as minutes,
      coalesce(pr.summary_ja, '') as summary,
      w.card_url as "sourceUrl",
      '青空文庫' as attribution,
      w.paragraph_count::integer as "paragraphCount",
      w.character_count::integer as "characterCount"
    from catalog.works w
    left join catalog.work_people wp on wp.work_id = w.id
    left join catalog.people p on p.id = wp.person_id
    left join app.work_profiles pr on pr.work_id = w.id
    where w.copyright_status = 'なし' and w.has_content
      and ($1::text = '' or w.title ilike '%' || $1 || '%' or w.title_reading ilike '%' || $1 || '%' or concat_ws(' ', p.family_name, p.given_name) ilike '%' || $1 || '%')
      and ($4::text = '' or pr.jlpt_level = $4)
      and ($5::text = '' or $5 = any(pr.genres))
      and w.character_count <= $6
    group by w.id, pr.work_id
    order by pr.is_curated desc nulls last,
      case when $7 = 'shortest' then w.character_count end asc,
      case when $7 = 'title' then w.sort_reading end asc,
      case when $7 = 'newest' then w.metadata_updated_on end desc,
      w.aozora_work_id
    limit $2 offset $3
  `, [query, limit + 1, offset, level, genre, maxCharacters, sort]))
  const hasMore = result.rows.length > limit
  return response({ works: result.rows.slice(0, limit), page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null } })
}

export async function todayWork(request: Request, env: CatalogEnv) {
  const requested = new URL(request.url).searchParams.get('date') || ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const result = await queryCatalog(env, client => client.query(`
    select w.aozora_work_id::text id,w.title,
      coalesce(string_agg(concat_ws(' ',p.family_name,p.given_name),'・' order by wp.ordinal) filter(where wp.role='著者'),'作者不詳') author,
      coalesce(pr.jlpt_level,'未分類') level,coalesce(pr.genres[1],'文学') genre,
      coalesce(pr.estimated_minutes,greatest(1,ceil(w.character_count/500.0)))::integer minutes,
      coalesce(pr.summary_ja,'') summary,w.card_url as "sourceUrl",'青空文庫' attribution,
      w.paragraph_count::integer as "paragraphCount",w.character_count::integer as "characterCount"
    from catalog.works w join app.work_profiles pr on pr.work_id=w.id
    left join catalog.work_people wp on wp.work_id=w.id left join catalog.people p on p.id=wp.person_id
    where pr.is_published and pr.is_curated and w.copyright_status='なし' and w.has_content
    group by w.id,pr.work_id order by md5(w.aozora_work_id::text || $1) limit 1
  `, [date]))
  return response({ date, work: result.rows[0] || null }, 200)
}

export async function listVocabulary(request: Request, env: CatalogEnv) {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') || '').trim().slice(0, 80)
  const level = (url.searchParams.get('level') || '').slice(0, 4)
  const kana = (url.searchParams.get('kana') || '').slice(0, 2)
  const category = (url.searchParams.get('category') || '').slice(0, 30)
  const corpusOnly = url.searchParams.get('corpusOnly') !== 'false'
  const limit = numberParam(url.searchParams.get('limit'), 80, 1, 220)
  const offset = numberParam(url.searchParams.get('offset'), 0, 0, 20_000)
  const result = await queryCatalog(env, client => client.query(`
    with selected as (
      select v.* from learning.vocabulary v where
        ($1='' or v.term ilike '%'||$1||'%' or v.reading ilike '%'||$1||'%' or v.meaning ilike '%'||$1||'%') and
        ($2='' or v.jlpt_level=$2) and ($3='' or v.kana_key=$3) and ($4='' or v.category=$4) and
        (not $5::boolean or exists(select 1 from learning.work_vocabulary_stats ws where ws.vocabulary_id=v.id))
      order by v.kana_key,v.reading,v.id limit $6 offset $7
    )
    select s.id,s.term,s.reading,s.meaning,s.meaning_language as "meaningLanguage",s.jlpt_level as level,s.kana_key as "kanaKey",s.category,s.annotation_safe as "annotationSafe",
      coalesce(a.articles,'[]'::json) articles
    from selected s left join lateral (
      select json_agg(json_build_object('id',x.aozora_work_id::text,'title',x.title,'author',x.author,'count',x.occurrence_count) order by x.occurrence_count desc) articles from (
        select w.aozora_work_id,w.title,coalesce(string_agg(concat_ws(' ',p.family_name,p.given_name),'・') filter(where wp.role='著者'),'作者不詳') author,ws.occurrence_count
        from learning.work_vocabulary_stats ws join catalog.works w on w.id=ws.work_id left join catalog.work_people wp on wp.work_id=w.id left join catalog.people p on p.id=wp.person_id
        where ws.vocabulary_id=s.id group by w.id,ws.occurrence_count order by ws.occurrence_count desc limit 3
      ) x
    ) a on true
  `, [query, level, kana, category, corpusOnly, limit + 1, offset]))
  const hasMore = result.rows.length > limit
  return response({ entries: result.rows.slice(0, limit), page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null } })
}

export async function listGrammar(request: Request, env: CatalogEnv) {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') || '').trim().slice(0, 80)
  const level = (url.searchParams.get('level') || '').slice(0, 4)
  const category = (url.searchParams.get('category') || '').slice(0, 30)
  const corpusOnly = url.searchParams.get('corpusOnly') !== 'false'
  const limit = numberParam(url.searchParams.get('limit'), 80, 1, 220)
  const offset = numberParam(url.searchParams.get('offset'), 0, 0, 20_000)
  const result = await queryCatalog(env, client => client.query(`
    with selected as (
      select g.* from learning.grammar_patterns g where
        ($1='' or g.pattern ilike '%'||$1||'%' or g.title ilike '%'||$1||'%' or g.meaning ilike '%'||$1||'%') and
        ($2='' or g.jlpt_level=$2) and ($3='' or g.category=$3) and
        (not $4::boolean or exists(select 1 from learning.work_grammar_stats ws where ws.grammar_id=g.id))
      order by g.category,g.pattern,g.id limit $5 offset $6
    )
    select s.id,s.title,s.pattern,s.meaning,s.meaning_language as "meaningLanguage",s.formation,s.jlpt_level as level,s.category,s.examples,
      coalesce(a.articles,'[]'::json) articles
    from selected s left join lateral (
      select json_agg(json_build_object('id',x.aozora_work_id::text,'title',x.title,'author',x.author,'count',x.occurrence_count) order by x.occurrence_count desc) articles from (
        select w.aozora_work_id,w.title,coalesce(string_agg(concat_ws(' ',p.family_name,p.given_name),'・') filter(where wp.role='著者'),'作者不詳') author,ws.occurrence_count
        from learning.work_grammar_stats ws join catalog.works w on w.id=ws.work_id left join catalog.work_people wp on wp.work_id=w.id left join catalog.people p on p.id=wp.person_id
        where ws.grammar_id=s.id group by w.id,ws.occurrence_count order by ws.occurrence_count desc limit 3
      ) x
    ) a on true
  `, [query, level, category, corpusOnly, limit + 1, offset]))
  const hasMore = result.rows.length > limit
  return response({ entries: result.rows.slice(0, limit), page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null } })
}

export async function getWork(request: Request, env: CatalogEnv, workID: string) {
  if (!/^\d{1,6}$/.test(workID)) return response({ error: '作品IDが正しくありません。' }, 400)
  const url = new URL(request.url)
  const from = numberParam(url.searchParams.get('from'), 1, 1, 1_000_000)
  const limit = numberParam(url.searchParams.get('limit'), 180, 1, 800)
  return queryCatalog(env, async client => {
    const workResult = await client.query(`
      select
        w.id as internal_id, w.aozora_work_id::text as id, w.title,
        coalesce(
          string_agg(concat_ws(' ', p.family_name, p.given_name), '・' order by wp.ordinal) filter (where wp.role = '著者'),
          string_agg(concat_ws(' ', p.family_name, p.given_name), '・' order by wp.ordinal),
          '作者不詳'
        ) as author,
        coalesce(pr.jlpt_level, '未分類') as level,
        coalesce(pr.genres[1], '文学') as genre,
        greatest(1, ceil(w.character_count / 500.0))::integer as minutes,
        coalesce(pr.summary_ja, '') as summary,
        w.card_url as "sourceUrl", '青空文庫' as attribution,
        w.paragraph_count::integer as "paragraphCount", w.character_count::integer as "characterCount"
      from catalog.works w
      left join catalog.work_people wp on wp.work_id = w.id
      left join catalog.people p on p.id = wp.person_id
      left join app.work_profiles pr on pr.work_id = w.id
      where w.aozora_work_id = $1 and w.copyright_status = 'なし' and w.has_content
      group by w.id, pr.work_id
    `, [Number(workID)])
    if (!workResult.rowCount) return response({ error: '作品が見つかりません。' }, 404)
    const work = workResult.rows[0]
    const paragraphs = await client.query(`
      select id, ordinal::integer, plain_text as text
      from catalog.paragraphs
      where work_id = $1 and ordinal >= $2
      order by ordinal
      limit $3
    `, [work.internal_id, from, limit + 1])
    const visible = paragraphs.rows.slice(0, limit)
    const paragraphIDs = visible.map(row => row.id)
    const rubies = paragraphIDs.length ? await client.query(`
      select paragraph_id, ordinal::integer, start_offset::integer as "startOffset", end_offset::integer as "endOffset", base_text as "baseText", reading
      from catalog.ruby_annotations
      where paragraph_id = any($1::bigint[])
      order by paragraph_id, ordinal
    `, [paragraphIDs]) : { rows: [] }
    const vocabulary = paragraphIDs.length ? await client.query(`
      select paragraph_id,ordinal,start_offset as "startOffset",end_offset as "endOffset",vocabulary_id as "vocabId"
      from learning.paragraph_vocabulary_occurrences where paragraph_id=any($1::bigint[]) order by paragraph_id,ordinal
    `, [paragraphIDs]) : { rows: [] }
    const grammar = paragraphIDs.length ? await client.query(`
      select paragraph_id,ordinal,start_offset as "startOffset",end_offset as "endOffset",ranges,grammar_id as "grammarId"
      from learning.paragraph_grammar_occurrences where paragraph_id=any($1::bigint[]) order by paragraph_id,ordinal
    `, [paragraphIDs]) : { rows: [] }
    const rubyByParagraph = new Map<string, unknown[]>()
    for (const ruby of rubies.rows) {
      const key = String(ruby.paragraph_id)
      const items = rubyByParagraph.get(key) || []
      items.push({ startOffset: ruby.startOffset, endOffset: ruby.endOffset, baseText: ruby.baseText, reading: ruby.reading })
      rubyByParagraph.set(key, items)
    }
    const vocabularyByParagraph = new Map<string, unknown[]>()
    for (const item of vocabulary.rows) { const key=String(item.paragraph_id); const items=vocabularyByParagraph.get(key)||[]; items.push({ startOffset:item.startOffset,endOffset:item.endOffset,vocabId:item.vocabId }); vocabularyByParagraph.set(key,items) }
    const grammarByParagraph = new Map<string, unknown[]>()
    for (const item of grammar.rows) { const key=String(item.paragraph_id); const items=grammarByParagraph.get(key)||[]; items.push({ startOffset:item.startOffset,endOffset:item.endOffset,ranges:item.ranges,grammarId:item.grammarId }); grammarByParagraph.set(key,items) }
    const hasMore = paragraphs.rows.length > limit
    delete work.internal_id
    return response({
      work,
      paragraphs: visible.map(row => ({ ordinal: row.ordinal, text: row.text, rubies: rubyByParagraph.get(String(row.id)) || [], vocabulary: vocabularyByParagraph.get(String(row.id)) || [], grammar: grammarByParagraph.get(String(row.id)) || [] })),
      page: { from, limit, hasMore, nextFrom: hasMore ? from + limit : null },
    })
  })
}
