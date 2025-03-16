import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../firebase/core/firebase';
import { TimeEntry } from '../../types/firestore';
import { createMetadata, updateMetadata } from '../metadata';

const COLLECTION = 'timeEntries';

/**
 * Time Entries API - Abstracts Firestore implementation details
 */
export const timeEntriesApi = {
  /**
   * Create a new time entry
   */
  async create(
    entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>, 
    currentUser: User
  ): Promise<string> {
    // Validate user can only create entries for themselves
    if (entry.userId !== currentUser.uid) {
      throw new Error('Users can only create time entries for themselves');
    }

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...entry,
      // Add metadata for security auditing
      ...createMetadata(currentUser),
      ...updateMetadata(currentUser),
    });
    
    return docRef.id;
  },

  /**
   * Get a time entry by ID
   */
  async getById(id: string): Promise<TimeEntry | null> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as TimeEntry;
  },

  /**
   * Update a time entry
   */
  async update(
    id: string, 
    data: Partial<TimeEntry>, 
    currentUser: User
  ): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Time entry not found');
    }
    
    const entry = docSnap.data() as TimeEntry;
    
    // Security check: Only owner can update their entries unless user is manager/admin
    // Note: This is also enforced by Firestore rules, but we add it here for defense in depth
    if (entry.userId !== currentUser.uid) {
      // Check if user has permission to update this entry
      // For simplicity, we'll let the Firestore rules handle this check
      // Full implementation would verify manager/admin status here
    }
    
    await updateDoc(docRef, {
      ...data,
      // Add metadata for security auditing
      ...updateMetadata(currentUser),
    });
  },

  /**
   * Delete a time entry (soft delete)
   */
  async softDelete(id: string, currentUser: User): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    
    await updateDoc(docRef, {
      isDeleted: true,
      // Add metadata for security auditing
      ...updateMetadata(currentUser),
    });
  },

  /**
   * Hard delete a time entry (only for admins)
   * Note: This is blocked by Firestore rules, but we keep it for admin tools
   */
  async hardDelete(id: string, currentUser: User): Promise<void> {
    // This operation should be restricted by Firestore rules
    // We keep it here for potential admin tooling via Firebase Functions
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  },

  /**
   * Get time entries by user ID and date range
   */
  async getByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TimeEntry[]> {
    const constraints: QueryConstraint[] = [
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('isDeleted', '==', false),
      orderBy('date', 'asc'),
    ];
    
    const q = query(collection(db, COLLECTION), ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as TimeEntry));
  },

  /**
   * Subscribe to time entries for a user and date range
   */
  onUserEntriesChange(
    userId: string,
    startDate: string,
    endDate: string,
    callback: (entries: TimeEntry[]) => void
  ): () => void {
    const constraints: QueryConstraint[] = [
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      where('isDeleted', '==', false),
      orderBy('date', 'asc'),
    ];
    
    const q = query(collection(db, COLLECTION), ...constraints);
    
    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as TimeEntry));
      
      callback(entries);
    });
  },
}; 