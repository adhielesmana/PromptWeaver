import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { searchAndDownloadVideos } from "./pexels";
import { generateSpeech, getBackgroundMusic, getAudioDuration } from "./audio";
import { generateASSSubtitles, writeASSFile } from "./subtitles";

const TEMP_DIR = "/tmp/video-gen";
const OUTPUT_DIR = "public/videos";

interface Scene {
  timestamp: string;
  description: string;
  text?: string;
}

interface VideoGenerationOptions {
  prompt: string;
  duration: number;
  orientation: "landscape" | "portrait";
  visualStyle: string;
  musicMood: string;
  musicVolume: number;
  includeSpeech: boolean;
  language: "en" | "id";
  script?: string;
  scenes?: Scene[];
  title?: string;
}

function ensureDirs() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export async function generateVideo(
  options: VideoGenerationOptions,
  onProgress: (step: string, message: string) => void
): Promise<string> {
  ensureDirs();

  const videoId = `video_${Date.now()}`;
  const workDir = path.join(TEMP_DIR, videoId);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    let voiceoverPath: string | null = null;
    let actualDuration = options.duration;

    if (options.includeSpeech && options.script) {
      onProgress("voiceover", "Checking voiceover cache...");
      try {
        voiceoverPath = path.join(workDir, "voiceover.mp3");
        const startTime = Date.now();
        await generateSpeech(options.script, voiceoverPath, options.language);
        const elapsed = Date.now() - startTime;
        
        const voiceDuration = await getAudioDuration(voiceoverPath);
        actualDuration = Math.max(options.duration, voiceDuration + 1);
        
        const cacheMsg = elapsed < 1000 ? " (from cache)" : "";
        onProgress("voiceover", `Voiceover ready${cacheMsg} (${Math.round(voiceDuration)}s) - video will be ${Math.round(actualDuration)}s`);
      } catch (error) {
        console.error("TTS error:", error);
        onProgress("voiceover", "Voiceover generation skipped (TTS unavailable)");
        voiceoverPath = null;
      }
    }

    onProgress("searching", "Finding matching stock footage...");
    
    const searchQueries = options.scenes?.map((s) => s.description) || [options.prompt];
    const limitedQueries = searchQueries.slice(0, 5);
    
    const pexelsOrientation = options.orientation === "portrait" ? "portrait" : "landscape";
    const { paths: videoPaths, errors: searchErrors } = await searchAndDownloadVideos(
      limitedQueries, 
      workDir, 
      1, 
      pexelsOrientation,
      (msg) => onProgress("searching", msg)
    );

    if (videoPaths.length === 0) {
      const errorMsg = searchErrors.length > 0 
        ? `Could not find stock footage. ${searchErrors[0]}` 
        : "No videos could be downloaded. Please check your Pexels API key.";
      throw new Error(errorMsg);
    }

    if (searchErrors.length > 0) {
      onProgress("searching", `Note: Some scenes used fallback footage`);
    }
    
    onProgress("searching", `All ${videoPaths.length} video clips downloaded`);

    let musicPath: string | null = null;
    onProgress("music", "Loading background music...");
    try {
      musicPath = await getBackgroundMusic(options.musicMood, workDir);
      if (fs.existsSync(musicPath)) {
        onProgress("music", "Background music loaded");
      } else {
        musicPath = null;
        onProgress("music", "Background music unavailable, continuing without");
      }
    } catch (error) {
      console.error("Music error:", error);
      onProgress("music", "Background music skipped");
    }

    onProgress("mixing", `Processing ${videoPaths.length} video clips in parallel...`);
    const targetDurationPerClip = actualDuration / videoPaths.length;
    
    const clipPromises = videoPaths.map((inputPath, i) => {
      const outputPath = path.join(workDir, `clip_${i}.mp4`);
      return processClip(inputPath, outputPath, targetDurationPerClip, undefined, options.orientation)
        .then(() => outputPath);
    });
    
    const processedClips = await Promise.all(clipPromises);
    onProgress("mixing", `All ${videoPaths.length} clips encoded`);

    onProgress("mixing", "Merging all clips into single video...");
    const concatListPath = path.join(workDir, "concat.txt");
    const concatContent = processedClips.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const mergedPath = path.join(workDir, "merged.mp4");
    await concatenateVideos(concatListPath, mergedPath);
    onProgress("mixing", "Video clips merged");

    onProgress("rendering", "Generating subtitles...");
    const assContent = generateASSSubtitles(
      options.script || "",
      options.scenes || [],
      actualDuration,
      options.orientation
    );
    const assPath = path.join(workDir, "subtitles.ass");
    await writeASSFile(assContent, assPath);

    onProgress("rendering", "Rendering video with effects (style + title + subtitles)...");
    const renderedPath = path.join(workDir, "rendered.mp4");
    await applyCombinedEffects(
      mergedPath,
      renderedPath,
      options.visualStyle,
      options.title,
      assPath,
      options.orientation,
      (percent) => onProgress("rendering", `Rendering: ${percent}%`)
    );
    onProgress("rendering", "Video rendered");

    let videoForMixing = renderedPath;
    if (voiceoverPath) {
      const videoDuration = await getVideoDuration(renderedPath);
      if (videoDuration < actualDuration - 0.5) {
        onProgress("finalizing", `Extending video to ${Math.round(actualDuration)}s...`);
        const extendedPath = path.join(workDir, "extended.mp4");
        await extendVideo(renderedPath, extendedPath, actualDuration);
        videoForMixing = extendedPath;
      }
    }

    onProgress("finalizing", "Mixing audio tracks...");
    const finalPath = path.join(OUTPUT_DIR, `${videoId}.mp4`);
    await mixAudio(videoForMixing, voiceoverPath, musicPath, finalPath, actualDuration, options.musicVolume);
    onProgress("finalizing", "Audio mixed");

    fs.rmSync(workDir, { recursive: true, force: true });

    onProgress("complete", "Video generation complete!");

    return `/videos/${videoId}.mp4`;
  } catch (error) {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function processClip(
  inputPath: string,
  outputPath: string,
  targetDuration: number,
  subtitleText?: string,
  orientation: "landscape" | "portrait" = "landscape"
): Promise<void> {
  return new Promise((resolve, reject) => {
    const resolution = orientation === "portrait" ? "720x1280" : "1280x720";
    
    let command = ffmpeg(inputPath)
      .setDuration(targetDuration)
      .outputOptions([
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-r 30",
        `-s ${resolution}`,
        "-an",
      ]);

    if (subtitleText) {
      const words = subtitleText.split(' ');
      const lines: string[] = [];
      for (let i = 0; i < words.length; i += 3) {
        lines.push(words.slice(i, i + 3).join(' '));
      }
      const wrappedText = lines.join('\n');
      
      const escapedText = wrappedText
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "'\\''")
        .replace(/:/g, "\\:")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");
      
      const isPortrait = orientation === "portrait";
      const fontSize = isPortrait ? 38 : 32;
      const lineHeight = fontSize + 8;
      const totalHeight = lines.length * lineHeight;
      const yPosition = isPortrait ? `h-${200 + totalHeight}` : `h-${120 + totalHeight}`;
      
      command = command.videoFilters([
        {
          filter: "drawtext",
          options: {
            text: escapedText,
            fontsize: fontSize,
            fontcolor: "white",
            borderw: 5,
            bordercolor: "black",
            x: "(w-text_w)/2",
            y: yPosition,
            line_spacing: 8,
          },
        },
      ]);
    }

    command
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function concatenateVideos(listPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function getStyleFilters(style: string): string[] {
  switch (style) {
    case "cyberpunk":
      return ["eq=contrast=1.2:saturation=1.3", "colorbalance=bs=0.1:bm=0.1:bh=0.2"];
    case "cinematic":
      return ["eq=contrast=1.1:brightness=0.02", "colorbalance=rs=-0.05:gs=-0.02:bs=0.1"];
    case "anime":
      return ["eq=saturation=1.4:contrast=1.2"];
    case "documentary":
      return ["eq=saturation=0.9:contrast=1.05"];
    case "minimal":
      return ["eq=saturation=0.7:contrast=1.1"];
    default:
      return [];
  }
}

function applyCombinedEffects(
  inputPath: string,
  outputPath: string,
  style: string,
  title: string | undefined,
  assPath: string,
  orientation: "landscape" | "portrait",
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filters: string[] = [];
    
    const styleFilters = getStyleFilters(style);
    filters.push(...styleFilters);
    
    
    const escapedAssPath = assPath.replace(/:/g, "\\:").replace(/\\/g, "/");
    filters.push(`ass=${escapedAssPath}`);
    
    let command = ffmpeg(inputPath);
    
    if (filters.length > 0) {
      command = command.videoFilters(filters);
    }
    
    let totalTime = 0;
    
    command
      .outputOptions(["-c:v libx264", "-preset veryfast", "-crf 23", "-an"])
      .output(outputPath)
      .on("codecData", (data: any) => {
        if (data.duration) {
          const parts = data.duration.split(':');
          totalTime = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
      })
      .on("progress", (progress: any) => {
        if (onProgress && totalTime > 0 && progress.timemark) {
          const parts = progress.timemark.split(':');
          const currentTime = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
          const percent = Math.min(99, Math.round((currentTime / totalTime) * 100));
          onProgress(percent);
        }
      })
      .on("end", () => {
        if (onProgress) onProgress(100);
        resolve();
      })
      .on("error", (err) => reject(err))
      .run();
  });
}

function addTitleOverlay(
  inputPath: string,
  outputPath: string,
  title: string,
  orientation: "landscape" | "portrait" = "portrait",
  displayDuration: number = 3
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isPortrait = orientation === "portrait";
    const videoWidth = isPortrait ? 720 : 1280;
    const fontSize = 92;
    const maxCharsPerLine = isPortrait ? 20 : 35;
    
    const upperTitle = title.toUpperCase();
    const words = upperTitle.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    const wrappedTitle = lines.join('\\n');
    
    const escapedTitle = wrappedTitle
      .replace(/'/g, "'\\''")
      .replace(/:/g, "\\:")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
    
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: escapedTitle,
            fontsize: fontSize,
            fontcolor: "yellow",
            borderw: 1.5,
            bordercolor: "white",
            x: "(w-text_w)/2",
            y: "(h-text_h)/2",
            enable: `between(t,0,${displayDuration})`,
          },
        },
      ])
      .outputOptions(["-c:v libx264", "-preset fast", "-crf 23", "-an"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function applyASSSubtitles(
  inputPath: string,
  assPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const escapedAssPath = assPath.replace(/:/g, "\\:").replace(/\\/g, "/");
    
    ffmpeg(inputPath)
      .videoFilters([`ass=${escapedAssPath}`])
      .outputOptions(["-c:v libx264", "-preset fast", "-crf 23", "-an"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function mixAudio(
  videoPath: string,
  voiceoverPath: string | null,
  musicPath: string | null,
  outputPath: string,
  targetDuration: number,
  musicVolume: number = 0.02
): Promise<void> {
  return new Promise((resolve, reject) => {
    const hasVoice = voiceoverPath && fs.existsSync(voiceoverPath);
    const hasMusic = musicPath && fs.existsSync(musicPath);
    const safeVolume = Math.max(0, Math.min(1, musicVolume));

    if (!hasVoice && !hasMusic) {
      ffmpeg(videoPath)
        .outputOptions(["-c:v copy", "-an"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
      return;
    }

    if (hasVoice && hasMusic) {
      const fadeStart = Math.max(0, targetDuration - 2);
      ffmpeg(videoPath)
        .input(voiceoverPath!)
        .input(musicPath!)
        .complexFilter([
          `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[voice]`,
          `[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${safeVolume},afade=t=out:st=${fadeStart}:d=2[music]`,
          `[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        ])
        .outputOptions([
          "-map", "0:v",
          "-map", "[aout]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest"
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    } else if (hasVoice) {
      ffmpeg(videoPath)
        .input(voiceoverPath!)
        .outputOptions([
          "-map", "0:v",
          "-map", "1:a",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest"
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    } else if (hasMusic) {
      const fadeStart = Math.max(0, targetDuration - 2);
      ffmpeg(videoPath)
        .input(musicPath!)
        .complexFilter([
          `[1:a]volume=${safeVolume},afade=t=out:st=${fadeStart}:d=2[music]`
        ])
        .outputOptions([
          "-map", "0:v",
          "-map", "[music]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest"
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    }
  });
}

export function getVideoPath(videoId: string): string | null {
  const filePath = path.join(OUTPUT_DIR, `${videoId}.mp4`);
  return fs.existsSync(filePath) ? filePath : null;
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

function extendVideo(inputPath: string, outputPath: string, targetDuration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-stream_loop", "-1"])
      .setDuration(targetDuration)
      .outputOptions(["-c:v libx264", "-preset fast", "-crf 23", "-an"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}
