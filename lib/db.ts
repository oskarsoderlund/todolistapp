import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

export type Priority = "low" | "medium" | "high";
export type Status = "pending" | "completed";

export interface Task {
  id: number;
  description: string;
  priority: Priority;
  status: Status;
  created_at: string;
}

const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), "data", "todo.db");

// Ensure the parent directory exists before opening the file.
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Singleton across hot-reloads in dev.
const globalForDb = globalThis as unknown as {
  __todoDb?: Database.Database;
};

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

function ensureSchema(db: Database.Database) {
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
}

export function getDb(): Database.Database {
  if (!globalForDb.__todoDb) {
    globalForDb.__todoDb = createDb();
  }
  return globalForDb.__todoDb;
}

// ----- Query helpers (synchronous, prepared statements) -----

export function addTask(description: string, priority: Priority): Task {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO tasks (description, priority) VALUES (?, ?) RETURNING *`,
  );
  return stmt.get(description, priority) as Task;
}

export function getTasks(filter: "pending" | "completed" | "all" = "pending"): Task[] {
  const db = getDb();
  const orderClause = `
    ORDER BY
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      datetime(created_at) DESC
  `;

  if (filter === "all") {
    return db.prepare(`SELECT * FROM tasks ${orderClause}`).all() as Task[];
  }
  return db
    .prepare(`SELECT * FROM tasks WHERE status = ? ${orderClause}`)
    .all(filter) as Task[];
}

export function completeTask(id: number): Task | { error: "not_found" } {
  const db = getDb();
  const updated = db
    .prepare(
      `UPDATE tasks SET status = 'completed' WHERE id = ? RETURNING *`,
    )
    .get(id) as Task | undefined;
  if (!updated) return { error: "not_found" };
  return updated;
}
