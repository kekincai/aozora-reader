alter table catalog.work_contents
  drop column if exists raw_html,
  drop column if exists body_html;

alter table catalog.chapters
  drop column if exists plain_text;

comment on table catalog.work_contents is '作品単位の検索用純テキストと解析集計。原本HTMLは青空文庫Git、表示HTMLはparagraphsに保持する。';
