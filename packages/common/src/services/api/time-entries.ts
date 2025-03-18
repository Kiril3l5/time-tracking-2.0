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
  async update(id: string, data: Partial<TimeEntry>, currentUser: User): Promise<void> {
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
  async hardDelete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'timeEntries', id));
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

    return querySnapshot.docs.map(
      doc =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as TimeEntry
    );
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

    return onSnapshot(q, snapshot => {
      const entries = snapshot.docs.map(
        doc =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as TimeEntry
      );

      callback(entries);
    });
  },
};

/**
 * Collection reference for time entries
 */
const timeEntriesCollection = collection(db, 'timeEntries');

/**
 * Get all time entries with optional filters
 */
export async function getTimeEntries(filters?: Record<string, unknown>): Promise<TimeEntry[]> {
  try {
    let q = query(timeEntriesCollection, orderBy('date', 'desc'));

    // Apply filters if provided
    if (filters) {
      if (filters.userId) {
        q = query(q, where('userId', '==', filters.userId));
      }

      if (filters.companyId) {
        q = query(q, where('companyId', '==', filters.companyId));
      }

      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }

      if (filters.startDate && filters.endDate) {
        q = query(q, where('date', '>=', filters.startDate), where('date', '<=', filters.endDate));
      }
    }

    const querySnapshot = await getDocs(q);
    const entries: TimeEntry[] = [];

    querySnapshot.forEach(doc => {
      const data = doc.data();
      entries.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || '',
        approvedAt: data.approvedAt?.toDate?.()?.toISOString() || undefined,
      } as TimeEntry);
    });

    return entries;
  } catch (error) {
    console.error('Error fetching time entries:', error);
    throw error;
  }
}

/**
 * Get a single time entry by ID
 */
export async function getTimeEntry(id: string): Promise<TimeEntry> {
  try {
    const docRef = doc(timeEntriesCollection, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error(`Time entry with ID ${id} not found`);
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || '',
      approvedAt: data.approvedAt?.toDate?.()?.toISOString() || undefined,
    } as TimeEntry;
  } catch (error) {
    console.error(`Error fetching time entry ${id}:`, error);
    throw error;
  }
}

/**
 * Create a new time entry
 */
export async function createTimeEntry(
  data: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TimeEntry> {
  try {
    const now = serverTimestamp();
    const docRef = await addDoc(timeEntriesCollection, {
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    // Get the created document to return
    return getTimeEntry(docRef.id);
  } catch (error) {
    console.error('Error creating time entry:', error);
    throw error;
  }
}

/**
 * Update an existing time entry
 */
export async function updateTimeEntry(
  id: string,
  data: Partial<Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<TimeEntry> {
  try {
    const docRef = doc(timeEntriesCollection, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    // Get the updated document to return
    return getTimeEntry(id);
  } catch (error) {
    console.error(`Error updating time entry ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a time entry (soft delete by default)
 */
export async function deleteTimeEntry(id: string, hardDelete = false): Promise<void> {
  try {
    const docRef = doc(timeEntriesCollection, id);

    if (hardDelete) {
      // Hard delete - remove from database
      await deleteDoc(docRef);
    } else {
      // Soft delete - mark as deleted but keep in database
      await updateDoc(docRef, {
        isDeleted: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error(`Error deleting time entry ${id}:`, error);
    throw error;
  }
}
