import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["superadmin", "admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;

// Cached video clips from Pexels
export const cachedVideoClips = pgTable("cached_video_clips", {
  id: serial("id").primaryKey(),
  pexelsId: integer("pexels_id").notNull().unique(),
  filePath: text("file_path").notNull(),
  searchTerms: text("search_terms").array().notNull(),
  duration: integer("duration").notNull(),
  orientation: text("orientation").notNull(),
  quality: text("quality").notNull().default("hd"),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCachedVideoClipSchema = createInsertSchema(cachedVideoClips).omit({
  id: true,
  createdAt: true,
});

export type CachedVideoClip = typeof cachedVideoClips.$inferSelect;
export type InsertCachedVideoClip = z.infer<typeof insertCachedVideoClipSchema>;

// Media library for uploaded and stored videos
export const mediaLibrary = pgTable("media_library", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  filePath: text("file_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  source: text("source").notNull().default("upload"),
  duration: integer("duration"),
  width: integer("width"),
  height: integer("height"),
  orientation: text("orientation").notNull().default("landscape"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  aiAnalysis: text("ai_analysis"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMediaLibrarySchema = createInsertSchema(mediaLibrary).omit({
  id: true,
  createdAt: true,
});

export type MediaItem = typeof mediaLibrary.$inferSelect;
export type InsertMediaItem = z.infer<typeof insertMediaLibrarySchema>;

// Video generation tables
export const videoGenerations = pgTable("video_generations", {
  id: serial("id").primaryKey(),
  prompt: text("prompt").notNull(),
  duration: integer("duration").notNull(),
  orientation: text("orientation").notNull().default("landscape"),
  visualStyle: text("visual_style").notNull(),
  musicMood: text("music_mood").notNull(),
  musicVolume: real("music_volume").notNull().default(0.05),
  includeSpeech: integer("include_speech").notNull().default(1),
  language: text("language").notNull().default("en"),
  script: text("script"),
  scenes: text("scenes"),
  status: text("status").notNull().default("pending"),
  resultUrl: text("result_url"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVideoGenerationSchema = createInsertSchema(videoGenerations).omit({
  id: true,
  createdAt: true,
});

export type VideoGeneration = typeof videoGenerations.$inferSelect;
export type InsertVideoGeneration = z.infer<typeof insertVideoGenerationSchema>;

// Export chat models
export * from "./models/chat";
