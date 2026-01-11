import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { storage } from "../storage";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const MEDIA_DIR = path.join(process.cwd(), "public", "media");

// Persistent cache directory
const CACHE_DIR = path.join(process.cwd(), "public", "cache", "videos");

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  videos: PexelsVideo[];
}

export async function searchVideos(
  query: string,
  options: {
    orientation?: "landscape" | "portrait" | "square";
    size?: "large" | "medium" | "small";
    perPage?: number;
    minDuration?: number;
    maxDuration?: number;
  } = {}
): Promise<PexelsVideo[]> {
  if (!PEXELS_API_KEY) {
    throw new Error("PEXELS_API_KEY is not set");
  }

  const params = new URLSearchParams({
    query,
    per_page: String(options.perPage || 5),
    orientation: options.orientation || "landscape",
  });

  if (options.minDuration) {
    params.append("min_duration", String(options.minDuration));
  }
  if (options.maxDuration) {
    params.append("max_duration", String(options.maxDuration));
  }

  const response = await fetch(
    `https://api.pexels.com/videos/search?${params.toString()}`,
    {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = (await response.json()) as PexelsSearchResponse;
  return data.videos;
}

export async function downloadVideo(
  video: PexelsVideo,
  outputDir: string,
  preferredQuality: "hd" | "sd" = "hd",
  searchTerm?: string,
  orientation: string = "landscape"
): Promise<string> {
  const hdFile = video.video_files.find(
    (f) => f.quality === "hd" && f.file_type === "video/mp4"
  );
  const sdFile = video.video_files.find(
    (f) => f.quality === "sd" && f.file_type === "video/mp4"
  );
  const anyFile = video.video_files.find((f) => f.file_type === "video/mp4");

  const file =
    preferredQuality === "hd" ? hdFile || sdFile || anyFile : sdFile || anyFile;

  if (!file) {
    throw new Error(`No suitable video file found for video ${video.id}`);
  }

  // Check if already in cache database
  const cachedClip = await storage.getCachedClipByPexelsId(video.id);
  if (cachedClip && fs.existsSync(cachedClip.filePath)) {
    // Add this search term to the clip's terms if not already present
    if (searchTerm && !cachedClip.searchTerms.includes(searchTerm.toLowerCase())) {
      await storage.addSearchTermToClip(cachedClip.id, searchTerm.toLowerCase());
    }
    // Link or copy to output directory for job isolation
    const outputPath = path.join(outputDir, `pexels_${video.id}.mp4`);
    if (!fs.existsSync(outputPath)) {
      try {
        fs.linkSync(cachedClip.filePath, outputPath);
      } catch {
        fs.copyFileSync(cachedClip.filePath, outputPath);
      }
    }
    return outputPath;
  }

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cachePath = path.join(CACHE_DIR, `pexels_${video.id}.mp4`);

  // Download if not in cache
  if (!fs.existsSync(cachePath)) {
    const response = await fetch(file.link);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }
    const buffer = await response.buffer();
    fs.writeFileSync(cachePath, buffer);
  }

  // Save to cache database
  await storage.saveCachedClip({
    pexelsId: video.id,
    filePath: cachePath,
    searchTerms: searchTerm ? [searchTerm.toLowerCase()] : [],
    duration: Math.round(video.duration),
    orientation: orientation,
    quality: preferredQuality,
    width: file.width,
    height: file.height,
  });

  // Link or copy to output directory for job isolation
  const outputPath = path.join(outputDir, `pexels_${video.id}.mp4`);
  if (!fs.existsSync(outputPath)) {
    try {
      fs.linkSync(cachePath, outputPath);
    } catch {
      fs.copyFileSync(cachePath, outputPath);
    }
  }
  return outputPath;
}

// Extended fallback queries - guaranteed to have results on Pexels
const FALLBACK_QUERIES = [
  "nature",
  "city",
  "technology",
  "abstract",
  "sky",
  "ocean",
  "business",
  "people walking",
  "traffic",
  "clouds"
];

function simplifyQuery(query: string): string {
  // Extract key words, removing common words
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const words = query.toLowerCase()
    .split(/\s+/)
    .filter(w => !stopWords.includes(w) && w.length > 2)
    .slice(0, 2);
  return words.join(" ") || query.split(/\s+/)[0];
}

// Search media library for matching videos
async function searchMediaLibrary(
  query: string,
  orientation: string,
  usedIds: Set<number>
): Promise<string | null> {
  try {
    const items = await storage.searchMediaItems(query, orientation);
    for (const item of items) {
      if (usedIds.has(item.id)) continue;
      
      // Convert filePath to actual path
      const actualPath = item.filePath.startsWith('/media/')
        ? path.join(process.cwd(), 'public', item.filePath)
        : item.filePath;
      
      if (fs.existsSync(actualPath)) {
        return actualPath;
      }
    }
  } catch (err) {
    console.error("Media library search failed:", err);
  }
  return null;
}

export async function searchAndDownloadVideos(
  queries: string[],
  outputDir: string,
  clipsPerQuery: number = 1,
  orientation: "landscape" | "portrait" = "landscape",
  onProgress?: (message: string) => void
): Promise<{ paths: string[]; errors: string[]; fromCache: number; fromLibrary: number }> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const downloadedPaths: string[] = [];
  const errors: string[] = [];
  const usedVideoIds = new Set<number>();
  const usedMediaIds = new Set<number>();
  let fromCache = 0;
  let fromLibrary = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let found = false;
    
    onProgress?.(`Scene ${i + 1}/${queries.length}: "${query}"`);
    
    // Step 1: Check media library first (user uploads)
    try {
      const items = await storage.searchMediaItems(query, orientation);
      for (const item of items) {
        if (usedMediaIds.has(item.id)) continue;
        
        const actualPath = item.filePath.startsWith('/media/')
          ? path.join(process.cwd(), 'public', item.filePath)
          : item.filePath;
        
        if (fs.existsSync(actualPath)) {
          const fileName = path.basename(actualPath);
          const outputPath = path.join(outputDir, `library_${Date.now()}_${fileName}`);
          fs.copyFileSync(actualPath, outputPath);
          downloadedPaths.push(outputPath);
          usedMediaIds.add(item.id);
          found = true;
          fromLibrary++;
          onProgress?.(`Using uploaded video for scene ${i + 1}`);
          break;
        }
      }
    } catch (libErr) {
      console.error(`Media library search failed for "${query}":`, libErr);
    }

    if (found) continue;
    
    // Step 2: Check Pexels cache
    try {
      const cachedClips = await storage.findCachedClips(query, orientation, 5);
      for (const cached of cachedClips) {
        if (usedVideoIds.has(cached.pexelsId)) continue;
        
        if (fs.existsSync(cached.filePath)) {
          const outputPath = path.join(outputDir, `pexels_${cached.pexelsId}.mp4`);
          if (!fs.existsSync(outputPath)) {
            try {
              fs.linkSync(cached.filePath, outputPath);
            } catch {
              fs.copyFileSync(cached.filePath, outputPath);
            }
          }
          downloadedPaths.push(outputPath);
          usedVideoIds.add(cached.pexelsId);
          found = true;
          fromCache++;
          onProgress?.(`Using cached clip for scene ${i + 1}`);
          break;
        }
      }
    } catch (cacheErr) {
      console.error(`Cache lookup failed for "${query}":`, cacheErr);
    }

    if (found) continue;

    // Step 3: Search Pexels API with progressive fallbacks
    onProgress?.(`Searching online for scene ${i + 1}/${queries.length}...`);
    
    // Build search queries: original -> simplified -> single words -> fallbacks
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const queriesToTry = [
      query,
      simplifyQuery(query),
      ...queryWords.slice(0, 3), // Try individual words
      ...FALLBACK_QUERIES
    ];
    
    // Remove duplicates
    const uniqueQueries = Array.from(new Set(queriesToTry));

    for (const searchQuery of uniqueQueries) {
      if (found) break;
      
      try {
        const videos = await searchVideos(searchQuery, {
          perPage: 10,
          maxDuration: 30,
          orientation: orientation,
        });

        for (const video of videos) {
          if (usedVideoIds.has(video.id)) continue;
          
          try {
            onProgress?.(`Downloading clip ${i + 1}/${queries.length} (${Math.round(video.duration)}s)...`);
            const filePath = await downloadVideo(video, outputDir, "hd", query, orientation);
            downloadedPaths.push(filePath);
            usedVideoIds.add(video.id);
            found = true;
            onProgress?.(`Downloaded clip ${i + 1}/${queries.length} successfully`);
            break;
          } catch (downloadErr) {
            console.error(`Failed to download video ${video.id}:`, downloadErr);
          }
        }
      } catch (error) {
        console.error(`Search failed for "${searchQuery}":`, error);
      }
    }

    // Step 4: Use ANY cached clip regardless of orientation
    if (!found) {
      onProgress?.(`Using any available fallback for scene ${i + 1}...`);
      try {
        // Try any orientation
        for (const tryOrientation of [orientation, orientation === "portrait" ? "landscape" : "portrait"]) {
          if (found) break;
          const anyCached = await storage.findCachedClips("", tryOrientation, 20);
          for (const cached of anyCached) {
            if (usedVideoIds.has(cached.pexelsId)) continue;
            if (fs.existsSync(cached.filePath)) {
              const outputPath = path.join(outputDir, `fallback_${cached.pexelsId}.mp4`);
              if (!fs.existsSync(outputPath)) {
                try {
                  fs.linkSync(cached.filePath, outputPath);
                } catch {
                  fs.copyFileSync(cached.filePath, outputPath);
                }
              }
              downloadedPaths.push(outputPath);
              usedVideoIds.add(cached.pexelsId);
              found = true;
              fromCache++;
              onProgress?.(`Using fallback clip for scene ${i + 1}`);
              break;
            }
          }
        }
      } catch (fallbackErr) {
        console.error("Fallback cache lookup failed:", fallbackErr);
      }
    }
    
    // Step 5: Last resort - force download one generic clip from Pexels
    if (!found) {
      onProgress?.(`Downloading generic fallback for scene ${i + 1}...`);
      const emergencyQueries = ["nature", "sky", "water", "city", "abstract"];
      for (const emergencyQuery of emergencyQueries) {
        if (found) break;
        try {
          // Try both orientations
          const videos = await searchVideos(emergencyQuery, {
            perPage: 5,
            maxDuration: 30,
          });
          for (const video of videos) {
            if (usedVideoIds.has(video.id)) continue;
            try {
              const filePath = await downloadVideo(video, outputDir, "hd", emergencyQuery, orientation);
              downloadedPaths.push(filePath);
              usedVideoIds.add(video.id);
              found = true;
              onProgress?.(`Downloaded emergency fallback for scene ${i + 1}`);
              break;
            } catch {
              // Try next video
            }
          }
        } catch {
          // Try next query
        }
      }
    }
    
    if (!found) {
      errors.push(`No footage found for: "${query}"`);
      onProgress?.(`Warning: Could not find any footage for scene ${i + 1}`);
    }
  }

  if (fromLibrary > 0) {
    onProgress?.(`Used ${fromLibrary} clips from media library`);
  }
  if (fromCache > 0) {
    onProgress?.(`Used ${fromCache} clips from cache/fallback`);
  }

  return { paths: downloadedPaths, errors, fromCache, fromLibrary };
}
