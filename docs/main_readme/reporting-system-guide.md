# Reporting System Guide

## Overview

This guide outlines the reporting system for the Time Tracking application. It follows a lean but scalable architecture that prioritizes simplicity while establishing patterns that can handle increased complexity and data volume over time.

## Key Design Principles

1. **Progressive Implementation**: Start with essential reports and expand incrementally
2. **Frontend-First Approach**: Leverage client-side processing for most reports when possible
3. **Server-Side Fallback**: Move to server-side processing only when data volume or complexity demands it
4. **Cacheable Reports**: Design reports to be cacheable for performance
5. **Export Flexibility**: Support multiple export formats (PDF, CSV, Excel)

## Report Types

### Core Reports

The system begins with these essential reports that cover the most critical business needs:

1. **Weekly Timesheet**
   - Individual user's time entries for a specific week
   - Grouped by day with daily totals
   - Weekly hour total and breakdown by category (regular, overtime, PTO)

2. **Team Time Summary**
   - Manager view of their team's time entries
   - Aggregated by user with approval status
   - Highlights exceptions (missing entries, overtime)

3. **Monthly Hour Distribution**
   - Visual representation of hours across a month
   - Breakdown by project or time entry type
   - Trend analysis compared to previous periods

4. **Time Off Balance**
   - Current PTO, sick leave, and other time off balances
   - Historical usage patterns
   - Forecasted balances based on scheduled time off

### Advanced Reports (Future Implementation)

These reports will be added as the system matures:

1. **Project Time Allocation**
   - Time spent per project with cost calculations
   - Resource allocation analysis
   - Variance from estimates

2. **Billing & Invoicing Reports**
   - Billable hours by client or project
   - Invoice generation with company branding
   - Payment status tracking

3. **Compliance Reports**
   - Working hours compliance (overtime, rest periods)
   - Leave entitlement compliance
   - Audit trails for time adjustments

## Architecture

### Data Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Data Source │───▶│ Aggregation │───▶│Visualization│───▶│   Export    │
│  (Firestore)│    │   Engine    │    │   Engine    │    │   Engine    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Component Structure

The reporting system consists of these key components:

#### 1. Report Service Layer

A service layer that abstracts data retrieval and transformation:

```typescript
// services/reports/report-service.ts
export class ReportService {
  // Base data fetching with caching support
  async fetchReportData<T>(reportType: ReportType, params: ReportParams): Promise<T> {
    const cacheKey = this.getCacheKey(reportType, params);
    const cachedData = await this.checkCache(cacheKey);
    
    if (cachedData) return cachedData as T;
    
    // Fetch data based on report type
    let data: T;
    switch (reportType) {
      case ReportType.WEEKLY_TIMESHEET:
        data = await this.fetchWeeklyTimesheetData(params) as T;
        break;
      case ReportType.TEAM_SUMMARY:
        data = await this.fetchTeamSummaryData(params) as T;
        break;
      // Additional report types...
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
    
    // Cache the results
    await this.cacheData(cacheKey, data);
    return data;
  }
  
  // Report-specific data fetching methods
  private async fetchWeeklyTimesheetData(params: WeeklyTimesheetParams): Promise<WeeklyTimesheetData> {
    const { userId, startDate, endDate } = params;
    
    // Query Firestore for time entries
    const timeEntries = await queryDocuments(
      timeEntriesCollection,
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    
    // Transform the data for the report
    return this.transformWeeklyTimesheetData(timeEntries);
  }
  
  // Data transformation methods
  private transformWeeklyTimesheetData(entries: TimeEntry[]): WeeklyTimesheetData {
    // Group entries by day
    const entriesByDay = this.groupEntriesByDay(entries);
    
    // Calculate daily and weekly totals
    const dailyTotals = this.calculateDailyTotals(entriesByDay);
    const weeklyTotal = this.calculateWeeklyTotal(dailyTotals);
    
    return {
      entriesByDay,
      dailyTotals,
      weeklyTotal,
      breakdown: this.calculateHourTypeBreakdown(entries)
    };
  }
  
  // Caching methods
  private async checkCache(key: string): Promise<any | null> {
    // Implementation depends on caching strategy
    // Could use localStorage, IndexedDB, or a server cache
    return null; // Initially no caching
  }
  
  private async cacheData(key: string, data: any): Promise<void> {
    // Cache the data with an expiration
  }
  
  private getCacheKey(reportType: ReportType, params: ReportParams): string {
    return `report_${reportType}_${JSON.stringify(params)}`;
  }
}
```

#### 2. Report Components

React components that render report data with visualization options:

```typescript
// components/reports/WeeklyTimesheet.tsx
import React from 'react';
import { useWeeklyTimesheetReport } from '../../hooks/reports/useReports';
import { DateRangePicker } from '../common/DateRangePicker';
import { Table } from '../common/Table';
import { ExportButton } from './ExportButton';

interface WeeklyTimesheetProps {
  userId: string;
  initialStartDate?: Date;
  initialEndDate?: Date;
}

export const WeeklyTimesheet: React.FC<WeeklyTimesheetProps> = ({
  userId,
  initialStartDate,
  initialEndDate
}) => {
  const [startDate, setStartDate] = useState(initialStartDate || getStartOfWeek());
  const [endDate, setEndDate] = useState(initialEndDate || getEndOfWeek());
  
  const { data, isLoading, error } = useWeeklyTimesheetReport(userId, startDate, endDate);
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error} />;
  
  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Weekly Timesheet</h2>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <ExportButton 
          data={data} 
          filename={`timesheet-${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}`} 
          formats={['pdf', 'csv']} 
        />
      </div>
      
      <div className="report-summary">
        <div className="summary-item">
          <label>Total Hours:</label>
          <span>{data.weeklyTotal}</span>
        </div>
        <div className="summary-item">
          <label>Regular Hours:</label>
          <span>{data.breakdown.regularHours}</span>
        </div>
        <div className="summary-item">
          <label>Overtime Hours:</label>
          <span>{data.breakdown.overtimeHours}</span>
        </div>
        <div className="summary-item">
          <label>PTO Hours:</label>
          <span>{data.breakdown.ptoHours}</span>
        </div>
      </div>
      
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Date</Table.Head>
            <Table.Head>Day</Table.Head>
            <Table.Head>Total Hours</Table.Head>
            <Table.Head>Status</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {Object.entries(data.entriesByDay).map(([dateStr, entries]) => (
            <Table.Row key={dateStr}>
              <Table.Cell>{format(parseISO(dateStr), 'MMM d, yyyy')}</Table.Cell>
              <Table.Cell>{format(parseISO(dateStr), 'EEEE')}</Table.Cell>
              <Table.Cell>{data.dailyTotals[dateStr]}</Table.Cell>
              <Table.Cell>
                {entries.some(e => !e.managerApproved) ? (
                  <Badge variant="warning">Pending</Badge>
                ) : (
                  <Badge variant="success">Approved</Badge>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      
      <Accordion>
        <AccordionItem title="Daily Details">
          {Object.entries(data.entriesByDay).map(([dateStr, entries]) => (
            <DailyEntriesDetail key={dateStr} date={dateStr} entries={entries} />
          ))}
        </AccordionItem>
      </Accordion>
    </div>
  );
};
```

#### 3. Report Hooks

React Query hooks for data fetching and state management:

```typescript
// hooks/reports/useReports.ts
import { useQuery } from '@tanstack/react-query';
import { reportService } from '../../services/reports/report-service';
import { format } from 'date-fns';

export function useWeeklyTimesheetReport(userId: string, startDate: Date, endDate: Date) {
  return useQuery({
    queryKey: ['report', 'weeklyTimesheet', userId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: () => reportService.fetchReportData(
      ReportType.WEEKLY_TIMESHEET, 
      { userId, startDate, endDate }
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTeamSummaryReport(managerId: string, period: ReportPeriod) {
  return useQuery({
    queryKey: ['report', 'teamSummary', managerId, period.toString()],
    queryFn: () => reportService.fetchReportData(
      ReportType.TEAM_SUMMARY,
      { managerId, period }
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Additional report hooks...
```

#### 4. Export Engine

Handles conversion to different formats:

```typescript
// services/reports/export-service.ts
export class ExportService {
  async exportToPdf<T>(reportData: T, template: string, filename: string): Promise<Blob> {
    // Generate PDF using pdfmake or similar
    const pdfDoc = await this.generatePdf(reportData, template);
    return pdfDoc.getBlob();
  }
  
  async exportToCsv<T>(reportData: T, columns: CSVColumn[], filename: string): Promise<string> {
    // Generate CSV
    const csvContent = this.generateCsv(reportData, columns);
    return csvContent;
  }
  
  async exportToExcel<T>(reportData: T, worksheets: ExcelWorksheet[], filename: string): Promise<Blob> {
    // Generate Excel file using exceljs or similar
    const workbook = await this.generateExcel(reportData, worksheets);
    return workbook.xlsx.writeBuffer();
  }
  
  private async generatePdf<T>(data: T, template: string): Promise<any> {
    // Implement PDF generation logic
    // For a lean implementation, we can use pdfmake
    // For more advanced needs, consider moving to server-side generation
  }
  
  private generateCsv<T>(data: T, columns: CSVColumn[]): string {
    // Implement CSV generation logic
    // Can be done efficiently client-side
  }
  
  private async generateExcel<T>(data: T, worksheets: ExcelWorksheet[]): Promise<any> {
    // Implement Excel generation logic
    // For simple Excel files, can be done client-side
    // For complex reports, consider server-side generation
  }
}
```

## Implementation Strategy

### Phase 1: Essential Client-Side Reports

Start with basic reports that can be entirely processed client-side:

1. Implement the Weekly Timesheet report
2. Add PDF and CSV export capabilities
3. Create reusable report components
4. Establish the report hook pattern

### Phase 2: Team and Aggregation Reports

Add reports that require more data aggregation:

1. Implement the Team Time Summary report
2. Add the Monthly Hour Distribution with basic charts
3. Enhance caching to improve performance
4. Add Excel export option

### Phase 3: Advanced Reports (When Needed)

As data volume grows or more complex reports are needed:

1. Move complex calculations to Firebase Cloud Functions
2. Implement background report generation for large datasets
3. Add report scheduling and delivery (email, notification)
4. Implement more sophisticated data visualizations

## Performance Considerations

### Client-Side Performance

1. **Data Chunking**: For large reports, load data in chunks and process incrementally
2. **Windowing**: Use virtualized lists for long reports to render only visible items
3. **Web Workers**: Move heavy computations to web workers for responsive UI
4. **Memoization**: Cache expensive calculations with useMemo and React Query

### Large Dataset Handling

When data volumes exceed client-side processing capability:

1. **Server-Side Aggregation**: Use Cloud Functions to pre-aggregate data
2. **Stored Reports**: Generate and store report results rather than calculating on demand
3. **Pagination**: Implement paginated report viewing for very large reports
4. **Background Processing**: Generate complex reports asynchronously and notify when complete

## Security

Reports must respect the same security boundaries as the rest of the application:

1. **User-Scoped Reports**: Users can only access reports on their own data
2. **Manager-Scoped Reports**: Managers can only access reports for their team members
3. **Time Period Restrictions**: Reports respect company policies on historical data access
4. **Export Permissions**: Export capabilities can be controlled by permissions

## Integration with Other Modules

The reporting system integrates with:

1. **Time Entry Workflow**: Uses completed and approved entries as its data source
2. **User Management**: Respects the organizational hierarchy for team reports
3. **UI Component Library**: Leverages the common component library for consistency
4. **Authentication & Security**: Enforces the security model across all reports

## Best Practices

1. **Start Simple**: Begin with the most essential reports before adding complexity
2. **Measure Performance**: Profile report generation to identify bottlenecks
3. **Progressive Enhancement**: Add advanced features incrementally as needed
4. **Reuse Components**: Build a library of report components to maintain consistency
5. **Test with Real Data**: Verify report accuracy with representative test data volumes

## Conclusion

This reporting system provides a lean starting point that can scale as the application's needs grow. By focusing initially on client-side processing and adding server-side capabilities only when needed, the implementation maintains simplicity while establishing patterns that can accommodate future complexity. 