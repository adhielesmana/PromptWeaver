import { Link, Route, Switch } from "wouter";
import VideoGenerator from "@/components/VideoGenerator";
import background from "@assets/generated_images/abstract_digital_video_timeline_and_waves.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `url(${background})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Gradient Overlay for Fade */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-background/80 via-background/60 to-background pointer-events-none" />
      
      {/* Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent z-50 opacity-50" />
      
      <header className="relative z-10 p-6 flex justify-between items-center max-w-7xl mx-auto w-full border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
            <span className="font-bold text-black font-mono">AV</span>
          </div>
          <span className="font-bold text-xl tracking-tight">AI Video Forge</span>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
          <Link href="/library" className="hover:text-cyan-400 transition-colors" data-testid="link-library">Media Library</Link>
          <a href="#" className="hover:text-cyan-400 transition-colors">Showcase</a>
          <a href="#" className="hover:text-cyan-400 transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
           <span className="text-xs text-muted-foreground hidden sm:block">v2.4.0-beta</span>
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] py-12">
        <VideoGenerator />
      </main>

      <footer className="relative z-10 py-8 text-center text-xs text-muted-foreground border-t border-white/5 mt-auto">
        <p>© 2026 AI Video Forge. Powered by Replit & OpenAI Blueprint.</p>
      </footer>
    </div>
  );
}