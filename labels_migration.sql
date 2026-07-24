-- ============================================
-- LABELS (multi-select) SUPPORT
-- Safe to re-run
-- ============================================

alter table issues add column if not exists labels text[] default '{}';

-- Optional: drop the old single-label text column if you added it earlier and want to clean up
-- (safe to skip if you never added a "label" column)
-- alter table issues drop column if exists label;
