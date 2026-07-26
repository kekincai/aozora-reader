import { createClient } from './config.mjs'

const topic = 'giving-receiving'
const scanBatchSize = Math.max(1_000, Number(process.env.TOPIC_SCAN_BATCH || 10_000))
const workBatchSize = Math.max(50, Number(process.env.TOPIC_WORK_BATCH || 500))
const started = Date.now()
const client = createClient(process.env.PGDATABASE || 'aozora_reader')
let runID = 0

const elapsed = () => {
  const seconds = Math.floor((Date.now() - started) / 1_000)
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}
const percent = (done, total) => total > 0 ? Math.min(100, done * 100 / total).toFixed(1) : '100.0'
const progress = (label, done, total, extra = '') => {
  console.log(`[${elapsed()}] ${label}: ${done.toLocaleString()}/${total.toLocaleString()} (${percent(done, total)}%)${extra ? `; ${extra}` : ''}`)
}

async function createFreshRun() {
  const corpus = (await client.query(`
    select count(*)::bigint as count, coalesce(max(id), 0)::bigint as maximum
    from catalog.paragraphs
  `)).rows[0]

  await client.query('drop table if exists catalog.topic_examples')
  await client.query('drop table if exists catalog.topic_work_ranking_next')
  await client.query(`
    create table catalog.topic_examples (
      topic_key text not null,
      form_key text not null,
      paragraph_id bigint not null,
      work_id bigint not null,
      editorial_rank smallint not null,
      publication_year smallint not null,
      topic_work_rank integer,
      form_work_rank integer,
      created_at timestamptz not null default now()
    )
  `)
  await client.query(`
    create table catalog.topic_work_ranking_next (
      work_id bigint primary key,
      editorial_rank smallint not null,
      publication_year smallint not null
    )
  `)
  await client.query(`
    insert into catalog.topic_work_ranking_next(work_id, editorial_rank, publication_year)
    with author_names as (
      select wp.work_id,
        string_agg(concat_ws(' ', people.family_name, people.given_name), '・' order by wp.ordinal)
          filter (where wp.role = '著者') as author
      from catalog.work_people wp
      join catalog.people people on people.id = wp.person_id
      group by wp.work_id
    ), source_years as (
      select sources.work_id,
        max(nullif(substring(sources.first_published_text from '[0-9]{4}'), '')::integer) as publication_year
      from catalog.bibliographic_sources sources
      group by sources.work_id
    )
    select works.id,
      case
        when position('夏目漱石' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 100
        when position('芥川龍之介' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 98
        when position('太宰治' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 96
        when position('宮沢賢治' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 95
        when position('森鴎外' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 93
        when position('樋口一葉' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 91
        when position('江戸川乱歩' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 89
        when position('谷崎潤一郎' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 88
        when position('新美南吉' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 87
        when position('梗井基次郎' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 86
        when position('中島敦' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 85
        when position('泉鏡花' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 83
        when position('国木田独歩' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 82
        when position('小川未明' in replace(coalesce(author_names.author, ''), ' ', '')) > 0 then 80
        else 10
      end,
      coalesce(
        nullif(substring(works.first_appearance from '[0-9]{4}'), '')::integer,
        source_years.publication_year,
        extract(year from works.published_on)::integer,
        0
      )
    from catalog.works works
    left join author_names on author_names.work_id = works.id
    left join source_years on source_years.work_id = works.id
  `)
  const run = (await client.query(`
    insert into ops.topic_refresh_runs(topic_key, status, maximum_paragraph_id)
    values ($1, 'scanning', $2)
    returning *
  `, [topic, corpus.maximum])).rows[0]
  run.corpus_count = Number(corpus.count)
  return run
}

async function activeRun() {
  const result = await client.query(`
    select * from ops.topic_refresh_runs
    where topic_key = $1 and status in ('scanning', 'ranking', 'indexing')
    order by id desc limit 1
  `, [topic])
  if (!result.rowCount) return null
  const tables = await client.query(`
    select to_regclass('catalog.topic_examples') is not null as examples,
      to_regclass('catalog.topic_work_ranking_next') is not null as rankings
  `)
  return tables.rows[0].examples && tables.rows[0].rankings ? result.rows[0] : null
}

async function scanCorpus(run) {
  if (run.status !== 'scanning') return run
  const corpusCount = Number(run.corpus_count || (await client.query('select count(*)::bigint as count from catalog.paragraphs')).rows[0].count)
  let lastID = Number(run.last_paragraph_id)
  let processed = Number(run.processed_paragraphs)
  let matched = Number(run.matched_examples)
  progress('Scanning paragraphs', processed, corpusCount, `${matched.toLocaleString()} matches`)

  while (lastID < Number(run.maximum_paragraph_id)) {
    const boundary = (await client.query(`
      select coalesce(max(id), $1)::bigint as last_id, count(*)::integer as count
      from (select id from catalog.paragraphs where id > $1 order by id limit $2) batch
    `, [lastID, scanBatchSize])).rows[0]
    const batchCount = Number(boundary.count)
    if (!batchCount) break
    const nextID = Number(boundary.last_id)

    await client.query('begin')
    try {
      const inserted = await client.query(`
        insert into catalog.topic_examples(
          topic_key, form_key, paragraph_id, work_id, editorial_rank, publication_year
        )
        select $1, forms.form_key, paragraphs.id, paragraphs.work_id,
          ranking.editorial_rank, ranking.publication_year
        from catalog.paragraphs paragraphs
        join catalog.topic_work_ranking_next ranking on ranking.work_id = paragraphs.work_id
        cross join (values
          ('kureru', '(て|で)(くれ|呉れ|くださ|下さ)'),
          ('morau', '(て|で)(もら|豰|いただ|戴|頂)'),
          ('ageru', '(て|で)(あげ|上げ|やる|やり|やっ|やれ|差し上げ)'),
          ('causative', '((させて)|([かがたなばまらわ]せて))(くれ|呉れ|くださ|下さ|もら|豰|いただ|戴|頂|あげ|上げ|やる|やり|やっ|やれ)')
        ) forms(form_key, pattern)
        where paragraphs.id > $2 and paragraphs.id <= $3
          and paragraphs.plain_text ~ forms.pattern
      `, [topic, lastID, nextID])
      processed += batchCount
      matched += inserted.rowCount || 0
      await client.query(`
        update ops.topic_refresh_runs
        set last_paragraph_id = $2, processed_paragraphs = $3, matched_examples = $4, updated_at = now()
        where id = $1
      `, [runID, nextID, processed, matched])
      await client.query('commit')
      lastID = nextID
      progress('Scanning paragraphs', processed, corpusCount, `${matched.toLocaleString()} matches`)
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }

  const totalWorks = Number((await client.query('select count(distinct work_id)::integer as count from catalog.topic_examples')).rows[0].count)
  run = (await client.query(`
    update ops.topic_refresh_runs
    set status = 'ranking', total_works = $2, last_work_id = 0, processed_works = 0, updated_at = now()
    where id = $1 returning *
  `, [runID, totalWorks])).rows[0]
  return run
}

async function rankWorks(run) {
  if (run.status !== 'ranking') return run
  let lastWorkID = Number(run.last_work_id)
  let processedWorks = Number(run.processed_works)
  const totalWorks = Number(run.total_works)
  progress('Ranking works', processedWorks, totalWorks)

  while (processedWorks < totalWorks) {
    const workRows = (await client.query(`
      select distinct work_id from catalog.topic_examples
      where work_id > $1 order by work_id limit $2
    `, [lastWorkID, workBatchSize])).rows
    if (!workRows.length) break
    const workIDs = workRows.map(row => row.work_id)
    const nextWorkID = Number(workIDs.at(-1))

    await client.query('begin')
    try {
      await client.query(`
        with form_ranks as materialized (
          select topic_key, form_key, paragraph_id,
            row_number() over (partition by work_id, form_key order by paragraph_id desc)::integer as work_rank
          from catalog.topic_examples where work_id = any($1::bigint[])
        ), topic_choices as materialized (
          select distinct on (paragraph_id) topic_key, form_key, paragraph_id, work_id
          from catalog.topic_examples where work_id = any($1::bigint[])
          order by paragraph_id,
            case form_key when 'causative' then 1 when 'kureru' then 2 when 'morau' then 3 else 4 end
        ), topic_ranks as materialized (
          select topic_key, form_key, paragraph_id,
            row_number() over (partition by work_id order by paragraph_id desc)::integer as work_rank
          from topic_choices
        )
        update catalog.topic_examples examples
        set form_work_rank = form_ranks.work_rank,
          topic_work_rank = topic_ranks.work_rank
        from form_ranks
        left join topic_ranks using (topic_key, form_key, paragraph_id)
        where examples.topic_key = form_ranks.topic_key
          and examples.form_key = form_ranks.form_key
          and examples.paragraph_id = form_ranks.paragraph_id
      `, [workIDs])
      processedWorks += workIDs.length
      await client.query(`
        update ops.topic_refresh_runs
        set last_work_id = $2, processed_works = $3, updated_at = now()
        where id = $1
      `, [runID, nextWorkID, processedWorks])
      await client.query('commit')
      lastWorkID = nextWorkID
      progress('Ranking works', processedWorks, totalWorks)
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }

  run = (await client.query(`
    update ops.topic_refresh_runs set status = 'indexing', updated_at = now()
    where id = $1 returning *
  `, [runID])).rows[0]
  return run
}

async function buildFinalIndexes(run) {
  if (run.status !== 'indexing') return run
  const suffix = String(runID)
  const indexes = [
    [`topic_examples_build_unique_${suffix}`, '(topic_key, form_key, paragraph_id)', 'unique'],
    ['topic_examples_editorial_all_idx', '(topic_key, editorial_rank desc, publication_year desc, paragraph_id desc) where topic_work_rank <= 2', ''],
    ['topic_examples_editorial_form_idx', '(topic_key, form_key, editorial_rank desc, publication_year desc, paragraph_id desc) where form_work_rank <= 2', ''],
  ]
  for (const [name, definition, unique] of indexes) {
    console.log(`[${elapsed()}] Building index ${name}...`)
    await client.query(`create ${unique} index if not exists ${name} on catalog.topic_examples ${definition}`)
    console.log(`[${elapsed()}] Built index ${name}`)
  }

  console.log(`[${elapsed()}] Finalizing constraints...`)
  await client.query('begin')
  try {
    await client.query(`alter table catalog.topic_examples add constraint topic_examples_pkey primary key using index topic_examples_build_unique_${suffix}`)
    await client.query(`alter table catalog.topic_examples add constraint topic_examples_paragraph_id_fkey foreign key (paragraph_id) references catalog.paragraphs(id) on delete cascade not valid`)
    await client.query(`
      update ops.topic_refresh_runs
      set status = 'complete', completed_at = now(), updated_at = now()
      where id = $1
    `, [runID])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
  await client.query('analyze catalog.topic_examples')
  await client.query('drop table if exists catalog.topic_work_ranking_next')
  console.log(`[${elapsed()}] Topic index rebuild complete.`)
}

await client.connect()
try {
  let run = await activeRun()
  if (!run) {
    console.log('Starting a complete batched topic-index rebuild. The previous topic index will be discarded.')
    run = await createFreshRun()
  } else {
    console.log(`Resuming topic-index run ${run.id} from phase ${run.status}.`)
  }
  runID = Number(run.id)
  run = await scanCorpus(run)
  run = await rankWorks(run)
  await buildFinalIndexes(run)
} catch (error) {
  if (runID) {
    await client.query(`update ops.topic_refresh_runs set error_message = $2, updated_at = now() where id = $1`, [runID, error instanceof Error ? error.message.slice(0, 1_000) : String(error)]).catch(() => {})
  }
  console.error(`Topic rebuild paused: ${error instanceof Error ? error.message : error}`)
  console.error('Run the same command again to resume from the last committed batch.')
  process.exitCode = 1
} finally {
  await client.end()
}
