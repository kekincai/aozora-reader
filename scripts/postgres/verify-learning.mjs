import { createClient } from './config.mjs'

const client = createClient(process.env.PGDATABASE || 'aozora_reader')
await client.connect()
try {
  const result = await client.query(`select
    (select count(*)::integer from learning.vocabulary) vocabulary,
    (select count(*)::integer from learning.vocabulary where annotation_safe) safe_vocabulary,
    (select count(*)::integer from learning.grammar_patterns) grammar,
    (select count(*)::integer from learning.work_analysis) analyzed_works,
    (select count(*)::bigint from learning.paragraph_vocabulary_occurrences) vocabulary_occurrences,
    (select count(*)::bigint from learning.paragraph_grammar_occurrences) grammar_occurrences,
    (select count(*)::integer from learning.vocabulary where annotation_safe and term in ('し','と','さん')) unsafe_short_kana
  `)
  const counts = result.rows[0]
  if (counts.vocabulary < 5_000) throw new Error(`Expected N1/N2 vocabulary, received ${counts.vocabulary}`)
  if (counts.grammar < 400) throw new Error(`Expected N1/N2 grammar, received ${counts.grammar}`)
  if (counts.unsafe_short_kana !== 0) throw new Error('Ambiguous short kana are still marked safe')
  console.log(JSON.stringify(counts, null, 2))
} finally { await client.end() }
