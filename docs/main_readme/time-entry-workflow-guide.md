# Time Entry Workflow Guide

## 1. Purpose and Scope

This guide documents the complete lifecycle of time entries in the Time Tracking System, from creation to approval and reporting. It covers:

- Time entry creation and submission process
- Validation rules and business logic
- Approval workflows and state transitions
- Special cases (overtime, time-off, etc.)
- Integration with reporting and analytics

The workflow is implemented using the Firestore collections structure defined in the architecture, with a focus on maintaining data integrity and providing a smooth user experience.

## 2. Time Entry Lifecycle

### 2.1 Time Entry States

A time entry progresses through the following states:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DRAFT     │────▶│  PENDING    │────▶│  APPROVED   │────▶│  PROCESSED  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐            │
       └───────────▶│  REJECTED   │◀───────────┘
                    └─────────────┘
```

| State | Description | `status` Field Value |
|-------|-------------|----------------------|
| Draft | Entry is being created, not yet submitted | `'draft'` |
| Pending | Entry submitted but waiting for approval | `'pending'` |
| Approved | Entry approved by a manager | `'approved'` |
| Rejected | Entry rejected by a manager | `'rejected'` |
| Processed | Entry included in payroll/reporting | `'processed'` |

### 2.2 Fields Controlling Workflow

The `TimeEntry` collection contains several fields that control the workflow:

```typescript
interface TimeEntry {
  // Core fields
  id: string;
  userId: string;
  companyId: string;
  date: string;  // YYYY-MM-DD format
  
  // Hours breakdown
  hours: number;
  regularHours: number;
  overtimeHours: number;
  ptoHours: number;
  unpaidLeaveHours: number;
  
  // Workflow state fields
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'processed';
  isSubmitted: boolean;
  needsApproval: boolean;
  managerApproved: boolean;
  overtimeApproved: boolean;
  isTimeOff: boolean;
  timeOffType?: 'pto' | 'sick' | 'unpaid' | 'other';
  
  // Metadata
  notes?: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
  
  // Manager info (when applicable)
  managerId?: string;
  managerNotes?: string;
  approvedAt?: Timestamp;
}
```

## 3. Detailed Workflow Stages

### 3.1 Time Entry Creation

#### User Flow

1. User navigates to time entry screen (calendar or list view)
2. User selects a date or clicks "Add Time Entry"
3. User fills out the time entry form with:
   - Hours (total, regular, overtime if applicable)
   - Project/task (if enabled)
   - Notes/description
   - Time-off designation (if applicable)
4. User saves the entry (as draft) or submits directly

#### Implementation Details

```typescript
// Time entry creation hook (simplified)
function useCreateTimeEntry() {
  const { user } = useAuth();
  const { companySettings } = useCompanySettings();
  
  const createEntry = async (entryData) => {
    // Determine if entry needs approval based on company settings
    const needsApproval = determineIfNeedsApproval(entryData, companySettings);
    
    // Determine initial status
    const initialStatus = entryData.isSubmitted ? 'pending' : 'draft';
    
    // Create the time entry document
    const newEntry = {
      userId: user.id,
      companyId: user.companyId,
      date: entryData.date,
      hours: calculateTotalHours(entryData),
      regularHours: entryData.regularHours || 0,
      overtimeHours: entryData.overtimeHours || 0,
      ptoHours: entryData.ptoHours || 0,
      unpaidLeaveHours: entryData.unpaidLeaveHours || 0,
      status: initialStatus,
      isSubmitted: entryData.isSubmitted || false,
      needsApproval,
      managerApproved: false,
      overtimeApproved: false,
      isTimeOff: entryData.isTimeOff || false,
      timeOffType: entryData.isTimeOff ? entryData.timeOffType : undefined,
      notes: entryData.notes || '',
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.id
    };
    
    // Add to Firestore
    return await addDoc(collection(db, 'timeEntries'), newEntry);
  };
  
  return { createEntry };
}
```

#### Validation Rules

1. **Date Validation**:
   - Entry date cannot be in the future
   - Entry date cannot be older than company-defined threshold (typically 14-30 days)
   - No duplicate entries for the same date (if company settings prohibit it)

2. **Hours Validation**:
   - Total hours must equal the sum of individual hour types
   - Maximum hours per day setting (typically 24)
   - Overtime threshold based on company settings

3. **Time-Off Validation**:
   - If marked as time-off, must specify a valid time-off type
   - Time-off balance check if PTO (can be overridden by managers)

### 3.2 Submission Process

#### User Flow

1. User reviews draft entries
2. User selects one or more entries to submit
3. User confirms submission
4. System updates entries to "pending" status
5. Notification sent to manager for approval

#### Implementation Details

Batch submission implementation:

```typescript
// Submit multiple time entries (simplified)
async function submitTimeEntries(entryIds) {
  const batch = writeBatch(db);
  
  // Update each entry
  for (const id of entryIds) {
    const entryRef = doc(db, 'timeEntries', id);
    batch.update(entryRef, {
      status: 'pending',
      isSubmitted: true,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
  }
  
  // Commit the batch
  await batch.commit();
  
  // Notify managers (via Cloud Function)
  await notifyManagersOfPendingApprovals(entryIds);
}
```

#### Auto-Submission Rules

The system can be configured to auto-submit entries based on:

1. **Time-based rules**:
   - End of day auto-submission
   - End of week auto-submission
   - End of pay period auto-submission

2. **Threshold-based rules**:
   - Auto-submit when 8 hours is reached
   - Auto-submit when scheduled hours are reached

### 3.3 Approval Workflow

#### Manager Flow

1. Manager receives notification of pending entries
2. Manager views pending entries dashboard
3. Manager reviews each entry or selects batch approval
4. Manager approves or rejects with optional notes
5. System updates entry status and notifies employee

#### Implementation Details

```typescript
// Approve time entry (simplified)
async function approveTimeEntry(entryId, managerNotes = '') {
  const entryRef = doc(db, 'timeEntries', entryId);
  const entrySnap = await getDoc(entryRef);
  
  if (!entrySnap.exists()) {
    throw new Error('Time entry not found');
  }
  
  const entry = entrySnap.data();
  
  // Verify manager has permission to approve this entry
  if (!canApproveEntry(currentUser, entry)) {
    throw new Error('Permission denied');
  }
  
  // Update the entry
  await updateDoc(entryRef, {
    status: 'approved',
    managerApproved: true,
    overtimeApproved: entry.overtimeHours > 0 ? true : entry.overtimeApproved,
    managerId: currentUser.uid,
    managerNotes: managerNotes,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  });
  
  // Update user stats in a transaction
  await updateUserStatsAfterApproval(entry.userId, entry);
  
  // Notify employee
  await notifyEmployeeOfApproval(entry.userId, entryId);
}
```

#### Auto-Approval Rules

Certain entries can be auto-approved based on company settings:

1. **Regular hours under threshold**:
   - Regular working hours under daily limit
   - No overtime claimed

2. **Recurring patterns**:
   - Matches previous approved entries
   - Standard working schedule

3. **Time-off with sufficient balance**:
   - PTO requests with available balance
   - Pre-approved time-off arrangements

#### Rejection Handling

When an entry is rejected:

1. Status changes to `'rejected'`
2. Employee is notified
3. Entry can be edited and resubmitted
4. Rejection reason and manager notes are recorded

### 3.4 Special Workflows

#### Overtime Handling

1. **Overtime Detection**:
   - Automatic detection based on hours > daily threshold
   - Automatic detection based on weekly accumulated hours
   - Manual designation by employee

2. **Overtime Approval**:
   - May require special approval (even if regular hours are auto-approved)
   - May require higher-level manager approval beyond certain thresholds
   - Special notes requirement for justification

#### Time-Off Requests

1. **Time-Off Entry Creation**:
   - Set `isTimeOff: true`
   - Select appropriate `timeOffType`
   - May include special approval workflow

2. **Balance Checking**:
   - Validate against user's PTO/sick leave balance
   - Warn if insufficient balance (can still submit)
   - Auto-reject option if balance insufficient (configurable)

3. **Time-Off Calendar**:
   - Visibility of team time-off for planning
   - Calendar integration options

#### Corrections and Amendments

1. **Post-Approval Changes**:
   - Approved entries require special permission to modify
   - Creates change record for audit purposes
   - May require re-approval workflow

2. **Bulk Corrections**:
   - Manager-initiated corrections for multiple entries
   - Approval chain may change for bulk corrections

## 4. Integration with Other Systems

### 4.1 Reporting Integration

Time entries feed into the reporting system:

1. **Real-time Dashboards**:
   - Summary of hours by status
   - Pending approvals metrics
   - Time-off calendar view

2. **Periodic Reports**:
   - Weekly timesheet reports
   - Pay period summaries
   - Manager approval reports

```typescript
// Generate timesheet report (simplified)
async function generateTimesheetReport(userId, startDate, endDate) {
  // Query time entries
  const entriesQuery = query(
    collection(db, 'timeEntries'),
    where('userId', '==', userId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    where('status', 'in', ['approved', 'processed']),
    orderBy('date', 'asc')
  );
  
  const snapshot = await getDocs(entriesQuery);
  const entries = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  // Process and format report data
  const reportData = processTimesheetData(entries);
  
  // Store report metadata
  const reportRef = await addDoc(collection(db, 'reports'), {
    userId,
    reportType: 'timesheet',
    startDate,
    endDate,
    createdAt: serverTimestamp(),
    createdBy: currentUser.uid,
    // Other report metadata
  });
  
  // Generate PDF/Excel/etc. (via Cloud Function)
  const reportUrl = await generateReportDocument(reportRef.id, reportData);
  
  // Update report with URL
  await updateDoc(reportRef, {
    url: reportUrl,
    status: 'completed'
  });
  
  return reportRef.id;
}
```

### 4.2 User Stats Updates

Time entries update user statistics:

1. **Real-time Metrics**:
   - Total hours tracked this week/month
   - Approval rate and average approval time
   - Time-off usage metrics

2. **Historical Trends**:
   - Working patterns over time
   - Overtime trends
   - Time-off utilization

```typescript
// Update user stats after time entry operations (simplified)
async function updateUserStats(userId, operation, entryData) {
  const statsRef = doc(db, 'userStats', userId);
  
  // Use transaction for consistency
  await runTransaction(db, async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    
    if (!statsDoc.exists()) {
      // Initialize stats if not existing
      transaction.set(statsRef, {
        userId,
        totalHoursWorked: 0,
        averageHoursPerWeek: 0,
        totalOvertimeHours: 0,
        totalPtoUsed: 0,
        totalSickDaysUsed: 0,
        submissionStreak: 0,
        lastSubmission: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    const stats = statsDoc.exists() ? statsDoc.data() : {};
    
    // Apply updates based on operation type
    switch(operation) {
      case 'create':
        // Update appropriate metrics
        break;
      case 'approve':
        // Update approval-related metrics
        break;
      case 'delete':
        // Adjust metrics for deleted entry
        break;
    }
    
    // Update the document
    transaction.update(statsRef, {
      // Updated stats values
      updatedAt: serverTimestamp()
    });
  });
}
```

## 5. Business Rules and Configuration

### 5.1 Company-Level Configuration

The following settings in the `Company` collection affect time entry workflow:

```typescript
interface CompanySettings {
  weekConfig: {
    startDay: number;            // 0 = Sunday, 1 = Monday
    workWeekLength: number;      // Typically 5
    overtimeThreshold: number;   // Hours threshold for overtime
    timeZone: string;            // Default timezone (e.g., "America/New_York")
  };
  approvals: {
    requireManagerApproval: boolean;
    autoApproveRegularHours: boolean;
    requireOvertimeApproval: boolean;
    maxDaysForEditing: number;   // Days in the past that can be edited
    allowFutureEntries: boolean; // Whether future entries are allowed
    requireNotes: boolean;       // Whether notes are required
  };
}
```

### 5.2 Role-Based Permissions

User permissions directly impact the time entry workflow:

| Permission | Worker | Manager | Admin |
|------------|--------|---------|-------|
| Create own entries | ✅ | ✅ | ✅ |
| Edit own pending entries | ✅ | ✅ | ✅ |
| Edit own approved entries | ❌ | ✅ | ✅ |
| View team entries | ❌ | ✅ | ✅ |
| Approve team entries | ❌ | ✅ | ✅ |
| Edit all entries | ❌ | ❌ | ✅ |
| Configure workflow rules | ❌ | ❌ | ✅ |

### 5.3 Notification System

The time entry workflow triggers various notifications:

1. **Employee Notifications**:
   - Entry approval/rejection
   - Reminder to submit time
   - Approaching time-off balance limits

2. **Manager Notifications**:
   - Pending entries requiring approval
   - Team overtime alerts
   - Late submission notifications

## 6. Implementation Examples

### 6.1 Hours Site (Employee View)

#### Weekly Time Entry Grid

```typescript
// WeeklyTimeEntryGrid.tsx (simplified)
export const WeeklyTimeEntryGrid = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { currentUser } = useAuth();
  const { entries, isLoading } = useTimeEntries({
    userId: currentUser?.uid,
    startDate: startOfWeek(selectedDate),
    endDate: endOfWeek(selectedDate)
  });
  
  // Calculate week day columns based on company settings
  const weekDays = useMemo(() => 
    getWeekDaysArray(selectedDate, companySettings.weekConfig), 
    [selectedDate, companySettings]
  );
  
  // Group entries by date
  const entriesByDate = useMemo(() => 
    groupBy(entries, entry => entry.date),
    [entries]
  );
  
  // Navigate between weeks
  const prevWeek = () => setSelectedDate(subWeeks(selectedDate, 1));
  const nextWeek = () => setSelectedDate(addWeeks(selectedDate, 1));
  
  // Render the grid
  return (
    <div className="weekly-grid">
      <div className="grid-navigation">
        <button onClick={prevWeek}>Previous Week</button>
        <h2>{format(startOfWeek(selectedDate), 'MMM d')} - {format(endOfWeek(selectedDate), 'MMM d, yyyy')}</h2>
        <button onClick={nextWeek}>Next Week</button>
      </div>
      
      <div className="grid-header">
        {weekDays.map(day => (
          <div key={day.date} className="day-column-header">
            <div>{format(day.date, 'EEE')}</div>
            <div>{format(day.date, 'MMM d')}</div>
          </div>
        ))}
      </div>
      
      <div className="grid-body">
        {weekDays.map(day => {
          const dateString = format(day.date, 'yyyy-MM-dd');
          const dayEntries = entriesByDate[dateString] || [];
          
          return (
            <div key={dateString} className="day-column">
              {isLoading ? (
                <LoadingPlaceholder />
              ) : dayEntries.length > 0 ? (
                dayEntries.map(entry => (
                  <TimeEntryCard 
                    key={entry.id} 
                    entry={entry} 
                    onEdit={() => handleEdit(entry)}
                  />
                ))
              ) : (
                <EmptyDayCard onAddEntry={() => handleAddEntry(dateString)} />
              )}
            </div>
          );
        })}
      </div>
      
      <WeeklySummary entries={entries} />
    </div>
  );
};
```

#### Time Entry Form

```typescript
// TimeEntryForm.tsx (simplified)
export const TimeEntryForm = ({ 
  initialEntry, 
  onSubmit, 
  onCancel 
}) => {
  const { companySettings } = useCompanySettings();
  const { timeOffBalance } = useTimeOffBalance();
  
  // Form validation schema
  const validationSchema = z.object({
    date: z.string(),
    regularHours: z.number().min(0),
    overtimeHours: z.number().min(0),
    ptoHours: z.number().min(0),
    unpaidLeaveHours: z.number().min(0),
    isTimeOff: z.boolean(),
    timeOffType: z.string().optional(),
    notes: z.string().optional()
  }).refine(data => {
    const totalHours = data.regularHours + data.overtimeHours + 
                     data.ptoHours + data.unpaidLeaveHours;
    return totalHours > 0 && totalHours <= 24;
  }, {
    message: "Total hours must be greater than 0 and not exceed 24",
    path: ["regularHours"]
  });
  
  // Form state
  const form = useForm({
    initialValues: initialEntry || {
      date: format(new Date(), 'yyyy-MM-dd'),
      regularHours: 8,
      overtimeHours: 0,
      ptoHours: 0,
      unpaidLeaveHours: 0,
      isTimeOff: false,
      notes: ''
    },
    validationSchema
  });
  
  // Handle time-off toggle
  const handleTimeOffToggle = (isTimeOff) => {
    form.setValue('isTimeOff', isTimeOff);
    if (isTimeOff) {
      form.setValue('regularHours', 0);
      form.setValue('overtimeHours', 0);
      form.setValue('ptoHours', 8);
    } else {
      form.setValue('ptoHours', 0);
      form.setValue('regularHours', 8);
    }
  };
  
  // Handle save or submit
  const handleSave = (asDraft = true) => {
    if (form.isValid) {
      onSubmit({
        ...form.values,
        isSubmitted: !asDraft
      });
    }
  };
  
  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSave(false); }}>
      <DatePicker
        label="Date"
        value={form.values.date}
        onChange={(date) => form.setValue('date', date)}
        min={format(subDays(new Date(), companySettings.approvals.maxDaysForEditing), 'yyyy-MM-dd')}
        max={companySettings.approvals.allowFutureEntries ? undefined : format(new Date(), 'yyyy-MM-dd')}
      />
      
      <div className="time-type-toggle">
        <label>
          <input
            type="checkbox"
            checked={form.values.isTimeOff}
            onChange={(e) => handleTimeOffToggle(e.target.checked)}
          />
          Time Off Request
        </label>
      </div>
      
      {form.values.isTimeOff ? (
        <div className="time-off-fields">
          <Select
            label="Time Off Type"
            value={form.values.timeOffType}
            onChange={(value) => form.setValue('timeOffType', value)}
            options={[
              { value: 'pto', label: 'PTO' },
              { value: 'sick', label: 'Sick Leave' },
              { value: 'unpaid', label: 'Unpaid Leave' },
              { value: 'other', label: 'Other' }
            ]}
          />
          
          {form.values.timeOffType === 'pto' && (
            <div className="balance-indicator">
              Available PTO: {timeOffBalance.available} hours
              {timeOffBalance.available < 8 && (
                <div className="warning">Low PTO balance</div>
              )}
            </div>
          )}
          
          <NumberInput
            label="Hours"
            value={form.values.ptoHours}
            onChange={(value) => form.setValue('ptoHours', value)}
            min={0}
            max={24}
          />
        </div>
      ) : (
        <div className="work-hours-fields">
          <NumberInput
            label="Regular Hours"
            value={form.values.regularHours}
            onChange={(value) => form.setValue('regularHours', value)}
            min={0}
            max={24}
          />
          
          <NumberInput
            label="Overtime Hours"
            value={form.values.overtimeHours}
            onChange={(value) => form.setValue('overtimeHours', value)}
            min={0}
            max={24}
          />
        </div>
      )}
      
      <TextArea
        label="Notes"
        value={form.values.notes}
        onChange={(value) => form.setValue('notes', value)}
        required={companySettings.approvals.requireNotes}
      />
      
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={() => handleSave(true)}>Save as Draft</button>
        <button type="submit">Submit</button>
      </div>
    </form>
  );
};
```

### 6.2 Admin Site (Manager View)

#### Approval Dashboard

```typescript
// ApprovalDashboard.tsx (simplified)
export const ApprovalDashboard = () => {
  const { currentUser } = useAuth();
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedEntries, setSelectedEntries] = useState([]);
  
  // Get managed users
  const { managedUsers } = useManagedUsers();
  
  // Get pending entries
  const { entries, isLoading, error } = usePendingTimeEntries({
    managerId: currentUser.uid,
    status: filterStatus
  });
  
  // Group by user for easier review
  const entriesByUser = useMemo(() => 
    groupBy(entries, entry => entry.userId),
    [entries]
  );
  
  // Handle batch actions
  const handleBatchApprove = async () => {
    if (selectedEntries.length === 0) return;
    
    try {
      await approveMultipleTimeEntries(selectedEntries);
      // Show success notification
      setSelectedEntries([]);
    } catch (error) {
      // Show error notification
    }
  };
  
  const handleBatchReject = async () => {
    if (selectedEntries.length === 0) return;
    
    // Prompt for rejection reason
    const reason = await promptForRejectionReason();
    if (!reason) return;
    
    try {
      await rejectMultipleTimeEntries(selectedEntries, reason);
      // Show success notification
      setSelectedEntries([]);
    } catch (error) {
      // Show error notification
    }
  };
  
  return (
    <div className="approval-dashboard">
      <div className="dashboard-header">
        <h1>Time Entry Approvals</h1>
        
        <div className="filters">
          <Select
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'pending', label: 'Pending Approval' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }
            ]}
          />
        </div>
        
        {selectedEntries.length > 0 && (
          <div className="batch-actions">
            <span>{selectedEntries.length} entries selected</span>
            <button onClick={handleBatchApprove}>Approve Selected</button>
            <button onClick={handleBatchReject}>Reject Selected</button>
          </div>
        )}
      </div>
      
      {isLoading ? (
        <LoadingPlaceholder />
      ) : error ? (
        <ErrorMessage error={error} />
      ) : Object.keys(entriesByUser).length === 0 ? (
        <EmptyState message="No pending time entries found" />
      ) : (
        Object.entries(entriesByUser).map(([userId, userEntries]) => {
          const user = managedUsers.find(u => u.id === userId);
          
          return (
            <div key={userId} className="user-entries-group">
              <div className="user-header">
                <h2>{user?.firstName} {user?.lastName}</h2>
                <span>{userEntries.length} entries</span>
              </div>
              
              <div className="entries-list">
                {userEntries.map(entry => (
                  <TimeEntryApprovalCard
                    key={entry.id}
                    entry={entry}
                    user={user}
                    selected={selectedEntries.includes(entry.id)}
                    onToggleSelect={(selected) => {
                      if (selected) {
                        setSelectedEntries([...selectedEntries, entry.id]);
                      } else {
                        setSelectedEntries(selectedEntries.filter(id => id !== entry.id));
                      }
                    }}
                    onApprove={() => approveTimeEntry(entry.id)}
                    onReject={() => rejectTimeEntry(entry.id)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
```

## 7. Best Practices & Do's and Don'ts

### 7.1 Do's

✅ **DO** validate time entries on both client and server sides  
✅ **DO** implement optimistic UI updates for better user experience  
✅ **DO** use batch operations for multi-entry approvals  
✅ **DO** implement proper error handling for failed operations  
✅ **DO** provide clear feedback on entry status changes  
✅ **DO** enforce consistent time zone handling across the application  
✅ **DO** maintain audit trails for all approval actions  
✅ **DO** use transactions for updating related documents (entries + stats)  

### 7.2 Don'ts

❌ **DON'T** allow modification of processed entries without special permissions  
❌ **DON'T** implement complex business logic in UI components  
❌ **DON'T** rely solely on client-side validation  
❌ **DON'T** trigger excessive real-time listeners on approval screens  
❌ **DON'T** store calculated fields that can be derived on-demand  
❌ **DON'T** allow future entries beyond company policy limits  
❌ **DON'T** perform time calculations in local time zones  
❌ **DON'T** use non-atomic operations for critical state changes  

## 8. Troubleshooting Common Issues

### Approval Process Issues

1. **Entry Stuck in Pending Status**
   - Check if manager exists and has proper permissions
   - Verify notification system is working correctly
   - Use admin override if necessary

2. **Incorrect Hour Calculations**
   - Validate time zone settings
   - Check week configuration (start day, work week length)
   - Verify overtime threshold settings

3. **Missing Entries in Reports**
   - Check entry status (only approved entries included)
   - Verify date range parameters
   - Check for soft-deleted entries 