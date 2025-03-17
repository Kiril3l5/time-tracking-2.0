#!/bin/bash

# Project Cleanup Script
# Usage: ./scripts/cleanup.sh
# This script performs a comprehensive cleanup of the project
# before deployment to ensure a clean build environment.

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Pipeline fails on the first command that fails

# Function to handle errors
handle_error() {
  local line=$1
  local command=$2
  local code=$3
  echo "Error in cleanup script on line $line: Command '$command' exited with status $code"
  exit $code
}

# Set up error handling
trap 'handle_error ${LINENO} "$BASH_COMMAND" $?' ERR

echo "=============================="
echo "Starting project cleanup..."
echo "=============================="

# Function to safely remove files/directories with error handling
safe_remove() {
  if [ -e "$1" ]; then
    echo "Removing $1"
    rm -rf "$1"
  fi
}

# 1. Remove redundant documentation files
echo "Cleaning up documentation..."

# Handle duplicate security documentation
if [ -f docs/security/implementation.md ] && [ -f docs/main_readme/security-implementation-guide.md ]; then
  echo "Merging security documentation..."
  # We'll keep the more detailed main_readme version but update README.md links
  safe_remove docs/security/implementation.md
  echo "Consolidated security documentation"
fi

# 2. Remove any temp files
echo "Removing temporary files..."
find . -name "*.tmp" -type f -delete
find . -name "*.bak" -type f -delete
find . -name ".DS_Store" -type f -delete
find . -name "Thumbs.db" -type f -delete  # Windows thumbnail files
find . -name "*~" -type f -delete  # Backup files from editors

# 3. Clean up node_modules (optional - uncomment if needed)
# echo "Cleaning node_modules..."
# rm -rf node_modules
# rm -rf packages/*/node_modules

# 4. Clean up build artifacts
echo "Removing build artifacts..."
safe_remove packages/*/dist
safe_remove packages/*/build
safe_remove packages/*/.cache
safe_remove .firebase/hosting.*  # Previous Firebase hosting caches

# 5. Clean up test coverage reports
echo "Cleaning test coverage reports..."
safe_remove coverage
safe_remove packages/*/coverage
safe_remove .nyc_output  # NYC coverage output

# 6. Clean storybook builds
echo "Cleaning Storybook builds..."
safe_remove packages/*/storybook-static

# 7. Remove logs
echo "Removing log files..."
find . -name "*.log" -type f -delete
safe_remove logs

# 8. Clean up any environment-specific files that shouldn't be in version control
echo "Cleaning environment-specific files..."
find . -name ".env.local" -type f -delete
find . -name ".env.*.local" -type f -delete

# 9. Clean up IDE-specific artifacts that shouldn't be in the repo
echo "Cleaning IDE-specific artifacts..."
safe_remove .idea
safe_remove .vscode/.react

# Don't remove these on CI systems - they're needed for the build
if [ -z "$CI" ]; then
  echo "Not running in CI environment, performing additional cleanup..."
  
  # Clean up yarn/npm error logs
  safe_remove yarn-error.log
  safe_remove npm-debug.log
  
  # Optionally clean caches - commented out by default as it will slow down builds
  # echo "Cleaning package manager caches..."
  # pnpm store prune
fi

# 10. Remove any leftover Firebase emulator files
echo "Cleaning Firebase emulator files..."
safe_remove .runtimeconfig.json
safe_remove database-debug.log
safe_remove firestore-debug.log
safe_remove ui-debug.log
safe_remove firebase-debug.log

echo "=============================="
echo "Cleanup completed successfully!"
echo "=============================="

exit 0 