export interface VideoGenerationRequest {
  prompt: string;
  duration: number;
  orientation: string;
  visualStyle: string;
  musicMood: string;
  musicVolume: number;
  includeSpeech: number;
  language: string;
}

export interface VideoGeneration {
  id: number;
  prompt: string;
  duration: number;
  orientation: string;
  visualStyle: string;
  musicMood: string;
  musicVolume: number;
  includeSpeech: number;
  language: string;
  script?: string;
  scenes?: string;
  status: string;
  resultUrl?: string;
  createdAt: string;
}

export interface GenerationEvent {
  step: string;
  message: string;
  data?: any;
  video?: VideoGeneration;
}

export async function generateVideo(
  request: VideoGenerationRequest,
  onEvent: (event: GenerationEvent) => void
): Promise<void> {
  const response = await fetch("/api/videos/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to start generation");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        onEvent(data);
      }
    }
  }
}

export async function getVideoGeneration(id: number): Promise<VideoGeneration> {
  const response = await fetch(`/api/videos/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch video");
  }
  return response.json();
}

export async function getAllVideos(): Promise<VideoGeneration[]> {
  const response = await fetch("/api/videos");
  if (!response.ok) {
    throw new Error("Failed to fetch videos");
  }
  return response.json();
}
