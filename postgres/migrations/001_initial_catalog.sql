create schema if not exists ops;
create schema if not exists catalog;
create schema if not exists app;

create table if not exists ops.import_runs (
  id bigint generated always as identity primary key,
  source_name text not null,
  source_root text not null,
  source_commit text,
  parser_version text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists catalog.people (
  id bigint generated always as identity primary key,
  aozora_person_id integer not null unique,
  family_name text,
  given_name text,
  family_name_reading text,
  given_name_reading text,
  family_name_sort text,
  given_name_sort text,
  family_name_roman text,
  given_name_roman text,
  birth_date date,
  death_date date,
  copyright_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.works (
  id bigint generated always as identity primary key,
  aozora_work_id integer not null unique,
  title text not null,
  title_reading text,
  sort_reading text,
  subtitle text,
  subtitle_reading text,
  original_title text,
  first_appearance text,
  ndc_classifications text[] not null default '{}'::text[],
  orthography_type text,
  copyright_status text,
  published_on date,
  metadata_updated_on date,
  card_url text not null,
  has_text_file boolean not null default false,
  has_html_file boolean not null default false,
  has_content boolean not null default false,
  character_count integer not null default 0 check (character_count >= 0),
  paragraph_count integer not null default 0 check (paragraph_count >= 0),
  chapter_count integer not null default 0 check (chapter_count >= 0),
  ruby_count integer not null default 0 check (ruby_count >= 0),
  gaiji_count integer not null default 0 check (gaiji_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.work_people (
  work_id bigint not null references catalog.works(id) on delete cascade,
  person_id bigint not null references catalog.people(id) on delete cascade,
  role text not null,
  ordinal smallint not null default 1 check (ordinal > 0),
  primary key (work_id, person_id, role)
);

create table if not exists catalog.bibliographic_sources (
  id bigint generated always as identity primary key,
  work_id bigint not null references catalog.works(id) on delete cascade,
  source_number smallint not null check (source_number in (1, 2)),
  edition_title text,
  publisher text,
  first_published_text text,
  input_edition text,
  proofread_edition text,
  parent_edition_title text,
  parent_publisher text,
  parent_first_published_text text,
  unique (work_id, source_number)
);

create table if not exists catalog.work_contributors (
  work_id bigint not null references catalog.works(id) on delete cascade,
  role text not null check (role in ('input', 'proofreading')),
  name text not null,
  ordinal smallint not null default 1 check (ordinal > 0),
  primary key (work_id, role, name)
);

create table if not exists catalog.source_files (
  id bigint generated always as identity primary key,
  work_id bigint not null references catalog.works(id) on delete cascade,
  format text not null check (format in ('text_zip', 'html')),
  source_url text not null,
  repository_path text,
  source_updated_on date,
  declared_encoding text,
  declared_charset text,
  revision_count integer check (revision_count is null or revision_count >= 0),
  repository_object_id text,
  content_sha256 text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  is_available boolean not null default false,
  parse_error text,
  checked_at timestamptz,
  unique (work_id, format, source_url)
);

create table if not exists catalog.work_contents (
  id bigint generated always as identity primary key,
  work_id bigint not null unique references catalog.works(id) on delete cascade,
  source_file_id bigint references catalog.source_files(id) on delete set null,
  source_encoding text,
  raw_html text not null,
  body_html text not null,
  plain_text text not null,
  content_sha256 text not null,
  parser_version text not null,
  character_count integer not null check (character_count >= 0),
  paragraph_count integer not null check (paragraph_count >= 0),
  chapter_count integer not null check (chapter_count >= 0),
  ruby_count integer not null check (ruby_count >= 0),
  gaiji_count integer not null check (gaiji_count >= 0),
  parsed_at timestamptz not null default now()
);

create table if not exists catalog.chapters (
  id bigint generated always as identity primary key,
  work_id bigint not null references catalog.works(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  heading_level smallint check (heading_level is null or heading_level between 1 and 6),
  title text,
  title_reading text,
  heading_html text,
  plain_text text,
  character_count integer not null default 0 check (character_count >= 0),
  unique (work_id, ordinal)
);

create table if not exists catalog.paragraphs (
  id bigint generated always as identity primary key,
  work_id bigint not null references catalog.works(id) on delete cascade,
  chapter_id bigint not null references catalog.chapters(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  chapter_ordinal integer not null check (chapter_ordinal > 0),
  html text not null,
  plain_text text not null,
  character_count integer not null check (character_count >= 0),
  unique (work_id, ordinal),
  unique (chapter_id, chapter_ordinal)
);

create table if not exists catalog.ruby_annotations (
  id bigint generated always as identity primary key,
  paragraph_id bigint not null references catalog.paragraphs(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  base_text text not null,
  reading text not null,
  unique (paragraph_id, ordinal)
);

create table if not exists catalog.gaiji_annotations (
  id bigint generated always as identity primary key,
  paragraph_id bigint not null references catalog.paragraphs(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  display_text text not null,
  description text,
  image_source text,
  unique (paragraph_id, ordinal)
);

create table if not exists app.work_profiles (
  work_id bigint primary key references catalog.works(id) on delete cascade,
  jlpt_level text check (jlpt_level is null or jlpt_level in ('N2', 'N2+', 'N1')),
  genres text[] not null default '{}'::text[],
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  summary_ja text,
  summary_zh text,
  excerpt_start_paragraph integer check (excerpt_start_paragraph is null or excerpt_start_paragraph > 0),
  excerpt_end_paragraph integer check (excerpt_end_paragraph is null or excerpt_end_paragraph > 0),
  readability_metrics jsonb not null default '{}'::jsonb,
  is_curated boolean not null default false,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  check (excerpt_end_paragraph is null or excerpt_start_paragraph is null or excerpt_end_paragraph >= excerpt_start_paragraph)
);

create table if not exists app.tags (
  id bigint generated always as identity primary key,
  slug text not null unique,
  label_ja text not null,
  label_zh text,
  description_zh text
);

create table if not exists app.work_tags (
  work_id bigint not null references catalog.works(id) on delete cascade,
  tag_id bigint not null references app.tags(id) on delete cascade,
  primary key (work_id, tag_id)
);

create index if not exists import_runs_status_started_idx on ops.import_runs (status, started_at desc);
create index if not exists works_copyright_content_idx on catalog.works (copyright_status, has_content, published_on desc);
create index if not exists works_sort_reading_idx on catalog.works (sort_reading, aozora_work_id);
create index if not exists works_metadata_updated_idx on catalog.works (metadata_updated_on desc);
create index if not exists works_ndc_gin_idx on catalog.works using gin (ndc_classifications);
create index if not exists people_name_reading_idx on catalog.people (family_name_reading, given_name_reading);
create index if not exists work_people_person_idx on catalog.work_people (person_id, role, work_id);
create index if not exists bibliographic_sources_work_idx on catalog.bibliographic_sources (work_id);
create index if not exists work_contributors_work_idx on catalog.work_contributors (work_id);
create index if not exists source_files_work_format_idx on catalog.source_files (work_id, format);
create index if not exists chapters_work_ordinal_idx on catalog.chapters (work_id, ordinal);
create index if not exists paragraphs_work_ordinal_idx on catalog.paragraphs (work_id, ordinal);
create index if not exists paragraphs_chapter_idx on catalog.paragraphs (chapter_id, chapter_ordinal);
create index if not exists ruby_annotations_paragraph_idx on catalog.ruby_annotations (paragraph_id, ordinal);
create index if not exists gaiji_annotations_paragraph_idx on catalog.gaiji_annotations (paragraph_id, ordinal);
create index if not exists work_profiles_published_level_idx on app.work_profiles (is_published, jlpt_level, work_id);
create index if not exists work_profiles_genres_gin_idx on app.work_profiles using gin (genres);
create index if not exists work_tags_tag_idx on app.work_tags (tag_id, work_id);

comment on table catalog.works is '青空文庫の作品メタデータ。公開可否は copyright_status で必ず判定する。';
comment on table catalog.work_contents is '原本HTML、本文HTML、純テキストを一作品一行で保持する。PostgreSQL TOAST圧縮対象。';
comment on column catalog.ruby_annotations.start_offset is '段落plain_text内のUnicodeコードポイント単位オフセット。';
comment on table app.work_profiles is 'JLPT、ジャンル、要約、公開範囲などサイト独自の編集情報。青空文庫原データと分離する。';
