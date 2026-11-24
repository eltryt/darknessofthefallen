-- Honor rank (0 = no rank yet, 1-14) and honorable kills, as Forever's profile API
-- answers them in /pvp-summary. Filled by the Battle.net refresh; null until then.
ALTER TABLE characters ADD COLUMN pvp_rank INTEGER CHECK(pvp_rank IS NULL OR pvp_rank BETWEEN 0 AND 14);
ALTER TABLE characters ADD COLUMN honorable_kills INTEGER CHECK(honorable_kills IS NULL OR honorable_kills >= 0);
INSERT INTO schema_migrations(version) VALUES(27);
