#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ai-video-forge"
DEFAULT_PORT=5000
MAX_PORT=5100
NGINX_CONF_PATH="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED_PATH="/etc/nginx/sites-enabled/${APP_NAME}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   AI Video Forge - Deployment Script   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if a port is available
check_port() {
    local port=$1
    if command -v ss &> /dev/null; then
        ss -tuln | grep -q ":${port} " && return 1 || return 0
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep -q ":${port} " && return 1 || return 0
    else
        # Fallback: try to bind to the port
        (echo >/dev/tcp/localhost/$port) 2>/dev/null && return 1 || return 0
    fi
}

# Function to find available port
find_available_port() {
    local port=$DEFAULT_PORT
    while [ $port -le $MAX_PORT ]; do
        if check_port $port; then
            echo $port
            return 0
        fi
        echo -e "${YELLOW}Port $port is in use, trying next...${NC}" >&2
        port=$((port + 1))
    done
    echo -e "${RED}No available ports found between $DEFAULT_PORT and $MAX_PORT${NC}" >&2
    exit 1
}

# Function to check and install nginx
setup_nginx() {
    echo -e "${BLUE}[1/5] Checking Nginx installation...${NC}"
    
    if command -v nginx &> /dev/null; then
        echo -e "${GREEN}✓ Nginx is already installed${NC}"
    else
        echo -e "${YELLOW}Installing Nginx...${NC}"
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y nginx
        elif command -v yum &> /dev/null; then
            sudo yum install -y nginx
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nginx
        else
            echo -e "${RED}Unable to install Nginx. Please install it manually.${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓ Nginx installed successfully${NC}"
    fi
    
    # Ensure nginx is running
    sudo systemctl enable nginx 2>/dev/null || true
    sudo systemctl start nginx 2>/dev/null || true
}

# Function to setup nginx config
setup_nginx_config() {
    local port=$1
    echo -e "${BLUE}[2/5] Setting up Nginx configuration...${NC}"
    
    if [ -f "$NGINX_CONF_PATH" ]; then
        echo -e "${GREEN}✓ Nginx config already exists, updating port to $port...${NC}"
        sudo sed -i "s/proxy_pass http:\/\/127.0.0.1:[0-9]*/proxy_pass http:\/\/127.0.0.1:$port/" "$NGINX_CONF_PATH"
    else
        echo -e "${YELLOW}Creating Nginx configuration...${NC}"
        
        # Get domain from user or use default
        read -p "Enter your domain name (or press Enter for localhost): " DOMAIN
        DOMAIN=${DOMAIN:-localhost}
        
        sudo tee "$NGINX_CONF_PATH" > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # SSE support for progress streaming
    location /api/generate-video {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 600s;
    }
}
EOF
        echo -e "${GREEN}✓ Nginx configuration created${NC}"
    fi
    
    # Enable site
    if [ ! -L "$NGINX_ENABLED_PATH" ]; then
        sudo ln -sf "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
    fi
    
    # Test and reload nginx
    sudo nginx -t && sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx configured and reloaded${NC}"
}

# Function to setup environment file
setup_env() {
    local port=$1
    echo -e "${BLUE}[3/5] Setting up environment...${NC}"
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            echo -e "${YELLOW}Created .env from .env.example${NC}"
        else
            touch .env
        fi
    fi
    
    # Update or add APP_PORT
    if grep -q "^APP_PORT=" .env 2>/dev/null; then
        sed -i "s/^APP_PORT=.*/APP_PORT=$port/" .env
    else
        echo "APP_PORT=$port" >> .env
    fi
    
    # Check required environment variables
    source .env 2>/dev/null || true
    
    if [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${YELLOW}OPENAI_API_KEY not set. Please enter it:${NC}"
        read -s OPENAI_KEY
        echo "OPENAI_API_KEY=$OPENAI_KEY" >> .env
    fi
    
    if [ -z "$PEXELS_API_KEY" ]; then
        echo -e "${YELLOW}PEXELS_API_KEY not set. Please enter it:${NC}"
        read -s PEXELS_KEY
        echo "PEXELS_API_KEY=$PEXELS_KEY" >> .env
    fi
    
    if [ -z "$SESSION_SECRET" ]; then
        echo -e "${YELLOW}Generating secure SESSION_SECRET...${NC}"
        SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
        echo "SESSION_SECRET=$SESSION_SECRET" >> .env
    fi
    
    echo -e "${GREEN}✓ Environment configured${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Default superadmin credentials:${NC}"
    echo -e "   Username: ${BLUE}adhielesmana${NC}"
    echo -e "   Password: ${BLUE}admin123${NC}"
    echo -e "${YELLOW}   Please change this password immediately after first login!${NC}"
}

# Function to create data directories
create_directories() {
    echo -e "${BLUE}[4/5] Creating data directories...${NC}"
    mkdir -p data/videos data/music data/cache data/postgres
    chmod -R 755 data/
    echo -e "${GREEN}✓ Directories created${NC}"
}

# Function to deploy with docker
deploy_docker() {
    local port=$1
    echo -e "${BLUE}[5/5] Deploying with Docker...${NC}"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
        echo "Visit: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    # Check if docker-compose is available
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        echo -e "${RED}Docker Compose is not installed. Please install it first.${NC}"
        exit 1
    fi
    
    # Export port for docker-compose
    export APP_PORT=$port
    
    # Build and start containers
    echo -e "${YELLOW}Building Docker images...${NC}"
    $COMPOSE_CMD build
    
    echo -e "${YELLOW}Starting containers...${NC}"
    $COMPOSE_CMD up -d
    
    # Wait for database to be ready
    echo -e "${YELLOW}Waiting for database to be ready...${NC}"
    sleep 10
    
    # Run database migrations
    echo -e "${YELLOW}Running database migrations...${NC}"
    $COMPOSE_CMD exec -T app npx drizzle-kit push --force 2>/dev/null || \
    $COMPOSE_CMD exec -T app npm run db:push 2>/dev/null || \
    echo -e "${YELLOW}Migration command not available, database may already be up to date${NC}"
    
    echo -e "${GREEN}✓ Deployment complete!${NC}"
}

# Main execution
main() {
    # Find available port
    echo -e "${BLUE}Checking port availability...${NC}"
    PORT=$(find_available_port)
    echo -e "${GREEN}✓ Using port: $PORT${NC}"
    echo ""
    
    # Setup nginx
    setup_nginx
    
    # Setup nginx config
    setup_nginx_config $PORT
    
    # Setup environment
    setup_env $PORT
    
    # Create directories
    create_directories
    
    # Deploy with docker
    deploy_docker $PORT
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Deployment Successful!               ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "Application is running on port: ${BLUE}$PORT${NC}"
    echo -e "Access via Nginx: ${BLUE}http://localhost${NC}"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  View logs:     docker compose logs -f app"
    echo "  Stop app:      docker compose down"
    echo "  Restart app:   docker compose restart"
    echo "  Update app:    git pull && ./deploy.sh"
    echo ""
}

# Run main function
main
