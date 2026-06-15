import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const defaultServerlessPath = process.env.NETLIFY || process.env.VERCEL ? '/tmp/routeshare.sqlite' : config.DATABASE_URL;
const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || defaultServerlessPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}
