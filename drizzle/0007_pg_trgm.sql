-- Custom SQL migration file, put your code below! --

-- R2a Library v2 smart search: trigram fuzzy matching for "similar words"
-- across track titles/descriptions and (admin-only) transcript full text.
-- The extension is idempotent; queries use similarity()/ILIKE at read time,
-- so no columns or indexes change here (nothing lost, no schema drift).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
