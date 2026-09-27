-- Computed difficulty for every work, kept apart from the editorial levels in app.work_profiles.
create table if not exists app.work_readability (
  work_id bigint primary key references catalog.works(id) on delete cascade,
  version text not null,
  score numeric(8, 2) not null,
  level text not null check (level in ('N2', 'N2+', 'N1', 'N1+')),
  -- Suitable as a daily serial: modern kana, a few days to a few weeks long, prose.
  serial_ok boolean not null default false,
  metrics jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists work_readability_level_idx on app.work_readability (level, score);
create index if not exists work_readability_serial_idx on app.work_readability (score) where serial_ok;
