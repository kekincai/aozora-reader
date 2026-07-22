create schema if not exists learning;

create table if not exists learning.vocabulary (
  id text primary key,
  term text not null,
  reading text not null,
  meaning text not null,
  meaning_language text not null default 'en' check (meaning_language in ('en', 'zh', 'ja')),
  jlpt_level text not null check (jlpt_level in ('N2', 'N1')),
  kana_key text not null,
  category text not null,
  annotation_safe boolean not null default false,
  annotation_note text,
  source_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists learning.grammar_patterns (
  id text primary key,
  title text not null,
  pattern text not null,
  match_parts text[] not null default '{}'::text[],
  meaning text not null,
  meaning_language text not null default 'zh' check (meaning_language in ('en', 'zh', 'ja')),
  formation text,
  jlpt_level text not null check (jlpt_level in ('N2', 'N1')),
  category text not null,
  examples jsonb not null default '[]'::jsonb,
  annotation_safe boolean not null default false,
  source_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists learning.paragraph_vocabulary_occurrences (
  paragraph_id bigint not null references catalog.paragraphs(id) on delete cascade,
  vocabulary_id text not null references learning.vocabulary(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  surface_form text not null,
  primary key (paragraph_id, ordinal)
);

create table if not exists learning.paragraph_grammar_occurrences (
  paragraph_id bigint not null references catalog.paragraphs(id) on delete cascade,
  grammar_id text not null references learning.grammar_patterns(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  ranges jsonb not null,
  primary key (paragraph_id, ordinal)
);

create table if not exists learning.work_vocabulary_stats (
  work_id bigint not null references catalog.works(id) on delete cascade,
  vocabulary_id text not null references learning.vocabulary(id) on delete cascade,
  occurrence_count integer not null check (occurrence_count > 0),
  primary key (work_id, vocabulary_id)
);

create table if not exists learning.work_grammar_stats (
  work_id bigint not null references catalog.works(id) on delete cascade,
  grammar_id text not null references learning.grammar_patterns(id) on delete cascade,
  occurrence_count integer not null check (occurrence_count > 0),
  primary key (work_id, grammar_id)
);

create table if not exists learning.work_analysis (
  work_id bigint primary key references catalog.works(id) on delete cascade,
  analysis_version text not null,
  vocabulary_count integer not null default 0,
  vocabulary_unique integer not null default 0,
  grammar_count integer not null default 0,
  grammar_unique integer not null default 0,
  analyzed_at timestamptz not null default now()
);

create index if not exists vocabulary_filter_idx on learning.vocabulary (jlpt_level, kana_key, category, id);
create index if not exists vocabulary_safe_idx on learning.vocabulary (id) where annotation_safe;
create index if not exists grammar_filter_idx on learning.grammar_patterns (jlpt_level, category, id);
create index if not exists grammar_safe_idx on learning.grammar_patterns (id) where annotation_safe;
create index if not exists paragraph_vocab_entry_idx on learning.paragraph_vocabulary_occurrences (vocabulary_id, paragraph_id);
create index if not exists paragraph_grammar_entry_idx on learning.paragraph_grammar_occurrences (grammar_id, paragraph_id);
create index if not exists work_vocab_entry_idx on learning.work_vocabulary_stats (vocabulary_id, occurrence_count desc, work_id);
create index if not exists work_grammar_entry_idx on learning.work_grammar_stats (grammar_id, occurrence_count desc, work_id);
create index if not exists work_analysis_version_idx on learning.work_analysis (analysis_version, work_id);

comment on schema learning is 'N2/N1参考词汇、文法、正文命中位置与作品级统计。JLPT官方不提供完整词表。';
comment on column learning.vocabulary.annotation_safe is '是否允许自动标到正文。短假名和功能词仍可检索，但不会自动标注。';
