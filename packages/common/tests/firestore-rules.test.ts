import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

let testEnv: RulesTestEnvironment;

// Mock user data
const adminUser = { uid: 'admin-uid', email: 'admin@example.com' };
const managerUser = { uid: 'manager-uid', email: 'manager@example.com' };
const workerUser = { uid: 'worker-uid', email: 'worker@example.com' };
const unrelatedUser = { uid: 'unrelated-uid', email: 'unrelated@example.com' };

const companyId = 'company-123';
const workerId = workerUser.uid;
const managerId = managerUser.uid;

// Helper to set up database with test data
async function setupTestData() {
  // Set up admin user
  const adminDoc = testEnv.firestore().collection('users').doc(adminUser.uid);
  await adminDoc.set({
    email: adminUser.email,
    firstName: 'Admin',
    lastName: 'User',
    role: 'super-admin',
    permissions: { all: true },
    companyId: companyId,
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: adminUser.uid
    }
  });

  // Set up manager user with assigned worker
  const managerDoc = testEnv.firestore().collection('users').doc(managerUser.uid);
  await managerDoc.set({
    email: managerUser.email,
    firstName: 'Manager',
    lastName: 'User',
    role: 'manager',
    permissions: { generateInvoices: true },
    assignedWorkers: [workerId],
    companyId: companyId,
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: adminUser.uid
    }
  });

  // Set up worker user
  const workerDoc = testEnv.firestore().collection('users').doc(workerUser.uid);
  await workerDoc.set({
    email: workerUser.email,
    firstName: 'Worker',
    lastName: 'User',
    role: 'worker',
    permissions: {},
    companyId: companyId,
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: adminUser.uid
    }
  });

  // Set up company
  const companyDoc = testEnv.firestore().collection('companies').doc(companyId);
  await companyDoc.set({
    name: 'Test Company',
    settings: {
      weekConfig: {
        startDay: 1,
        workWeekLength: 5
      }
    },
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: adminUser.uid
    }
  });
}

beforeAll(async () => {
  // Set up the test environment
  testEnv = await initializeTestEnvironment({
    projectId: 'time-tracking-test',
    firestore: {
      rules: fs.readFileSync('../../firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080
    }
  });

  // Set up initial data as admin
  await testEnv.withSecurityRulesDisabled(async () => {
    await setupTestData();
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Time Entry Security Rules', () => {
  const timeEntryData = {
    date: '2023-06-15',
    hours: 8,
    userId: workerId,
    companyId: companyId,
    status: 'pending',
    description: 'Development work',
    createdAt: new Date().toISOString(),
    createdBy: workerId,
    updatedAt: new Date().toISOString(),
    updatedBy: workerId
  };

  const timeEntryId = uuidv4();

  test('Worker can create their own time entry', async () => {
    const workerContext = testEnv.authenticatedContext(workerId);
    await expect(
      workerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .set(timeEntryData)
    ).toAllow();
  });

  test('Worker cannot create time entry for someone else', async () => {
    const workerContext = testEnv.authenticatedContext(workerId);
    await expect(
      workerContext.firestore()
        .collection('timeEntries')
        .doc()
        .set({
          ...timeEntryData,
          userId: unrelatedUser.uid,
          updatedBy: workerId,
          createdBy: workerId
        })
    ).toDeny();
  });

  test('Worker can read their own time entries', async () => {
    // Create time entry for testing
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .set(timeEntryData);
    });

    const workerContext = testEnv.authenticatedContext(workerId);
    await expect(
      workerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .get()
    ).toAllow();
  });

  test('Manager can read assigned worker time entries', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .get()
    ).toAllow();
  });

  test('Manager can update status of assigned worker time entry', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .update({
          status: 'approved',
          managerNotes: 'Looks good',
          updatedAt: new Date().toISOString(),
          updatedBy: managerId
        })
    ).toAllow();
  });

  test('Manager cannot update hours of assigned worker time entry', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .update({
          hours: 6,
          updatedAt: new Date().toISOString(),
          updatedBy: managerId
        })
    ).toDeny();
  });

  test('Admin can read any time entry', async () => {
    const adminContext = testEnv.authenticatedContext(adminUser.uid);
    await expect(
      adminContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .get()
    ).toAllow();
  });

  test('Admin can update any field in time entry', async () => {
    const adminContext = testEnv.authenticatedContext(adminUser.uid);
    await expect(
      adminContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .update({
          hours: 6,
          description: 'Updated by admin',
          updatedAt: new Date().toISOString(),
          updatedBy: adminUser.uid
        })
    ).toAllow();
  });

  test('No one can delete time entries directly', async () => {
    const adminContext = testEnv.authenticatedContext(adminUser.uid);
    await expect(
      adminContext.firestore()
        .collection('timeEntries')
        .doc(timeEntryId)
        .delete()
    ).toDeny();
  });
});

describe('User Security Rules', () => {
  test('Users can read their own data', async () => {
    const workerContext = testEnv.authenticatedContext(workerId);
    await expect(
      workerContext.firestore()
        .collection('users')
        .doc(workerId)
        .get()
    ).toAllow();
  });

  test('Manager can read assigned worker data', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('users')
        .doc(workerId)
        .get()
    ).toAllow();
  });

  test('Worker cannot read unrelated user data', async () => {
    const workerContext = testEnv.authenticatedContext(workerId);
    await expect(
      workerContext.firestore()
        .collection('users')
        .doc(unrelatedUser.uid)
        .get()
    ).toDeny();
  });

  test('Manager can update limited fields of assigned worker', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('users')
        .doc(workerId)
        .update({
          status: 'active',
          approvedHours: 40,
          updatedAt: new Date().toISOString(),
          'metadata.updatedBy': managerId
        })
    ).toAllow();
  });

  test('Manager cannot update role of assigned worker', async () => {
    const managerContext = testEnv.authenticatedContext(managerId);
    await expect(
      managerContext.firestore()
        .collection('users')
        .doc(workerId)
        .update({
          role: 'manager',
          'metadata.updatedBy': managerId
        })
    ).toDeny();
  });
}); 