-- Chinese meanings for N2/N1 vocabulary from the Tomoshi open dictionary data
-- (JMdict-based, CC BY-SA 4.0: © EDRDG, Chinese layer © Y1Z). English stays as the fallback.
alter table learning.vocabulary add column if not exists meaning_zh text;
alter table learning.vocabulary add column if not exists meaning_zh_source text;
