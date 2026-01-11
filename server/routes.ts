import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { insertVideoGenerationSchema, insertMediaLibrarySchema } from "@shared/schema";
import { generateVideo } from "./services/videoGenerator";
import { analyzeVideo, getVideoMetadata } from "./services/videoAnalyzer";
import path from "path";
import fs from "fs";
import multer from "multer";

const MEDIA_UPLOAD_DIR = path.join(process.cwd(), "public", "media");
const upload = multer({ 
  dest: path.join(process.cwd(), "tmp", "uploads"),
  limits: { fileSize: 500 * 1024 * 1024 }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Serve generated videos
  app.use("/videos", (req, res, next) => {
    const videoPath = path.join(process.cwd(), "public/videos", req.path);
    if (fs.existsSync(videoPath)) {
      res.sendFile(videoPath);
    } else {
      next();
    }
  });

  // Get all video generations
  app.get("/api/videos", async (req, res) => {
    try {
      const videos = await storage.getAllVideoGenerations();
      res.json(videos);
    } catch (error) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  // Get single video generation
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getVideoGeneration(id);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      console.error("Error fetching video:", error);
      res.status(500).json({ error: "Failed to fetch video" });
    }
  });

  // Generate video (SSE streaming)
  app.post("/api/videos/generate", async (req, res) => {
    try {
      const validatedData = insertVideoGenerationSchema.parse(req.body);

      // Check if Pexels API key is configured
      if (!process.env.PEXELS_API_KEY) {
        return res.status(400).json({ 
          error: "Pexels API key is not configured. Please add PEXELS_API_KEY to your secrets." 
        });
      }

      // Create initial record
      const generation = await storage.createVideoGeneration({
        ...validatedData,
        status: "processing",
      });

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Step 1: Analyze prompt and generate script
        sendEvent({ step: "analyzing", message: "Analyzing prompt with AI..." });
        
        const targetLanguage = (validatedData as any).language || "en";
        const languageInstruction = targetLanguage === "id" 
          ? "IMPORTANT: Write ALL content (title, script, and scene text) in Bahasa Indonesia. If the prompt is in English, translate everything to Bahasa Indonesia."
          : "IMPORTANT: Write ALL content (title, script, and scene text) in English. If the prompt is in Bahasa Indonesia, translate everything to English.";

        const scriptPrompt = `You are a professional short-form video creator for news reels and social media (TikTok, Reels, Shorts). Create a ${validatedData.duration}-second video script based on this prompt: "${validatedData.prompt}"

Visual Style: ${validatedData.visualStyle}

${languageInstruction}

IMPORTANT: Create engaging, news-style content with bold captions.

Return a JSON object with:
1. "title": A catchy, attention-grabbing title (max 6 words)
2. "script": Full narration script for the voiceover. Write it as natural speech - DO NOT include any timestamps, time markers, or scene numbers. Just write flowing, conversational narration that sounds natural when spoken aloud.
3. "scenes": Array of 3-5 scenes, each with:
   - "timestamp": Time range for internal use only
   - "description": Simple search term for stock video (2-3 words, always in English for Pexels search)
   - "text": Short caption (6-9 words max). This will be shown as multi-line subtitle.

CRITICAL: The "script" field must be pure narration text only - no timestamps like "0-15s:" or "[Scene 1]" or any markers. It should read like a natural voiceover script.`;

        const scriptResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: scriptPrompt }],
          response_format: { type: "json_object" },
          max_completion_tokens: 2048,
        });

        const scriptData = JSON.parse(scriptResponse.choices[0]?.message?.content || "{}");
        sendEvent({ step: "script_ready", message: "Script generated", data: scriptData });

        // Step 2: Generate actual video
        const videoUrl = await generateVideo(
          {
            prompt: validatedData.prompt,
            duration: validatedData.duration,
            orientation: (validatedData.orientation as "landscape" | "portrait") || "landscape",
            visualStyle: validatedData.visualStyle,
            musicMood: validatedData.musicMood,
            musicVolume: validatedData.musicVolume ?? 0.02,
            includeSpeech: validatedData.includeSpeech === 1,
            language: (targetLanguage as "en" | "id"),
            script: scriptData.script,
            scenes: scriptData.scenes,
            title: scriptData.title,
          },
          (step, message) => {
            sendEvent({ step, message });
          }
        );

        // Update database with results
        const updated = await storage.updateVideoGeneration(generation.id, {
          script: scriptData.script || "",
          scenes: JSON.stringify(scriptData.scenes || []),
          status: "completed",
          resultUrl: videoUrl,
        });

        sendEvent({ 
          step: "complete", 
          message: "Video generation complete!", 
          video: updated 
        });

      } catch (error) {
        console.error("Generation error:", error);
        await storage.updateVideoGeneration(generation.id, {
          status: "failed",
        });
        sendEvent({ 
          step: "error", 
          message: error instanceof Error ? error.message : "Generation failed" 
        });
      }

      res.end();
    } catch (error) {
      console.error("Error starting generation:", error);
      if (res.headersSent) {
        res.end();
      } else {
        res.status(500).json({ error: "Failed to start generation" });
      }
    }
  });

  // ============ MEDIA LIBRARY ROUTES ============
  
  // Serve media files
  app.use("/media", (req, res, next) => {
    const mediaPath = path.join(MEDIA_UPLOAD_DIR, req.path);
    if (fs.existsSync(mediaPath)) {
      res.sendFile(mediaPath);
    } else {
      next();
    }
  });

  // Get all media items
  app.get("/api/media", async (req, res) => {
    try {
      const { search, orientation } = req.query;
      let items;
      if (search) {
        items = await storage.searchMediaItems(
          search as string, 
          orientation as string | undefined
        );
      } else {
        items = await storage.getAllMediaItems();
      }
      res.json(items);
    } catch (error) {
      console.error("Error fetching media:", error);
      res.status(500).json({ error: "Failed to fetch media" });
    }
  });

  // Get single media item
  app.get("/api/media/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getMediaItem(id);
      if (!item) {
        return res.status(404).json({ error: "Media not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching media:", error);
      res.status(500).json({ error: "Failed to fetch media" });
    }
  });

  // Upload video with AI analysis
  app.post("/api/media/upload", upload.single("video"), async (req, res) => {
    const tempFilePath = req.file?.path;
    let destPath: string | undefined;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided" });
      }

      // Ensure media directory exists
      if (!fs.existsSync(MEDIA_UPLOAD_DIR)) {
        fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });
      }

      const originalName = req.file.originalname;
      const ext = path.extname(originalName);
      const baseName = path.basename(originalName, ext);
      const fileName = `${baseName}_${Date.now()}${ext}`;
      destPath = path.join(MEDIA_UPLOAD_DIR, fileName);

      // Move file using streams (works across volumes)
      await new Promise<void>((resolve, reject) => {
        const readStream = fs.createReadStream(req.file!.path);
        const writeStream = fs.createWriteStream(destPath!);
        readStream.pipe(writeStream);
        writeStream.on("finish", () => {
          fs.unlinkSync(req.file!.path);
          resolve();
        });
        writeStream.on("error", reject);
        readStream.on("error", reject);
      });

      // Get video metadata
      let metadata;
      try {
        metadata = await getVideoMetadata(destPath);
      } catch (err) {
        metadata = { duration: 0, width: 1280, height: 720, orientation: "landscape" as const };
      }

      // Analyze video with AI
      let analysis;
      try {
        analysis = await analyzeVideo(destPath, baseName);
      } catch (err) {
        console.error("AI analysis failed:", err);
        analysis = {
          title: baseName,
          description: "",
          tags: ["video", "uploaded"],
          aiAnalysis: "Analysis unavailable",
        };
      }

      // Normalize tags to lowercase for consistent search
      const normalizedTags = analysis.tags.map((t: string) => t.toLowerCase());

      // Save to database
      const mediaItem = await storage.createMediaItem({
        title: analysis.title,
        description: analysis.description,
        filePath: `/media/${fileName}`,
        source: "upload",
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        orientation: metadata.orientation,
        tags: normalizedTags,
        aiAnalysis: analysis.aiAnalysis,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      res.json(mediaItem);
    } catch (error) {
      console.error("Error uploading video:", error);
      // Clean up on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      if (destPath && fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch {}
      }
      res.status(500).json({ error: "Failed to upload video" });
    }
  });

  // Update media item
  app.patch("/api/media/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, description, tags } = req.body;
      
      // Normalize tags to lowercase if provided
      const normalizedTags = tags && Array.isArray(tags) 
        ? tags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.toLowerCase())
        : undefined;
      
      const updated = await storage.updateMediaItem(id, {
        ...(title && typeof title === 'string' && { title }),
        ...(description !== undefined && typeof description === 'string' && { description }),
        ...(normalizedTags && { tags: normalizedTags }),
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating media:", error);
      res.status(500).json({ error: "Failed to update media" });
    }
  });

  // Delete media item
  app.delete("/api/media/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getMediaItem(id);
      
      if (item) {
        // Delete file from disk
        const filePath = path.join(process.cwd(), "public", item.filePath);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      
      await storage.deleteMediaItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting media:", error);
      res.status(500).json({ error: "Failed to delete media" });
    }
  });

  // Re-analyze video with AI
  app.post("/api/media/:id/analyze", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getMediaItem(id);
      
      if (!item) {
        return res.status(404).json({ error: "Media not found" });
      }

      const filePath = path.join(process.cwd(), "public", item.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Media file not found" });
      }

      const analysis = await analyzeVideo(filePath, item.title);
      
      // Normalize tags to lowercase
      const normalizedTags = analysis.tags.map(t => t.toLowerCase());
      
      const updated = await storage.updateMediaItem(id, {
        title: analysis.title,
        description: analysis.description,
        tags: normalizedTags,
        aiAnalysis: analysis.aiAnalysis,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error analyzing media:", error);
      res.status(500).json({ error: "Failed to analyze media" });
    }
  });

  return httpServer;
}
