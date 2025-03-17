# Minimal PowerShell deployment script
param([string]$CommitMessage = "")

# Check if message is provided
if ([string]::IsNullOrEmpty($CommitMessage)) {
    Write-Output "Error: Commit message is required"
    Write-Output "Usage: .\deploy.ps1 'Your commit message'"
    exit 1
}

Write-Output "Starting deployment process..."
Write-Output "Commit message: $CommitMessage"

# Run cleanup
Write-Output "Running cleanup..."
pnpm run cleanup

# Build project
Write-Output "Building project..."
$env:NODE_ENV = "production"
pnpm run build:all

# Git operations
Write-Output "Adding files to git..."
git add .

Write-Output "Committing changes..."
git commit -m $CommitMessage

Write-Output "Pushing to remote..."
git push

Write-Output "Deployment completed successfully!" 