import { getPerformance, trace } from 'firebase/performance';
import { app } from '../core/firebase';

/**
 * Initialize Firebase Performance Monitoring
 */
export const performance = getPerformance(app);

/**
 * Create a custom trace for measuring performance
 */
export function createPerformanceTrace(traceName: string) {
  const performanceTrace = trace(performance, traceName);
  
  const startTrace = () => {
    performanceTrace.start();
    return performanceTrace;
  };
  
  const stopTrace = () => {
    performanceTrace.stop();
    return performanceTrace;
  };
  
  const putAttribute = (name: string, value: string) => {
    performanceTrace.putAttribute(name, value);
    return performanceTrace;
  };
  
  const incrementMetric = (metricName: string, incrementBy = 1) => {
    performanceTrace.incrementMetric(metricName, incrementBy);
    return performanceTrace;
  };
  
  return {
    startTrace,
    stopTrace,
    putAttribute,
    incrementMetric,
    trace: performanceTrace,
  };
}

/**
 * Measure the performance of a function
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  functionName: string,
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args: Parameters<T>): ReturnType<T> => {
    const perfTrace = createPerformanceTrace(`function_${functionName}`);
    perfTrace.startTrace();
    
    try {
      const result = fn(...args);
      
      // Handle promises
      if (result instanceof Promise) {
        return result
          .then(value => {
            perfTrace.stopTrace();
            return value;
          })
          .catch(error => {
            perfTrace.putAttribute('error', 'true');
            perfTrace.stopTrace();
            throw error;
          }) as ReturnType<T>;
      }
      
      perfTrace.stopTrace();
      return result;
    } catch (error) {
      perfTrace.putAttribute('error', 'true');
      perfTrace.stopTrace();
      throw error;
    }
  };
}

/**
 * React hook to measure component render performance
 */
export function useComponentPerformance(componentName: string) {
  // This would be implemented with useEffect and useRef
  // For now, just return the trace functions
  return createPerformanceTrace(`component_${componentName}`);
} 