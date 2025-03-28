# Mobile-First Implementation Plan - Comprehensive Guide

## Overview

This document outlines a streamlined implementation plan for transforming the Time Tracking 2.0 application into a mobile-first system. As a solo developer focused on delivering competitive advantage through mobile functionality, this plan prioritizes core features for modern devices (iPhone 10 and newer equivalents).

**Key Goals:**
- Create an intuitive mobile experience for time tracking (workers) and approval (managers)
- Focus on critical workflows that provide immediate business value
- Leverage existing libraries and components to maximize development efficiency
- Implement iteratively, with emphasis on core functionality first

**Competitive Advantages:**
- Simple time entry directly from work sites
- One-tap/swipe approvals for managers
- Modern, touch-optimized interface (unlike legacy competitors)
- Works offline in areas with poor connectivity
- Remembers user login information

## Implementation Tracking

| Phase | Status | Start Date | Target Completion | Actual Completion |
|-------|--------|------------|-------------------|-------------------|
| 1: Mobile Foundation | In Progress | 2024-06-06 | 2024-06-27 | |
| - Week 1: Mobile Setup & Navigation | Completed | 2024-06-06 | 2024-06-13 | 2024-06-13 |
| - Week 2: Authentication & UI Components | Completed | 2024-06-14 | 2024-06-20 | 2024-06-17 |
| - Week 3: Shared Components & Data Management | In Progress | 2024-06-18 | 2024-06-27 | |
| 2: Workers Portal (Hours) | Not Started | | | |
| 3: Managers Portal (Admin) | Not Started | | | |
| 4: Enhancements & Optimization | Not Started | | | |

## Essential Tech Stack

For efficient solo development, use these core technologies:

1. **Base Stack**:
   - React + TypeScript (already in project)
   - Tailwind CSS (already in project)
   - Firebase (already in project)

2. **Recommended Additional Libraries**:
   - [Headless UI](https://headlessui.dev/) - Unstyled, accessible UI components
   - [React Hook Form](https://react-hook-form.com/) - Efficient form handling
   - [React Swipeable](https://github.com/FormidableLabs/react-swipeable) - Touch gesture handling
   - [React Query](https://tanstack.com/query/latest) - Data fetching with offline support
   - [date-fns](https://date-fns.org/) - Lightweight date manipulation

## Phase 1: Mobile Foundation (3 weeks)

### Week 1: Mobile Setup & Navigation

#### Tasks:
- [x] Set up responsive utilities:
  - [x] Create `useViewport.ts` hook for responsive rendering ✅ (Created in packages/common/src/hooks/ui/useViewport.ts)
- [x] Create essential mobile layout components:
  - [x] `MobileContainer.tsx` - Base container with safe areas ✅ (Created in packages/common/src/components/ui/containers/MobileContainer.tsx)
- [x] `BottomNav.tsx` - Fixed bottom navigation ✅ (Created in packages/common/src/components/navigation/BottomNav.tsx)
- [x] `MobileHeader.tsx` - Simplified header for mobile ✅ (Created in packages/common/src/components/navigation/MobileHeader.tsx)
- [x] Create icon components for mobile navigation ✅ (Created in packages/common/src/components/ui/icons/index.tsx)
- [x] Create basic mobile layout structures for both portals:
  - [x] `MobileAdminLayout.tsx` for Admin portal ✅ (Created in packages/admin/src/layouts/MobileAdminLayout.tsx)
  - [x] `MobileHoursLayout.tsx` for Hours portal ✅ (Created in packages/hours/src/layouts/MobileHoursLayout.tsx)
- [x] Set up Tailwind for mobile-first approach:
  - [x] Configure breakpoints in `packages/common/tailwind.config.js` ✅ (Created with mobile-first config)
  - [x] Add safe area utilities for iOS devices ✅ (Added in packages/common/tailwind.config.js)
- [x] Set up mobile testing environment:
  - [x] Configure browser-sync for device testing ✅ (Added scripts/mobile-test.js and npm script)

#### Implementation Notes:

**Viewport Hook Implementation**:
The `useViewport` hook has been implemented with the following improvements over the original plan:
- Added more granular breakpoint flags (`isXs`, `isSm`, `isMd`, etc.)
- Improved SSR compatibility with default fallback values
- Added proper TypeScript types for return values

```tsx
// From packages/common/src/hooks/ui/useViewport.ts
export const useViewport = (): ViewportValues => {
  // Get initial dimensions (defaulting to common mobile size if on server)
  const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
  const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 667;

  const [width, setWidth] = useState<number>(initialWidth);
  const [height, setHeight] = useState<number>(initialHeight);
  
  useEffect(() => {
    // Skip if running on server
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    
    // Set initial values
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Compute breakpoint flags
  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isXs: width < BREAKPOINTS.sm,
    isSm: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
    isMd: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isLg: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
    isXl: width >= BREAKPOINTS.xl && width < BREAKPOINTS.xxl,
    isXxl: width >= BREAKPOINTS.xxl,
  };
};
```

**Mobile Navigation Implementation**:
The `BottomNav` component has been implemented with additional features:
- Active state detection from the current route
- Improved accessibility with proper aria attributes
- Dark mode support

**Tailwind Mobile Configuration**:
Created a dedicated Tailwind configuration for mobile-first development with these key features:
- iOS safe area insets (`safe-top`, `safe-bottom`, etc.) for handling notches and home indicators
- Touch-friendly target size utilities with minimum 44px height/width
- Mobile-specific utilities for better touch interactions (touch-manipulation, no-tap-highlight)

```js
// From packages/common/tailwind.config.js
export default {
  // ...
  theme: {
    extend: {
      padding: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe': 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-bottom))',
        'touch': '44px', // Minimum touch target height
      },
      minWidth: {
        'touch': '44px', // Minimum touch target width
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      const newUtilities = {
        '.pb-safe-bottom': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.touch-manipulation': {
          touchAction: 'manipulation',
        },
        '.no-tap-highlight': {
          WebkitTapHighlightColor: 'transparent',
        },
      };
      addUtilities(newUtilities, ['responsive']);
    },
  ],
};
```

**Mobile Testing Environment**:
Created a browser-sync setup for testing on actual mobile devices:
- Proxies the Vite development server for real mobile device testing
- Provides URL for access from any device on the local network
- Adds viewport meta tags for mobile rendering
- Detects mobile devices connecting to the server

**Example Pages Created**:
- Created `ApprovalsPage.tsx` in Admin portal showing mobile-optimized approval UI
- Created `TimeEntryPage.tsx` in Hours portal showing mobile-optimized time entry form

#### Deliverables Completed:
- ✅ Viewport detection hook with responsive breakpoints
- ✅ Basic mobile navigation structure with bottom nav and mobile header
- ✅ Mobile container component with safe area support 
- ✅ Example mobile layouts for both portals
- ✅ Tailwind configuration for mobile-first design with safe area utilities
- ✅ Browser-sync setup for testing on physical mobile devices

#### Next Steps:
- Proceed to Week 2 tasks for authentication and UI components

### Week 2: Authentication & Core UI Components

#### Tasks:
- [x] Set up feature flags for progressive development ✅ (Created in packages/common/src/hooks/features/useFeatureFlag.ts)
- [x] Create mobile-optimized authentication flow:
  - [x] Simplified login form with "Remember Me" ✅ (Enhanced in packages/common/src/components/auth/LoginForm.tsx)
  - [x] Biometric authentication integration (framework implemented) ✅ (Added in packages/common/src/firebase/auth/auth-service.ts)
- [x] Implement essential UI components:
  - [x] Touch-friendly buttons (min 44px height) ✅ (Available in packages/common/src/components/ui/Button.tsx)
  - [x] Mobile card components ✅ (Created in packages/common/src/components/ui/Card.tsx)
  - [x] Basic form inputs ✅ (Created in packages/common/src/components/forms/TextInput.tsx)

#### Implementation Notes:

**Enhanced LoginForm Component**:
Enhanced the LoginForm component with improved mobile responsiveness and added functionality:
- Touch-friendly controls with minimum 44px height for better mobile tapping
- "Remember Me" functionality that correctly saves user credentials in localStorage
- Biometric authentication framework with feature flag control
- Responsive design with proper spacing for mobile displays

```tsx
// packages/common/src/components/auth/LoginForm.tsx
import { 
  getRememberedUser, 
  getLastUser, 
  isBiometricAvailable, 
  isBiometricEnabled
} from '../../firebase/auth/auth-service';
import { useViewport } from '../../hooks/ui/useViewport';
import { useFeatureFlag } from '../../hooks/features/useFeatureFlag';

// In the useEffect
useEffect(() => {
  const setupLoginForm = async () => {
    try {
      // Check for remembered user email and prefill
      const rememberedUser = getRememberedUser();
      if (rememberedUser) {
        setEmail(rememberedUser);
        setRememberMe(true);
      }
      
      // Check for biometric authentication availability
      if (isBiometricFeatureEnabled) {
        // Check device/browser support
        const deviceSupported = isBiometricAvailable();
        
        if (deviceSupported) {
          // Get the last user (even if not "remembered")
          const lastUser = getLastUser();
          if (lastUser) {
            setLastLoggedInUser(lastUser);
            
            // Check if this user has biometric enabled
            const isBiometricEnabledForUser = await isBiometricEnabled(lastUser);
            setBiometricAvailable(isBiometricEnabledForUser);
          }
        }
      }
    } catch (err) {
      console.error('Error setting up login form:', err);
    }
  };
  
  setupLoginForm();
}, [isBiometricFeatureEnabled]);

// Touch-friendly mobile input styling:
<input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  disabled={isSubmitting}
  className="
    w-full p-3 border border-gray-300 rounded-md 
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
    min-h-[44px]
  "
  placeholder="your@email.com"
/>
```

**New Card Component**:
Created a mobile-optimized Card component with:
- Multiple style variants (shadow, border, highlight)
- Touch-friendly styling with proper feedback on interaction
- Accessible keyboard navigation when interactive

```tsx
// packages/common/src/components/ui/Card.tsx
export interface CardProps {
  /** Card title (optional) */
  title?: React.ReactNode;
  /** Card subtitle (optional) */
  subtitle?: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Footer content (optional) */
  footer?: React.ReactNode;
  /** Makes the card take up the full width of its container */
  fullWidth?: boolean;
  /** Custom padding */
  padding?: 'none' | 'small' | 'medium' | 'large';
  /** Background color */
  background?: 'white' | 'gray' | 'primary-light';
  /** Border style */
  border?: 'none' | 'default' | 'highlight';
  /** Highlight color for border (when border is 'highlight') */
  highlightColor?: 'primary' | 'success' | 'warning' | 'error';
  /** Shadow size */
  shadow?: 'none' | 'small' | 'medium' | 'large';
  /** Makes the card interactive with hover/active states */
  interactive?: boolean;
  /** Callback for when card is clicked (only used with interactive=true) */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// Interactive classes for touch feedback
const interactiveClasses = interactive
  ? 'cursor-pointer touch-manipulation hover:bg-gray-50 active:bg-gray-100 transition-colors'
  : '';

// Usage example:
<Card 
  title="Time Entry"
  subtitle="Today's hours"
  border="highlight"
  highlightColor="primary"
  shadow="medium"
  interactive
  onClick={handleCardClick}
>
  <p>You've logged 8 hours today</p>
</Card>
```

**New TextInput Component**:
Created a mobile-optimized TextInput component with:
- Touch-friendly sizing (min 44px height)
- Support for icons, error states, and help text
- Accessible markup with proper labeling

```tsx
// packages/common/src/components/forms/TextInput.tsx
export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label */
  label?: string;
  /** Help text displayed below the input */
  helpText?: string;
  /** Error message */
  error?: string;
  /** Input size */
  size?: 'small' | 'medium' | 'large';
  /** Makes the input take the full width of its container */
  fullWidth?: boolean;
  /** Icon to display at the start of the input */
  startIcon?: React.ReactNode;
  /** Icon to display at the end of the input */
  endIcon?: React.ReactNode;
  /** Callback for clicking the end icon */
  onEndIconClick?: () => void;
}

// Size classes with touch-friendly defaults
const sizeClasses = {
  small: 'h-10 py-2 text-sm',
  medium: 'h-12 py-3', // Default 48px height (12 * 4px)
  large: 'h-14 py-4 text-lg',
};

// Usage example:
<TextInput
  label="Hours Worked"
  type="number"
  size="medium"
  startIcon={<ClockIcon />}
  helpText="Enter hours in 0.5 increments"
  onChange={handleHoursChange}
/>
```

**Authentication Service Enhancements**:
Enhanced the authentication service with:
- Remember Me functionality using localStorage
- Framework for biometric authentication
- Device capability detection

```tsx
// packages/common/src/firebase/auth/auth-service.ts
// Remember me storage keys
const REMEMBER_ME_KEY = 'time_tracking_remember_me';
const LAST_USER_KEY = 'time_tracking_last_user';

// Store the remembered user details
export const setRememberedUser = (email: string, rememberMe: boolean): void => {
  try {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, email);
      localStorage.setItem(LAST_USER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      // Still store the last user for biometric login
      localStorage.setItem(LAST_USER_KEY, email);
    }
  } catch (error) {
    console.error('Failed to save remember me preference', error);
  }
};

// Login with email and password
export const login = async (
  email: string, 
  password: string, 
  rememberMe: boolean = false
): Promise<UserCredential> => {
  // Set persistence based on remember me
  const persistenceLevel = rememberMe ? 'local' : 'session';
  await setPersistenceLevel(persistenceLevel);
  
  // Perform login
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  
  // Save remember me preference
  setRememberedUser(email, rememberMe);
  
  // Record last login timestamp
  if (userCredential.user) {
    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      lastLoginAt: new Date().toISOString(),
    });
  }
  
  return userCredential;
};

// Check if biometric authentication is available
export const isBiometricAvailable = (): boolean => {
  // Check for WebAuthn/Credential Management API support
  return window && 
         window.PublicKeyCredential && 
         typeof window.PublicKeyCredential === 'function';
};
```

#### Deliverables Completed:
- ✅ Feature flag system for progressive development
- ✅ Enhanced LoginForm with "Remember Me" and biometric framework
- ✅ Touch-friendly UI components including Card and TextInput
- ✅ Mobile-optimized input styling with proper touch targets
- ✅ Authentication service with improved persistence options

### Week 3: Shared Components & Data Management

#### Tasks:
- [x] Set up offline data capabilities:
  - [x] Configure Firebase for offline persistence ✅ (Added in packages/common/src/firebase/core/firebase.ts)
  - [x] Create API client with offline support ✅ (Enhanced in packages/common/src/utils/api-client.ts)
- [x] Create sync status indicator ✅ (Created in packages/common/src/components/ui/OfflineIndicator.tsx)
- [x] Implement shared data components:
  - [x] Date picker optimized for touch ✅ (Created in packages/common/src/components/forms/DatePickerMobile.tsx)
  - [x] Time input with quick presets ✅ (Created in packages/common/src/components/forms/TimeInputMobile.tsx)
  - [x] Mobile-friendly dropdowns ✅ (Created in packages/common/src/components/forms/DropdownMobile.tsx)
- [x] Create React Query setup with offline support ✅ (Enhanced in packages/common/src/lib/react-query.ts)

#### Implementation Notes:

**Firebase Offline Persistence Setup**:
Enhanced the Firebase configuration with offline persistence for mobile devices:

```tsx
// packages/common/src/firebase/core/firebase.ts
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from 'firebase/firestore';

// After initializing Firestore
export const db = getFirestore(app);

// Configure Firestore for offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab
    console.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support persistence
    console.warn('Firestore persistence not supported in this browser');
  } else {
    // Handle other errors
    console.error('Firestore persistence error:', err);
  }
});
```

**Offline Status Indicator Component**:
Created a versatile offline status indicator component that shows a banner when the user is offline:

```tsx
// packages/common/src/components/ui/OfflineIndicator.tsx
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  className = '',
  message = "You're offline. Changes will sync when you reconnect.",
  position = 'bottom',
  variant = 'warning',
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Only show indicator when offline
  if (isOnline) return null;
  
  return (
    <div className="fixed left-0 right-0 z-50 py-2 px-4 text-center">
      <div className="flex items-center justify-center">
        <span>{message}</span>
      </div>
    </div>
  );
};
```

**Mobile-Optimized Form Components**:
Created a suite of touch-friendly form components with appropriate input sizes (44px minimum) for mobile use:

1. **DatePickerMobile**: Uses the native date input for the best mobile experience
   ```tsx
   // DatePickerMobile example
   <DatePickerMobile
     label="Start Date"
     value={startDate}
     onChange={setStartDate}
     minDate={new Date()}
     required
   />
   ```

2. **TimeInputMobile**: Includes increment/decrement buttons and quick preset selection
   ```tsx
   // TimeInputMobile with quick select presets
   <TimeInputMobile
     label="Hours Worked"
     value={hoursWorked}
     onChange={setHoursWorked}
     presets={[30, 60, 120, 240, 480]} // 30min, 1hr, 2hrs, 4hrs, 8hrs
     displayFormat="hours"
   />
   ```

3. **DropdownMobile**: Uses the native select element with custom styling
   ```tsx
   // Mobile-friendly dropdown
   <DropdownMobile
     label="Project"
     options={[
       { value: 'project1', label: 'Project 1' },
       { value: 'project2', label: 'Project 2' }
     ]}
     value={selectedProject}
     onChange={setSelectedProject}
   />
   ```

**React Query Offline Configuration**:
Enhanced React Query setup with offline-optimized configuration:

```tsx
// packages/common/src/lib/react-query.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // 24 hours - keep data much longer for offline use
      retry: 3,
      networkMode: 'always', // Use cached data when offline
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      networkMode: 'always', // Allow mutation attempts while offline (will be queued)
    },
  },
});

// Set up online status detection for React Query
if (typeof window !== 'undefined') {
  onlineManager.setEventListener(setOnline => {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    // ...
  });
}
```

#### Deliverables Completed:
- ✅ Firebase offline persistence configuration
- ✅ Offline status indicator component
- ✅ Mobile-optimized form components (DatePickerMobile, TimeInputMobile, DropdownMobile)
- ✅ React Query offline setup with longer caching time

#### Next Steps:
- Begin Phase 2: Workers Portal Implementation with a focus on the time entry form
- Implement the mobile dashboard for the hours portal
- Create mobile-optimized time entry screens

## Phase 2: Workers Portal Implementation (4 weeks)

### Week 4-5: Time Entry Core Experience

#### Tasks:
- [ ] Create mobile dashboard in `packages/hours/src/pages/Dashboard.tsx`:
  - [ ] Today's quick summary
  - [ ] This week's hours at a glance
  - [ ] Quick actions for today
- [ ] Implement time entry form:
  - [ ] Simple hours input with presets
  - [ ] Project/task selection optimized for touch
  - [ ] Quick submission process
- [ ] Implement optimistic updates for time entries

#### Implementation Details:

**Time Entry Form with React Hook Form**:
```tsx
// packages/hours/src/components/TimeEntryForm.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';

interface TimeEntryFormProps {
  onSubmit: (data: TimeEntryData) => void;
  isLoading?: boolean;
  initialData?: Partial<TimeEntryData>;
}

interface TimeEntryData {
  date: string;
  hours: number;
  projectId: string;
  notes?: string;
}

export const TimeEntryForm: React.FC<TimeEntryFormProps> = ({
  onSubmit,
  isLoading = false,
  initialData = {}
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const { register, handleSubmit, setValue, watch } = useForm<TimeEntryData>({
    defaultValues: {
      date: today,
      hours: 8,
      projectId: '',
      notes: '',
      ...initialData
    }
  });
  
  const hours = watch('hours');
  const presets = [4, 6, 8, 10];
  
  const selectPreset = (preset: number) => {
    setValue('hours', preset);
  };
  
  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {/* Form implementation as shown in the design system */}
      {/* ... */}
      
      {/* Optimized mobile submit button */}
      <div className="sticky bottom-0 bg-white pt-2 pb-safe-bottom mt-6">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary-600 text-white rounded-lg h-12 font-medium"
        >
          {isLoading ? 'Saving...' : 'Save Time Entry'}
        </button>
      </div>
    </form>
  );
};
```

**Optimistic Updates with React Query**:
```tsx
// packages/hours/src/hooks/useTimeEntries.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { TimeEntry } from '@/types';

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entry: Omit<TimeEntry, 'id'>) => {
      const docRef = await addDoc(collection(db, 'timeEntries'), entry);
      return { id: docRef.id, ...entry };
    },
    onMutate: async (newEntry) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['timeEntries'] });
      
      // Get current time entries
      const previousEntries = queryClient.getQueryData<TimeEntry[]>(['timeEntries']);
      
      // Create optimistic entry with temporary ID
      const optimisticEntry = {
        id: `temp-${new Date().getTime()}`,
        ...newEntry,
        createdAt: new Date().toISOString(),
      };
      
      // Update cache with optimistic entry
      queryClient.setQueryData<TimeEntry[]>(['timeEntries'], old => [
        ...(old || []),
        optimisticEntry as TimeEntry
      ]);
      
      return { previousEntries };
    },
    onError: (err, newEntry, context) => {
      // If mutation fails, restore previous entries
      queryClient.setQueryData(['timeEntries'], context?.previousEntries);
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    }
  });
}
```

#### Deliverables:
- Mobile worker dashboard
- Streamlined time entry form
- Optimistic updates for time entries

### Week 6-7: Weekly View & History

#### Tasks:
- [ ] Create weekly timesheet view:
  - [ ] Swipeable week navigation
  - [ ] Day cards with quick entry
  - [ ] Weekly summary statistics
- [ ] Implement time entry history:
  - [ ] Infinite scroll for past entries
  - [ ] Entry details with expand/collapse
  - [ ] Status indicators for approvals
- [ ] Add debounced updates for form inputs

#### Implementation Details:

**Swipeable Week Navigation**:
```tsx
// packages/hours/src/components/WeekNavigator.tsx
import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';

export const WeekNavigator: React.FC<{ onWeekChange: (start: Date, end: Date) => void }> = ({ onWeekChange }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 }); // Sunday
  
  const goToPreviousWeek = () => {
    const newDate = subWeeks(currentDate, 1);
    setCurrentDate(newDate);
    onWeekChange(startOfWeek(newDate, { weekStartsOn: 1 }), endOfWeek(newDate, { weekStartsOn: 1 }));
  };
  
  const goToNextWeek = () => {
    const newDate = addWeeks(currentDate, 1);
    setCurrentDate(newDate);
    onWeekChange(startOfWeek(newDate, { weekStartsOn: 1 }), endOfWeek(newDate, { weekStartsOn: 1 }));
  };
  
  const swipeHandlers = useSwipeable({
    onSwipedLeft: goToNextWeek,
    onSwipedRight: goToPreviousWeek,
    trackMouse: true
  });
  
  return (
    <div 
      {...swipeHandlers}
      className="flex items-center justify-between bg-white p-4 sticky top-0 z-10"
    >
      <button 
        type="button"
        onClick={goToPreviousWeek}
        className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100"
      >
        ←
      </button>
      
      <div className="text-center">
        <h2 className="font-medium">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <p className="text-sm text-gray-500">Swipe to change week</p>
      </div>
      
      <button 
        type="button"
        onClick={goToNextWeek}
        className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100"
      >
        →
      </button>
    </div>
  );
};
```

**Debounced Input Updates**:
```tsx
// packages/common/src/hooks/useDebounce.ts
import { useCallback } from 'react';
import debounce from 'lodash/debounce';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 500
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    debounce((...args: Parameters<T>) => {
      callback(...args);
    }, delay),
    [callback, delay]
  );
}

// Usage in a form component
const debouncedUpdate = useDebouncedCallback((value) => {
  updateTimeEntry({ ...entry, hours: value });
}, 800);

// In the UI
<input
  type="number"
  onChange={(e) => debouncedUpdate(e.target.value)}
  // ...
/>
```

#### Deliverables:
- Mobile weekly view with swipe navigation
- Time entry history interface
- Debounced update implementation for form inputs

## Phase 3: Managers Portal Implementation (4 weeks)

### Week 8-9: Approval Dashboard & Queue

#### Tasks:
- [ ] Create manager dashboard in `packages/admin/src/pages/Dashboard.tsx`:
  - [ ] Pending approvals count
  - [ ] Quick filters by employee/project
  - [ ] Recent activity summary
- [ ] Implement approval queue:
  - [ ] Card-based approval interface
  - [ ] Swipe to approve/reject pattern
  - [ ] Batch approval capabilities
- [ ] Handle form input focus for mobile

#### Implementation Details:

**Swipeable Approval Card**:
```tsx
// Implementation as shown in the design system document
// packages/admin/src/components/ApprovalCard.tsx
```

**Form Input Focus Management**:
```tsx
// packages/common/src/hooks/useInputFocus.ts
import { useRef, useEffect } from 'react';

export function useInputFocus(isFocused: boolean) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isFocused && inputRef.current) {
      // Add a slight delay to let the keyboard appear
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [isFocused]);
  
  return inputRef;
}

// Usage in a component
const MyInput = ({ label, isFocused, ...props }) => {
  const inputRef = useInputFocus(isFocused);
  
  return (
    <div>
      <label>{label}</label>
      <input ref={inputRef} {...props} />
    </div>
  );
};
```

#### Deliverables:
- Manager mobile dashboard
- Swipe-based approval interface
- Form input focus management

### Week 10-11: Employee Management & Basic Reports

#### Tasks:
- [ ] Create employee time summary view:
  - [ ] Individual employee hours by week
  - [ ] Status overview (approved/pending/rejected)
  - [ ] Quick filters for date ranges
- [ ] Implement simplified mobile reports:
  - [ ] Hours by employee
  - [ ] Hours by project
  - [ ] Export/share capabilities
- [ ] Implement card-based mobile tables

#### Implementation Details:

**Card-Based Mobile Tables**:
```tsx
// Implementation as shown in the design system document
// packages/common/src/components/data-display/ResponsiveTable.tsx
```

#### Deliverables:
- Employee summary interface
- Basic mobile reports
- Share/export functionality

## Phase 4: Enhancements & Optimization (3 weeks)

### Week 12-13: PWA Implementation & Polish

#### Tasks:
- [ ] Implement basic PWA features:
  - [ ] Web app manifest
  - [ ] Service worker for offline app shell
  - [ ] Add to home screen experience
- [ ] Add final polish:
  - [ ] Loading states and animations
  - [ ] Error handling for mobile context
  - [ ] Transition animations
- [ ] Fix iOS Safari-specific issues

#### Implementation Details:

**PWA Web Manifest**:
```json
// public/manifest.json
{
  "short_name": "TimeTrack",
  "name": "Time Tracking 2.0",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#f59e0b",
  "background_color": "#ffffff"
}
```

**iOS Safari Fixes**:
```css
/* Fix for 100vh issues in iOS Safari */
.min-h-screen {
  min-height: 100vh;
  /* Use fallback for iOS */
  min-height: -webkit-fill-available;
}

/* Fix for position:fixed elements when keyboard is active */
.ios-fixed-footer {
  position: sticky;
  bottom: 0;
  z-index: 40;
}
```

#### Deliverables:
- Basic PWA functionality
- Polished mobile experience
- iOS Safari compatibility fixes

### Week 14: Testing & Performance Optimization

#### Tasks:
- [ ] Conduct cross-device testing:
  - [ ] iOS testing on multiple devices
  - [ ] Android testing on multiple devices
- [ ] Optimize performance:
  - [ ] Reduce bundle size where possible
  - [ ] Optimize image loading
  - [ ] Audit and fix performance issues
- [ ] Final documentation updates

#### Implementation Details:

**Performance Optimization**:
```jsx
// Dynamic imports for code splitting
import { lazy, Suspense } from 'react';

// Lazy load non-critical components
const Reports = lazy(() => import('./Reports'));

// Use in component
<Suspense fallback={<LoadingSpinner />}>
  <Reports />
</Suspense>

// Image optimization
<img 
  src={smallImage} 
  srcSet={`${smallImage} 1x, ${mediumImage} 2x`}
  loading="lazy" 
  alt="..." 
/>
```

#### Deliverables:
- Cross-device testing report
- Performance optimization improvements
- Final documentation updates

## Implementation Strategy

### Development Workflow

For efficient solo development:

1. **Follow 2-4 Day Sprints**:
   - **Day 1-2**: Build component foundations for a particular feature
   - **Day 3-4**: Implement the feature using those components
   - **Day 5**: Test on real devices, fix issues, then move to the next feature

2. **Mobile-First Process**:
   - Start with mobile-only views first
   - Focus on complete mobile functionality before enhancing for tablet/desktop
   - Test frequently on actual devices

3. **Implementation Order**:
   - Build shared UI components first
   - Implement /hours portal before /admin portal
   - Focus on critical workflows before "nice-to-have" features

### Common Mobile Development Pitfalls

1. **iOS Safari Issues**:
   - Virtual keyboard can push fixed elements up
   - 100vh can cause overscrolling problems
   - Always test on actual iOS devices

2. **Form Input Challenges**:
   - Input focus may be obscured by the keyboard
   - Implement the scroll-into-view pattern for all forms
   - Use appropriate input types to trigger correct mobile keyboards

3. **Offline Sync Complexities**:
   - Test offline scenarios extensively
   - Handle conflicts when reconnecting to network
   - Provide clear UI indicators for sync status

4. **Performance Considerations**:
   - Mobile networks can be slow - implement loading states
   - Mobile CPUs can be limited - debounce heavy operations
   - Battery life is precious - minimize background operations

### Questions to Ask During Implementation

1. **Is this interaction optimized for one-handed use?**
2. **Does this work correctly when offline?**
3. **How does this handle spotty network connections?**
4. **Is this performant on mid-range devices?**
5. **How does this behave with the virtual keyboard open?**

## Success Metrics

- **Time Savings**: Workers can submit time in under 30 seconds
- **Error Reduction**: Decrease in submission errors compared to competitors
- **Manager Efficiency**: Approvals can be processed in bulk with minimal effort
- **Adoption Rate**: Percentage of users choosing mobile over desktop

## Future Enhancements (Post-Initial Implementation)

Once the core mobile experience is complete, consider these enhancements:

1. **Advanced Features**:
   - Location-based time tracking
   - Photo/document attachments
   - Voice input for notes
   - Push notifications for approvals

2. **Additional Optimizations**:
   - Advanced offline workflows
   - Background sync capabilities
   - Improved animations and transitions

3. **Analytics & Insights**:
   - Usage patterns analysis
   - Performance monitoring
   - User feedback collection 