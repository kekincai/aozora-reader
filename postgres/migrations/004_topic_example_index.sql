create table if not exists catalog.topic_examples (
  topic_key text not null,
  form_key text not null,
  paragraph_id bigint not null references catalog.paragraphs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_key, form_key, paragraph_id)
);

create index if not exists topic_examples_lookup_idx
  on catalog.topic_examples(topic_key, form_key, paragraph_id);

create or replace function catalog.refresh_topic_examples()
returns bigint
language plpgsql
as $$
declare
  inserted_count bigint;
begin
  delete from catalog.topic_examples where topic_key = 'giving-receiving';
  insert into catalog.topic_examples(topic_key, form_key, paragraph_id)
  select 'giving-receiving', forms.form_key, paragraphs.id
  from catalog.paragraphs paragraphs
  cross join (values
    ('kureru', '(て|で)(くれ|呉れ|くださ|下さ)'),
    ('morau', '(て|で)(もら|貰|いただ|戴|頂)'),
    ('ageru', '(て|で)(あげ|上げ|やる|やり|やっ|やれ|差し上げ)'),
    ('causative', '(させて|せて)(くれ|呉れ|くださ|下さ|もら|貰|いただ|戴|頂|あげ|上げ|やる|やり|やっ|やれ)')
  ) as forms(form_key, pattern)
  where paragraphs.plain_text ~ forms.pattern
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

select catalog.refresh_topic_examples();

analyze catalog.topic_examples;
