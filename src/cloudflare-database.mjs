import {defaults} from './database-core.mjs';

// The existing domain code uses synchronous prepared statements. Durable
// Objects' SQLite API provides the same model, with platform transactions.
export function durableDatabase(storage, initialSchema, operationsSchema) {
  const execute = (sql, parameters = []) => storage.sql.exec(sql, ...parameters);
  const db = {
    exec(sql) { execute(sql).toArray(); },
    prepare(sql) {
      return {
        all(...parameters) { return execute(sql, parameters).toArray(); },
        get(...parameters) { return execute(sql, parameters).toArray()[0]; },
        run(...parameters) {
          const cursor = execute(sql, parameters);
          cursor.toArray();
          return {changes: cursor.rowsWritten};
        }
      };
    },
    transactionSync(callback) { return storage.transactionSync(callback); }
  };
  storage.transactionSync(() => {
    db.exec(initialSchema);
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) db.exec(operationsSchema);
    db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)').run(JSON.stringify(defaults));
  });
  return db;
}
