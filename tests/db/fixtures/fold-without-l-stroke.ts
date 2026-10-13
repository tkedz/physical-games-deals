/**
 * A synthetic rule change for tests/db/rule-change.test.ts (D4), which proves
 * the detectors by breaking the rule on purpose.
 *
 * It is public.fold_for_matching as
 * supabase/migrations/20261013115104_fold_nfc_first.sql defines it, copied
 * with Ł and ł taken out of the two upper- and lower-case Polish
 * segments of the first translate string, and the l each mapped to taken out
 * of the matching "acelnoszz" segments of the second, so every other letter
 * keeps its position. ł then falls through to the step that turns every run
 * outside [a-z0-9] into a space: the fold changes for every text holding ł or
 * Ł, and for no other. Everything else, attributes included, is the source's,
 * so the change is to the table alone and create or replace keeps the grants.
 *
 * The copy follows the current body: when a migration replaces
 * fold_for_matching, this file takes the new body with the same two edits,
 * or D4 also finds every row the newer change touched.
 */
export const FOLD_WITHOUT_L_STROKE = `create or replace function public.fold_for_matching(value text)
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
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || 'ĄĆĘŃÓŚŹŻ' || 'ąćęńóśźż'
            || 'ÀÁÂÃÄÅàáâãäå' || 'ÇČçč' || 'ĎĐďđ' || 'ÈÉÊËĚèéêëě' || 'ÌÍÎÏìíîï'
            || 'ŇÑňñ' || 'ÒÔÕÖØŐòôõöøő' || 'Řř' || 'Šš' || 'Ťť' || 'ÙÚÛÜŮŰùúûüůű'
            || 'ÝŸýÿ' || 'Žž' || '''’‘\`´ʼ',
          'abcdefghijklmnopqrstuvwxyz' || 'acenoszz' || 'acenoszz'
            || 'aaaaaaaaaaaa' || 'cccc' || 'dddd' || 'eeeeeeeeee' || 'iiiiiiii'
            || 'nnnn' || 'oooooooooooo' || 'rr' || 'ss' || 'tt' || 'uuuuuuuuuuuu'
            || 'yyyy' || 'zz'),
        '&', ' and '),
      '[^a-z0-9]+', ' ', 'g'))
$$;
`;
