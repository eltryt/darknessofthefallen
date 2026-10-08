-- Owner-confirmed invitation. Fill only the previously empty setting and run once.
INSERT INTO audit(actor_id,action,target,changes,created_at)
SELECT 'migration:003','settings.updated','guild',
  json_object('before',json_object('discordUrl',''),'after',json_object('discordUrl','https://discord.gg/4PTrHVYUNT')),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM settings WHERE id=1 AND coalesce(json_extract(data,'$.discordUrl'),'')='';
UPDATE settings SET data=json_set(data,'$.discordUrl','https://discord.gg/4PTrHVYUNT')
WHERE id=1 AND coalesce(json_extract(data,'$.discordUrl'),'')='';
INSERT INTO schema_migrations(version) VALUES(3);
