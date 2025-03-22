# Pull Request Creation Guide

This guide explains the automated PR creation workflow that helps streamline the process of deploying changes from preview to production.

## Overview

The PR creation workflow allows you to:

1. Run a preview deployment to test your changes
2. Automatically create a pull request to merge your changes to the main branch
3. Include preview URLs in the PR description for easy testing by reviewers

This workflow simplifies the development process by reducing manual steps between preview and production deployment.

## Available Commands

The following commands have been added to the project:

| Command | Description |
|---------|-------------|
| `pnpm run pr:create` | Creates a PR from your current branch to main using the default title |
| `pnpm run pr:create-with-title "Your PR Title" "Optional description"` | Creates a PR with a custom title and description |
| `pnpm run preview-and-pr` | Runs a preview deployment and then creates a PR if successful |
| `pnpm run preview-quick-and-pr` | Runs a quick preview (skipping some checks) and then creates a PR |

## Command Line Options

The PR creation script supports several options to customize its behavior:

| Option | Description |
|--------|-------------|
| `--test` | Test mode - validate all checks without creating a PR |
| `--dry-run` | Show what would happen without executing commands |
| `--auto-commit` | Automatically commit uncommitted changes |
| `--skip-push` | Skip pushing to remote |
| `--skip-url-check` | Skip checking for preview URLs |
| `--force` | Force PR creation even from main branch |
| `--help`, `-h` | Show help information |

Examples:
```bash
# Test mode - validate checks without creating a PR
pnpm run pr:create -- --test

# Dry run mode - show what would happen without executing
pnpm run pr:create -- --dry-run "Testing PR" "Just testing PR creation"

# Auto-commit changes
pnpm run pr:create -- --auto-commit "Quick fix" "Corrected typo in documentation"

# Create PR with custom title and skip URL check
pnpm run pr:create -- --skip-url-check "Update configuration" "Updated config files"
```

## How It Works

The workflow uses the GitHub CLI (`gh`) to create pull requests. The process follows these steps:

1. **Branch Validation**: Ensures you're on a feature branch and not main
2. **Commit Check**: Verifies all changes are committed
3. **Branch Pushing**: Pushes your branch to remote if needed
4. **Preview URL Extraction**: Finds the most recent preview URLs from your deployment
5. **PR Creation**: Creates a PR with the preview URLs included in the description
6. **PR Opening**: Opens the PR in your browser for immediate review

## Requirements

- GitHub CLI (`gh`) installed and authenticated
- Git configured with proper remote
- Recent preview deployment (for including preview URLs)

## Using the PR Creation Workflow

### Basic Usage

The simplest way to use this feature is:

```bash
# First make your changes
git checkout -b feature/your-feature-name

# Make changes to code...

# Commit your changes
git add .
git commit -m "Implement feature X"

# Run preview and create PR in one step
pnpm run preview-and-pr
```

### With Custom PR Title

To provide a custom PR title and description:

```bash
pnpm run preview
pnpm run pr:create-with-title "Add new dashboard features" "This PR implements the new analytics dashboard"
```

### Quick Workflow

For faster iteration during development:

```bash
pnpm run preview-quick-and-pr
```

### Advanced Workflow: Auto-commit and PR Creation

For quick fixes and small changes:

```bash
# Make changes to code...

# Create a PR and auto-commit changes in one step
pnpm run pr:create -- --auto-commit "Fix typo" "Corrected typo in documentation"
```

### Testing Your Setup

To validate your setup without creating an actual PR:

```bash
# Test the PR creation process
pnpm run pr:create -- --test
```

## Troubleshooting

### Missing Preview URLs

If you haven't run a preview deployment or the script can't find your preview URLs:

1. Run `pnpm run preview` first
2. Then run `pnpm run pr:create`

Alternatively, you can skip the URL check if needed:
```bash
pnpm run pr:create -- --skip-url-check "Your PR title"
```

### GitHub CLI Not Installed

If the GitHub CLI is not installed, the script will provide instructions for manual PR creation.

To install GitHub CLI:
- Windows: `winget install GitHub.cli` or download from [GitHub CLI releases](https://github.com/cli/cli/releases)
- Mac: `brew install gh`
- Linux: See [GitHub CLI installation](https://github.com/cli/cli/blob/trunk/docs/install_linux.md)

After installing, run `gh auth login` to authenticate.

### Creating PRs from Main Branch

By default, the script will prevent PR creation from the main branch. If you need to create a PR from main (not recommended for normal workflow), use the `--force` option:

```bash
pnpm run pr:create -- --force "Critical fix" "Emergency hotfix for production issue"
```

## Best Practices

1. Always run tests and linting before creating a PR
2. Use descriptive branch names and PR titles
3. Provide detailed descriptions of changes
4. Reference any related issues in the PR description
5. Check the preview URLs before sharing the PR
6. Use `--dry-run` to preview your PR creation before executing
7. Create PRs from feature branches, not from main

## Next Steps

After creating your PR:
1. Share the PR link with your team
2. Wait for reviews
3. Make any requested changes
4. When approved, merge the PR
5. The GitHub Actions workflow will automatically deploy to production 