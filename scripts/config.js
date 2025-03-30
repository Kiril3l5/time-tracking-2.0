/**
 * Workflow Configuration
 * 
 * Centralized configuration for the workflow automation.
 * All configurable values should be stored here.
 */

export const config = {
  // Project configuration
  projectId: 'autonomy-heroes',
  sites: ['admin-autonomyhero-2024', 'hours-autonomyhero-2024'],
  
  // Documentation configuration
  docsDir: 'docs',
  requiredDocs: ['setup', 'deployment', 'architecture', 'api', 'configuration'],
  minCoverage: 80,
  
  // Channel configuration
  channelThreshold: 5,
  channelPrefix: 'feature',
  
  // Build configuration
  buildCommand: 'pnpm run build:all',
  
  // Quality check configuration
  qualityChecks: {
    lint: 'pnpm run lint',
    typecheck: 'pnpm run typecheck',
    test: 'pnpm run test'
  },
  
  // Git configuration
  mainBranch: 'main',
  featureBranchPrefix: 'feature/',
  
  // State file location
  stateFile: 'temp/workflow-state.json'
}; 