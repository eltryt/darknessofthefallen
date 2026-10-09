-- Open applications once, as requested by the guild owner. Later panel edits persist.
INSERT INTO audit(actor_id,action,target,changes,created_at)
SELECT 'migration:004','settings.updated','guild',
  json_object('before',json_object('recruitmentOpen',json_extract(data,'$.recruitmentOpen')),
              'after',json_object('recruitmentOpen',json('true'))),
  strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM settings WHERE id=1;
UPDATE settings SET data=json_set(data,'$.recruitmentOpen',json('true')) WHERE id=1;
UPDATE settings SET data=json_set(data,'$.server','Servidor PvP')
WHERE id=1 AND json_extract(data,'$.server')='Por confirmar';
INSERT INTO schema_migrations(version) VALUES(4);
