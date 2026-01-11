# AI Video Forge

## Overview

AI Video Forge is a web application that generates short videos from text prompts using AI. Users provide a prompt describing the video they want, and the system generates a complete video with stock footage from Pexels, AI-generated voiceover, background music, and animated subtitles. The application uses OpenAI for script generation and text-to-speech, Pexels API for stock video footage, and FFmpeg for video composition.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite
- **UI Components**: Radix UI primitives wrapped by shadcn/ui

The frontend is a single-page application with a video generation form that streams progress updates during generation. The main component is `VideoGenerator.tsx` which handles the generation workflow.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for development
- **API Pattern**: REST API with Server-Sent Events (SSE) for progress streaming
- **Build**: esbuild for production bundling

The backend exposes endpoints for:
- Video generation with real-time progress updates
- CRUD operations for video generations
- Chat and image generation (via Replit integrations)
- Object storage for file uploads

### Database
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Schema Location**: `shared/schema.ts`

Key tables:
- `users` - Basic user authentication
- `videoGenerations` - Stores video generation requests and results
- `conversations` and `messages` - Chat functionality

### Video Generation Pipeline
Located in `server/services/`:
1. **Script Generation** - OpenAI generates a script and scene descriptions
2. **Stock Footage** - Pexels API searches and downloads relevant video clips
3. **Audio Generation** - OpenAI TTS creates voiceover, background music is fetched
4. **Subtitle Generation** - ASS format subtitles with word-level timing
5. **Video Composition** - FFmpeg combines all elements into final video

### File Structure
```
client/           # React frontend
  src/
    components/   # UI components
    pages/        # Route pages
    lib/          # Utilities and API client
server/           # Express backend
  services/       # Video generation services
  replit_integrations/  # Chat, image, object storage
shared/           # Shared types and schema
public/           # Static files and generated videos
```

## External Dependencies

### APIs
- **OpenAI API** - Script generation, text-to-speech (via `OPENAI_API_KEY` or Replit AI Integrations)
- **Pexels API** - Stock video footage (`PEXELS_API_KEY`)

### System Dependencies
- **FFmpeg** - Video processing and composition (must be installed with libass for subtitles)
- **PostgreSQL** - Database storage

### Optional Services
- **Google Cloud Storage** - Object storage for file uploads (optional, falls back to local storage)

### Key npm Packages
- `openai` - OpenAI API client
- `fluent-ffmpeg` - FFmpeg wrapper for Node.js
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Data fetching and caching
- `framer-motion` - Animations
- `@uppy/*` - File upload handling