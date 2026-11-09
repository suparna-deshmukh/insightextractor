import Database from 'better-sqlite3';
import { EvidenceRecord, SqlAuditEntry } from './types';

export function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT,
      author TEXT,
      date TEXT,
      score REAL DEFAULT 0,
      rating REAL,
      bucket INTEGER,
      sentiment TEXT,
      relevance TEXT DEFAULT 'relevant'
    );
  `);
  return db;
}

export function insertRecords(db: Database.Database, rows: EvidenceRecord[]): number {
  const stmt = db.prepare(`INSERT OR REPLACE INTO records (id, source, title, body, url, author, date, score, rating) VALUES (?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction((items: EvidenceRecord[]) => {
    for (const r of items) stmt.run(r.id, r.source, r.title, r.body, r.url, r.author, r.date, r.score, r.rating ?? null);
  });
  tx(rows);
  return rows.length;
}

export function runQuery(
  db: Database.Database,
  audit: SqlAuditEntry[],
  stage: string,
  sql: string,
  summarize: (rows: any[]) => string
): any[] {
  const rows = db.prepare(sql).all();
  audit.push({ stage, sql: sql.replace(/\s+/g, ' ').trim(), rows: rows.length, summary: summarize(rows) });
  return rows;
}

export function fetchRows(db: Database.Database, sql: string, ...params: any[]): any[] {
  return db.prepare(sql).all(...params);
}
