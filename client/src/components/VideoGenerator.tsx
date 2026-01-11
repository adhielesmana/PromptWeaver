import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clapperboard, 
  Music, 
  Clock, 
  Sparkles, 
  Play, 
  Download, 
  Loader2,
  Wand2,
  Type,
  CheckCircle2,
  AlertCircle,
  Video,
  Smartphone,
  Monitor,
  Languages,
  Volume2,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { generateVideo, type GenerationEvent, type VideoGeneration } from "@/lib/api";

export default function VideoGenerator() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState([60]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<"input" | "generating" | "result">("input");
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [selectedMusic, setSelectedMusic] = useState("epic");
  const [musicVolume, setMusicVolume] = useState([2]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [selectedOrientation, setSelectedOrientation] = useState("portrait");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [includeSpeech, setIncludeSpeech] = useState(true);
  const [generatedVideo, setGeneratedVideo] = useState<VideoGeneration | null>(null);
  const [scriptData, setScriptData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stepMap: Record<string, number> = {
    analyzing: 10,
    script_ready: 15,
    voiceover: 30,
    searching: 50,
    music: 60,
    mixing: 75,
    grading: 82,
    subtitles: 90,
    finalizing: 95,
    complete: 100
  };

  const stepLabels: Record<string, string> = {
    analyzing: "Creating AI Script",
    script_ready: "Script Ready",
    voiceover: "Generating Voiceover",
    searching: "Downloading Stock Footage",
    music: "Loading Background Music",
    mixing: "Encoding Video Clips",
    grading: "Applying Color Grade",
    subtitles: "Adding TikTok Captions",
    finalizing: "Final Audio Mix",
    complete: "Complete"
  };

  const [currentStep, setCurrentStep] = useState("");

  const handleGenerate = async () => {
    if (!prompt) return;
    
    setIsGenerating(true);
    setStep("generating");
    setProgress(0);
    setLogs([]);
    setScriptData(null);
    setError(null);
    setCurrentStep("");

    try {
      await generateVideo(
        {
          prompt,
          duration: duration[0],
          orientation: selectedOrientation,
          visualStyle: selectedStyle,
          musicMood: selectedMusic,
          musicVolume: musicVolume[0] / 100,
          includeSpeech: includeSpeech ? 1 : 0,
          language: selectedLanguage,
        },
        (event: GenerationEvent) => {
          setLogs(prev => [...prev, event.message]);
          setCurrentStep(event.step);
          
          if (event.step === "script_ready" && event.data) {
            setScriptData(event.data);
          }

          const progressValue = stepMap[event.step] || progress;
          setProgress(progressValue);

          if (event.step === "complete" && event.video) {
            setGeneratedVideo(event.video);
            setIsGenerating(false);
            setTimeout(() => setStep("result"), 500);
          } else if (event.step === "error") {
            setError(event.message);
            setIsGenerating(false);
          }
        }
      );
    } catch (error: any) {
      console.error("Generation error:", error);
      setError(error.message || "Failed to generate video");
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setStep("input");
    setPrompt("");
    setLogs([]);
    setProgress(0);
    setGeneratedVideo(null);
    setScriptData(null);
    setError(null);
    setCurrentStep("");
    stopMusicPreview();
  };

  const musicTracks: Record<string, string> = {
    epic: "/music/epic.mp3",
    lofi: "/music/lofi.mp3",
    upbeat: "/music/upbeat.mp3",
    dark: "/music/dark.mp3",
    ambient: "/music/ambient.mp3",
  };

  const toggleMusicPreview = () => {
    if (isPlayingPreview) {
      stopMusicPreview();
    } else {
      playMusicPreview();
    }
  };

  const playMusicPreview = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.src = musicTracks[selectedMusic] || musicTracks.epic;
    audioRef.current.volume = musicVolume[0] / 100;
    audioRef.current.onended = () => setIsPlayingPreview(false);
    audioRef.current.onerror = () => {
      setIsPlayingPreview(false);
      console.warn("Music file not available for preview");
    };
    try {
      await audioRef.current.play();
      setIsPlayingPreview(true);
    } catch (err) {
      setIsPlayingPreview(false);
      console.warn("Could not play music preview:", err);
    }
  };

  const stopMusicPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingPreview(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      <AnimatePresence mode="wait">
        {step === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
            data-testid="input-screen"
          >
            <div className="text-center space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-cyan-500 font-sans">
                Turn Text into Video
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
                Describe your vision, and our AI will find matching stock footage, add subtitles, and create a real video file.
              </p>
            </div>

            <Card className="glass-panel border-white/5 bg-black/40 backdrop-blur-md overflow-hidden">
              <CardContent className="p-6 md:p-8 space-y-8">
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-medium text-cyan-100 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      Your Vision
                    </Label>
                    <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                      AI + Stock Footage
                    </Badge>
                  </div>
                  <Textarea 
                    placeholder="Describe a futuristic city with flying cars in the rain, cyberpunk style..."
                    className="min-h-[120px] text-lg bg-black/50 border-white/10 focus:border-cyan-500/50 focus:ring-cyan-500/20 resize-none rounded-xl"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    data-testid="input-prompt"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" /> Duration
                      </Label>
                      <span className="text-sm font-mono text-cyan-400" data-testid="text-duration">{duration[0] >= 60 ? `${Math.floor(duration[0]/60)}m ${duration[0]%60}s` : `${duration[0]}s`}</span>
                    </div>
                    <Slider
                      value={duration}
                      onValueChange={setDuration}
                      min={15}
                      max={300}
                      step={15}
                      className="[&>.relative>.absolute]:bg-cyan-500"
                      data-testid="slider-duration"
                    />
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Smartphone className="w-4 h-4" /> Orientation
                    </Label>
                    <Tabs value={selectedOrientation} onValueChange={setSelectedOrientation} className="w-full">
                      <TabsList className="w-full bg-black/50 border border-white/10">
                        <TabsTrigger value="landscape" className="flex-1 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 gap-2" data-testid="toggle-landscape">
                          <Monitor className="w-4 h-4" /> Landscape
                        </TabsTrigger>
                        <TabsTrigger value="portrait" className="flex-1 gap-2" data-testid="toggle-portrait">
                          <Smartphone className="w-4 h-4" /> Portrait
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Clapperboard className="w-4 h-4" /> Visual Style
                    </Label>
                    <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                      <SelectTrigger className="bg-black/50 border-white/10" data-testid="select-style">
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 border-white/10">
                        <SelectItem value="cinematic">Cinematic</SelectItem>
                        <SelectItem value="anime">Anime / 2D</SelectItem>
                        <SelectItem value="documentary">Documentary</SelectItem>
                        <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                        <SelectItem value="minimal">Minimalist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Music className="w-4 h-4" /> Background Music
                    </Label>
                    <Select value={selectedMusic} onValueChange={(v) => { setSelectedMusic(v); stopMusicPreview(); }}>
                      <SelectTrigger className="bg-black/50 border-white/10" data-testid="select-music">
                        <SelectValue placeholder="Select mood" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 border-white/10">
                        <SelectItem value="epic">Epic & Orchestral</SelectItem>
                        <SelectItem value="lofi">Lo-Fi Chill</SelectItem>
                        <SelectItem value="upbeat">Upbeat Pop</SelectItem>
                        <SelectItem value="dark">Dark & Suspenseful</SelectItem>
                        <SelectItem value="ambient">Ambient</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Volume2 className="w-3 h-3" /> Volume
                        </Label>
                        <span className="text-xs font-mono text-cyan-400" data-testid="text-music-volume">{musicVolume[0]}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={musicVolume}
                          onValueChange={(v) => {
                            setMusicVolume(v);
                            if (audioRef.current && isPlayingPreview) {
                              audioRef.current.volume = v[0] / 100;
                            }
                          }}
                          min={0}
                          max={50}
                          step={1}
                          className="flex-1 [&>.relative>.absolute]:bg-cyan-500"
                          data-testid="slider-music-volume"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={toggleMusicPreview}
                          className="border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400"
                          data-testid="button-test-music"
                        >
                          {isPlayingPreview ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                     <Label className="flex items-center gap-2 text-muted-foreground">
                      <Type className="w-4 h-4" /> Subtitles
                    </Label>
                    <Tabs value={includeSpeech ? "on" : "off"} onValueChange={(v) => setIncludeSpeech(v === "on")} className="w-full">
                      <TabsList className="w-full bg-black/50 border border-white/10">
                        <TabsTrigger value="on" className="flex-1 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="toggle-speech-on">On</TabsTrigger>
                        <TabsTrigger value="off" className="flex-1" data-testid="toggle-speech-off">Off</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Languages className="w-4 h-4" /> Language
                    </Label>
                    <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage} className="w-full">
                      <TabsList className="w-full bg-black/50 border border-white/10">
                        <TabsTrigger value="en" className="flex-1 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="toggle-lang-en">English</TabsTrigger>
                        <TabsTrigger value="id" className="flex-1 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="toggle-lang-id">Bahasa</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    size="lg" 
                    className="w-full h-14 text-lg font-semibold bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.01]"
                    onClick={handleGenerate}
                    disabled={!prompt || isGenerating}
                    data-testid="button-generate"
                  >
                    <Wand2 className="mr-2 w-5 h-5" />
                    Generate Video
                  </Button>
                </div>

              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex flex-col items-center justify-center min-h-[60vh] space-y-8"
            data-testid="generating-screen"
          >
            {error ? (
              <div className="text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Generation Failed</h2>
                <p className="text-muted-foreground max-w-md">{error}</p>
                <Button onClick={reset} variant="outline" className="mt-4">
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-ping duration-[3s]" />
                  <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full animate-ping delay-75 duration-[3s]" />
                  <Loader2 className="w-16 h-16 text-cyan-400 animate-spin" />
                </div>

                <div className="w-full max-w-lg space-y-4">
                  <div className="text-center mb-2">
                    <span className="text-lg font-semibold text-white" data-testid="text-current-step">
                      {stepLabels[currentStep] || "Starting..."}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-mono text-cyan-400">
                    <span>PROCESSING</span>
                    <span data-testid="text-progress">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-white/5 [&>div]:bg-cyan-500" />
                  
                  <div className="h-48 overflow-hidden bg-black/50 rounded-lg border border-white/10 p-4 font-mono text-xs text-green-400/80 space-y-2 relative">
                     <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />
                     <AnimatePresence>
                      {logs.map((log, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2"
                          data-testid={`log-${i}`}
                        >
                          <span className="text-cyan-500/50">{">"}</span>
                          {log}
                        </motion.div>
                      ))}
                     </AnimatePresence>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {step === "result" && generatedVideo && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
            data-testid="result-screen"
          >
             <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span className="w-2 h-8 bg-cyan-500 rounded-full inline-block" />
                  Your Video is Ready!
                </h2>
                <Button variant="ghost" onClick={reset} className="text-muted-foreground hover:text-white" data-testid="button-create-new">
                  Create New
                </Button>
             </div>

             {/* Video Player */}
             <Card className="glass-panel overflow-hidden border-white/10 bg-black/40">
                <div className="aspect-video relative bg-black">
                  {generatedVideo.resultUrl ? (
                    <video
                      src={generatedVideo.resultUrl}
                      controls
                      className="w-full h-full"
                      data-testid="video-player"
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Video className="w-16 h-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white" data-testid="text-result-title">
                        {scriptData?.title || prompt.substring(0, 50)}{prompt.length > 50 && !scriptData?.title ? "..." : ""}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {generatedVideo.duration}s</span>
                        <span className="flex items-center gap-1 capitalize"><Clapperboard className="w-3 h-3" /> {generatedVideo.visualStyle}</span>
                        <span className="flex items-center gap-1 capitalize"><Music className="w-3 h-3" /> {generatedVideo.musicMood}</span>
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      {generatedVideo.resultUrl && (
                        <a 
                          href={generatedVideo.resultUrl} 
                          download={`video-${generatedVideo.id}.mp4`}
                          className="inline-flex"
                        >
                          <Button className="bg-cyan-500 text-black hover:bg-cyan-400" data-testid="button-download">
                            <Download className="w-4 h-4 mr-2" /> Download
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
             </Card>

             {/* Script and Scenes Display */}
             {scriptData && (
               <Card className="glass-panel border-white/10 bg-black/40">
                 <CardContent className="p-6 space-y-4">
                   <div className="flex items-center gap-2 text-cyan-400">
                     <CheckCircle2 className="w-5 h-5" />
                     <h3 className="text-lg font-semibold">Generated Script</h3>
                   </div>
                   {scriptData.script && (
                     <div>
                       <p className="text-sm text-muted-foreground">Narration</p>
                       <p className="text-sm text-white/80 leading-relaxed" data-testid="text-script-narration">{scriptData.script}</p>
                     </div>
                   )}
                   {scriptData.scenes && scriptData.scenes.length > 0 && (
                     <div>
                       <p className="text-sm text-muted-foreground mb-2">Scenes</p>
                       <div className="space-y-2">
                         {scriptData.scenes.map((scene: any, i: number) => (
                           <div key={i} className="bg-white/5 p-3 rounded border border-white/10" data-testid={`scene-${i}`}>
                             <div className="flex justify-between items-start mb-1">
                               <span className="text-xs text-cyan-400 font-mono">{scene.timestamp}</span>
                               {scene.text && <span className="text-xs text-purple-400">"{scene.text}"</span>}
                             </div>
                             <p className="text-xs text-white/70">{scene.description}</p>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </CardContent>
               </Card>
             )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
