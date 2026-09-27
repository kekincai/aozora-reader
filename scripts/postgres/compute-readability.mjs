import { createClient } from './config.mjs'

// Bump when the formula or the thresholds change; every work is recomputed.
export const READABILITY_VERSION = 'readability-v1'
const database = process.env.PGDATABASE || 'aozora_reader'
const batchSize = Math.max(50, Number(process.env.AOZORA_READABILITY_BATCH || 1000))

/**
 * One batch of works by internal id. The score is calibrated on the ten editorial serial
 * works: kanji share carries most of the weight, author ruby marks hard vocabulary, N1
 * vocabulary density adds the rest, and historical kana or old kanji move a work up a band.
 */
const batchSql = `
with target as (
  select w.id, w.character_count, w.paragraph_count, w.ruby_count, w.gaiji_count, w.orthography_type, w.ndc_classifications
  from catalog.works w
  where w.id > $1 and w.id <= $2 and w.copyright_status = 'なし' and w.has_content and w.character_count > 0
),
vocab as (
  select ws.work_id,
    coalesce(sum(ws.occurrence_count) filter (where v.jlpt_level = 'N1'), 0) as n1,
    coalesce(sum(ws.occurrence_count) filter (where v.jlpt_level = 'N2'), 0) as n2
  from learning.work_vocabulary_stats ws join learning.vocabulary v on v.id = ws.vocabulary_id
  where ws.work_id in (select id from target) group by ws.work_id
),
grammar as (
  select ws.work_id, coalesce(sum(ws.occurrence_count) filter (where g.jlpt_level = 'N1'), 0) as g1
  from learning.work_grammar_stats ws join learning.grammar_patterns g on g.id = ws.grammar_id
  where ws.work_id in (select id from target) group by ws.work_id
),
text as (
  select c.work_id, greatest(1, length(c.plain_text)) as len,
    length(regexp_replace(c.plain_text, '[^一-龯々]', '', 'g')) as kanji,
    greatest(1, length(c.plain_text) - length(replace(c.plain_text, '。', ''))) as sentences
  from catalog.work_contents c where c.work_id in (select id from target)
),
metrics as (
  select t.id,
    round(100.0 * x.kanji / x.len, 2) as kanji_pct,
    round(1000.0 * t.ruby_count / t.character_count, 2) as ruby_per_k,
    round(1000.0 * coalesce(v.n1, 0) / t.character_count, 2) as n1_per_k,
    round(1000.0 * coalesce(v.n2, 0) / t.character_count, 2) as n2_per_k,
    round(1000.0 * coalesce(g.g1, 0) / t.character_count, 2) as g1_per_k,
    round(1000.0 * t.gaiji_count / t.character_count, 2) as gaiji_per_k,
    round(x.len::numeric / x.sentences, 1) as sentence_len,
    round(t.character_count::numeric / greatest(1, t.paragraph_count), 1) as paragraph_len,
    t.character_count, t.orthography_type,
    -- Poetry (911) and drama (912) do not read well one page a day.
    exists (select 1 from unnest(coalesce(t.ndc_classifications, '{}')) n where n ~ '^K?91[12]') as is_verse_or_drama
  from target t join text x on x.work_id = t.id
  left join vocab v on v.work_id = t.id left join grammar g on g.work_id = t.id
),
scored as (
  select m.*,
    -- Each signal is capped so a tiny work dense with ruby or gaiji cannot dominate.
    round(m.kanji_pct + 0.15 * least(m.ruby_per_k, 150) + 0.3 * least(m.n1_per_k, 60) + 2 * least(m.gaiji_per_k, 10)
      + least(greatest(0, m.sentence_len - 50), 200) * 0.1
      + case when m.orthography_type like '%旧仮名%' then 10 else 0 end
      + case when m.orthography_type like '旧字%' then 4 else 0 end, 2) as score
  from metrics m
)
insert into app.work_readability (work_id, version, score, level, serial_ok, metrics, computed_at)
select id, $3, score,
  case when score < 30 then 'N2' when score < 37 then 'N2+' when score < 46 then 'N1' else 'N1+' end,
  orthography_type = '新字新仮名' and character_count between 2500 and 30000 and not is_verse_or_drama
    and paragraph_len >= 30 and sentence_len between 15 and 90,
  jsonb_build_object('kanjiPct', kanji_pct, 'rubyPerK', ruby_per_k, 'n1PerK', n1_per_k, 'n2PerK', n2_per_k,
    'g1PerK', g1_per_k, 'gaijiPerK', gaiji_per_k, 'sentenceLen', sentence_len, 'paragraphLen', paragraph_len),
  now()
from scored
on conflict (work_id) do update set version = excluded.version, score = excluded.score, level = excluded.level,
  serial_ok = excluded.serial_ok, metrics = excluded.metrics, computed_at = excluded.computed_at
`

const client = createClient(database)
await client.connect()
try {
  const { rows: [range] } = await client.query('select coalesce(max(id), 0)::bigint as max from catalog.works', [])
  const maximum = Number(range.max)
  const started = Date.now()
  for (let from = 0; from < maximum; from += batchSize) {
    await client.query(batchSql, [from, from + batchSize, READABILITY_VERSION])
    console.log(`Readability ${Math.min(from + batchSize, maximum)}/${maximum} (${((Date.now() - started) / 1000).toFixed(0)}s)`)
  }
  const { rows } = await client.query(`
    select level, count(*)::integer as works, count(*) filter (where serial_ok)::integer as serial
    from app.work_readability where version = $1 group by level order by level
  `, [READABILITY_VERSION])
  console.table(rows)
} finally {
  await client.end()
}
