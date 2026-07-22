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
      and ($1::text = '' or w.title ilike '%' || $1 || '%' or concat_ws(' ', p.family_name, p.given_name) ilike '%' || $1 || '%')
    group by w.id, pr.work_id
    order by pr.is_curated desc nulls last, w.character_count asc, w.aozora_work_id
    limit $2 offset $3
  `, [query, limit + 1, offset]))
  const hasMore = result.rows.length > limit
  return response({ works: result.rows.slice(0, limit), page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null } })
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
    const rubyByParagraph = new Map<string, unknown[]>()
    for (const ruby of rubies.rows) {
      const key = String(ruby.paragraph_id)
      const items = rubyByParagraph.get(key) || []
      items.push({ startOffset: ruby.startOffset, endOffset: ruby.endOffset, baseText: ruby.baseText, reading: ruby.reading })
      rubyByParagraph.set(key, items)
    }
    const hasMore = paragraphs.rows.length > limit
    delete work.internal_id
    return response({
      work,
      paragraphs: visible.map(row => ({ ordinal: row.ordinal, text: row.text, rubies: rubyByParagraph.get(String(row.id)) || [] })),
      page: { from, limit, hasMore, nextFrom: hasMore ? from + limit : null },
    })
  })
}
