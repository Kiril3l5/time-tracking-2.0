import { User } from 'firebase/auth';

/**
 * Standard metadata for document creation
 */
export interface CreationMetadata {
  createdAt: string;
  createdBy: string;
}

/**
 * Standard metadata for document updates
 */
export interface UpdateMetadata {
  updatedAt: string;
  updatedBy: string;
}

/**
 * Complete document metadata
 */
export interface DocumentMetadata extends CreationMetadata, UpdateMetadata {}

/**
 * Creates metadata for new document creation
 * @param user Current authenticated user
 * @returns Creation metadata
 */
export function createMetadata(user: User | null): CreationMetadata {
  if (!user) {
    throw new Error('User must be authenticated to create metadata');
  }
  
  return {
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  };
}

/**
 * Creates metadata for document updates
 * @param user Current authenticated user
 * @returns Update metadata
 */
export function updateMetadata(user: User | null): UpdateMetadata {
  if (!user) {
    throw new Error('User must be authenticated to update metadata');
  }
  
  return {
    updatedAt: new Date().toISOString(),
    updatedBy: user.uid
  };
}

/**
 * Creates full document metadata
 * @param user Current authenticated user
 * @returns Complete document metadata
 */
export function fullMetadata(user: User | null): DocumentMetadata {
  return {
    ...createMetadata(user),
    ...updateMetadata(user)
  };
} 