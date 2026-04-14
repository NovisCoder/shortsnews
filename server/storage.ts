import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { projects, appSettings, type Project, type InsertProject, type AppSetting } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("shortsnews.db");
const db = drizzle(sqlite);

// Ensure tables exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    input_type TEXT NOT NULL,
    source_url TEXT,
    article_title TEXT,
    publisher TEXT,
    raw_input_text TEXT NOT NULL,
    clean_article_text TEXT,
    extraction_quality TEXT,
    tone TEXT NOT NULL DEFAULT 'easy_explainer',
    topic_angle TEXT,
    script_json TEXT,
    review_status TEXT NOT NULL DEFAULT 'draft',
    editor_notes TEXT DEFAULT '',
    llm_model TEXT DEFAULT '',
    export_status TEXT NOT NULL DEFAULT 'draft',
    risk_flags TEXT DEFAULT '[]',
    factual_confidence_score TEXT DEFAULT '1'
  )
`);

export interface IStorage {
  getAllProjects(): Project[];
  getProject(projectId: string): Project | undefined;
  createProject(data: InsertProject): Project;
  updateProject(projectId: string, data: Partial<InsertProject>): Project | undefined;
  deleteProject(projectId: string): void;
  // Settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  getAllSettings(): Record<string, string>;
}

export const storage: IStorage = {
  getAllProjects() {
    return db.select().from(projects).orderBy(desc(projects.createdAt)).all();
  },
  getProject(projectId) {
    return db.select().from(projects).where(eq(projects.projectId, projectId)).get();
  },
  createProject(data) {
    return db.insert(projects).values(data).returning().get();
  },
  updateProject(projectId, data) {
    const result = db
      .update(projects)
      .set(data)
      .where(eq(projects.projectId, projectId))
      .returning()
      .get();
    return result;
  },
  deleteProject(projectId) {
    db.delete(projects).where(eq(projects.projectId, projectId)).run();
  },
  getSetting(key) {
    const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    return row?.value;
  },
  setSetting(key, value) {
    db.insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
      .run();
  },
  getAllSettings() {
    const rows = db.select().from(appSettings).all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
