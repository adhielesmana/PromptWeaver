FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine

# Install FFmpeg with libass support for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install ALL dependencies (needed for drizzle-kit migrations)
COPY package*.json ./
RUN npm ci

# Copy built server bundle
COPY --from=builder /app/dist ./dist

# Copy required runtime files
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Create directories for generated content
RUN mkdir -p public/videos public/music public/cache

# Set ownership for node user
RUN chown -R node:node /app
USER node

# Expose port (will be mapped dynamically by deploy.sh)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/videos || exit 1

# Start command - migrations run via deploy.sh before container starts
CMD ["node", "dist/index.cjs"]
