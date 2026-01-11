import OpenAI from "openai";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MUSIC_DIR = "client/public/music";
const VOICEOVER_CACHE_DIR = "public/cache/voiceovers";

const MUSIC_TRACKS: Record<string, string> = {
  epic: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
  lofi: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3",
  upbeat: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Tours/Enthusiast/Tours_-_01_-_Enthusiast.mp3",
  dark: "https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3",
  ambient: "https://ia801603.us.archive.org/21/items/ambient-music-collection/Ambient_01.mp3",
};

function getVoiceoverCacheKey(text: string, language: string): string {
  const hash = crypto.createHash("md5").update(`${text}_${language}`).digest("hex");
  return hash;
}

export async function generateSpeech(
  text: string,
  outputPath: string,
  language: "en" | "id" = "en"
): Promise<string> {
  const cleanText = text.substring(0, 4096);
  
  if (!fs.existsSync(VOICEOVER_CACHE_DIR)) {
    fs.mkdirSync(VOICEOVER_CACHE_DIR, { recursive: true });
  }
  
  const cacheKey = getVoiceoverCacheKey(cleanText, language);
  const cachedPath = path.join(VOICEOVER_CACHE_DIR, `${cacheKey}.mp3`);
  
  if (fs.existsSync(cachedPath)) {
    fs.copyFileSync(cachedPath, outputPath);
    console.log(`Using cached voiceover: ${cacheKey}`);
    return outputPath;
  }

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: language === "id" ? "nova" : "alloy",
    input: cleanText,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  fs.writeFileSync(cachedPath, buffer);
  console.log(`Cached voiceover: ${cacheKey}`);

  return outputPath;
}

export async function initializeMusicLibrary(): Promise<void> {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }

  console.log("Initializing music library...");
  
  for (const [mood, url] of Object.entries(MUSIC_TRACKS)) {
    const cachedPath = path.join(MUSIC_DIR, `${mood}.mp3`);
    
    if (fs.existsSync(cachedPath)) {
      console.log(`Music track "${mood}" already cached`);
      continue;
    }

    try {
      console.log(`Downloading music track: ${mood}...`);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to download ${mood}: ${response.status}`);
        continue;
      }
      const buffer = await response.buffer();
      fs.writeFileSync(cachedPath, buffer);
      console.log(`Music track "${mood}" cached successfully`);
    } catch (error) {
      console.error(`Failed to download ${mood} music:`, error);
    }
  }
  
  console.log("Music library initialization complete");
}

export async function getBackgroundMusic(
  mood: string,
  workDir: string
): Promise<string> {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }

  const cachedPath = path.join(MUSIC_DIR, `${mood}.mp3`);
  
  if (fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  const trackUrl = MUSIC_TRACKS[mood] || MUSIC_TRACKS.ambient;

  try {
    const response = await fetch(trackUrl);
    if (!response.ok) {
      throw new Error(`Failed to download music: ${response.status}`);
    }
    const buffer = await response.buffer();
    fs.writeFileSync(cachedPath, buffer);
    return cachedPath;
  } catch (error) {
    console.error(`Failed to download ${mood} music:`, error);
    const fallbackPath = path.join(workDir, `${mood}_fallback.mp3`);
    return fallbackPath;
  }
}

export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
}
