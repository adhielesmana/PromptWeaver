#!/bin/bash
# One-time installer - run this once on your server
# Usage: curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/install.sh | bash

set -e

echo "Installing AI Video Forge..."

# Clone or update repo
if [ -d ".git" ]; then
    git fetch origin
    git reset --hard origin/main
else
    git clone https://github.com/YOUR_REPO/YOUR_PROJECT.git .
fi

# Make scripts executable
chmod +x deploy.sh update.sh 2>/dev/null || true

# Run deployment
./deploy.sh

echo "Done!"
