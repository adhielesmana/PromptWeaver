import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Search, Trash2, RefreshCw, Play, Film, Clock, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaItem {
  id: number;
  title: string;
  description: string | null;
  filePath: string;
  thumbnailPath: string | null;
  source: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  orientation: string;
  tags: string[];
  aiAnalysis: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

export default function MediaLibrary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: mediaItems = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["media", searchQuery],
    queryFn: async () => {
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(`/api/media${params}`);
      if (!res.ok) throw new Error("Failed to fetch media");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast({ title: "Video uploaded and analyzed successfully" });
    },
    onError: () => {
      toast({ title: "Upload failed", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setSelectedItem(null);
      toast({ title: "Video deleted" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/media/${id}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setSelectedItem(data);
      toast({ title: "Video re-analyzed successfully" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({ title: "Please select a video file", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Media Library
            </h1>
            <p className="text-gray-400 mt-1">
              Upload, organize, and search your video clips
            </p>
          </div>
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-slate-800/50 border-slate-700"
                data-testid="input-search"
              />
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700"
              data-testid="button-upload"
            >
              {isUploading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isUploading ? "Analyzing..." : "Upload Video"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Film className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">No videos in your library</p>
            <p className="text-sm">Upload a video to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {mediaItems.map((item) => (
              <Dialog key={item.id}>
                <DialogTrigger asChild>
                  <Card
                    className="bg-slate-800/50 border-slate-700 hover:border-cyan-500/50 transition-all cursor-pointer overflow-hidden"
                    onClick={() => setSelectedItem(item)}
                    data-testid={`card-media-${item.id}`}
                  >
                    <div className="relative aspect-video bg-slate-900">
                      <video
                        src={item.filePath}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                        <Play className="w-12 h-12 text-white" />
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs">
                        {formatDuration(item.duration)}
                      </div>
                      <div className="absolute top-2 left-2">
                        <Badge
                          variant="secondary"
                          className={
                            item.orientation === "portrait"
                              ? "bg-purple-500/80"
                              : "bg-cyan-500/80"
                          }
                        >
                          {item.orientation}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium text-white truncate mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                        {item.description || "No description"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 3).map((tag, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs border-slate-600"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs border-slate-600">
                            +{item.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl">{item.title}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <video
                        src={item.filePath}
                        controls
                        className="w-full rounded-lg"
                        data-testid="video-preview"
                      />
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => analyzeMutation.mutate(item.id)}
                          disabled={analyzeMutation.isPending}
                          className="border-slate-600"
                          data-testid="button-reanalyze"
                        >
                          <RefreshCw
                            className={`w-4 h-4 mr-2 ${
                              analyzeMutation.isPending ? "animate-spin" : ""
                            }`}
                          />
                          Re-analyze
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          data-testid="button-delete"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-400">Description</label>
                        <p className="text-sm mt-1">
                          {item.description || "No description available"}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-400">AI Analysis</label>
                        <p className="text-sm mt-1 text-cyan-300">
                          {item.aiAnalysis || "No analysis available"}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-400 flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Tags
                        </label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.tags.map((tag, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="bg-slate-700"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="text-gray-400">Duration</label>
                          <p className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </p>
                        </div>
                        <div>
                          <label className="text-gray-400">Size</label>
                          <p>{formatFileSize(item.fileSize)}</p>
                        </div>
                        <div>
                          <label className="text-gray-400">Resolution</label>
                          <p>
                            {item.width}x{item.height}
                          </p>
                        </div>
                        <div>
                          <label className="text-gray-400">Source</label>
                          <p className="capitalize">{item.source}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
