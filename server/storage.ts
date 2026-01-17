import { db } from "./db";
import { 
  type User, 
  type InsertUser,
  type VideoGeneration,
  type InsertVideoGeneration,
  type CachedVideoClip,
  type InsertCachedVideoClip,
  type MediaItem,
  type InsertMediaItem,
  type AppSetting,
  type InsertAppSetting,
  users,
  videoGenerations,
  cachedVideoClips,
  mediaLibrary,
  appSettings
} from "@shared/schema";
import { eq, sql, desc, ilike } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  // Settings methods
  getSetting(key: string): Promise<AppSetting | undefined>;
  getAllSettings(): Promise<AppSetting[]>;
  setSetting(key: string, value: string, description?: string): Promise<AppSetting>;
  deleteSetting(key: string): Promise<void>;
  
  // Video generation methods
  createVideoGeneration(data: InsertVideoGeneration): Promise<VideoGeneration>;
  getVideoGeneration(id: number): Promise<VideoGeneration | undefined>;
  updateVideoGeneration(id: number, data: Partial<VideoGeneration>): Promise<VideoGeneration>;
  getAllVideoGenerations(): Promise<VideoGeneration[]>;
  
  // Video cache methods
  getCachedClipByPexelsId(pexelsId: number): Promise<CachedVideoClip | undefined>;
  findCachedClips(searchTerm: string, orientation: string, limit?: number): Promise<CachedVideoClip[]>;
  saveCachedClip(data: InsertCachedVideoClip): Promise<CachedVideoClip>;
  addSearchTermToClip(id: number, searchTerm: string): Promise<void>;
  
  // Media library methods
  getAllMediaItems(): Promise<MediaItem[]>;
  getMediaItem(id: number): Promise<MediaItem | undefined>;
  createMediaItem(data: InsertMediaItem): Promise<MediaItem>;
  updateMediaItem(id: number, data: Partial<MediaItem>): Promise<MediaItem>;
  deleteMediaItem(id: number): Promise<void>;
  searchMediaItems(query: string, orientation?: string): Promise<MediaItem[]>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getSetting(key: string): Promise<AppSetting | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting;
  }

  async getAllSettings(): Promise<AppSetting[]> {
    return db.select().from(appSettings).orderBy(appSettings.key);
  }

  async setSetting(key: string, value: string, description?: string): Promise<AppSetting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(appSettings)
        .set({ value, description, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(appSettings.key, key))
        .returning();
      return updated;
    }
    const [setting] = await db
      .insert(appSettings)
      .values({ key, value, description })
      .returning();
    return setting;
  }

  async deleteSetting(key: string): Promise<void> {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  }

  async createVideoGeneration(data: InsertVideoGeneration): Promise<VideoGeneration> {
    const [generation] = await db.insert(videoGenerations).values(data).returning();
    return generation;
  }

  async getVideoGeneration(id: number): Promise<VideoGeneration | undefined> {
    const [generation] = await db.select().from(videoGenerations).where(eq(videoGenerations.id, id));
    return generation;
  }

  async updateVideoGeneration(id: number, data: Partial<VideoGeneration>): Promise<VideoGeneration> {
    const [updated] = await db
      .update(videoGenerations)
      .set(data)
      .where(eq(videoGenerations.id, id))
      .returning();
    return updated;
  }

  async getAllVideoGenerations(): Promise<VideoGeneration[]> {
    return db.select().from(videoGenerations).orderBy(videoGenerations.createdAt);
  }

  async getCachedClipByPexelsId(pexelsId: number): Promise<CachedVideoClip | undefined> {
    const [clip] = await db.select().from(cachedVideoClips).where(eq(cachedVideoClips.pexelsId, pexelsId));
    return clip;
  }

  async findCachedClips(searchTerm: string, orientation: string, limit: number = 5): Promise<CachedVideoClip[]> {
    const normalizedTerm = searchTerm.toLowerCase().trim();
    const searchWords = normalizedTerm.split(/\s+/).filter(w => w.length > 2);
    
    if (searchWords.length === 0) {
      return [];
    }
    
    // Get clips with matching orientation, then filter by search terms
    const clips = await db
      .select()
      .from(cachedVideoClips)
      .where(eq(cachedVideoClips.orientation, orientation))
      .limit(50);
    
    // Score clips by how many search words match their terms
    const scoredClips = clips.map(clip => {
      let score = 0;
      for (const word of searchWords) {
        for (const term of clip.searchTerms) {
          if (term.includes(word) || word.includes(term)) {
            score++;
            break;
          }
        }
      }
      return { clip, score };
    });
    
    // Return clips with at least one match, sorted by score
    return scoredClips
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.clip);
  }

  async saveCachedClip(data: InsertCachedVideoClip): Promise<CachedVideoClip> {
    // Ensure searchTerms is never empty
    const terms = data.searchTerms.length > 0 ? data.searchTerms : ['uncategorized'];
    
    // Check if clip already exists
    const existing = await this.getCachedClipByPexelsId(data.pexelsId);
    
    if (existing) {
      // Merge search terms
      const allTerms = Array.from(new Set([...existing.searchTerms, ...terms]));
      const [clip] = await db
        .update(cachedVideoClips)
        .set({ 
          filePath: data.filePath,
          searchTerms: allTerms
        })
        .where(eq(cachedVideoClips.pexelsId, data.pexelsId))
        .returning();
      return clip;
    }
    
    const [clip] = await db
      .insert(cachedVideoClips)
      .values({ ...data, searchTerms: terms })
      .returning();
    return clip;
  }

  async addSearchTermToClip(id: number, searchTerm: string): Promise<void> {
    const clip = await db.select().from(cachedVideoClips).where(eq(cachedVideoClips.id, id)).limit(1);
    if (clip.length > 0) {
      const newTerms = Array.from(new Set([...clip[0].searchTerms, searchTerm]));
      await db
        .update(cachedVideoClips)
        .set({ searchTerms: newTerms })
        .where(eq(cachedVideoClips.id, id));
    }
  }

  async getAllMediaItems(): Promise<MediaItem[]> {
    return db.select().from(mediaLibrary).orderBy(desc(mediaLibrary.createdAt));
  }

  async getMediaItem(id: number): Promise<MediaItem | undefined> {
    const [item] = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, id));
    return item;
  }

  async createMediaItem(data: InsertMediaItem): Promise<MediaItem> {
    const [item] = await db.insert(mediaLibrary).values(data).returning();
    return item;
  }

  async updateMediaItem(id: number, data: Partial<MediaItem>): Promise<MediaItem> {
    const [updated] = await db
      .update(mediaLibrary)
      .set(data)
      .where(eq(mediaLibrary.id, id))
      .returning();
    return updated;
  }

  async deleteMediaItem(id: number): Promise<void> {
    await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id));
  }

  async searchMediaItems(query: string, orientation?: string): Promise<MediaItem[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const searchWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
    
    let items = await db
      .select()
      .from(mediaLibrary)
      .orderBy(desc(mediaLibrary.createdAt))
      .limit(100);
    
    if (orientation) {
      items = items.filter(item => item.orientation === orientation);
    }
    
    if (searchWords.length === 0) {
      return items;
    }
    
    // Score and filter by matching tags, title, or description
    const scoredItems = items.map(item => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      
      for (const word of searchWords) {
        if (titleLower.includes(word)) score += 3;
        if (descLower.includes(word)) score += 2;
        if (item.tags.some(tag => tag.includes(word))) score += 2;
      }
      return { item, score };
    });
    
    return scoredItems
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);
  }
}

export const storage = new DatabaseStorage();
