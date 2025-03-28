/**
 * API Client
 * 
 * A simple fetch wrapper with support for:
 * - Offline mode
 * - Request caching
 * - Optimistic updates
 * - Automatic retries
 */

// Define types for response data and cache
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
type ApiResponseData = JsonValue;

interface ApiRequestConfig extends Omit<RequestInit, 'cache'> {
  /** Cache the response for offline use */
  cacheResponse?: boolean;
  /** Cache expiration time in seconds */
  cacheTime?: number;
  /** Retry the request on failure */
  retry?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Whether to use optimistic updates */
  optimistic?: boolean;
  /** Offline fallback data */
  offlineFallback?: unknown;
  /** Native fetch cache setting */
  cache?: RequestCache;
}

interface ApiClient {
  /** Perform a GET request */
  get: <T>(url: string, config?: ApiRequestConfig) => Promise<T>;
  /** Perform a POST request */
  post: <T>(url: string, data: JsonValue, config?: ApiRequestConfig) => Promise<T>;
  /** Perform a PUT request */
  put: <T>(url: string, data: JsonValue, config?: ApiRequestConfig) => Promise<T>;
  /** Perform a DELETE request */
  delete: <T>(url: string, config?: ApiRequestConfig) => Promise<T>;
  /** Check if the app is online */
  isOnline: () => boolean;
  /** Clear all cached requests */
  clearCache: () => Promise<void>;
}

// Default API configuration
const DEFAULT_CONFIG: ApiRequestConfig = {
  cacheResponse: true,
  cacheTime: 3600, // 1 hour
  retry: true,
  maxRetries: 3,
  optimistic: false,
  cache: 'default',
};

// Local storage cache keys
const CACHE_PREFIX = 'api_cache_';
const PENDING_OPERATIONS_KEY = 'api_pending_operations';

/**
 * Create an API client with offline support
 */
export const createApiClient = (baseUrl: string): ApiClient => {
  // Check online status
  const isOnline = (): boolean => {
    return navigator.onLine;
  };

  // Cache a response
  const cacheResponse = (url: string, response: ApiResponseData, config: ApiRequestConfig) => {
    if (!config.cacheResponse) return;
    
    const cacheItem = {
      data: response,
      timestamp: Date.now(),
      expires: Date.now() + (config.cacheTime || DEFAULT_CONFIG.cacheTime || 0) * 1000,
    };
    
    try {
      localStorage.setItem(`${CACHE_PREFIX}${url}`, JSON.stringify(cacheItem));
    } catch (error) {
      console.error('Error caching response:', error);
    }
  };

  // Get cached response
  const getCachedResponse = (url: string): ApiResponseData | null => {
    try {
      const cacheItem = localStorage.getItem(`${CACHE_PREFIX}${url}`);
      if (!cacheItem) return null;
      
      const { data, expires } = JSON.parse(cacheItem);
      if (expires < Date.now()) {
        localStorage.removeItem(`${CACHE_PREFIX}${url}`);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error retrieving cached response:', error);
      return null;
    }
  };

  // Queue operation for offline mode
  const queueOperation = (method: string, url: string, data?: JsonValue) => {
    try {
      const pendingOperations = JSON.parse(
        localStorage.getItem(PENDING_OPERATIONS_KEY) || '[]'
      );
      
      pendingOperations.push({
        method,
        url,
        data,
        timestamp: Date.now(),
      });
      
      localStorage.setItem(
        PENDING_OPERATIONS_KEY,
        JSON.stringify(pendingOperations)
      );
    } catch (error) {
      console.error('Error queueing operation:', error);
    }
  };

  // Clear the cache
  const clearCache = async (): Promise<void> => {
    const cacheKeys = Object.keys(localStorage).filter(key => 
      key.startsWith(CACHE_PREFIX)
    );
    
    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  };

  // Process a request with caching and offline handling
  const request = async <T>(
    url: string,
    method: string,
    data?: JsonValue,
    config: ApiRequestConfig = {}
  ): Promise<T> => {
    // Merge default config with provided config
    const mergedConfig = { ...DEFAULT_CONFIG, ...config, method };
    const fullUrl = `${baseUrl}${url}`;
    
    // Handle the case when offline
    if (!isOnline()) {
      // eslint-disable-next-line no-console
      console.log('Offline mode: Using cached response or offline fallback');
      
      // If this is a mutation (POST/PUT/DELETE), queue it for later
      if (method !== 'GET') {
        queueOperation(method, url, data);
        // Return fallback or empty object, asserting it matches the expected type
        return (mergedConfig.offlineFallback ?? {}) as T;
      }
      
      // For GET requests, use cached response if available
      const cachedResponse = getCachedResponse(url);
      if (cachedResponse) {
        return cachedResponse as T;
      }
      
      // If no cached response, return fallback or error
      if (mergedConfig.offlineFallback !== undefined) {
        return mergedConfig.offlineFallback as T;
      }
      
      throw new Error('Offline and no cached data available');
    }
    
    // Prepare fetch options
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...mergedConfig.headers,
      },
      cache: mergedConfig.cache,
      credentials: mergedConfig.credentials,
      integrity: mergedConfig.integrity,
      keepalive: mergedConfig.keepalive,
      mode: mergedConfig.mode,
      redirect: mergedConfig.redirect,
      referrer: mergedConfig.referrer,
      referrerPolicy: mergedConfig.referrerPolicy,
      signal: mergedConfig.signal,
      window: mergedConfig.window,
    };
    
    // Add body for non-GET requests
    if (method !== 'GET' && data) {
      options.body = JSON.stringify(data);
    }
    
    // Execute request with retry logic
    let attempt = 0;
    let error: Error | null = null;
    
    while (attempt < (mergedConfig.maxRetries || 1)) {
      try {
        const response = await fetch(fullUrl, options);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const responseData = await response.json();
        
        // Cache successful GET responses
        if (method === 'GET' && mergedConfig.cacheResponse) {
          cacheResponse(url, responseData, mergedConfig);
        }
        
        return responseData as T;
      } catch (err) {
        error = err as Error;
        attempt++;
        
        if (attempt >= (mergedConfig.maxRetries || 1) || !mergedConfig.retry) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
    
    throw error || new Error('Request failed after retries');
  };

  return {
    get: <T>(url: string, config?: ApiRequestConfig) => 
      request<T>(url, 'GET', undefined, config),
    
    post: <T>(url: string, data: JsonValue, config?: ApiRequestConfig) => 
      request<T>(url, 'POST', data, config),
    
    put: <T>(url: string, data: JsonValue, config?: ApiRequestConfig) => 
      request<T>(url, 'PUT', data, config),
    
    delete: <T>(url: string, config?: ApiRequestConfig) => 
      request<T>(url, 'DELETE', undefined, config),
    
    isOnline,
    clearCache,
  };
};

// Create default API client instance
export const apiClient = createApiClient('/api');

export default apiClient; 