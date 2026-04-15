import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { projects, appSettings, type Project, type InsertProject } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// 테이블 자동 생성
async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
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
  `;
}

// 서버 시작 시 테이블 생성
initDb().catch(console.error);

export interface IStorage {
  getAllProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(projectId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(projectId: string): Promise<void>;
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;
}

export const storage: IStorage = {
  async getAllProjects() {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  },
  async getProject(projectId) {
    const rows = await db.select().from(projects).where(eq(projects.projectId, projectId));
    return rows[0];
  },
  async createProject(data) {
    const rows = await db.insert(projects).values(data).returning();
    return rows[0];
  },
  async updateProject(projectId, data) {
    const rows = await db.update(projects).set(data).where(eq(projects.projectId, projectId)).returning();
    return rows[0];
  },
  async deleteProject(projectId) {
    await db.delete(projects).where(eq(projects.projectId, projectId));
  },
  async getSetting(key) {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows[0]?.value;
  },
  async setSetting(key, value) {
    await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  },
  async getAllSettings() {
    const rows = await db.select().from(appSettings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
