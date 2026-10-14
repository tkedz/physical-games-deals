-- Rebuilds scripts/extract/eval/posts.json: the 55 real labelled posts of
-- scripts/extract/eval/labels.json, exported by their ids. Read-only.
--
-- How to save it: run this in the Supabase SQL editor; it returns one row
-- with one `posts` cell (55 elements when every labelled post is still in
-- public.collected_posts). Copy the cell's value — or export the result as
-- JSON, which wraps it in a result row that parsePosts accepts too — and save
-- it as scripts/extract/eval/posts.json, UTF-8. The file is gitignored,
-- because it carries post text. To check a copy you already have, save the
-- result elsewhere and compare it rather than overwriting posts.json.
--
-- This is the sample query of
-- context/changes/physical-deals-from-real-posts/evaluation.md ("Sample
-- query") with its random() sample replaced by the labels' postIds, so a
-- rerun returns the same posts. A label added to labels.json for a real post
-- needs its id added below. The synthetic posts live in synthetic-posts.json
-- and are not in the database.
--
-- One element per link: the representative row (its earliest sighting), whose
-- id the label carries, and the feed id and platform hint of every row
-- sharing the link.
with links as (
  select distinct on (link) *
  from public.collected_posts
  where link is not null
  order by link, first_seen_at, id
),
tagged as (
  select l.*,
         split_part(l.source, '-', 1) as aggregator
  from links l
)
select json_agg(
         json_build_object(
           'post', to_jsonb(t) - 'processed_at' - 'aggregator',
           'feeds', (
             select json_agg(json_build_object('source', c.source,
                                               'platform_hint', c.platform_hint)
                             order by c.source)
             from public.collected_posts c
             where c.link = t.link
           )
         )
         order by t.aggregator, t.id
       ) as posts
from tagged t
where t.id in (
    '0f5cc06c045eb321', '21992a93f6d95283', '35f9ffbf227d28a3', '7e6598e4ba19ae79',
    '80b992c95c74a3d0', '83328db2b6466093', '8a51f8e9a8bd27d9', '9d4b5010d732e207',
    'aafc9cf6cbc51857', 'cd21c66efdee0b82', 'db678008ec9a4f31', 'f1586d19dab5c195',
    '09b1153826a6c918', '1682822fa7cf7b7d', '1ba5fb9a24d655f2', '504666985fda941d',
    '66ee4a26b278abb5', '773cee9350629db7', '7e3fd28bfe5e243c', '8410aaf7573d95a7',
    'af2c1cb46eb61f25', 'da46d8fb2c4f753c', 'dc6b8a966ab2d97e', 'ef4a82ff16eff7cf',
    'f60aae03ac782340', 'f647131aa127e5f0', 'f7b390c70839bbcb', 'f95141295655b0ea',
    '177da139d6c1c235', '290c07bba85be6df', '2c5b90ea87e74a91', '3c466673229032b5',
    '40e923c089c02c46', '4780c2c26320636f', '553a5c179b3fb366', '5d02587d7b3216e8',
    '69a6d68732570c9a', '7a81989f145fb596', '82c6e55196928d62', '88a52603860e86b8',
    '9084b8dec6fa59da', '9220654893e4b984', '9d718bcdfa7fdca2', '9f637e9775ac2828',
    '9fc29fb2a638ffce', 'b499462a6223aff0', 'bac6b58408e8d112', 'bac6ff8ce71904d9',
    'be25eecd82bbf812', 'c86fa2ad9e24cc38', 'd03942ee8b83b7b8', 'd31a86d97c2b4922',
    'd7bc4657c73d0f06', 'f167c50ce0f5f980', 'f89ad2ca3d0c61f8'
  );
