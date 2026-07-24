-- ============================================
-- STORAGE USAGE VIEW (for Admin > Data Management)
-- Aggregates real Supabase Storage object counts/sizes per bucket.
-- Safe to re-run
-- ============================================

create or replace view public.storage_usage as
select
  bucket_id,
  count(*) as object_count,
  coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes
from storage.objects
group by bucket_id;

grant select on public.storage_usage to authenticated;
