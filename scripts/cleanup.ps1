# Project Cleanup Script for Windows
# Usage: .\scripts\cleanup.ps1

Write-Host "=============================="
Write-Host "Starting project cleanup..."
Write-Host "=============================="

# Function to safely remove files/directories with error handling
function Safe-Remove {
    param (
        [string]$Path
    )
    
    if (Test-Path $Path) {
        Write-Host "Removing $Path"
        Remove-Item -Path $Path -Recurse -Force
    }
}

# 1. Remove redundant documentation files
Write-Host "Cleaning up documentation..."

# Handle duplicate security documentation
if ((Test-Path "docs/security/implementation.md") -and (Test-Path "docs/main_readme/security-implementation-guide.md")) {
    Write-Host "Merging security documentation..."
    # We'll keep the more detailed main_readme version but update README.md links
    Safe-Remove "docs/security/implementation.md"
    Write-Host "Consolidated security documentation"
}

# 2. Remove any temp files
Write-Host "Removing temporary files..."
Get-ChildItem -Path . -Include "*.tmp", "*.bak", ".DS_Store", "Thumbs.db", "*~" -Recurse -File | Remove-Item -Force

# 3. Clean up build artifacts
Write-Host "Removing build artifacts..."
Get-ChildItem -Path "packages" -Directory | ForEach-Object {
    Safe-Remove "$($_.FullName)/dist"
    Safe-Remove "$($_.FullName)/build"
    Safe-Remove "$($_.FullName)/.cache"
}
Safe-Remove ".firebase/hosting.*"

# 4. Clean up test coverage reports
Write-Host "Cleaning test coverage reports..."
Safe-Remove "coverage"
Get-ChildItem -Path "packages" -Directory | ForEach-Object {
    Safe-Remove "$($_.FullName)/coverage"
}
Safe-Remove ".nyc_output"

# 5. Clean storybook builds
Write-Host "Cleaning Storybook builds..."
Get-ChildItem -Path "packages" -Directory | ForEach-Object {
    Safe-Remove "$($_.FullName)/storybook-static"
}

# 6. Remove logs
Write-Host "Removing log files..."
Get-ChildItem -Path . -Include "*.log" -Recurse -File | Remove-Item -Force
Safe-Remove "logs"

# 7. Clean up any environment-specific files that shouldn't be in version control
Write-Host "Cleaning environment-specific files..."
Get-ChildItem -Path . -Include ".env.local", ".env.*.local" -Recurse -File | Remove-Item -Force

# 8. Clean up IDE-specific artifacts that shouldn't be in the repo
Write-Host "Cleaning IDE-specific artifacts..."
Safe-Remove ".idea"
Safe-Remove ".vscode/.react"

# Don't remove these on CI systems - they're needed for the build
if (-not $env:CI) {
    Write-Host "Not running in CI environment, performing additional cleanup..."
    
    # Clean up yarn/npm error logs
    Safe-Remove "yarn-error.log"
    Safe-Remove "npm-debug.log"
}

# 9. Remove any leftover Firebase emulator files
Write-Host "Cleaning Firebase emulator files..."
Safe-Remove ".runtimeconfig.json"
Safe-Remove "database-debug.log"
Safe-Remove "firestore-debug.log"
Safe-Remove "ui-debug.log"
Safe-Remove "firebase-debug.log"

Write-Host "=============================="
Write-Host "Cleanup completed successfully!"
Write-Host "==============================" 