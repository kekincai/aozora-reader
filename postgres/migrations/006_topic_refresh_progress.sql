create table if not exists ops.topic_refresh_runs (
  id bigint generated always as identity primary key,
  topic_key text not null,
  status text not null check (status in ('scanning', 'ranking', 'indexing', 'complete', 'failed')),
  last_paragraph_id bigint not null default 0,
  maximum_paragraph_id bigint not null,
  processed_paragraphs bigint not null default 0,
  matched_examples bigint not null default 0,
  processed_works integer not null default 0,
  total_works integer not null default 0,
  last_work_id bigint not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create index if not exists topic_refresh_runs_active_idx
  on ops.topic_refresh_runs(topic_key, status, id desc);

alter table catalog.topic_examples
  alter column topic_work_rank type integer,
  alter column form_work_rank type integer;
