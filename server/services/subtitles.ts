import fs from "fs";
import path from "path";

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface SubtitleSegment {
  text: string;
  startTime: number;
  endTime: number;
  words: WordTiming[];
}

function estimateWordTimings(
  text: string,
  startTime: number,
  duration: number
): WordTiming[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentTime = startTime;
  const timings: WordTiming[] = [];

  for (const word of words) {
    const wordDuration = (word.length / totalChars) * duration;
    timings.push({
      word,
      start: currentTime,
      end: currentTime + wordDuration,
    });
    currentTime += wordDuration;
  }

  return timings;
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function escapeASSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

export function generateASSSubtitles(
  script: string,
  scenes: { text?: string; timestamp?: string }[],
  totalDuration: number,
  orientation: "landscape" | "portrait" = "portrait"
): string {
  const isPortrait = orientation === "portrait";
  const fontSize = 36;
  const marginV = isPortrait ? 180 : 80;
  const playResX = isPortrait ? 720 : 1280;
  const playResY = isPortrait ? 1280 : 720;

  let assContent = `[Script Info]
Title: TikTok Style Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,20,20,${marginV},1
Style: Highlight,Arial,${fontSize},&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const textToUse = script && script.trim().length > 0 ? script : scenes.map(s => s.text || '').join(' ');
  
  if (!textToUse || textToUse.trim().length === 0) {
    return assContent;
  }

  const words = textToUse.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return assContent;

  const wordsPerMinute = 150;
  const avgWordDuration = 60 / wordsPerMinute;
  const estimatedSpeechDuration = words.length * avgWordDuration;
  const actualDuration = Math.min(totalDuration * 0.95, estimatedSpeechDuration);
  
  const wordTimings = estimateWordTimings(textToUse, 0, actualDuration);

  const wordsPerLine = 3;
  for (let i = 0; i < wordTimings.length; i += wordsPerLine) {
    const lineWords = wordTimings.slice(i, i + wordsPerLine);
    if (lineWords.length === 0) continue;

    const lineStart = lineWords[0].start;
    const lineEnd = lineWords[lineWords.length - 1].end + 0.2;

    let lineText = "";
    for (let j = 0; j < lineWords.length; j++) {
      const wt = lineWords[j];
      const wordDurationCs = Math.round((wt.end - wt.start) * 100);
      lineText += `{\\k${wordDurationCs}}${escapeASSText(wt.word.toUpperCase())} `;
    }

    assContent += `Dialogue: 0,${formatASSTime(lineStart)},${formatASSTime(lineEnd)},Default,,0,0,0,,${lineText.trim()}\n`;
  }

  return assContent;
}

export function generateWordByWordASS(
  script: string,
  totalDuration: number,
  orientation: "landscape" | "portrait" = "portrait"
): string {
  const isPortrait = orientation === "portrait";
  const fontSize = 36;
  const marginV = isPortrait ? 200 : 100;
  const playResX = isPortrait ? 720 : 1280;
  const playResY = isPortrait ? 1280 : 720;

  let assContent = `[Script Info]
Title: Word by Word Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Arial,${fontSize},&H00FFFFFF,&H0000D9FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const durationPerSentence = totalDuration / Math.max(sentences.length, 1);
  let currentTime = 0;

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;

    const wordTimings = estimateWordTimings(sentence.trim(), currentTime, durationPerSentence * 0.95);

    const wordsPerGroup = 3;
    for (let i = 0; i < wordTimings.length; i += wordsPerGroup) {
      const groupWords = wordTimings.slice(i, i + wordsPerGroup);
      if (groupWords.length === 0) continue;

      const groupStart = groupWords[0].start;
      const groupEnd = groupWords[groupWords.length - 1].end + 0.15;

      let groupText = "";
      for (const wt of groupWords) {
        const durationCs = Math.round((wt.end - wt.start) * 100);
        groupText += `{\\kf${durationCs}}${escapeASSText(wt.word.toUpperCase())} `;
      }

      assContent += `Dialogue: 0,${formatASSTime(groupStart)},${formatASSTime(groupEnd)},Word,,0,0,0,,${groupText.trim()}\n`;
    }

    currentTime += durationPerSentence;
  }

  return assContent;
}

export async function writeASSFile(content: string, outputPath: string): Promise<string> {
  fs.writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}
