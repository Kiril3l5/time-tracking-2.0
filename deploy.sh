#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display progress
show_progress() {
  local duration=3
  local width=30
  local progress=0
  local message="$1"
  
  echo -ne "${BLUE}${message}${NC}\n"
  
  # Progress bar
  while [ $progress -lt $width ]; do
    echo -ne "${YELLOW}#${NC}"
    sleep 0.05
    progress=$((progress + 1))
  done
  echo -ne "\n"
}

# Function to display success or error
show_status() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ $2${NC}\n"
  else
    echo -e "${RED}✗ $2${NC}\n"
    echo -e "${RED}Error: $3${NC}\n"
    exit 1
  fi
}

# Check if message is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Commit message is required${NC}"
  echo -e "Usage: ${YELLOW}./deploy.sh \"Your commit message\"${NC}"
  exit 1
fi

echo -e "\n${BLUE}🚀 Starting deployment process...${NC}\n"

# Clean up the project first
show_progress "Running project cleanup..."
export CI=true  # Set CI environment variable to ensure proper cleanup behavior
pnpm run cleanup > cleanup_log.txt 2>&1
CLEANUP_STATUS=$?
if [ $CLEANUP_STATUS -ne 0 ]; then
  ERROR_MSG=$(cat cleanup_log.txt)
  rm cleanup_log.txt
  show_status $CLEANUP_STATUS "Failed to clean up project" "$ERROR_MSG"
else
  rm -f cleanup_log.txt
  show_status $CLEANUP_STATUS "Project cleaned up successfully" ""
fi

# Run build process
show_progress "Building project..."
NODE_ENV=production pnpm run build:all > build_log.txt 2>&1
BUILD_STATUS=$?
if [ $BUILD_STATUS -ne 0 ]; then
  ERROR_MSG=$(cat build_log.txt)
  rm build_log.txt
  show_status $BUILD_STATUS "Failed to build project" "$ERROR_MSG"
else
  rm -f build_log.txt
  show_status $BUILD_STATUS "Project built successfully" ""
fi

# Add all changes
show_progress "Adding files to staging area..."
git add .
show_status $? "Files added to staging area" "Failed to add files"

# Commit with the provided message
show_progress "Committing changes..."
git commit -m "$1"
show_status $? "Changes committed successfully" "Failed to commit changes"

# Push to remote repository
show_progress "Pushing to remote repository..."
git push 2> git_push_error.txt
PUSH_STATUS=$?
if [ $PUSH_STATUS -ne 0 ]; then
  ERROR_MSG=$(cat git_push_error.txt)
  rm git_push_error.txt
  show_status $PUSH_STATUS "Failed to push changes" "$ERROR_MSG"
else
  rm -f git_push_error.txt
  show_status $PUSH_STATUS "Changes pushed to remote repository" ""
fi

# Run firebase deployment
show_progress "Deploying to Firebase..."
firebase deploy > firebase_deploy_log.txt 2>&1
DEPLOY_STATUS=$?
if [ $DEPLOY_STATUS -ne 0 ]; then
  ERROR_MSG=$(cat firebase_deploy_log.txt)
  rm firebase_deploy_log.txt
  show_status $DEPLOY_STATUS "Failed to deploy to Firebase" "$ERROR_MSG"
else
  rm -f firebase_deploy_log.txt
  show_status $DEPLOY_STATUS "Deployed to Firebase successfully" ""
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}The application has been deployed and is now live.${NC}" 