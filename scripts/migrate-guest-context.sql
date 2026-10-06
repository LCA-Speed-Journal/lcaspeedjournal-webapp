-- Sport selected on the speed-testing form when the entry was saved.
-- NULL means All sports, or an entry saved before this column existed.
-- Guest is NOT stored. Readers compare this value to athlete_hugo_memberships.

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS context_hugo_group TEXT;
