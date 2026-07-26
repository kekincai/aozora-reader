alter table catalog.topic_examples
  add column if not exists work_id bigint,
  add column if not exists editorial_rank smallint not null default 10,
  add column if not exists publication_year smallint not null default 0,
  add column if not exists topic_work_rank smallint,
  add column if not exists form_work_rank smallint;

create index if not exists topic_examples_editorial_all_idx
  on catalog.topic_examples(topic_key, editorial_rank desc, publication_year desc, paragraph_id desc)
  where topic_work_rank <= 2;

create index if not exists topic_examples_editorial_form_idx
  on catalog.topic_examples(topic_key, form_key, editorial_rank desc, publication_year desc, paragraph_id desc)
  where form_work_rank <= 2;

create or replace function catalog.refresh_topic_examples()
returns bigint
language plpgsql
as $$
declare
  inserted_count bigint;
begin
  delete from catalog.topic_examples where topic_key = 'giving-receiving';

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
  ), work_metadata as (
    select works.id as work_id,
      coalesce(
        nullif(substring(works.first_appearance from '[0-9]{4}'), '')::integer,
        source_years.publication_year,
        extract(year from works.published_on)::integer,
        0
      ) as publication_year,
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
      end as editorial_rank
    from catalog.works works
    left join author_names on author_names.work_id = works.id
    left join source_years on source_years.work_id = works.id
  ), classified as materialized (
    select forms.form_key, paragraphs.id as paragraph_id, paragraphs.work_id,
      work_metadata.editorial_rank, work_metadata.publication_year
    from catalog.paragraphs paragraphs
    join work_metadata on work_metadata.work_id = paragraphs.work_id
    cross join (values
      ('kureru', '(て|で)(くれ|呉れ|くださ|下さ)'),
      ('morau', '(て|で)(もら|貰|いただ|戴|頂)'),
      ('ageru', '(て|で)(あげ|上げ|やる|やり|やっ|やれ|差し上げ)'),
      ('causative', '((させて)|([かがたなばまらわ]せて))(くれ|呉れ|くださ|下さ|もら|貰|いただ|戴|頂|あげ|上げ|やる|やり|やっ|やれ)')
    ) as forms(form_key, pattern)
    where paragraphs.plain_text ~ forms.pattern
  ), topic_choices as (
    select distinct on (paragraph_id) *
    from classified
    order by paragraph_id,
      case form_key when 'causative' then 1 when 'kureru' then 2 when 'morau' then 3 else 4 end
  ), topic_ranked as (
    select topic_choices.*,
      row_number() over (partition by work_id order by paragraph_id desc) as work_rank
    from topic_choices
  ), form_ranked as (
    select classified.*,
      row_number() over (partition by work_id, form_key order by paragraph_id desc) as work_rank
    from classified
  )
  insert into catalog.topic_examples(
    topic_key, form_key, paragraph_id, work_id, editorial_rank, publication_year, topic_work_rank, form_work_rank
  )
  select 'giving-receiving', classified.form_key, classified.paragraph_id, classified.work_id,
    classified.editorial_rank, classified.publication_year,
    topic_ranked.work_rank::smallint, form_ranked.work_rank::smallint
  from classified
  join form_ranked using (form_key, paragraph_id, work_id, editorial_rank, publication_year)
  left join topic_ranked using (form_key, paragraph_id, work_id, editorial_rank, publication_year)
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  analyze catalog.topic_examples;
  return inserted_count;
end;
$$;
