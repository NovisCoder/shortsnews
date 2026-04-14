import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── App Settings (persistent key storage on server) ──────────────────────────
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Projects (generated script packages) ───────────────────────────────────
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull().unique(),
  createdAt: text("created_at").notNull(),

  // Input
  inputType: text("input_type").notNull(), // "url" | "pasted_text"
  sourceUrl: text("source_url"),
  articleTitle: text("article_title"),
  publisher: text("publisher"),
  rawInputText: text("raw_input_text").notNull(),
  cleanArticleText: text("clean_article_text"),
  extractionQuality: text("extraction_quality"), // "high"|"medium"|"low"

  // Settings
  tone: text("tone").notNull().default("easy_explainer"),
  topicAngle: text("topic_angle"), // 경제 초보자, 부동산, 직장인 etc.

  // Generated script (JSON string)
  scriptJson: text("script_json"),

  // Review
  reviewStatus: text("review_status").notNull().default("draft"),
  editorNotes: text("editor_notes").default(""),
  llmModel: text("llm_model").default(""),

  // Export
  exportStatus: text("export_status").notNull().default("draft"),

  // Safety flags (JSON array string)
  riskFlags: text("risk_flags").default("[]"),
  factualConfidenceScore: text("factual_confidence_score").default("1"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
