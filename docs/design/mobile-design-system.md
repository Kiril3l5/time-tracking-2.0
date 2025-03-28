# Mobile Design System Guidelines - Simplified

This document outlines the essential mobile design principles and patterns for the Time Tracking 2.0 application, focusing on modern devices (iPhone 10+ and equivalent Android). This is a practical guide for implementation rather than an exhaustive design system.

## Core Mobile Design Principles

1. **Focus on Core Workflows**
   - Time entry for workers must be lightning-fast
   - Approval process for managers should be intuitive
   - Optimize the critical paths first, then enhance secondary features

2. **Touch-Optimized Controls**
   - Minimum touch target size of 44px × 44px
   - Clear visual feedback on all interactive elements
   - Place primary actions in thumb-friendly zones

3. **Offline-First Thinking**
   - Always design with offline capability in mind
   - Provide clear sync status indicators
   - Enable entry and approval even without connectivity

## Responsive Design Approach

The application uses a mobile-first approach with these key breakpoints:

| Breakpoint | Width | Primary Usage |
|------------|-------|---------------|
| Default    | < 640px | Mobile devices (primary focus) |
| sm         | ≥ 640px | Large mobile/Small tablet |
| md         | ≥ 768px | Tablets |
| lg         | ≥ 1024px | Desktop |

Always design for mobile first, then adapt for larger screens using Tailwind's responsive prefixes.

## Key Mobile Layout Patterns

### 1. Worker Dashboard Layout

```jsx
<div className="flex flex-col min-h-screen">
  {/* Fixed header */}
  <header className="sticky top-0 bg-white z-10 px-4 py-3 shadow">
    <h1 className="text-lg font-semibold">Hours Portal</h1>
  </header>
  
  {/* Scrollable content */}
  <main className="flex-1 overflow-auto p-4">
    {/* Main content here */}
  </main>
  
  {/* Fixed bottom navigation */}
  <nav className="sticky bottom-0 bg-white shadow-top border-t border-gray-200">
    <div className="flex justify-around py-2">
      {/* Nav items */}
    </div>
  </nav>
</div>
```

### 2. Card-Based List Layout

```jsx
<div className="space-y-4">
  {items.map(item => (
    <div 
      key={item.id} 
      className="bg-white rounded-lg shadow p-4 touch-manipulation active:bg-gray-50"
    >
      {/* Card content */}
    </div>
  ))}
</div>
```

### 3. Two-Column Layout (Transforms to Single Column on Mobile)

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="bg-white rounded-lg shadow p-4">
    {/* Left column content */}
  </div>
  <div className="bg-white rounded-lg shadow p-4">
    {/* Right column content */}
  </div>
</div>
```

## Essential Mobile Components

### 1. Bottom Navigation

```jsx
const BottomNav = ({ items, currentPath }) => (
  <nav className="sticky bottom-0 bg-white shadow-top border-t border-gray-200">
    <div className="flex justify-around py-2">
      {items.map(item => (
        <Link 
          key={item.path}
          to={item.path}
          className={`
            flex flex-col items-center justify-center px-4 py-1
            min-w-[60px] min-h-[60px]
            ${currentPath === item.path ? 'text-primary-600' : 'text-gray-500'}
          `}
        >
          <item.icon className="h-6 w-6" />
          <span className="text-xs mt-1">{item.label}</span>
        </Link>
      ))}
    </div>
  </nav>
);
```

### 2. Mobile Form Controls

#### Text Input

```jsx
<div className="mb-4">
  <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
    {label}
  </label>
  <input
    id={id}
    type={type || 'text'}
    className="
      w-full rounded-lg border-gray-300 shadow-sm 
      h-12 px-4 py-2
      focus:ring-2 focus:ring-primary-500 focus:border-primary-500
    "
    {...props}
  />
</div>
```

#### Action Button

```jsx
<button
  type="button"
  className="
    w-full rounded-lg bg-primary-600 px-4
    h-12 text-white font-medium
    active:bg-primary-700 transform active:scale-[0.98]
    transition-all disabled:opacity-50
  "
  {...props}
>
  {children}
</button>
```

### 3. Time Entry Components

#### Quick Time Entry

```jsx
const QuickTimeEntry = ({ date, onSave }) => {
  const [hours, setHours] = useState(8);
  
  // Common presets for quick selection
  const presets = [4, 6, 8, 10];
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-medium mb-3">{formatDate(date)}</h3>
      
      {/* Quick preset buttons */}
      <div className="flex space-x-2 mb-4">
        {presets.map(preset => (
          <button
            key={preset}
            type="button"
            className={`
              flex-1 rounded-md py-2 font-medium
              ${hours === preset 
                ? 'bg-primary-100 text-primary-700 border border-primary-300' 
                : 'bg-gray-100 text-gray-700'}
            `}
            onClick={() => setHours(preset)}
          >
            {preset}h
          </button>
        ))}
      </div>
      
      {/* Number input with +/- buttons */}
      <div className="flex items-center mb-4">
        <button 
          type="button"
          className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center"
          onClick={() => setHours(Math.max(0, hours - 0.5))}
        >
          -
        </button>
        <input
          type="number"
          className="mx-2 h-12 text-center w-20 rounded-md border-gray-300"
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          step="0.5"
        />
        <button 
          type="button"
          className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center"
          onClick={() => setHours(hours + 0.5)}
        >
          +
        </button>
      </div>
      
      <button
        type="button"
        className="w-full bg-primary-600 text-white rounded-lg h-12 font-medium"
        onClick={() => onSave({ date, hours })}
      >
        Save Time
      </button>
    </div>
  );
};
```

### 4. Approval Components

#### Swipeable Approval Card

```jsx
import { useSwipeable } from 'react-swipeable';

const ApprovalCard = ({ entry, onApprove, onReject }) => {
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => onReject(entry.id),
    onSwipedRight: () => onApprove(entry.id),
    trackMouse: true
  });
  
  return (
    <div
      {...swipeHandlers}
      className="bg-white rounded-lg shadow p-4 relative overflow-hidden"
    >
      <div className="flex justify-between mb-2">
        <span className="font-medium">{entry.userName}</span>
        <span className="text-gray-500">{formatDate(entry.date)}</span>
      </div>
      
      <div className="flex justify-between mb-4">
        <span>{entry.hours} hours</span>
        <span className="text-gray-500">{entry.project}</span>
      </div>
      
      {/* Action buttons as alternative to swiping */}
      <div className="flex space-x-2">
        <button
          type="button"
          className="flex-1 bg-green-50 text-green-700 border border-green-200 rounded-md py-2"
          onClick={() => onApprove(entry.id)}
        >
          Approve
        </button>
        <button
          type="button"
          className="flex-1 bg-red-50 text-red-700 border border-red-200 rounded-md py-2"
          onClick={() => onReject(entry.id)}
        >
          Reject
        </button>
      </div>
      
      {/* Swipe hint text */}
      <p className="text-xs text-center text-gray-400 mt-2">
        Swipe right to approve, left to reject
      </p>
    </div>
  );
};
```

## Mobile-First Forms

### Best Practices

1. **Keep Forms Short**
   - Include only essential fields
   - Use progressive disclosure for advanced options
   - Break long forms into steps

2. **Optimize for Touch**
   - Provide large input areas (min 44px height)
   - Use native date/time pickers when appropriate
   - Choose selects/dropdowns carefully (consider alternatives)

3. **Provide Immediate Validation**
   - Validate as users type or on field blur
   - Show clear error messages below fields
   - Use color and icons to indicate state

### Form Layout Example

```jsx
<form className="space-y-4" onSubmit={handleSubmit}>
  {/* Single column layout on mobile */}
  <div className="space-y-4">
    {/* Project selection */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Project
      </label>
      <select 
        className="w-full rounded-lg border-gray-300 h-12 px-3"
        value={project}
        onChange={e => setProject(e.target.value)}
      >
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
    
    {/* Hours input */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Hours
      </label>
      <input 
        type="number" 
        className="w-full rounded-lg border-gray-300 h-12 px-4"
        value={hours}
        onChange={e => setHours(e.target.value)}
        step="0.5"
        min="0"
        max="24"
      />
    </div>
    
    {/* Date picker */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Date
      </label>
      <input 
        type="date" 
        className="w-full rounded-lg border-gray-300 h-12 px-4"
        value={date}
        onChange={e => setDate(e.target.value)}
        max={today}
      />
    </div>
    
    {/* Notes - optional with disclosure */}
    <div>
      <div 
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setShowNotes(!showNotes)}
      >
        <label className="block text-sm font-medium text-gray-700">
          Notes (optional)
        </label>
        <ChevronDownIcon 
          className={`h-5 w-5 transform transition-transform ${showNotes ? 'rotate-180' : ''}`} 
        />
      </div>
      
      {showNotes && (
        <textarea
          className="w-full rounded-lg border-gray-300 mt-1 min-h-[100px] p-3"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add any details about this time entry..."
        />
      )}
    </div>
  </div>
  
  {/* Submit button - fixed to bottom on mobile */}
  <div className="sticky bottom-0 bg-white pt-2 pb-4 mt-6">
    <button
      type="submit"
      className="w-full bg-primary-600 text-white rounded-lg h-12 font-medium"
    >
      Save Time Entry
    </button>
  </div>
</form>
```

## Mobile Data Display Patterns

### 1. Card Lists for Data Tables

On mobile, transform data tables into card lists:

```jsx
// Desktop: Standard table
<div className="hidden md:block">
  <table className="min-w-full">
    <thead>
      <tr>
        <th>Date</th>
        <th>Hours</th>
        <th>Project</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {entries.map(entry => (
        <tr key={entry.id}>
          <td>{formatDate(entry.date)}</td>
          <td>{entry.hours}</td>
          <td>{entry.project}</td>
          <td>{entry.status}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

// Mobile: Card list
<div className="md:hidden space-y-4">
  {entries.map(entry => (
    <div key={entry.id} className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between">
        <span className="font-medium">{formatDate(entry.date)}</span>
        <StatusBadge status={entry.status} />
      </div>
      <div className="mt-2">
        <div className="flex justify-between border-b border-gray-100 py-1">
          <span className="text-gray-500">Hours</span>
          <span>{entry.hours}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-gray-500">Project</span>
          <span>{entry.project}</span>
        </div>
      </div>
    </div>
  ))}
</div>
```

### 2. Expandable Sections for Dense Content

```jsx
const ExpandableSection = ({ title, children }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 bg-gray-50 flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium">{title}</span>
        <ChevronDownIcon 
          className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {isExpanded && (
        <div className="p-4 border-t">
          {children}
        </div>
      )}
    </div>
  );
};
```

## Implementation Resources

### Recommended Libraries

1. **UI Components**
   - [Headless UI](https://headlessui.dev/) - For accessible UI components
   - [Radix UI](https://www.radix-ui.com/) - For advanced components
   - [Tailwind UI](https://tailwindui.com/) - For pre-built component examples

2. **Mobile Interaction**
   - [React Swipeable](https://github.com/FormidableLabs/react-swipeable) - For swipe gestures
   - [React Hook Form](https://react-hook-form.com/) - For efficient form handling
   - [React Day Picker](https://react-day-picker.js.org/) - For calendar selection

### Quick Testing Tips

1. Use Chrome DevTools device mode for rapid testing
2. Test on actual devices periodically (iPhone, Android)
3. Enable touch events in Chrome DevTools for better simulation

## Accessibility Reminders

1. **Touch Targets**: Keep all interactive elements at minimum 44px × 44px
2. **Color Contrast**: Ensure 4.5:1 minimum contrast ratio for text
3. **Error States**: Provide clear error messages, not just color indicators
4. **Form Labels**: Always use proper labels, not just placeholders 