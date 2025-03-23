# Automated Development Workflow Guide

This guide explains how to use the automated workflow tool that simplifies the development process from branch creation to PR creation.

## Overview

The automated workflow tool combines several steps into a single interactive process:

1. **Branch Management**: Creates a new feature branch or continues work on an existing branch
2. **Change Management**: Helps you commit changes with meaningful messages
3. **Preview Deployment**: Runs the preview deployment to test your changes
4. **PR Creation**: Suggests PR title and description based on your changes

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

### 3. Preview Deployment

The workflow automatically runs the preview deployment:

- Executes `pnpm run preview`
- Shows deployment progress and results
- Opens the preview dashboard if available
- Asks if you want to create a PR after the preview

### 4. PR Creation

If you choose to create a PR:

- The tool **suggests a PR title** based on:
  - Your commit messages
  - The directories/files you modified most
  
- The tool **generates a PR description** including:
  - List of modified files grouped by directory
  - Commit history
  
- You can:
  - Accept the suggestions
  - Provide your own title/description
  - Review the final PR before creation

## Example Workflow

Here's an example session:

```
=====================
AUTOMATED DEVELOPMENT WORKFLOW
=====================

INFO: Current branch: main
INFO: You're on the main branch. Let's create a feature branch.
What are you working on? (brief description for branch name): Add user settings page

INFO: Creating new branch: feature/add-user-settings-page
INFO: Updating main branch from remote...
SUCCESS: Created and switched to branch: feature/add-user-settings-page
INFO: No changes to commit on the new branch yet.

=====================
RUNNING PREVIEW DEPLOYMENT
=====================

INFO: Starting preview deployment. This may take a few minutes...
[Preview deployment output...]
SUCCESS: Preview deployment completed!
INFO: Opening preview dashboard...

Would you like to create a pull request? (Y/n): y
INFO: Generating PR title and description suggestions based on your changes...
Enter PR title [Add user settings page]: 
Suggested PR description:
------------------------
## Changes

### Modified Files
- packages/admin/src: UserSettings.tsx, UserSettingsForm.tsx, index.ts
- packages/common/src/types: settings.ts

### Commit History
- Add user settings components
- Add settings types
------------------------
Use this description? (Y/n): y

=====================
CREATING PULL REQUEST
=====================

INFO: Creating PR with title: Add user settings page
[PR creation output...]
SUCCESS: Pull request created successfully!

=====================
NEXT STEPS
=====================

INFO: You are on branch: feature/add-user-settings-page
INFO: What would you like to do next?
1. Continue working on this branch
2. Run preview deployment again: pnpm run preview
3. Create/update PR: pnpm run pr:create
4. Switch to main branch: git checkout main

Press Enter to exit...
```

## Tips for Best Results

1. **Start fresh from main**: Use `pnpm run workflow:new` to ensure you're starting from a clean state
2. **Use descriptive feature names**: This helps generate better branch names and commit messages
3. **Commit logically**: Make smaller, focused commits with clear messages
4. **Review suggestions**: The tool makes intelligent suggestions, but review them before accepting
5. **Branch naming**: The tool automatically formats branch names with `feature/` prefix and proper formatting

## Troubleshooting

- **Script fails to run**: Make sure you have executable permissions on the script
- **Branch creation fails**: Check if you have permission to create branches
- **Commit errors**: Make sure your Git user name and email are configured
- **Branch switching issues**: 
  - If you have uncommitted changes, the tool will offer options to commit, stash, or stay on current branch
  - If you receive a Git error even after handling uncommitted changes, try using Git commands directly
- **Preview deployment issues**: Check the error message and fix any issues before trying again
- **PR creation problems**: You might have an existing PR from this branch - update it instead

## Advanced Usage

If you prefer to run individual steps manually:

1. Create a branch: `git checkout -b feature/your-feature-name`
2. Make changes and commit: `git add .` and `git commit -m "Your message"`
3. Run preview: `pnpm run preview`
4. Create PR: `pnpm run pr:create-with-title "Your PR title" "Your description"`

The automated workflow simply combines these steps into a single interactive process.

## Technical Details

The workflow automation script (`scripts/workflow-automation.js`) uses:

- Git commands to manage branches and commits
- The existing preview deployment system
- The PR creation script
- Intelligent analysis of changes to suggest PR content

For developers who want to modify the workflow, check the script code for detailed comments. 