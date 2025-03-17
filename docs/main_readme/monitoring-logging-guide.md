# Monitoring & Logging Guide

## Overview

This guide outlines the monitoring and logging strategy for the Time Tracking System. It follows the project's core philosophy of starting with a lean implementation that can scale as the application grows, focusing on the most critical metrics and events while establishing patterns that support future expansion.

## Core Principles

1. **Actionable Insights**: Focus on collecting data that leads to specific actions
2. **Minimal Overhead**: Implement logging with minimal performance impact
3. **Selective Verbosity**: Use appropriate detail levels for different environments
4. **Privacy First**: Ensure all logging respects user privacy and data regulations
5. **Early Warning System**: Monitor for issues before they impact users

## Logging Strategy

### Log Levels and Usage

The system implements five standard log levels:

| Level | Purpose | Example Usage |
|-------|---------|---------------|
| ERROR | Critical failures requiring immediate attention | Authentication failures, data corruption |
| WARN | Potential issues that don't stop execution | Failed API calls with fallback, performance degradation |
| INFO | Important application events | User sign-in, time entry submission, approvals |
| DEBUG | Detailed information for troubleshooting | Function parameters, state transitions (dev/test only) |
| TRACE | Extremely detailed execution information | Request/response payloads, timing data (disabled in production) |

### Logging Implementation

#### Frontend Logging Service

```typescript
// services/logging/logging-service.ts
export class LoggingService {
  private context: LogContext;
  
  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      app: context.app || 'default',
      environment: context.environment || process.env.NODE_ENV,
      version: context.version || process.env.APP_VERSION,
      userId: context.userId,
      sessionId: context.sessionId || generateSessionId(),
    };
  }
  
  // Set or update context data
  setContext(newContext: Partial<LogContext>): void {
    this.context = { ...this.context, ...newContext };
  }

  // Core logging methods
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('ERROR', message, { error, ...metadata });
  }
  
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, metadata);
  }
  
  info(message: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, metadata);
  }
  
  debug(message: string, metadata?: Record<string, any>): void {
    // Only log in non-production environments
    if (this.context.environment !== 'production') {
      this.log('DEBUG', message, metadata);
    }
  }
  
  trace(message: string, metadata?: Record<string, any>): void {
    // Only log in development environment
    if (this.context.environment === 'development') {
      this.log('TRACE', message, metadata);
    }
  }
  
  // Central log handler
  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata: this.sanitizeMetadata(metadata || {}),
    };
    
    // Send to appropriate destination based on environment
    if (this.context.environment === 'production') {
      this.sendToProductionLogging(logEntry);
    } else {
      this.sendToDevelopmentLogging(logEntry);
    }
  }
  
  // Sanitize sensitive data before logging
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    // Implement data sanitization to remove PII, credentials, etc.
    return sanitizeData(metadata);
  }
  
  // Logging destinations
  private sendToProductionLogging(entry: LogEntry): void {
    // In production, send to Firebase Remote Config Logger or other service
    // This implementation uses Firebase Performance for production
    if (entry.level === 'ERROR' || entry.level === 'WARN') {
      sendToFirebaseAnalytics(entry);
    }
  }
  
  private sendToDevelopmentLogging(entry: LogEntry): void {
    // In development, output to console with formatting
    const formattedEntry = formatLogEntry(entry);
    switch (entry.level) {
      case 'ERROR':
        console.error(formattedEntry.message, formattedEntry.metadata);
        break;
      case 'WARN':
        console.warn(formattedEntry.message, formattedEntry.metadata);
        break;
      case 'INFO':
        console.info(formattedEntry.message, formattedEntry.metadata);
        break;
      default:
        console.log(formattedEntry.message, formattedEntry.metadata);
    }
  }
}

// Singleton instance for app-wide logging
export const logger = new LoggingService();
```

#### Backend Logging (Cloud Functions)

```typescript
// functions/src/utils/logger.ts
import * as functions from 'firebase-functions';

export class FunctionLogger {
  private functionName: string;
  
  constructor(functionName: string) {
    this.functionName = functionName;
  }
  
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    functions.logger.error(message, {
      functionName: this.functionName,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined,
      ...metadata
    });
  }
  
  warn(message: string, metadata?: Record<string, any>): void {
    functions.logger.warn(message, {
      functionName: this.functionName,
      ...metadata
    });
  }
  
  info(message: string, metadata?: Record<string, any>): void {
    functions.logger.info(message, {
      functionName: this.functionName,
      ...metadata
    });
  }
  
  debug(message: string, metadata?: Record<string, any>): void {
    // Only log in non-production environments or when explicitly enabled
    if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.DEBUG_LOGGING === 'true') {
      functions.logger.debug(message, {
        functionName: this.functionName,
        ...metadata
      });
    }
  }
}

// Helper function to create a logger for a specific Cloud Function
export function createLogger(functionName: string): FunctionLogger {
  return new FunctionLogger(functionName);
}
```

### Key Events to Log

The system logs these critical events:

#### User-Related Events
- Authentication attempts (success/failure)
- Account creation and modification
- Permission and role changes
- Session activity (login/logout)

#### Time Entry Events
- Time entry creation and modification
- Submission status changes
- Approval/rejection actions
- Batch operations

#### System Events
- Application startup and initialization
- API endpoint calls (with timing)
- Error conditions and resolutions
- Firestore connectivity issues

## Monitoring Strategy

The monitoring system focuses on these key areas:

### 1. Application Health Monitoring

- **Availability**: Check that both /hours and /admin sites are responding
- **Latency**: Monitor page load and API response times
- **Error Rates**: Track percentage of failed operations
- **Dependencies**: Monitor Firebase service availability

### 2. User Experience Monitoring

- **Core Flow Completion Rates**: Track successful completion of key flows
  - Time entry submission rate
  - Approval workflow completion rate
  - Report generation success rate
- **Client-Side Performance**: Monitor component render times and interactions
- **Session Metrics**: Track session duration and interaction depth

### 3. Technical Monitoring

- **Firebase Quota Usage**: Monitor approaching limits for Firestore reads/writes
- **Authentication Metrics**: Track sign-in success rates and MFA usage
- **Cloud Function Performance**: Monitor execution time and memory usage
- **Bundle Size**: Track application download size and loading performance

## Implementation Patterns

### Error Tracking Integration

The system uses error boundaries in React combined with centralized error reporting:

```typescript
// components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../services/logging/logging-service';

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error
    logger.error('React component error', error, {
      componentStack: errorInfo.componentStack,
    });
    
    // Call the onError prop if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render fallback UI
      return this.props.fallback || (
        <div className="error-boundary-fallback">
          <h2>Something went wrong.</h2>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = '/';
            }}
          >
            Return to home page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Performance Monitoring

The system uses custom performance traces for critical operations:

```typescript
// hooks/usePerformanceMonitoring.ts
import { useEffect, useRef } from 'react';
import { getPerformance, trace } from 'firebase/performance';
import { useAuth } from './useAuth';

export function usePerformanceTrace(traceName: string, options?: {
  attributes?: Record<string, string>;
  startAutomatically?: boolean;
}) {
  const traceRef = useRef<ReturnType<typeof trace> | null>(null);
  const { user } = useAuth();
  
  useEffect(() => {
    // Only initialize in production
    if (process.env.NODE_ENV === 'production') {
      const performance = getPerformance();
      traceRef.current = trace(performance, traceName);
      
      // Add standard attributes
      if (traceRef.current) {
        traceRef.current.putAttribute('userRole', user?.role || 'unauthenticated');
        
        // Add custom attributes
        if (options?.attributes) {
          Object.entries(options.attributes).forEach(([key, value]) => {
            traceRef.current?.putAttribute(key, value);
          });
        }
        
        // Start automatically if requested
        if (options?.startAutomatically) {
          traceRef.current.start();
        }
      }
    }
    
    return () => {
      if (traceRef.current && !traceRef.current.isStopped()) {
        traceRef.current.stop();
      }
      traceRef.current = null;
    };
  }, [traceName, options?.attributes]);
  
  const startTrace = () => {
    if (traceRef.current && !traceRef.current.isStarted()) {
      traceRef.current.start();
    }
  };
  
  const stopTrace = () => {
    if (traceRef.current && traceRef.current.isStarted()) {
      traceRef.current.stop();
    }
  };
  
  const addTraceAttribute = (key: string, value: string) => {
    if (traceRef.current) {
      traceRef.current.putAttribute(key, value);
    }
  };
  
  const incrementMetric = (metricName: string, incrementBy: number = 1) => {
    if (traceRef.current) {
      traceRef.current.incrementMetric(metricName, incrementBy);
    }
  };
  
  return {
    startTrace,
    stopTrace,
    addTraceAttribute,
    incrementMetric,
  };
}
```

### Alerting Configuration

The system implements progressive alerting to avoid alert fatigue:

1. **Severity Levels**:
   - **Critical**: Immediate notification via multiple channels
   - **High**: Prompt notification during business hours
   - **Medium**: Daily digest
   - **Low**: Weekly report

2. **Alert Grouping**:
   - Similar errors are grouped to reduce noise
   - Frequency thresholds trigger severity escalation

3. **Response Procedures**:
   - Each alert type has a defined response procedure
   - Clear ownership assignment
   - Resolution tracking

## Real-Time Monitoring Dashboard

The admin site includes a monitoring dashboard for real-time application health visibility:

```typescript
// admin/src/features/monitoring/components/MonitoringDashboard.tsx
import React, { useEffect, useState } from 'react';
import { Card, Grid, Tabs, Tab } from '../../../components/ui';
import { useMonitoringData } from '../hooks/useMonitoringData';
import { ErrorRateChart } from './ErrorRateChart';
import { LatencyMetrics } from './LatencyMetrics';
import { ActiveUserCount } from './ActiveUserCount';
import { FirebaseUsageMetrics } from './FirebaseUsageMetrics';
import { AlertsPanel } from './AlertsPanel';

export const MonitoringDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, isLoading, error } = useMonitoringData();
  
  if (isLoading) return <LoadingIndicator />;
  if (error) return <ErrorDisplay error={error} />;
  
  return (
    <div className="monitoring-dashboard">
      <h1>System Monitoring</h1>
      
      <Tabs
        value={activeTab}
        onChange={(tab) => setActiveTab(tab)}
      >
        <Tab value="overview" label="Overview" />
        <Tab value="performance" label="Performance" />
        <Tab value="errors" label="Errors" />
        <Tab value="usage" label="Firebase Usage" />
        <Tab value="users" label="User Activity" />
      </Tabs>
      
      {activeTab === 'overview' && (
        <Grid columns={2}>
          <Card>
            <ActiveUserCount data={data.activeUsers} />
          </Card>
          <Card>
            <ErrorRateChart data={data.errorRates} />
          </Card>
          <Card>
            <LatencyMetrics data={data.latency} />
          </Card>
          <Card>
            <AlertsPanel alerts={data.activeAlerts} />
          </Card>
        </Grid>
      )}
      
      {/* Other tab contents */}
    </div>
  );
};
```

## Integration with Firebase

The monitoring system leverages these Firebase-specific tools:

### 1. Firebase Performance Monitoring

Used for automated collection of:
- Page load times
- Network request performance
- Render times
- Custom traces for business-critical operations

### 2. Firebase Crashlytics

Used for:
- Automatic crash detection and reporting
- Error grouping and prioritization
- User impact assessment
- Trend analysis

### 3. Firebase Analytics

Used for:
- User behavior tracking
- Feature usage analytics
- Conversion and completion rates
- A/B test performance

### 4. Cloud Functions Monitoring

Used for:
- Function execution metrics
- Memory utilization
- Error rates
- Cold start frequency

## Security Monitoring

Special attention is given to security-related monitoring:

1. **Authentication Monitoring**:
   - Failed login attempts (rate and patterns)
   - Account lockouts
   - Password reset requests
   - Unusual access patterns

2. **Authorization Monitoring**:
   - Permission elevation attempts
   - Unauthorized access attempts
   - Security rule rejections

3. **Data Access Monitoring**:
   - Sensitive data access patterns
   - Unusual query patterns
   - High-volume data access

## Implementation Phases

The monitoring system is implemented in phases:

### Phase 1: Core Health Monitoring
- Basic error logging
- Availability monitoring
- Critical user flow tracking
- Essential alerting for critical issues

### Phase 2: Enhanced Monitoring
- Detailed performance tracing
- User experience metrics
- Expanded alerting rules
- Dashboard implementation

### Phase 3: Advanced Analytics
- Predictive issue detection
- Anomaly detection
- Automated response procedures
- Cross-system correlation

## Best Practices

1. **Focus on Signal-to-Noise Ratio**
   - Log meaningful events, not everything
   - Set appropriate alert thresholds
   - Group related events

2. **Performance Considerations**
   - Use sampling for high-volume events
   - Batch log submissions
   - Disable verbose logging in production

3. **Privacy and Compliance**
   - Never log PII or credentials
   - Follow data retention policies
   - Implement appropriate access controls

4. **Actionable Monitoring**
   - Every alert should be actionable
   - Clear ownership for alerts
   - Documented response procedures

5. **Continuous Improvement**
   - Regular review of log effectiveness
   - Adjust alert thresholds based on experience
   - Automate common resolution paths

## Conclusion

This monitoring and logging strategy provides a lean foundation that focuses on the most critical aspects of system health and user experience. By starting with essential metrics and a clean logging structure, the system can scale as the application grows, adding more sophisticated monitoring capabilities only when needed.

The implementation follows the project's core philosophy by:
- Focusing on the minimal viable monitoring for initial launch
- Establishing patterns that can scale with the application
- Prioritizing user impact over technical metrics
- Integrating seamlessly with the Firebase ecosystem
- Supporting a gradual enhancement approach 