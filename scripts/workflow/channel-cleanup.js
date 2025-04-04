// Import necessary modules
import { logger } from '../utils/logger.js';
import { apiClient } from '../utils/api-client.js';
import getWorkflowState from './workflow-state.js';

/**
 * Find all artifacts for a specific channel
 * 
 * @param {string} channelId - Channel ID to find artifacts for
 * @returns {Promise<Array>} List of artifacts
 */
export async function findChannelArtifacts(channelId) {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }
  
  try {
    const response = await apiClient.get(`/channels/${channelId}/artifacts`);
    return response.data.artifacts || [];
  } catch (error) {
    logger.error(`Failed to find artifacts for channel ${channelId}: ${error.message}`);
    throw error;
  }
}

/**
 * Determine which artifacts should be deleted based on criteria
 * 
 * @param {Array} artifacts - List of artifacts
 * @param {Object} options - Filter options
 * @param {boolean} [options.keepLatest=true] - Keep the latest version
 * @param {number} [options.keepCount=2] - Number of versions to keep
 * @param {string} [options.olderThan] - ISO date string, delete versions older than this
 * @returns {Array} Artifacts to delete
 */
export function getArtifactsToDelete(artifacts, options = {}) {
  const { keepLatest = true, keepCount = 2, olderThan } = options;
  
  if (!artifacts || artifacts.length === 0) {
    return [];
  }
  
  // Sort by createdAt (newest first)
  const sorted = [...artifacts].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  // Apply keepLatest and keepCount
  let toKeep = [];
  
  if (keepLatest && sorted.length > 0) {
    toKeep.push(sorted[0]);
  }
  
  if (keepCount > 1) {
    toKeep = sorted.slice(0, keepCount);
  }
  
  // Filter by date if needed
  let toDelete = sorted.filter(artifact => !toKeep.includes(artifact));
  
  if (olderThan) {
    const olderThanDate = new Date(olderThan);
    toDelete = toDelete.filter(artifact => 
      new Date(artifact.createdAt) < olderThanDate
    );
  }
  
  return toDelete;
}

/**
 * Delete a list of artifacts
 * 
 * @param {Array} artifacts - Artifacts to delete
 * @returns {Promise<Array>} Results of deletion operations
 */
export async function deleteArtifacts(artifacts) {
  if (!artifacts || artifacts.length === 0) {
    return [];
  }
  
  const results = [];
  
  for (const artifact of artifacts) {
    try {
      await apiClient.delete(`/artifacts/${artifact.id}`);
      results.push({ id: artifact.id, success: true });
    } catch (error) {
      logger.error(`Failed to delete artifact ${artifact.id}: ${error.message}`);
      results.push({ 
        id: artifact.id, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return results;
}

/**
 * Cleanup a channel by removing old artifacts
 * 
 * @param {Object} options - Cleanup options
 * @param {string} options.channelId - Channel ID to clean
 * @param {boolean} [options.dryRun=false] - If true, will only list what would be deleted
 * @param {boolean} [options.keepLatest=true] - If true, will keep the latest version
 * @param {number} [options.keepCount=2] - Number of versions to keep (including latest)
 * @param {string} [options.olderThan] - ISO date string, delete versions older than this date
 * @returns {Promise<Object>} Cleanup result
 */
export async function cleanupChannel(options = {}) {
  const { channelId, dryRun = false, keepLatest = true, keepCount = 2, olderThan } = options;
  
  if (!channelId) {
    return { success: false, error: 'Channel ID is required for cleanup' };
  }
  
  try {
    // Find all artifacts for the channel
    const artifacts = await findChannelArtifacts(channelId);
    
    if (!artifacts || artifacts.length === 0) {
      return { success: true, message: `No artifacts found for channel: ${channelId}`, deletedCount: 0 };
    }
    
    // Select artifacts to delete
    const toDelete = getArtifactsToDelete(artifacts, { keepLatest, keepCount, olderThan });
    
    if (toDelete.length === 0) {
      return { success: true, message: `No artifacts to delete for channel: ${channelId}`, deletedCount: 0 };
    }
    
    // Generate deletion summary
    const deletionSummary = toDelete.map(artifact => ({
      id: artifact.id,
      version: artifact.version,
      createdAt: artifact.createdAt,
      size: artifact.size
    }));
    
    // In dry run mode, just return what would be deleted
    if (dryRun) {
      return {
        success: true,
        message: 'Dry run completed',
        wouldDelete: deletionSummary,
        deletedCount: 0,
        dryRun: true
      };
    }
    
    // Actually delete the artifacts
    const results = await deleteArtifacts(toDelete);
    
    // Analyze results
    const failedDeletions = results.filter(r => !r.success);
    
    return {
      success: failedDeletions.length === 0,
      message: `Deleted ${results.length - failedDeletions.length} of ${toDelete.length} artifacts`,
      deleted: deletionSummary.filter(d => !failedDeletions.some(f => f.id === d.id)),
      failed: failedDeletions,
      deletedCount: results.length - failedDeletions.length
    };
  } catch (error) {
    logger.error(`Channel cleanup error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      deletedCount: 0
    };
  }
}

/**
 * Cleanup a channel with workflow tracking integration
 *
 * @param {Object} options - Cleanup options
 * @param {string} options.channelId - Channel ID to clean
 * @param {boolean} [options.dryRun=false] - If true, will only list what would be deleted
 * @param {boolean} [options.keepLatest=true] - If true, will keep the latest version
 * @param {number} [options.keepCount=2] - Number of versions to keep (including latest)
 * @param {string} [options.olderThan] - ISO date string, delete versions older than this date
 * @param {string} [options.phase='Maintenance'] - Current workflow phase
 * @returns {Promise<Object>} Cleanup result
 */
export async function cleanupChannelWithWorkflowTracking(options = {}) {
  const {
    channelId,
    dryRun = false,
    keepLatest = true,
    keepCount = 2,
    olderThan,
    phase = 'Maintenance'
  } = options;
  
  // Get workflow state for tracking
  const workflowState = getWorkflowState();
  
  if (!channelId) {
    const error = 'Channel ID is required for cleanup';
    workflowState.addWarning(error, 'Channel Cleanup', phase);
    return { success: false, error };
  }
  
  const stepName = 'Channel Cleanup';
  const startTime = Date.now();
  
  // Start step tracking
  workflowState.setCurrentStep(stepName);
  
  try {
    // Find all artifacts for the channel
    const artifacts = await findChannelArtifacts(channelId);
    
    if (!artifacts || artifacts.length === 0) {
      const message = `No artifacts found for channel: ${channelId}`;
      workflowState.addWarning(message, stepName, phase);
      
      workflowState.completeStep(stepName, {
        success: true,
        message,
        deletedCount: 0,
        duration: Date.now() - startTime
      });
      
      return { success: true, message, deletedCount: 0 };
    }
    
    // Record stats about found artifacts
    workflowState.addWarning(`Found ${artifacts.length} artifacts for channel: ${channelId}`, stepName, phase, 'info');
    
    // Select artifacts to delete
    const toDelete = getArtifactsToDelete(artifacts, { keepLatest, keepCount, olderThan });
    
    if (toDelete.length === 0) {
      const message = `No artifacts to delete for channel: ${channelId}`;
      
      workflowState.completeStep(stepName, {
        success: true,
        message,
        deletedCount: 0,
        duration: Date.now() - startTime
      });
      
      return { success: true, message, deletedCount: 0 };
    }
    
    // Generate deletion summary
    const deletionSummary = toDelete.map(artifact => ({
      id: artifact.id,
      version: artifact.version,
      createdAt: artifact.createdAt,
      size: artifact.size
    }));
    
    // Record specific warnings about artifacts to be deleted
    workflowState.addWarning(`Will delete ${toDelete.length} artifacts from channel: ${channelId}${dryRun ? ' (dry run)' : ''}`, stepName, phase, 'info');
    
    if (toDelete.length > 5) {
      workflowState.addWarning(`Large cleanup: ${toDelete.length} artifacts will be deleted from channel: ${channelId}`, stepName, phase);
    }
    
    // In dry run mode, just return what would be deleted
    if (dryRun) {
      workflowState.completeStep(stepName, {
        success: true,
        message: `Dry run completed. Would delete ${toDelete.length} artifacts.`,
        duration: Date.now() - startTime
      });
      
      return {
        success: true,
        message: 'Dry run completed',
        wouldDelete: deletionSummary,
        deletedCount: 0,
        dryRun: true
      };
    }
    
    // Actually delete the artifacts
    const results = await deleteArtifacts(toDelete);
    
    // Analyze results
    const failedDeletions = results.filter(r => !r.success);
    
    if (failedDeletions.length > 0) {
      // Record specific warnings about failed deletions
      failedDeletions.forEach(failure => {
        workflowState.addWarning(`Failed to delete artifact: ${failure.id} - ${failure.error}`, stepName, phase);
      });
    }
    
    // Record results in metrics
    workflowState.updateMetrics({
      channelCleanup: {
        channelId,
        deletedCount: results.length - failedDeletions.length,
        failedCount: failedDeletions.length,
        totalFound: artifacts.length,
        dryRun: false
      }
    });
    
    // Record completion
    workflowState.completeStep(stepName, {
      success: failedDeletions.length === 0,
      message: `Deleted ${results.length - failedDeletions.length} of ${toDelete.length} artifacts`,
      duration: Date.now() - startTime
    });
    
    return {
      success: failedDeletions.length === 0,
      message: `Deleted ${results.length - failedDeletions.length} of ${toDelete.length} artifacts`,
      deleted: deletionSummary.filter(d => !failedDeletions.some(f => f.id === d.id)),
      failed: failedDeletions,
      deletedCount: results.length - failedDeletions.length
    };
  } catch (error) {
    // Record error as a warning
    workflowState.addWarning(`Channel cleanup error: ${error.message}`, stepName, phase);
    workflowState.trackError(error, stepName);
    
    // Complete step with failure
    workflowState.completeStep(stepName, {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
    
    return {
      success: false,
      error: error.message,
      deletedCount: 0
    };
  }
}

export default {
  findChannelArtifacts,
  getArtifactsToDelete,
  deleteArtifacts,
  cleanupChannel,
  cleanupChannelWithWorkflowTracking
}; 