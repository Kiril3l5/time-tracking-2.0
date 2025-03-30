# Automated Development Workflow Guide

This guide provides a comprehensive overview of our automated development workflow, including branch management, change management, preview deployment, PR creation, and post-PR guidance.

> **Related Documentation**
> - [Preview Deployment Guide](./preview-deployment-guide.md) - For preview deployment details
> - [Firebase Configuration Guide](../firebase/firebase-config-guide.md) - For Firebase setup
> - [GitHub Workflow Guide](../github/github-workflow-guide.md) - For PR management
> - [Security Implementation Guide](../main_readme/security-implementation-guide.md) - For security details

## Overview

The automated workflow streamlines the development process by providing a unified interface for:
1. Branch management and synchronization
2. Change tracking and commits
3. Preview deployment and testing
4. Pull request creation and management
5. Post-PR workflow guidance
6. Health checks and monitoring
7. Performance tracking and optimization
8. Quality assurance and validation

## Core Components

### 1. Workflow Orchestration
- **Main Orchestrator** (`improved-workflow.js`)
  - Coordinates all workflow steps
  - Manages state and progress tracking
  - Handles error recovery and reporting
  - Integrates with package coordinator

- **Workflow Engine** (`workflow-engine.js`)
  - Executes workflow steps in sequence
  - Manages package dependencies
  - Handles monorepo coordination
  - Tracks performance metrics
  - Provides error recovery
  - Manages workflow state

- **Step Runner** (`step-runner.js`)
  - Manages individual step execution
  - Handles step dependencies
  - Provides step context and state
  - Tracks step performance
  - Manages error handling
  - Supports step retries

### 2. State Management
- **Workflow State** (`workflow-state.js`)
  - Manages state persistence
  - Handles state recovery
  - Provides state validation
  - Manages state backups
  - Tracks error history
  - Supports state cleanup

### 3. Quality Assurance
- **Health Checks** (`health-checker.js`)
  - Security vulnerability scanning
  - Environment validation
  - Git configuration checks
  - Dependency validation

- **Quality Checker** (`quality-checker.js`)
  - Linting
  - TypeScript validation
  - Documentation checks
  - Test execution
  - Bundle analysis
  - Dead code detection

### 4. Build & Preview
- **Package Coordinator** (`package-coordinator.js`)
  - Manages package dependencies
  - Determines build order
  - Handles shared resources
  - Tracks package metrics
  - Analyzes dependencies
  - Manages build order

- **Deployment Manager** (`deployment-manager.js`)
  - Creates preview channels
  - Deploys preview builds
  - Manages preview URLs
  - Handles preview cleanup
  - Verifies authentication
  - Tracks deployment metrics

### 5. Reporting & Analytics
- **Dashboard Generator** (`dashboard-generator.js`)
  - Real-time progress tracking
  - Visual metrics display
  - Performance analytics
  - Error visualization
  - Package metrics display

- **Consolidated Report** (`consolidated-report.js`)
  - Quality metrics
  - Build statistics
  - Test results
  - Documentation coverage
  - Bundle analysis
  - Dead code detection
  - Performance metrics

### 6. Core Services
- **Logger** (`core/logger.js`)
  - Centralized logging
  - Log rotation
  - Multiple log levels
  - File and console output

- **Command Runner** (`core/command-runner.js`)
  - Shell command execution
  - Output capturing
  - Error handling
  - Timeout support
  - Command history

- **Progress Tracker** (`core/progress-tracker.js`)
  - Step-by-step tracking
  - Timing information
  - Visual formatting
  - Success/failure indicators

- **Performance Monitor** (`core/performance-monitor.js`)
  - Step timing
  - Resource usage
  - Build metrics
  - Test metrics

## Workflow Steps

The automated workflow executes the following steps in order:

1. **Workflow Engine Initialization** (Critical)
   - Initialize all workflow components
   - Set up package coordinator
   - Initialize quality checker
   - Set up deployment manager
   - Initialize dashboard generator
   - Set up consolidated report
   - Initialize branch manager

2. **Environment Validation** (Critical)
   - Validate development environment
   - Check required tools and dependencies
   - Verify environment variables
   - Validate package dependencies
   - Ensure all required services are available

3. **Security & Git Checks** (Critical)
   - Run security vulnerability scanning
   - Validate Git configuration
   - Check repository security settings
   - Verify access permissions
   - Scan for sensitive data

4. **Quality Checks** (Critical)
   - Run code quality checks
   - Execute linting
   - Run unit tests
   - Perform type checking
   - Generate coverage reports

5. **Build Application** (Critical)
   - Build packages in dependency order
   - Compile TypeScript
   - Bundle assets
   - Generate production builds
   - Verify build outputs

6. **Deployment** (Critical)
   - Deploy to preview environment
   - Set up preview URLs
   - Configure environment variables
   - Verify deployment health
   - Run smoke tests

7. **Results & Cleanup** (Non-critical)
   - Generate dashboard
   - Create consolidated report
   - Clean up temporary resources
   - Archive build artifacts
   - Update status reports

Each step is designed to be independent and can be retried if it fails. Critical steps must succeed for the workflow to continue, while non-critical steps can fail without stopping the entire workflow.

## Error Handling & Recovery

The workflow includes comprehensive error handling:

### Error Categories
- Authentication errors
- Validation errors
- Resource errors
- Performance errors

### Recovery Options
- Maximum retries: 3
- Retry delay: 5 seconds
- Backoff factor: 2
- Maximum backoff: 30 seconds

### Critical Steps
- Authentication & Branch Management
- Build Process

### Retryable Steps
- Authentication & Branch Management
- Quality Checks
- Build Process
- Deployment

## Performance Monitoring

The workflow tracks comprehensive performance metrics:

### Step Metrics
- Step durations
- Package build times
- Test execution times
- Deployment times

### Resource Metrics
- Memory usage
- CPU usage
- Disk usage
- Network usage

### Package Metrics
- Build times
- Test times
- Bundle sizes
- Dependencies

## Quick Start

```bash
# Run complete workflow
node scripts/improved-workflow.js

# Run with options
node scripts/improved-workflow.js --skip-tests --skip-build --skip-deploy --skip-pr --verbose
```

## Available Commands

| Command | Description | Options |
|---------|-------------|---------|
| `node scripts/improved-workflow.js` | Run the complete workflow | None |
| `node scripts/improved-workflow.js --help` | Show help information | None |
| `node scripts/improved-workflow.js --skip-tests` | Skip running tests | None |
| `node scripts/improved-workflow.js --skip-build` | Skip build process | None |
| `node scripts/improved-workflow.js --skip-deploy` | Skip deployment | None |
| `node scripts/improved-workflow.js --skip-pr` | Skip creating pull request | None |
| `node scripts/improved-workflow.js --verbose` | Enable verbose logging | None |

## Health Checks

The workflow includes comprehensive health checks to ensure a stable development environment:

### Environment Checks
- Node.js version (>=14.0.0)
- Git installation
- Firebase tools installation
- Disk space (minimum 1GB)
- Network connectivity
- Firebase rules validation

### Dependency Checks
- PNPM version (>=6.0.0)
- Workspace dependencies
- Duplicate dependencies
- Missing dependencies

### Module and Build Checks
- Workspace setup validation
- Build configuration
- TypeScript configuration
- Test setup verification

### Test Setup Checks
- Test dependencies (Vitest, React Testing Library)
- Test coverage configuration
- Test scripts availability

## Performance Monitoring

The workflow includes built-in performance monitoring:

### Metrics Tracked
- Total workflow duration
- Individual step durations
- Build times
- Test execution times
- Deployment times
- Resource usage
- Package metrics

### Performance Reports
- JSON format metrics
- Step-by-step breakdown
- Historical data tracking
- Performance trends
- Resource usage patterns
- Package performance analysis

## Step-by-Step Workflow

### 1. Health Checks
```bash
# Run with health checks (default)
node scripts/improved-workflow.js

# Skip health checks
node scripts/improved-workflow.js --skip-health-checks
```

### 2. Branch Management
```bash
# Create feature branch
node scripts/improved-workflow.js

# Skip branch management
node scripts/improved-workflow.js --skip-branch
```

### 3. Authentication
```bash
# Run with authentication (default)
node scripts/improved-workflow.js

# Skip authentication
node scripts/improved-workflow.js --skip-auth
```

### 4. Quality Checks
```bash
# Run quality checks (default)
node scripts/improved-workflow.js

# Skip quality checks
node scripts/improved-workflow.js --skip-tests
```

### 5. Build Process
```bash
# Run build (default)
node scripts/improved-workflow.js

# Skip build
node scripts/improved-workflow.js --skip-build
```

### 6. Deployment
```bash
# Deploy to preview (default)
node scripts/improved-workflow.js

# Skip deployment
node scripts/improved-workflow.js --skip-deploy
```

### 7. Pull Request Creation
```bash
# Create PR (default)
node scripts/improved-workflow.js
```

## State Management

The workflow maintains state for:
- Current step
- Completed steps
- Last error
- Start time
- Branch information
- Preview URLs
- Performance metrics

### Recovery
```bash
# Resume from last successful step
node scripts/improved-workflow.js --recover
```

## Output and Reports

### Preview URLs
- Saved to `temp/preview-urls.json`
- Included in PR description
- Accessible via dashboard

### Performance Reports
- Saved to `temp/metrics/workflow-metrics-{timestamp}.json`
- Includes step durations
- Tracks total workflow time

### Summary Reports
- Saved to `temp/reports/workflow-summary-{timestamp}.json`
- Includes branch info
- Contains preview URLs
- Lists step durations

## Error Handling

The workflow provides:
- Detailed error messages
- Error state persistence
- Recovery mechanisms
- Performance impact tracking

## Recent Improvements

### 1. Enhanced Quality Checks
- TypeScript quality improvements
  - Query type validation
  - Import optimization
  - Module syntax validation
- Dead code detection
- Bundle size analysis
- Documentation freshness checks

### 2. Health Check System
- Comprehensive environment validation
- Dependency verification
- Build configuration checks
- Test setup validation

### 3. Performance Monitoring
- Step duration tracking
- Build time optimization
- Test execution metrics
- Deployment timing
- Bundle size tracking

### 4. State Management
- Workflow state persistence
- Recovery mechanisms
- Progress tracking
- Error state handling

### 5. Enhanced Reporting
- Performance metrics
- Health check results
- Error summaries
- Step completion status
- Bundle analysis reports
- Dead code reports
- Documentation quality metrics

## Related Documentation

- [Preview Deployment Guide](./preview-deployment-guide.md)
- [Firebase Configuration Guide](../firebase/firebase-config-guide.md)
- [GitHub Workflow Guide](../github/github-workflow-guide.md)
- [Health Check Guide](./health-check-guide.md)
- [Performance Monitoring Guide](./performance-monitoring-guide.md)

## Troubleshooting

### Common Issues

1. **Health Check Failures**
   - Check Node.js version
   - Verify PNPM installation
   - Ensure Firebase tools are installed
   - Check disk space
   - Verify network connectivity

2. **Performance Issues**
   - Review step durations
   - Check build times
   - Monitor test execution
   - Analyze deployment timing

3. **State Recovery**
   - Use `--recover` option
   - Check state file
   - Review error logs
   - Verify step completion

4. **Build Failures**
   - Check TypeScript errors
   - Verify dependencies
   - Review build logs
   - Check disk space

5. **Deployment Issues**
   - Verify Firebase auth
   - Check environment variables
   - Review channel limits
   - Check network connectivity

## Enhanced Dashboard

The workflow now includes a comprehensive dashboard that provides:

### 1. Workflow Status
- Visual timeline of all steps
- Current step highlighting
- Progress tracking
- Step completion status

### 2. Quick Actions
- Open Admin Portal
- Open Hours Portal
- Create Pull Request
- View CI Status
- View Documentation
- Run Tests

### 3. Branch Information
- Current branch
- Base branch
- Last commit
- Changes

### 4. Preview URLs
- Admin portal URL
- Hours portal URL
- Expiration information

### 5. Deployment Information
- Build status
- Duration metrics
- Environment details

### 6. Environment Comparison
- Development vs Production metrics
- Change indicators
- Performance comparisons

### 7. Error Summary
- Severity-based categorization
- Visual indicators
- Detailed messages

### 8. Next Steps
- Context-aware recommendations
- Quality check reminders
- PR creation guidance

### 9. Quality Metrics
- Bundle analysis
- Documentation quality
- Dead code detection
- Vulnerability reports
- Performance metrics

### 10. Detailed Reports
- Tabbed interface for different report types
- Interactive navigation
- Comprehensive data views

## Recent Improvements

### 1. Optimized Build Process
- Faster builds with caching
- Parallel package building
- Skip build optimization for previews

### 2. Enhanced Logging
- Structured log output
- Progress indicators
- Error highlighting

### 3. Better Error Handling
- Detailed error messages
- Recovery suggestions
- Error categorization

### 4. Improved Dashboard
- Modern, responsive design
- Interactive elements
- Real-time updates
- Comprehensive metrics

### 5. Workflow Integration
- Seamless step transitions
- State persistence
- Progress tracking

## Documentation Structure

The documentation is organized to provide a clear path through the development workflow:

1. **Automated Workflow Guide** (this document)
   - High-level overview
   - Step-by-step instructions
   - Command reference
   - Recent improvements

2. **Preview Deployment Guide**
   - Technical architecture
   - Preview channel management
   - Environment configuration
   - Troubleshooting

3. **Firebase Configuration Guide**
   - Project setup
   - Authentication
   - Environment variables
   - Security rules

4. **GitHub Workflow Guide**
   - PR creation
   - Branch protection
   - Review process
   - CI/CD integration

### How the Guides Work Together

The documentation is designed to work together:

1. **Start Here**: Begin with this guide to understand the overall workflow
2. **Deep Dive**: Use the specialized guides for detailed technical information
3. **Cross-Reference**: Follow the links between guides to find related information
4. **Troubleshoot**: Use the troubleshooting sections in each guide as needed

For example, when you reach the preview deployment step:
1. This guide tells you what happens and why
2. The Preview Deployment Guide provides technical details
3. The Firebase Guide explains the configuration
4. The GitHub Guide covers PR creation

## Troubleshooting

If you encounter issues:

1. **Check the Dashboard**
   - Open the dashboard with `pnpm run dashboard:open`
   - Review error summaries
   - Follow suggested next steps

2. **Common Issues**
   - Authentication problems: Run `firebase login`
   - Build failures: Check TypeScript errors
   - Preview issues: Verify environment variables
   - PR creation: Ensure GitHub CLI is installed

3. **Get Help**
   - Review the troubleshooting sections in each guide
   - Check the error messages in the dashboard
   - Consult the team documentation 

## Performance Optimization

The workflow includes several performance optimizations:

### 1. Build Caching
- **Caches build outputs** - Stores build artifacts for faster subsequent builds
- **Skips unnecessary rebuilds** - Only rebuilds changed packages
- **Configurable cache duration** - Adjustable cache lifetime settings
- **Cache invalidation** - Smart cache invalidation based on dependencies

### 2. Parallel Execution
- **Parallel quality checks** - Runs linting, type checking, and tests concurrently
- **Concurrent package building** - Builds independent packages in parallel
- **Parallel test execution** - Runs test suites concurrently
- **Resource-aware scheduling** - Adjusts parallelism based on system resources

### 3. Resource Management
- **Memory optimization** - Efficient memory usage during builds
- **CPU utilization** - Balanced CPU usage across processes
- **Disk space management** - Automatic cleanup of temporary files
- **Network optimization** - Efficient dependency downloads

## Security Features

The workflow includes comprehensive security measures:

### 1. Authentication
- **Firebase authentication** - Secure Firebase service access
- **Git authentication** - Secure repository access
- **Environment validation** - Secure environment configuration
- **Token management** - Secure handling of access tokens

### 2. Dependency Security
- **Vulnerability scanning** - Regular security audits of dependencies
- **License compliance** - Checks for compatible licenses
- **Security updates** - Automated security patch management
- **Dependency validation** - Verification of package integrity

### 3. Access Control
- **Role-based access** - Environment-specific permissions
- **Environment isolation** - Secure separation of environments
- **Secure configuration** - Protected sensitive data
- **Audit logging** - Security event tracking

## Command Reference

| Command | Description | Options |
|---------|-------------|---------|
| `pnpm run workflow` | Run complete workflow | `--skip-auth`, `--quick`, `--skip-health-checks` |
| `pnpm run preview` | Create preview deployment | `--skip-bundle-analysis`, `--skip-dead-code` |
| `pnpm run deploy` | Deploy to production | `--env=prod`, `--skip-tests` |
| `pnpm run quality` | Run quality checks | `--skip-doc-quality`, `--skip-typescript` |
| `pnpm run health` | Run health checks | `--skip-deps`, `--skip-env` |
| `pnpm run test` | Run tests | `--coverage`, `--watch` |
| `pnpm run build` | Build packages | `--clean`, `--skip-cache` |
| `pnpm run lint` | Run linting | `--fix`, `--quiet` |
| `pnpm run type-check` | Run type checking | `--strict`, `--watch` |

### Common Options

| Option | Description |
|--------|-------------|
| `--skip-auth` | Skip authentication checks |
| `--quick` | Run in quick mode (skip some checks) |
| `--skip-health-checks` | Skip health checks |
| `--skip-bundle-analysis` | Skip bundle size analysis |
| `--skip-dead-code` | Skip dead code detection |
| `--skip-doc-quality` | Skip documentation quality checks |
| `--skip-typescript` | Skip TypeScript checks |
| `--env=<env>` | Set environment (dev, test, prod) |
| `--clean` | Clean build directory before building |
| `--skip-cache` | Skip build cache |
| `--fix` | Automatically fix issues where possible |
| `--watch` | Run in watch mode |
| `--coverage` | Generate coverage report |
| `--strict` | Run in strict mode | 