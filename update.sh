#!/bin/bash

# Force pull from git without stash - discards local changes
echo "Updating code from git..."
git fetch origin
git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)
echo "Done! Run ./deploy.sh to rebuild."
