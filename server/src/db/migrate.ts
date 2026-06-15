import fs from 'node:fs';
import path from 'node:path';
import { db } from './database.js';

const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');

const applied = new Set(
  db.prepare('SELECT filename FROM schema_migrations').all().map((row: any) => row.filename)
);

for (const filename of fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()) {
  if (applied.has(filename)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
  db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(filename);
  })();
  console.log(`Applied ${filename}`);
}
