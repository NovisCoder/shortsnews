import { pgTable, text, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectId: text("project_id").notNull().unique(),
  createdAt: text("created_at").notNull(),

  inputType: text("input_type").notNull(),
  sourceUrl: text("source_url"),
  articleTitle: text("article_title"),
  publisher: text("publisher"),
  rawInputText: text("raw_input_text").notNull(),
  cleanArticleText: text("clean_article_text"),
  extractionQuality: text("extraction_quality"),

  tone: text("tone").notNull().default("easy_explainer"),
  topicAngle: text("topic_angle"),

  scriptJson: text("script_json"),

  reviewStatus: text("review_status").notNull().default("draft"),
  editorNotes: text("editor_notes").default(""),
  llmModel: text("llm_model").default(""),

  exportStatus: text("export_status").notNull().default("draft"),

  riskFlags: text("risk_flags").default("[]"),
  factualConfidenceScore: text("factual_confidence_score").default("1"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
