import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
}

interface VideoAnalysis {
  title: string;
  description: string;
  tags: string[];
  aiAnalysis: string;
}

export async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }

      const width = videoStream.width || 1280;
      const height = videoStream.height || 720;
      const duration = Math.round(metadata.format.duration || 0);
      const orientation = width >= height ? "landscape" : "portrait";

      resolve({ duration, width, height, orientation });
    });
  });
}

async function extractFrames(videoPath: string, numFrames: number = 4): Promise<string[]> {
  const tempDir = path.join(os.tmpdir(), `frames_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const duration = metadata.format.duration || 10;
      const interval = duration / (numFrames + 1);
      const timestamps = [];
      
      for (let i = 1; i <= numFrames; i++) {
        timestamps.push(interval * i);
      }

      // Extract all frames in a single command
      ffmpeg(videoPath)
        .screenshots({
          timestamps: timestamps,
          filename: "frame_%i.jpg",
          folder: tempDir,
          size: "640x?",
        })
        .on("end", () => {
          // Collect all successfully extracted frames
          const framePaths: string[] = [];
          for (let i = 1; i <= numFrames; i++) {
            const framePath = path.join(tempDir, `frame_${i}.jpg`);
            if (fs.existsSync(framePath)) {
              framePaths.push(framePath);
            }
          }
          resolve(framePaths);
        })
        .on("error", (frameErr) => {
          console.error("Error extracting frames:", frameErr);
          // Return empty array on error
          resolve([]);
        });
    });
  });
}

function frameToBase64(framePath: string): string {
  const buffer = fs.readFileSync(framePath);
  return buffer.toString("base64");
}

export async function analyzeVideo(
  videoPath: string,
  providedTitle?: string
): Promise<VideoAnalysis> {
  const frames = await extractFrames(videoPath, 4);

  if (frames.length === 0) {
    return {
      title: providedTitle || path.basename(videoPath, path.extname(videoPath)),
      description: "Unable to analyze video content",
      tags: ["video"],
      aiAnalysis: "No frames could be extracted for analysis",
    };
  }

  const imageContents = frames.map((framePath) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${frameToBase64(framePath)}`,
      detail: "low" as const,
    },
  }));

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a video content analyzer. Analyze the provided video frames and generate:
1. A concise, descriptive title (max 50 chars)
2. A detailed description of what the video shows (2-3 sentences)
3. 5-10 relevant tags/keywords for search
4. A brief analysis of the visual content, mood, and potential use cases

Respond in JSON format:
{
  "title": "string",
  "description": "string",
  "tags": ["tag1", "tag2", ...],
  "analysis": "string"
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: providedTitle
                ? `Analyze these video frames. The original filename was: "${providedTitle}"`
                : "Analyze these video frames and describe the content:",
            },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    // Clean up temp frames
    frames.forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });
    try {
      fs.rmdirSync(path.dirname(frames[0]));
    } catch {}

    return {
      title: parsed.title || providedTitle || "Untitled Video",
      description: parsed.description || "",
      tags: parsed.tags || [],
      aiAnalysis: parsed.analysis || "",
    };
  } catch (error) {
    console.error("Error analyzing video:", error);

    // Clean up temp frames
    frames.forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });

    return {
      title: providedTitle || path.basename(videoPath, path.extname(videoPath)),
      description: "AI analysis unavailable",
      tags: ["video"],
      aiAnalysis: "Error during AI analysis",
    };
  }
}
