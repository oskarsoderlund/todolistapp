#!/usr/bin/env node
// Initialize the SQLite database used by the Todo agent.
// Run with: `npm run db:init` or `node scripts/init-db.mjs`

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), "data", "todo.db");

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`[init-db] Skapade mapp ${dbDir}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT    NOT NULL,
    priority    TEXT    NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
    status      TEXT    NOT NULL CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

const { count } = db.prepare("SELECT COUNT(*) AS count FROM tasks").get();

console.log(`[init-db] OK — databas: ${DB_PATH}`);
console.log(`[init-db] Antal befintliga uppgifter: ${count}`);

db.close();
