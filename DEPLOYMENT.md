# Deployment Guide - AI Video Generator

This guide explains how to deploy the AI Video Generator to your own server.

## Requirements

- **Node.js** 20+ 
- **PostgreSQL** 14+
- **FFmpeg** (with libass for subtitles)
- **2GB+ RAM** (for video processing)
- **10GB+ disk space** (for temporary video files)

## Environment Variables

Create a `.env` file with these variables:

```bash
# Required
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/videogen

# API Keys (Required)
OPENAI_API_KEY=sk-your-openai-api-key
PEXELS_API_KEY=your-pexels-api-key

# Optional - Object Storage (for cloud file storage)
# Leave empty to use local file storage
DEFAULT_OBJECT_STORAGE_BUCKET_ID=
PUBLIC_OBJECT_SEARCH_PATHS=
PRIVATE_OBJECT_DIR=
```

## Option 1: Deploy to VPS (Ubuntu/Debian)

### Step 1: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install FFmpeg with libass
sudo apt install -y ffmpeg libass-dev

# Install PM2 (process manager)
sudo npm install -g pm2
```

### Step 2: Setup PostgreSQL

```bash
# Create database user and database
sudo -u postgres psql

CREATE USER videogen WITH PASSWORD 'your_secure_password';
CREATE DATABASE videogen OWNER videogen;
GRANT ALL PRIVILEGES ON DATABASE videogen TO videogen;
\q
```

### Step 3: Clone and Setup Application

```bash
# Clone your repository
git clone https://github.com/your-repo/video-generator.git
cd video-generator

# Install all dependencies (including dev dependencies for build)
npm install

# Create .env file
cp .env.example .env
nano .env  # Edit with your values

# Create required directories
mkdir -p public/videos public/music

# Push database schema
npm run db:push

# Build for production
npm run build
```

### Step 4: Start with PM2

```bash
# Start the application (runs the built production server)
pm2 start node --name "video-generator" -- dist/index.cjs

# Or alternatively using npm script:
# pm2 start npm --name "video-generator" -- start

# Save PM2 configuration
pm2 save

# Setup auto-start on reboot
pm2 startup

# View logs
pm2 logs video-generator
```

### Step 5: Setup Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/video-generator
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 500M;  # For large video uploads

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # For long video generation
    }

    # Serve generated videos directly
    location /videos/ {
        alias /path/to/your/app/public/videos/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/video-generator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6: Setup SSL (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Option 2: Deploy with Docker

### Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Create directories for videos
RUN mkdir -p public/videos public/music

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/videogen
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PEXELS_API_KEY=${PEXELS_API_KEY}
    depends_on:
      - db
    volumes:
      - ./public/videos:/app/public/videos
      - ./public/music:/app/public/music
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=videogen
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Deploy with Docker

```bash
# Create data directories first
mkdir -p data/videos data/music data/postgres

# Create .env file with your API keys
echo "OPENAI_API_KEY=your-key-here" > .env
echo "PEXELS_API_KEY=your-key-here" >> .env

# Build and start
docker-compose up -d --build

# Wait for database to be ready, then push schema
sleep 10
docker-compose exec app npm run db:push

# View logs
docker-compose logs -f app
```

## Option 3: Deploy to Cloud Platforms

### Railway.app

1. Connect your GitHub repository
2. Add environment variables in Railway dashboard
3. Railway will auto-detect Node.js and deploy

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run db:push && npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Render.com

1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm run db:push && npm start`
5. Add environment variables

### DigitalOcean App Platform

1. Create new App from GitHub
2. Select Node.js environment
3. Add PostgreSQL database component
4. Configure environment variables
5. Deploy

## Post-Deployment Checklist

- [ ] Test video generation end-to-end
- [ ] Verify FFmpeg is working: `ffmpeg -version`
- [ ] Check database connection
- [ ] Verify API keys are working
- [ ] Setup monitoring (optional)
- [ ] Configure backup for `/public/videos` folder
- [ ] Setup log rotation for PM2/Docker logs

## Troubleshooting

### FFmpeg not found
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Alpine (Docker)
apk add ffmpeg

# macOS
brew install ffmpeg
```

### Database connection failed
- Check DATABASE_URL format: `postgresql://user:password@host:port/database`
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Check firewall allows port 5432

### Video generation fails
- Check disk space: `df -h`
- Check `/tmp` has write permissions
- Ensure FFmpeg has libass support: `ffmpeg -filters | grep ass`

### Out of memory
- Increase server RAM to 4GB+
- Add swap space: `sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

## Maintenance

### Update Application

```bash
cd /path/to/video-generator
git pull
npm install
npm run build
pm2 restart video-generator
```

### Clean Old Videos

```bash
# Delete videos older than 7 days
find /path/to/app/public/videos -name "*.mp4" -mtime +7 -delete
```

### Backup Database

```bash
pg_dump -U videogen videogen > backup_$(date +%Y%m%d).sql
```
