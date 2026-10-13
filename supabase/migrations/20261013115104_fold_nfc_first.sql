-- Revert: create or replace public.fold_for_matching and its comment as 20261012070050_match_deals_to_watchlist.sql defines them, run that migration's settle statement again, reindex index public.watchlist_entries_active_phrase_folded, then update public.deals set title = title. The phrases this migration's settle marked removed stay removed.
-- Backward-compatible with the previous deployment: yes — the function keeps its name, signature, volatility and grants, and its result changes only for text that NFC changes: an accent typed as a separate character, or a canonical singleton such as U+212A KELVIN SIGN. Until the code deploy, the deployed rules.ts can disagree only on phrases holding such text, and where the database refuses one the pre-check let through, addEntry answers 23505 as "duplicate".

-- S-04's implementation review, F5
-- (context/changes/deals-matched-to-watchlist/reviews/impl-review.md), fixed
-- in rollout Phase 6 of context/changes/testing-matching-rule-protection/plan.md.
-- The translate table holds precomposed letters only, so a title or a phrase
-- whose accent was typed as a separate combining character (NFD), "Poke",
-- U+0301, "mon", folded to "poke mon": the accent became a space and split
-- the word. The fold now normalises its input to NFC first, which composes
-- such a letter, so the table sees "é" and folds it to "e".
--
-- A combining mark with no precomposed letter still turns into a space, and
-- ł, which has no decomposition, does not change. NFC also maps a few
-- canonical singletons, such as U+212A KELVIN SIGN to K and U+212B ANGSTROM
-- SIGN to Å. NFKC, which would also fold compatibility forms such as
-- fullwidth letters and Roman numerals, would widen the rule, and is not
-- taken here.
--
-- pg_catalog.normalize is immutable, as an index expression needs. It is
-- called with 'NFC' as text: the bare NFC keyword belongs to the special
-- syntax, which a schema-qualified call does not take. foldForMatching in
-- src/lib/watchlist/rules.ts takes the same first step.
--
-- A fold change owes the rows it leaves behind three things, in this order
-- (CLAUDE.md, Deal matching): settle the phrases that newly fold alike, so
-- that the reindex meets no duplicate; reindex the folded phrase index, which
-- create or replace does not rebuild; recompute the keys public.deals
-- stores. Everything but the NFC step is 20261012070050's, unchanged.
create or replace function public.fold_for_matching(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.translate(
          pg_catalog.normalize(value, 'NFC'),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || 'ĄĆĘŁŃÓŚŹŻ' || 'ąćęłńóśźż'
            || 'ÀÁÂÃÄÅàáâãäå' || 'ÇČçč' || 'ĎĐďđ' || 'ÈÉÊËĚèéêëě' || 'ÌÍÎÏìíîï'
            || 'ŇÑňñ' || 'ÒÔÕÖØŐòôõöøő' || 'Řř' || 'Šš' || 'Ťť' || 'ÙÚÛÜŮŰùúûüůű'
            || 'ÝŸýÿ' || 'Žž' || '''’‘`´ʼ',
          'abcdefghijklmnopqrstuvwxyz' || 'acelnoszz' || 'acelnoszz'
            || 'aaaaaaaaaaaa' || 'cccc' || 'dddd' || 'eeeeeeeeee' || 'iiiiiiii'
            || 'nnnn' || 'oooooooooooo' || 'rr' || 'ss' || 'tt' || 'uuuuuuuuuuuu'
            || 'yyyy' || 'zz'),
        '&', ' and '),
      '[^a-z0-9]+', ' ', 'g'))
$$;

-- The settle statement of 20261012070050: in each group of active phrase
-- entries with one user, one non-empty folded text and one platform, the
-- oldest stays — by created_at, then id — and the rest are marked removed.
-- They stay as records (FR-004).
update public.watchlist_entries as e
set removed_at = now()
from (
  select id,
    row_number() over (
      partition by user_id, public.fold_for_matching(phrase), platform
      order by created_at, id
    ) as rank_in_group
  from public.watchlist_entries
  where kind = 'phrase' and removed_at is null and public.fold_for_matching(phrase) <> ''
) as ranked
where e.id = ranked.id and ranked.rank_in_group > 1;

reindex index public.watchlist_entries_active_phrase_folded;

update public.deals set title = title;

comment on function public.fold_for_matching(text) is
  'Text as matching compares it: normalised to NFC first, so that an accent typed as a separate character joins its letter; then A-Z lowered and the Latin diacritics of one fixed table folded to their base letter, ł included, through translate rather than lower(), so that the result does not depend on the locale; apostrophes removed; "&" read as " and "; every other run of characters outside [a-z0-9] turned into one space; the ends trimmed. foldForMatching in src/lib/watchlist/rules.ts mirrors it.';
