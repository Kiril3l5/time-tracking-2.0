#!/bin/bash

# Project Cleanup Script
# Usage: ./scripts/cleanup.sh

echo "Starting project cleanup..."

# 1. Remove redundant documentation files
echo "Cleaning up documentation..."

# Handle duplicate security documentation
if [ -f docs/security/implementation.md ] && [ -f docs/main_readme/security-implementation-guide.md ]; then
  echo "Merging security documentation..."
  # We'll keep the more detailed main_readme version but update README.md links
  rm docs/security/implementation.md
  echo "Consolidated security documentation"
fi

# 2. Remove any temp files
echo "Removing temporary files..."
find . -name "*.tmp" -type f -delete
find . -name "*.bak" -type f -delete
find . -name ".DS_Store" -type f -delete

# 3. Clean up node_modules (optional - uncomment if needed)
# echo "Cleaning node_modules..."
# rm -rf node_modules
# rm -rf packages/*/node_modules

# 4. Clean up build artifacts
echo "Removing build artifacts..."
rm -rf packages/*/dist
rm -rf packages/*/build
rm -rf packages/*/.cache

# 5. Clean up test coverage reports
echo "Cleaning test coverage reports..."
rm -rf coverage
rm -rf packages/*/coverage

# 6. Clean storybook builds
echo "Cleaning Storybook builds..."
rm -rf packages/*/storybook-static

# 7. Remove logs
echo "Removing log files..."
find . -name "*.log" -type f -delete

echo "Cleanup complete!" 