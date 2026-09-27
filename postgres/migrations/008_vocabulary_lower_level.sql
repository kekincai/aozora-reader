-- N2/N1 reference entries that are really N5–N3 words under another spelling (面白い, 其れから).
-- They stay searchable by id for saved cards but are not annotated or listed as N2/N1.
alter table learning.vocabulary add column if not exists lower_level text check (lower_level in ('N5', 'N4', 'N3'));
