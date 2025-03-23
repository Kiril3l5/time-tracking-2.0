# Automated Development Workflow Guide

This guide explains how to use the automated workflow tool that simplifies the development process from branch creation to PR creation.

## Overview

The automated workflow tool combines several steps into a single interactive process:

1. **Branch Management**: Creates a new feature branch or continues work on an existing branch
2. **Change Management**: Helps you commit changes with meaningful messages
3. **Preview Deployment**: Runs the preview deployment to test your changes
4. **PR Creation**: Suggests PR title and description based on your changes
5. **Post-PR Guidance**: Explains how to keep your local repo in sync after PRs are merged

This automation helps enforce the "1 Branch, 1 PR" workflow best practice while making it more user-friendly.

## Quick Start

To start a new development session with the automated workflow:

```bash
pnpm run workflow
```

Or use the shorthand:

```bash
pnpm run dev
```

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm run workflow` | Start the automated workflow |
| `pnpm run workflow:start` | Same as above |
| `pnpm run workflow:new` | Switch to main, pull latest changes, and start workflow |
| `pnpm run dev` | Shorthand for workflow |
| `pnpm run sync-main` | Sync local main branch with remote repository |
| `pnpm run fix-gitignore` | Fix gitignore settings to properly ignore temporary files |

## Step-by-Step Workflow

### 1. Branch Creation/Selection

When you run the workflow:

- If you're on the **main branch**, it will:
  - Ask what you're working on
  - Create a new feature branch with a sanitized name
  - Pull latest changes from main first
  
- If you're on a **feature branch**, it will:
  - Detect your current branch
  - Ask if you want to switch to a different branch
  - Show available branches if you choose to switch
  - **Handle uncommitted changes safely** if you're switching branches:
    - Offer to commit changes before switching
    - Offer to stash changes temporarily (with option to apply later)
    - Let you stay on the current branch instead
  - Ask if you want to sync your local main branch with remote

### 2. Change Management

After branch selection:

- If you have **uncommitted changes**, it will:
  - Show modified files
  - Ask if you want to commit them
  - Suggest a default commit message based on your branch name
  - Allow you to provide a custom commit message
  
- If you have **no changes**, it will:
  - Inform you that there are no changes to commit
  - Continue to the next step

### 3. Fix Gitignore Issues

The workflow now automatically:
- Checks if your `.gitignore` file has the proper entries for temporary files
- Updates `.gitignore` to ignore preview-specific files that shouldn't be committed
- Helps prevent issues with uncommitted temporary files during PR creation

### 4. Preview Deployment

The workflow automatically runs the preview deployment:

- Executes `pnpm run preview`
- Shows deployment progress and results
- Opens the preview dashboard if available
- Asks if you want to create a PR after the preview

### 5. PR Creation

If you choose to create a PR:

- The tool **suggests a PR title** based on:
  - Your commit messages
  - The directories/files you modified most
  
- The tool **generates a PR description** including:
  - List of modified files grouped by directory
  - Commit history
  
- Now with **improved error handling**:
  - If you have uncommitted changes, it offers to auto-commit them
  - If a PR already exists, it shows you the link and offers to update it
  - Provides clear guidance when things go wrong
  
- You can:
  - Accept the suggestions
  - Provide your own title/description
  - Review the final PR before creation

### 6. Post-PR Workflow

After your PR is created and merged on GitHub:

- The tool provides clear guidance on next steps:
  - How to update your local main branch with the merged changes
  - How to start working on a new feature
  - How to keep your repository in sync

## Syncing Your Main Branch

You can sync your local main branch with remote at any time:

```bash
pnpm run sync-main
```

This command:
1. Checks your current branch
2. Handles uncommitted changes safely (offers to commit or stash)
3. Switches to main branch
4. Pulls latest changes from remote
5. Offers to switch back to your original branch

## Example Workflow

Here's an example session:

```
=====================
AUTOMATED DEVELOPMENT WORKFLOW
=====================

INFO: Current branch: feature/existing-branch
INFO: Continuing work on existing branch: feature/existing-branch

Would you like to sync your local main branch with remote first? (y/N): y

=====================
SYNCING MAIN BRANCH
=====================

INFO: Switching to main branch...
SUCCESS: Main branch updated successfully!
Would you like to switch back to 'feature/existing-branch'? (Y/n): 
SUCCESS: Switched back to branch: feature/existing-branch

INFO: You have uncommitted changes.
INFO: Modified files:
M docs/workflow/automated-workflow-guide.md

Would you like to commit these changes? (Y/n): y
Enter commit message [Update automated workflow guide]: Add sync-main explanation
SUCCESS: Changes committed successfully.

INFO: Checking .gitignore configuration...
SUCCESS: All required patterns are already in .gitignore

=====================
RUNNING PREVIEW DEPLOYMENT
=====================

INFO: Starting preview deployment. This may take a few minutes...
[Preview deployment output...]
SUCCESS: Preview deployment completed!
INFO: Opening preview dashboard...

Would you like to create a pull request? (Y/n): y
INFO: Generating PR title and description suggestions based on your changes...
Enter PR title [Add sync-main explanation]: 
Suggested PR description:
------------------------
## Changes

### Modified Files
- docs/workflow: automated-workflow-guide.md

### Commit History
- Add sync-main explanation
------------------------
Use this description? (Y/n): y

=====================
CREATING PULL REQUEST
=====================

INFO: Creating PR with title: Add sync-main explanation
SUCCESS: PR created successfully!

=====================
AFTER PR IS MERGED
=====================

INFO: After your PR is merged on GitHub, follow these steps:
INFO: 1. Switch to main branch: git checkout main
INFO: 2. Pull latest changes: git pull origin main
INFO: 3. Start a new feature with: pnpm run workflow:new

INFO: You can run 'pnpm run sync-main' at any time to update your local main branch.

=====================
NEXT STEPS
=====================

INFO: You are on branch: feature/existing-branch
INFO: What would you like to do next?
1. Continue working on this branch
2. Run preview deployment again: pnpm run preview
3. Create/update PR: pnpm run pr:create
4. Switch to main branch: git checkout main
5. Sync main with remote: pnpm run sync-main

Press Enter to exit...
```

## Tips for Best Results

1. **Start fresh from main**: Use `pnpm run workflow:new` to ensure you're starting from a clean state
2. **Keep main in sync**: Use `pnpm run sync-main` regularly to avoid divergence
3. **Use descriptive feature names**: This helps generate better branch names and commit messages
4. **Commit logically**: Make smaller, focused commits with clear messages
5. **Review suggestions**: The tool makes intelligent suggestions, but review them before accepting
6. **After PR merges**: Use the guidance to keep your local repository in sync with the remote

## Troubleshooting

- **Script fails to run**: Make sure you have executable permissions on the script
- **Branch creation fails**: Check if you have permission to create branches
- **Commit errors**: Make sure your Git user name and email are configured
- **Branch switching issues**: 
  - If you have uncommitted changes, the tool will offer options to commit, stash, or stay on current branch
  - If you receive a Git error even after handling uncommitted changes, try using Git commands directly
- **Preview deployment issues**: Check the error message and fix any issues before trying again
- **PR creation problems**: 
  - If you see "You have uncommitted changes", use the auto-commit option
  - If you see "PR already exists", update the existing PR instead of creating a new one
- **Main branch out of sync**: Run `pnpm run sync-main` to update your local main branch

## Advanced Usage

If you prefer to run individual steps manually:

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Make changes and commit: `git add .` and `git commit -m "Your message"`
3. Run preview: `pnpm run preview`
4. Create PR: `pnpm run pr:create-with-title "Your PR title" "Your description"`
5. Sync main: `pnpm run sync-main`

The automated workflow simply combines these steps into a single interactive process.

## Technical Details

The workflow automation script (`scripts/workflow-automation.js`) uses:

- Git commands to manage branches and commits
- The existing preview deployment system
- The PR creation script
- Intelligent analysis of changes to suggest PR content

For developers who want to modify the workflow, check the script code for detailed comments. 