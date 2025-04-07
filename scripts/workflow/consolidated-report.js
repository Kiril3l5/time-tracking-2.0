/**
 * Consolidated Report Generator
 * 
 * Generates a report for the workflow execution using existing metrics
 * and data from progress-tracker and performance-monitor.
 */

import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import process from 'node:process';
import { exec as _exec } from 'child_process';
import open from 'open';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default report path - unused but kept for future reference
// const DEFAULT_DASHBOARD_PATH = join(process.cwd(), 'preview-dashboard.html');

// Default template if the main template cannot be found
const defaultTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <link rel="stylesheet" href="dashboard.css">
</head>
<body>
    <div class="dashboard">
        <header>
            <h1>{{TITLE}}</h1>
            <div class="metadata">{{TIMESTAMP}}</div>
        </header>
        
        <!-- Status Panel -->
        <div class="overview">
            <div class="column">
                <div class="panel">
                    <div class="status-indicator">
                        <div class="status-icon {{STATUS_CLASS}}">{{STATUS_ICON}}</div>
                        <div class="status-text">{{STATUS_TEXT}}</div>
                    </div>
                    
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-label">Total Duration</div>
                            <div class="metric-value">{{DURATION}}</div>
                        </div>
                        
                        <div class="metric">
                            <div class="metric-label">Warnings</div>
                            <div class="metric-value">{{WARNING_COUNT}}</div>
                        </div>
                        
                        <div class="metric">
                            <div class="metric-label">Errors</div>
                            <div class="metric-value">{{ERROR_COUNT}}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Critical Errors - Always visible at the top if there are errors -->
                {{CRITICAL_ERRORS}}
            </div>
            
            <div class="column">
                <!-- Preview URLs - If available -->
                {{PREVIEW_URLS}}
            </div>
        </div>
        
        <!-- Workflow Timeline -->
        <div class="panel">
            <h2>Workflow Timeline</h2>
            <div class="timeline-chart" id="timeline-container">
                <!-- Timeline chart will be rendered by JavaScript -->
            </div>
        </div>
        
        <!-- Warnings Panel -->
        <div class="panel">
            <h2>Warnings & Notices</h2>
            <ul class="warnings-list">
                {{WARNINGS}}
            </ul>
        </div>
        
        <!-- Build Status -->
        <div class="panel">
            <h2>Build Status</h2>
            <div class="status-indicator">
                <div class="status-icon {{BUILD_STATUS_CLASS}}">{{BUILD_STATUS_ICON}}</div>
                <div class="status-text">
                    <div>{{BUILD_STATUS_TEXT}}</div>
                    <div class="metric-label">Duration: {{BUILD_DURATION}}</div>
                </div>
            </div>
            
            <!-- Always show build details -->
            {{BUILD_DETAILS}}
        </div>
        
        <!-- Advanced Check Results -->
        {{ADVANCED_CHECKS}}
        
        <!-- Workflow Options -->
        <div class="panel">
            <h2>Workflow Options</h2>
            <pre>{{WORKFLOW_OPTIONS}}</pre>
        </div>
        
        <!-- Channel Cleanup -->
        <div class="panel">
            <h2>Channel Cleanup Results</h2>
            {{CHANNEL_CLEANUP}}
        </div>
    </div>
    
    <script>
        // Initialize the dashboard when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            // Create timeline visualization
            renderWorkflowTimeline();
            
            // Setup accordions
            setupAccordions();
            
            // Add warning action handlers
            setupWarningActions();
        });
        
        // Setup accordion functionality
        function setupAccordions() {
            const accordionHeaders = document.querySelectorAll('.accordion-header');
            
            accordionHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    // Toggle active class
                    const accordionItem = header.parentElement;
                    accordionItem.classList.toggle('active');
                    
                    // Toggle content visibility
                    const content = accordionItem.querySelector('.accordion-content');
                    if (content) {
                        content.style.maxHeight = content.style.maxHeight ? null : content.scrollHeight + 'px';
                    }
                    
                    // Toggle arrow
                    const arrow = header.querySelector('.toggle');
                    if (arrow) {
                        arrow.textContent = arrow.textContent === '▼' ? '▲' : '▼';
                    }
                });
            });
        }
        
        // Handle warning action buttons
        function setupWarningActions() {
            document.querySelectorAll('.warning-actions .action-button').forEach(button => {
                button.addEventListener('click', function() {
                    const action = this.textContent.toLowerCase();
                    const warningElement = this.closest('.warning-item');
                    
                    if (action.includes('dismiss')) {
                        warningElement.style.display = 'none';
                    } else if (action.includes('fix')) {
                        alert('This would open the file in your editor');
                    } else if (action.includes('docs')) {
                        alert('This would open documentation');
                    } else if (action.includes('details')) {
                        alert('This would show additional details');
                    }
                });
            });
        }
        
        // Create a better workflow timeline visualization
        function renderWorkflowTimeline() {
            const container = document.getElementById('timeline-container');
            if (!container) return;
            
            console.log("WORKFLOW_STEPS_JSON available:", typeof WORKFLOW_STEPS_JSON !== 'undefined');
            
            // Check if WORKFLOW_STEPS_JSON is available
            if (typeof WORKFLOW_STEPS_JSON === 'undefined' || !WORKFLOW_STEPS_JSON || WORKFLOW_STEPS_JSON.length === 0) {
                container.innerHTML = '<div class="empty-timeline">No workflow steps available</div>';
                return;
            }
            
            console.log("Steps found:", WORKFLOW_STEPS_JSON.length);
            
            // Group steps by phase
            const phases = {};
            let totalDuration = 0;
            
            WORKFLOW_STEPS_JSON.forEach(step => {
                if (!phases[step.phase]) {
                    phases[step.phase] = {
                        name: step.phase,
                        steps: [],
                        totalDuration: 0
                    };
                }
                
                phases[step.phase].steps.push(step);
                phases[step.phase].totalDuration += step.duration;
                totalDuration += step.duration;
            });
            
            console.log("Phases:", Object.keys(phases));
            
            // Create SVG for visualization
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", "100%");
            // Adjust SVG height based on the number of steps
            const phaseCount = Object.keys(phases).length;
            const stepCount = WORKFLOW_STEPS_JSON.length;
            // Height calculation: 50px padding + (60px per phase + 30px per step)
            const svgHeight = 50 + (phaseCount * 60) + (stepCount * 30);
            svg.setAttribute("height", svgHeight);
            svg.classList.add("timeline-svg");
            container.appendChild(svg);
            
            // Create timeline
            const timelineStartX = 250; // Increased from 150px to give more space for step names
            const timelineWidth = container.clientWidth - timelineStartX - 20;
            let yPosition = 30;
            
            // Draw timeline header
            const timelineHeader = document.createElementNS("http://www.w3.org/2000/svg", "line");
            timelineHeader.setAttribute("x1", timelineStartX);
            timelineHeader.setAttribute("y1", 20);
            timelineHeader.setAttribute("x2", timelineStartX + timelineWidth);
            timelineHeader.setAttribute("y2", 20);
            timelineHeader.setAttribute("stroke", "#e1e4e8");
            timelineHeader.setAttribute("stroke-width", "2");
            svg.appendChild(timelineHeader);
            
            // Add time markers
            const timeMarkers = [0, 0.25, 0.5, 0.75, 1];
            timeMarkers.forEach(marker => {
                const xPos = timelineStartX + (timelineWidth * marker);
                
                // Marker line
                const markerLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                markerLine.setAttribute("x1", xPos);
                markerLine.setAttribute("y1", 15);
                markerLine.setAttribute("x2", xPos);
                markerLine.setAttribute("y2", 25);
                markerLine.setAttribute("stroke", "#586069");
                markerLine.setAttribute("stroke-width", "1");
                svg.appendChild(markerLine);
                
                // Marker text
                const markerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                markerText.setAttribute("x", xPos);
                markerText.setAttribute("y", 10);
                markerText.setAttribute("text-anchor", "middle");
                markerText.setAttribute("font-size", "12");
                markerText.setAttribute("fill", "#586069");
                markerText.textContent = Math.round(marker * 100) + "%";
                svg.appendChild(markerText);
            });
            
            // Draw phases
            Object.values(phases).forEach(phase => {
                // Phase header
                const phaseText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                phaseText.setAttribute("x", "10");
                phaseText.setAttribute("y", yPosition + 20);
                phaseText.setAttribute("font-size", "14");
                phaseText.setAttribute("font-weight", "bold");
                phaseText.textContent = phase.name;
                svg.appendChild(phaseText);
                
                // Phase timeline
                const phaseTimeline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                phaseTimeline.setAttribute("x", timelineStartX);
                phaseTimeline.setAttribute("y", yPosition + 10);
                phaseTimeline.setAttribute("width", (phase.totalDuration / totalDuration) * timelineWidth);
                phaseTimeline.setAttribute("height", "20");
                phaseTimeline.setAttribute("fill", "#0366d6");
                phaseTimeline.setAttribute("rx", "3");
                svg.appendChild(phaseTimeline);
                
                // Phase duration text
                const phaseDuration = document.createElementNS("http://www.w3.org/2000/svg", "text");
                phaseDuration.setAttribute("x", timelineStartX + (phase.totalDuration / totalDuration) * timelineWidth + 5);
                phaseDuration.setAttribute("y", yPosition + 25);
                phaseDuration.setAttribute("font-size", "12");
                phaseDuration.setAttribute("fill", "#24292e");
                phaseDuration.textContent = formatDuration(phase.totalDuration);
                svg.appendChild(phaseDuration);
                
                yPosition += 40;
                
                // Draw steps
                let stepOffset = 0;
                phase.steps.forEach(step => {
                    // Step text
                    const stepText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    stepText.setAttribute("x", "30");
                    stepText.setAttribute("y", yPosition + 15);
                    stepText.setAttribute("font-size", "12");
                    stepText.textContent = step.name;
                    svg.appendChild(stepText);
                    
                    // Step timeline bar
                    const stepWidth = (step.duration / totalDuration) * timelineWidth;
                    const stepX = timelineStartX + (stepOffset / totalDuration) * timelineWidth;
                    
                    const stepTimeline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    stepTimeline.setAttribute("x", stepX);
                    stepTimeline.setAttribute("y", yPosition + 5);
                    stepTimeline.setAttribute("width", Math.max(stepWidth, 2)); // Ensure visibility
                    stepTimeline.setAttribute("height", "15");
                    stepTimeline.setAttribute("fill", step.success ? "#2cbe4e" : "#cb2431");
                    stepTimeline.setAttribute("rx", "2");
                    svg.appendChild(stepTimeline);
                    
                    // Step duration text (if enough space)
                    if (stepWidth > 30) {
                        const stepDuration = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        stepDuration.setAttribute("x", stepX + 5);
                        stepDuration.setAttribute("y", yPosition + 16);
                        stepDuration.setAttribute("font-size", "10");
                        stepDuration.setAttribute("fill", "white");
                        stepDuration.textContent = formatDuration(step.duration);
                        svg.appendChild(stepDuration);
                    }
                    
                    stepOffset += step.duration;
                    yPosition += 30;
                });
                
                // Add space between phases
                yPosition += 20;
            });
        }
        
        // Helper function to format duration
        function formatDuration(ms) {
            if (typeof ms !== 'number' || isNaN(ms)) return '0ms';
            
            if (ms < 1000) {
                return ms + 'ms';
            } else if (ms < 60000) {
                return (ms / 1000).toFixed(1) + 's';
            } else {
                const minutes = Math.floor(ms / 60000);
                const seconds = Math.floor((ms % 60000) / 1000);
                return minutes + 'm ' + (seconds > 0 ? seconds + 's' : '');
            }
        }
    </script>
</body>
</html>
`;

/**
 * Generate a consolidated report for the workflow
 * @param {Object} data Report data
 * @param {Object} buildMetrics Build metrics
 * @returns {Promise<Object>} Generated report
 */
export async function generateReport(data, buildMetrics) {
  logger.debug('Generating consolidated report from workflow data');
  logger.debug(`[Generate Report] Received buildMetrics argument: ${JSON.stringify(buildMetrics)}`);
  
  try {
    // Make sure we have the basic data structure
    const report = {
      timestamp: data.timestamp || new Date().toISOString(),
      metrics: data.metrics || { duration: 0 },
      preview: data.preview || null,
      workflow: data.workflow || { steps: [] },
      warnings: data.warnings || [],
      errors: data.errors || [],
      advancedChecks: data.advancedChecks || {},
      buildMetrics: buildMetrics || data.buildMetrics || {},
    };
    
    logger.debug(`[Generate Report] Constructed report object with buildMetrics: ${JSON.stringify(report.buildMetrics)}`);
    
    // Process steps by phase - make this more robust
    const stepsByPhase = {};
    const failedSteps = [];
    
    // Fix variable usage in steps by phase loop
    // Ensure we check both data.steps (new format) and data.workflow.steps (old format)
    const stepData = data.steps && Array.isArray(data.steps) 
      ? data.steps 
      : (data.workflow && data.workflow.steps ? data.workflow.steps : []);

    if (stepData.length > 0) {
      logger.debug(`Processing ${stepData.length} workflow steps`);
      
      // First log all steps for debugging
      stepData.forEach((step, index) => {
        // Different data formats may have success in different places
        const success = step.success !== undefined 
          ? step.success 
          : (step.result ? step.result.success : undefined);
          
        logger.debug(`Step ${index}: ${step.name}, phase: ${step.phase}, success: ${success}`);
      });
      
      // Group steps by phase
      stepData.forEach(step => {
        const phase = step.phase || 'Other';
        if (!stepsByPhase[phase]) {
          stepsByPhase[phase] = [];
        }
        stepsByPhase[phase].push(step);
        
        // Track failed steps - check both formats
        const isSuccess = step.success !== undefined 
          ? step.success 
          : (step.result ? step.result.success : true);
          
        if (isSuccess === false) {
          failedSteps.push(step);
        }
      });
    } else {
      logger.debug('No steps found in report data');
    }
    
    // Calculate status based on steps and warnings
    const hasErrors = (report.errors && report.errors.length > 0) || failedSteps.length > 0;
    const hasWarnings = report.warnings && report.warnings.filter(w => w.severity === 'warning').length > 0;
    
    const statusClass = hasErrors ? 'failure' : (hasWarnings ? 'warning' : 'success');
    const statusIcon = hasErrors ? '✗' : (hasWarnings ? '⚠' : '✓');
    const statusText = hasErrors ? 'Workflow Failed' : (hasWarnings ? 'Completed with Warnings' : 'Workflow Successful');
    
    // Build metrics processing
    const buildSuccess = report.buildMetrics && report.buildMetrics.success !== false;
    const buildStatusClass = buildSuccess ? 'success' : 'failure';
    const buildStatusIcon = buildSuccess ? '✓' : '✗';
    const buildStatusText = buildSuccess ? 'Build Successful' : 'Build Failed';
    const buildDuration = report.buildMetrics && report.buildMetrics.duration 
      ? formatDuration(report.buildMetrics.duration) 
      : 'N/A';
    
    // Prepare warnings and errors for the dashboard
    const formattedWarnings = [];
    const criticalErrors = [];
    const buildInfoItems = []; // New array for build info messages
    
    // Process all warnings and errors
    [...(report.warnings || []), ...(report.errors || [])].forEach(item => {
      const severity = item.severity || (report.errors && report.errors.includes(item) ? 'error' : 'warning');
      const source = item.source || item.phase || 'System';
      const message = typeof item === 'string' ? item : item.message;
      
      // Skip build information messages - they'll be shown in the build section
      if (source === 'Build' && (
          message.startsWith('Starting build') || 
          message.startsWith('Building package') ||
          message.startsWith('Build output:') ||
          message.startsWith('Build progress:') ||
          message.includes('files, ') ||
          message.includes('KB total')
      )) {
        buildInfoItems.push({
          severity: 'info',
          source,
          message
        });
        return; // Skip adding to warnings
      }
      
      const formattedItem = {
        severity,
        source,
        message
      };
      
      if (severity === 'error') {
        criticalErrors.push(formattedItem);
      } else {
        formattedWarnings.push(formattedItem);
      }
    });
    
    // Also add failed steps as errors
    failedSteps.forEach(step => {
      const errorItem = {
        severity: 'error',
        source: step.phase || 'Workflow',
        message: `Step "${step.name}" failed: ${step.error || 'Unknown error'}`
      };
      criticalErrors.push(errorItem);
    });
    
    // Generate critical errors HTML if there are any
    const criticalErrorsHtml = criticalErrors.length > 0 
      ? `
        <div class="panel">
          <h2>⚠️ Critical Errors (${criticalErrors.length})</h2>
          <div class="accordion">
            <div class="accordion-item">
              <div class="accordion-header">
                <span class="category">Errors</span>
                <span class="count">${criticalErrors.length}</span>
                <span class="toggle">▼</span>
              </div>
              <div class="accordion-content">
                <ul class="warnings-list">
                  ${criticalErrors.map(error => `
                    <li class="warning-item">
                      <div class="warning-message">${error.message}</div>
                      <div class="warning-source">${error.source}</div>
                      <div class="warning-actions">
                        <button class="action-button">Fix Now</button>
                        <button class="action-button">View Details</button>
                        <button class="action-button">Dismiss</button>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ` 
      : '';
    
    // Generate warnings HTML
    const warningsHtml = formattedWarnings.length > 0
      ? formattedWarnings.map(warning => `
        <li class="warning-item">
          <div class="warning-message">${warning.message}</div>
          <div class="warning-source">${warning.source}</div>
          <div class="warning-actions">
            ${generateWarningActions(warning)}
          </div>
        </li>
      `).join('')
      : '<li class="warning-item">No warnings or notices</li>';
    
    // Generate detailed build info for failed builds
    const buildDetailsHtml = buildSuccess
      ? `
        <div class="build-details">
          <h3>Build Information</h3>
          <ul class="build-info-list">
            ${buildInfoItems.map(item => `
              <li class="build-info-item">
                <div class="build-info-message">${item.message}</div>
              </li>
            `).join('')}
            ${data.performance ? `
              <li class="build-info-item">
                <div class="build-info-message">Setup Phase: ${formatDuration(data.performance.phaseDurations.setup)}</div>
              </li>
              <li class="build-info-item">
                <div class="build-info-message">Validation Phase: ${formatDuration(data.performance.phaseDurations.validation)}</div>
              </li>
              <li class="build-info-item">
                <div class="build-info-message">Build Phase: ${formatDuration(data.performance.phaseDurations.build)}</div>
              </li>
              <li class="build-info-item">
                <div class="build-info-message">Deploy Phase: ${formatDuration(data.performance.phaseDurations.deploy)}</div>
              </li>
              <li class="build-info-item">
                <div class="build-info-message">Results Phase: ${formatDuration(data.performance.phaseDurations.results)}</div>
              </li>
            ` : ''}
            ${buildInfoItems.length === 0 && !data.performance ? '<li>No detailed build information available</li>' : ''}
          </ul>
        </div>
      `
      : `
        <div class="build-details">
          <h3>Build Failure Details</h3>
          ${report.buildMetrics.error 
            ? `<pre class="error-log">${report.buildMetrics.error}</pre>` 
            : '<p>No detailed error information available</p>'}
        </div>
      `;
    
    // Prepare workflow steps data for the timeline
    // First, collect all possible workflow steps for debugging
    const allStepSources = {
      steps: data.steps && Array.isArray(data.steps) ? data.steps.length : 0,
      stepData: Array.isArray(stepData) ? stepData.length : 0,
      workflowSteps: data.workflowSteps && typeof data.workflowSteps.values === 'function' 
        ? Array.from(data.workflowSteps.values()).length : 0,
      workflowStepsObject: data.workflow && data.workflow.steps && !Array.isArray(data.workflow.steps)
        ? Object.keys(data.workflow.steps).length : 0,
      workflowStepsArray: data.workflow && data.workflow.steps && Array.isArray(data.workflow.steps)
        ? data.workflow.steps.length : 0
    };
    
    logger.debug(`Step sources: ${JSON.stringify(allStepSources, null, 2)}`);
    
    // Get all possible steps from all sources
    const allPossibleSteps = [
      ...(data.steps || []),
      ...(Array.isArray(stepData) ? stepData : []),
      ...(data.workflowSteps && typeof data.workflowSteps.values === 'function' 
        ? Array.from(data.workflowSteps.values()) : []),
      ...(data.workflow && data.workflow.steps && Array.isArray(data.workflow.steps)
        ? data.workflow.steps : []),
      ...(data.workflow && data.workflow.steps && !Array.isArray(data.workflow.steps)
        ? Object.values(data.workflow.steps) : [])
    ];
    
    logger.debug(`Total combined steps: ${allPossibleSteps.length}`);
    
    // Filter duplicates by name+phase
    const uniqueMap = new Map();
    allPossibleSteps.forEach(step => {
      if (!step) return;
      const key = `${step.name}|${step.phase}`;
      if (!uniqueMap.has(key) || step.duration > (uniqueMap.get(key).duration || 0)) {
        uniqueMap.set(key, step);
      }
    });
    
    const uniqueSteps = Array.from(uniqueMap.values());
    logger.debug(`Unique steps after deduplication: ${uniqueSteps.length}`);
    
    const workflowStepsJson = JSON.stringify(
      uniqueSteps.map(step => ({
        name: step.name || 'Unknown Step',
        phase: step.phase || 'Other',
        duration: parseInt(step.duration || 0, 10),
        success: step.success !== undefined ? step.success : (step.result ? step.result.success : true),
        error: step.error || null,
        timestamp: step.timestamp || new Date().toISOString()
      }))
    );
    
    logger.debug(`Generated workflow steps JSON, found ${JSON.parse(workflowStepsJson).length} steps`);
    
    // Generate preview URLs section if available
    const previewUrlsHtml = report.preview && report.preview.urls && report.preview.urls.length > 0
      ? `
        <div class="panel">
          <h2>Preview URLs</h2>
          <div class="preview-links">
            ${report.preview.urls.map(link => `
              <div class="preview-link">
                <div class="preview-label">${link.label || 'Preview'}</div>
                <a href="${link.url}" target="_blank" class="preview-url">${link.url}</a>
                ${link.channel ? `<div class="preview-channel">${link.channel}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';
    
    // Generate workflow options
    const workflowOptionsHtml = data.options && Object.keys(data.options).length > 0
      ? `
        <ul class="options-list">
          ${Object.entries(data.options).map(([key, value]) => `
            <li class="option-item">
              <span class="option-key">${key}:</span>
              <span class="option-value">${value === true ? 'Yes' : value === false ? 'No' : value}</span>
            </li>
          `).join('')}
        </ul>
      `
      : '<p>No workflow options specified</p>';
    
    // Generate channel cleanup results if available
    const channelCleanupHtml = data.channelCleanup && Object.keys(data.channelCleanup).length > 0
      ? `
        <div class="channel-cleanup-summary">
          <div class="cleanup-stat">
            <span class="stat-label">Sites Processed:</span>
            <span class="stat-value">${data.channelCleanup.sitesProcessed || 0}</span>
          </div>
          <div class="cleanup-stat">
            <span class="stat-label">Channels Found:</span>
            <span class="stat-value">${data.channelCleanup.totalChannels || 0}</span>
          </div>
          <div class="cleanup-stat">
            <span class="stat-label">Channels Deleted:</span>
            <span class="stat-value">${data.channelCleanup.deletedCount || 0}</span>
          </div>
          <div class="cleanup-stat">
            <span class="stat-label">Errors:</span>
            <span class="stat-value">${data.channelCleanup.errors && data.channelCleanup.errors.length || 0}</span>
          </div>
        </div>
      `
      : '<p>No channel cleanup data available</p>';
    
    // Generate advanced checks HTML
    const advancedChecksHtml = _generateAdvancedChecksHtml(report.advancedChecks);
    
    // Replace template placeholders
    const htmlContent = defaultTemplate
      .replace(/{{TITLE}}/g, 'Workflow Dashboard')
      .replace(/{{TIMESTAMP}}/g, new Date(report.timestamp).toLocaleString())
      .replace(/{{DURATION}}/g, formatDuration(report.metrics.duration))
      .replace(/{{WARNING_COUNT}}/g, formattedWarnings.length)
      .replace(/{{ERROR_COUNT}}/g, criticalErrors.length)
      .replace(/{{STATUS_CLASS}}/g, statusClass)
      .replace(/{{STATUS_ICON}}/g, statusIcon)
      .replace(/{{STATUS_TEXT}}/g, statusText)
      .replace(/{{CRITICAL_ERRORS}}/g, criticalErrorsHtml)
      .replace(/{{PREVIEW_URLS}}/g, previewUrlsHtml)
      .replace(/{{WARNINGS}}/g, warningsHtml)
      .replace(/{{WORKFLOW_STEPS_JSON}}/g, `var WORKFLOW_STEPS_JSON = ${workflowStepsJson};`)
      .replace(/{{BUILD_STATUS_CLASS}}/g, buildStatusClass)
      .replace(/{{BUILD_STATUS_ICON}}/g, buildStatusIcon)
      .replace(/{{BUILD_STATUS_TEXT}}/g, buildStatusText)
      .replace(/{{BUILD_DURATION}}/g, buildDuration)
      .replace(/{{BUILD_DETAILS}}/g, buildDetailsHtml)
      .replace(/{{ADVANCED_CHECKS}}/g, advancedChecksHtml)
      .replace(/{{WORKFLOW_OPTIONS}}/g, workflowOptionsHtml)
      .replace(/{{CHANNEL_CLEANUP}}/g, channelCleanupHtml);
    
    // Debugging - output what we're using to create the timeline
    logger.debug(`Timeline will use ${JSON.parse(workflowStepsJson).length} workflow steps`);
    
    // Write the HTML to a file
    const outputPath = data.outputPath || join(process.cwd(), 'dashboard.html');
    await writeFile(outputPath, htmlContent, 'utf8');
    logger.info(`✨ Dashboard generated at: ${outputPath}`);
    
    // Open the HTML in the browser if not in a CI environment
    if (process.env.CI !== 'true') {
      try {
        await open(outputPath);
        logger.info('✨ Dashboard opened in your browser');
      } catch (error) {
        logger.warn(`Could not open browser: ${error.message}`);
      }
    }
    
    return {
      outputPath,
      data: report
    };
  } catch (error) {
    logger.error(`Error generating consolidated report: ${error.message}`);
    logger.debug(error);
    throw error;
  }
}

/**
 * Generate appropriate action buttons for a warning
 * @param {Object} warning - Warning object
 * @returns {string} HTML for action buttons
 */
function generateWarningActions(warning) {
  const actions = [];
  const message = warning.message || '';
  
  if (message.includes('TypeScript') || message.includes('type')) {
    actions.push('<button class="action-button">Fix Type Issue</button>');
  }
  
  if (message.includes('Lint') || message.includes('ESLint')) {
    actions.push('<button class="action-button">Run ESLint Fix</button>');
  }
  
  if (message.includes('Documentation')) {
    actions.push('<button class="action-button">View Docs</button>');
  }
  
  if (message.includes('Build')) {
    actions.push('<button class="action-button">View Build Log</button>');
  }
  
  // Always add dismiss option
  actions.push('<button class="action-button">Dismiss</button>');
  
  return actions.join('');
}

/**
 * Load existing metrics from temp files
 * @returns {Object} Metrics data
 */
function _loadExistingMetrics() {
  try {
    const result = {
      metrics: {},
      steps: [],
      warnings: [],
      errors: []
    };
    
    // Check for the latest metrics file
    const metricsDir = join(process.cwd(), 'temp', 'metrics');
    if (existsSync(metricsDir)) {
      // Get most recent metrics file
      const metricsFiles = fs.readdirSync(metricsDir)
        .filter(f => f.startsWith('workflow-metrics-'))
        .sort()
        .reverse();
        
      if (metricsFiles.length > 0) {
        const latestMetricsPath = join(metricsDir, metricsFiles[0]);
        const metricsData = JSON.parse(readFileSync(latestMetricsPath, 'utf8'));
        
        // Extract step metrics
        if (metricsData.steps) {
          for (const [stepName, stepData] of Object.entries(metricsData.steps)) {
            result.steps.push({
              name: stepName,
              duration: stepData.duration,
              timestamp: stepData.startTime
            });
          }
        }
        
        // Extract overall metrics
        result.metrics.totalDuration = metricsData.totalDuration;
      }
    }
    
    // Check for the latest workflow state backup
    const backupDir = join(process.cwd(), 'temp', 'backups');
    if (existsSync(backupDir)) {
      // Get most recent backup file
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('workflow-state-'))
        .sort()
        .reverse();
        
      if (backupFiles.length > 0) {
        const latestBackupPath = join(backupDir, backupFiles[0]);
        const backupData = JSON.parse(readFileSync(latestBackupPath, 'utf8'));
        
        // Extract completedSteps
        if (backupData.completedSteps) {
          for (const step of backupData.completedSteps) {
            if (!result.steps.some(s => s.name === step.name)) {
              result.steps.push({
                name: step.name,
                result: step.result,
                timestamp: step.timestamp
              });
            }
          }
        }
        
        // Extract warnings and errors
        if (backupData.warnings) {
          result.warnings = backupData.warnings;
        }
        
        if (backupData.errors) {
          result.errors = backupData.errors;
        }
      }
    }
    
    return result;
  } catch (error) {
    logger.warn(`Failed to load existing metrics: ${error.message}`);
    return null;
  }
}

/**
 * Generate HTML report
 * @param {Object} report Report data
 * @returns {string} HTML report
 */
function _generateHtmlReport(report) {
  const formattedDuration = formatDuration(report.metrics.duration);
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Workflow Execution Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 2rem;
            background: #f8f9fa;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            color: #2c3e50;
            margin-bottom: 2rem;
          }
          h2 {
            color: #34495e;
            margin-top: 2rem;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #eee;
          }
          .timestamp {
            color: #7f8c8d;
            font-size: 0.9rem;
            margin-bottom: 2rem;
          }
          .section {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .url-card {
            border-left: 4px solid #3498db;
            padding-left: 1rem;
            margin-bottom: 1rem;
          }
          .url {
            color: #3498db;
            word-break: break-all;
          }
          .label {
            font-weight: bold;
            color: #7f8c8d;
            display: inline-block;
            width: 120px;
          }
          .workflow-info {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
          }
          .workflow-item {
            background: #f8f9fa;
            padding: 0.5rem 1rem;
            border-radius: 4px;
          }
          .success {
            color: #27ae60;
          }
          .error {
            color: #e74c3c;
          }
          .warning {
            color: #f39c12;
          }
          .timeline {
            margin: 2rem 0;
            position: relative;
          }
          .timeline::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            left: 20px;
            width: 2px;
            background: #eee;
          }
          .timeline-item {
            position: relative;
            padding-left: 40px;
            margin-bottom: 1.5rem;
          }
          .timeline-item:before {
            content: '';
            position: absolute;
            left: 16px;
            top: 0;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #3498db;
          }
          .timeline-header {
            font-weight: bold;
            margin-bottom: 0.5rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Workflow Execution Report</h1>
          <div class="timestamp">Generated: ${report.timestamp}</div>
          
          <h2>Preview URLs</h2>
          <div class="section">
            <div class="url-card">
              <div class="label">Hours App:</div>
              <div class="url">${report.preview.hours}</div>
            </div>
            <div class="url-card">
              <div class="label">Admin App:</div>
              <div class="url">${report.preview.admin}</div>
            </div>
            <div class="url-card">
              <div class="label">Channel ID:</div>
              <div>${report.preview.channelId}</div>
            </div>
          </div>

          <h2>Workflow Summary</h2>
          <div class="section">
            <div class="card">
              <div class="label">Duration:</div>
              <div>${formattedDuration}</div>
            </div>
            <div class="card">
              <div class="label">Branch:</div>
              <div>${report.workflow.git.branch || 'Unknown'}</div>
            </div>
            <div class="card">
              <div><span class="label">Options:</span></div>
              <div class="workflow-info">
                ${Object.entries(report.workflow.options || {})
                  .map(([key, value]) => `<div class="workflow-item">${key}: ${value}</div>`)
                  .join('')}
              </div>
            </div>
          </div>
          
          <h2>Workflow Steps</h2>
          <div class="section">
            <div class="timeline">
              ${report.workflow.steps.map(step => `
                <div class="timeline-item">
                  <div class="timeline-header">${step.name}</div>
                  <div>
                    ${step.duration ? `Duration: ${formatDuration(step.duration)}` : ''}
                    ${step.timestamp ? `Time: ${new Date(step.timestamp).toLocaleTimeString()}` : ''}
                  </div>
                  ${step.result ? 
                    `<div class="${step.result.success ? 'success' : 'error'}">
                      ${step.result.success ? '✓ Success' : '✗ Failed'}
                     </div>` 
                    : ''}
                </div>
              `).join('')}
            </div>
          </div>
          
          ${report.warnings && report.warnings.length > 0 ? `
            <h2>Warnings</h2>
            <div class="section">
              ${report.warnings.map(warning => `
                <div class="card warning">
                  <div>${warning.message}</div>
                  ${warning.timestamp ? `<div class="timestamp">Time: ${new Date(warning.timestamp).toLocaleString()}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${report.errors && report.errors.length > 0 ? `
            <h2>Errors</h2>
            <div class="section">
              ${report.errors.map(error => `
                <div class="card error">
                  <div>${error.message || error}</div>
                  ${error.timestamp ? `<div class="timestamp">Time: ${new Date(error.timestamp).toLocaleString()}</div>` : ''}
                  ${error.step ? `<div>Step: ${error.step}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </body>
    </html>
  `;
}

/**
 * Save report to file
 * @param {Object} report Report data
 * @param {string} htmlReport HTML report
 * @returns {Promise<Object>} Paths to saved files
 */
async function _saveReport(report, htmlReport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = join(process.cwd(), 'reports');
  const reportFile = join(reportDir, `workflow-report-${timestamp}.json`);
  const htmlFile = join(reportDir, `workflow-report-${timestamp}.html`);

  // Ensure reports directory exists
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  // Save JSON report
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  logger.info(`Saved JSON report to: ${reportFile}`);

  // Save HTML report
  await writeFile(htmlFile, htmlReport);
  logger.info(`Saved HTML report to: ${htmlFile}`);

  // Create latest symlink or copy for easy access
  const latestJsonFile = join(reportDir, 'latest-report.json');
  const latestHtmlFile = join(reportDir, 'latest-report.html');
  
  try {
    await writeFile(latestJsonFile, JSON.stringify(report, null, 2));
    await writeFile(latestHtmlFile, htmlReport);
    logger.info('Updated latest report files for quick access');
  } catch (error) {
    logger.warn(`Failed to create latest report links: ${error.message}`);
  }
  
  return {
    json: reportFile,
    html: htmlFile,
    latestJson: latestJsonFile,
    latestHtml: latestHtmlFile
  };
}

/**
 * Load the report template
 * @returns {Promise<string>} The template HTML
 */
async function _loadTemplate() {
  // Use the defaultTemplate directly since we've already defined it
  // and the external template path doesn't exist
  return defaultTemplate;
}

/**
 * Generates a time-series chart for bundle size trends
 * @param {Object} bundleData - Bundle metrics data
 * @returns {string} - HTML for the chart
 */
function generateBundleSizeTrendChart(bundleData) {
  if (!bundleData || !bundleData.packages) {
    return '';
  }
  
  // Create data for the chart based on package sizes
  const packages = Object.keys(bundleData.packages);
  
  // If we have historical data, use it to generate the trend
  const hasHistory = bundleData.history && Object.keys(bundleData.history).length > 0;
  
  if (!hasHistory) {
    return `
    <div class="chart-container">
      <h3>Bundle Size Trends</h3>
      <div class="empty-chart-message">
        <p>No historical data available yet. Trends will appear after multiple workflow runs.</p>
      </div>
    </div>`;
  }
  
  // Generate dates for the X-axis (use last 5 data points for simplicity)
  // In a real scenario, these would come from the actual timestamps
  const dates = [];
  const today = new Date();
  for (let i = 4; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 3); // Every 3 days for example
    dates.push(date.toLocaleDateString());
  }
  
  // Generate random historical data for demonstration
  // In a real scenario, this would use actual historical data
  const chartData = {};
  
  // Take top 3 packages for the chart to avoid clutter
  const topPackages = packages.slice(0, 3);
  
  topPackages.forEach(pkg => {
    const currentSize = parseFloat(bundleData.packages[pkg].totalSize);
    
    // Create a realistic trend (randomized for demonstration)
    chartData[pkg] = dates.map((date, index) => {
      // Last point is the current size
      if (index === dates.length - 1) {
        return currentSize;
      }
      
      // Earlier points are random variations around current size
      const variation = Math.random() * 0.2 - 0.1; // -10% to +10%
      return Math.max(0, currentSize * (1 + variation)).toFixed(2);
    });
  });
  
  // Get the maximum value for Y-axis scaling
  const maxValue = Math.max(
    ...Object.values(chartData).flat().map(v => parseFloat(v))
  ) * 1.1; // Add 10% padding
  
  // Generate the SVG chart
  const width = 800;
  const height = 400;
  const padding = 50;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);
  
  // X and Y scales
  const xStep = chartWidth / (dates.length - 1);
  const yScale = chartHeight / maxValue;
  
  // Generate paths for each package
  const paths = topPackages.map((pkg, pkgIndex) => {
    const points = chartData[pkg].map((value, index) => {
      const x = padding + (index * xStep);
      const y = height - padding - (value * yScale);
      return `${x},${y}`;
    });
    
    // Generate a unique color for each package
    const colors = ['#0366d6', '#28a745', '#d73a49'];
    const color = colors[pkgIndex % colors.length];
    
    return {
      pkg,
      path: `<path d="M${points.join(' L')}" fill="none" stroke="${color}" stroke-width="2" />`,
      color
    };
  });
  
  // Generate SVG markup as a string
  let svgMarkup = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add X and Y axis
  svgMarkup += `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d1d5da" />`;
  svgMarkup += `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d1d5da" />`;
  
  // Add X axis labels
  dates.forEach((date, i) => {
    svgMarkup += `<text x="${padding + (i * xStep)}" y="${height - padding + 20}" text-anchor="middle" font-size="12" fill="#586069">${date}</text>`;
  });
  
  // Add Y axis labels
  [0, 0.25, 0.5, 0.75, 1].forEach(percent => {
    const value = (maxValue * percent).toFixed(1);
    const y = height - padding - (value * yScale);
    svgMarkup += `<line x1="${padding - 5}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e1e4e8" stroke-dasharray="5,5" />`;
    svgMarkup += `<text x="${padding - 10}" y="${y + 5}" text-anchor="end" font-size="12" fill="#586069">${value} KB</text>`;
  });
  
  // Add data paths
  paths.forEach(p => {
    svgMarkup += p.path;
  });
  
  // Add data points
  topPackages.forEach((pkg, pkgIndex) => {
    chartData[pkg].forEach((value, index) => {
      const x = padding + (index * xStep);
      const y = height - padding - (value * yScale);
      svgMarkup += `<circle cx="${x}" cy="${y}" r="4" fill="${paths[pkgIndex].color}" />`;
      svgMarkup += `<title>${pkg}: ${value} KB</title>`;
    });
  });
  
  // Close SVG tag
  svgMarkup += `</svg>`;
  
  // Generate legend as a string
  let legendMarkup = `<div class="chart-legend">`;
  
  paths.forEach(p => {
    legendMarkup += `<div class="legend-item">`;
    legendMarkup += `<span class="legend-color" style="background-color: ${p.color}"></span>`;
    legendMarkup += `<span class="legend-label">${p.pkg}</span>`;
    legendMarkup += `</div>`;
  });
  
  legendMarkup += `</div>`;
  
  // Return the complete chart container
  return `
  <div class="chart-container">
    <h3>Bundle Size Trends</h3>
    ${svgMarkup}
    ${legendMarkup}
  </div>
  `;
}

/**
 * Helper function for dashboard display: Format file size in bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size (e.g., "1.23 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  // Keep to 2 decimal places max and remove trailing zeros
  return (bytes / Math.pow(1024, i)).toFixed(2).replace(/\.0+$/, '') + ' ' + units[i];
}

/**
 * Format a camelCase or snake_case string to a display-friendly format
 * Helper function for the dashboard
 * @param {string} name - The name to format
 * @returns {string} Formatted name
 */
function formatDisplayName(name) {
  if (!name) return '';
  
  // Replace underscores and dashes with spaces
  let formatted = name.replace(/[_-]/g, ' ');
  
  // Convert camelCase to spaces
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Capitalize first letter of each word
  return formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate HTML content for advanced check results
 * @param {Object} advancedChecks - Advanced check results
 * @returns {string} - HTML content
 */
function _generateAdvancedChecksHtml(advancedChecks) {
  if (!advancedChecks || Object.keys(advancedChecks).length === 0) {
    return '';
  }
  
  return `
  <div class="panel">
    <h2>Advanced Check Results</h2>
    <div class="accordion">
      ${Object.entries(advancedChecks).map(([checkName, checkResult]) => {
        // Fix for TypeScript and Lint checks being incorrectly shown as skipped
        // If we have success or warning data, the check wasn't skipped
        const isReallySkipped = checkResult.skipped === true && 
                               !checkResult.data && 
                               !checkResult.success && 
                               !checkResult.warning;
        
        // Determine status class
        const statusClass = isReallySkipped ? '' : 
                          (checkResult.success ? 'success' : 
                           (checkResult.warning ? 'warning' : 'failure'));
        
        return `
        <div class="accordion-item">
          <div class="accordion-header">
            <span class="category">${formatDisplayName(checkName)}</span>
            <span class="status ${statusClass}">
              ${isReallySkipped ? 'Skipped' : (checkResult.success ? 'Passed' : (checkResult.warning ? 'Warning' : 'Failed'))}
            </span>
            <span class="toggle">▼</span>
          </div>
          <div class="accordion-content">
            ${checkResult.message ? `<p>${checkResult.message}</p>` : ''}
            ${checkResult.error ? `<p>Error: ${checkResult.error}</p>` : ''}
            ${checkResult.data ? `
              <pre>${JSON.stringify(checkResult.data, null, 2)}</pre>
            ` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/**
 * Generate HTML panel for build metrics
 * @param {Object} buildMetrics - Build metrics data
 * @returns {string} - HTML content
 */
function _generateBuildMetricsHtml(buildMetrics) {
  if (!buildMetrics || (!buildMetrics.isValid && !buildMetrics.totalSize)) {
    return '';
  }
  
  // Ensure totalSize is properly formatted
  const totalSizeFormatted = buildMetrics.totalSizeFormatted || 
                            (buildMetrics.totalSize ? formatFileSize(buildMetrics.totalSize) : '0 B');
  
  // Ensure duration is properly formatted
  const durationFormatted = buildMetrics.durationFormatted || 
                           (buildMetrics.duration ? formatDuration(buildMetrics.duration) : '0s');
  
  // Calculate file count correctly
  const fileCount = buildMetrics.fileCount || 
                   Object.values(buildMetrics.packages || {})
                     .reduce((sum, pkg) => sum + (pkg.fileCount || 0), 0) || 
                   0;
  
  return `
  <div class="panel build-metrics">
    <h2>Build Metrics</h2>
    
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">📦</div>
        <div class="metric-title">Total Bundle Size</div>
        <div class="metric-value">${totalSizeFormatted}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">⏱️</div>
        <div class="metric-title">Build Time</div>
        <div class="metric-value">${durationFormatted}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">🗂️</div>
        <div class="metric-title">Total Files</div>
        <div class="metric-value">${fileCount}</div>
      </div>
    </div>
    
    ${buildMetrics.packages ? generatePackageDetailsHtml(buildMetrics.packages) : ''}
  </div>`;
}

/**
 * Generate HTML for package details
 * @param {Object} packages - Package details
 * @returns {string} - HTML content
 */
function generatePackageDetailsHtml(packages) {
  return `
  <div class="package-section">
    <h3>Package Details</h3>
    <div class="packages-grid">
      ${Object.entries(packages).map(([name, pkg]) => {
        // Ensure package size is properly formatted
        const pkgSize = pkg.totalSize || 
                       (pkg.rawSize ? formatFileSize(pkg.rawSize) : '0 B');
        
        // Ensure package duration is properly formatted
        const pkgDuration = pkg.duration || 
                           (pkg.rawDuration ? formatDuration(pkg.rawDuration) : '0s');
        
        return `
        <div class="package-card">
          <div class="package-name">${name}</div>
          <div class="package-metrics">
            <div class="package-metric">
              <span class="metric-label">Size</span>
              <span class="metric-value">${pkgSize}</span>
            </div>
            <div class="package-metric">
              <span class="metric-label">Files</span>
              <span class="metric-value">${pkg.fileCount || 0}</span>
            </div>
            <div class="package-metric">
              <span class="metric-label">Build Time</span>
              <span class="metric-value">${pkgDuration}</span>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/**
 * Format duration in milliseconds to a readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A';
  
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

export default {
  generateReport
}; 