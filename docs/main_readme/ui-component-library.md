# UI Component Library

## Overview

This document outlines the UI Component Library for the Time Tracking System, providing a consistent design language across both the Admin and Hours portals. The design system emphasizes usability, accessibility, and visual consistency with the main website.

## Design Foundations

### Brand Colors

```css
--primary: #ff8d00;     /* Main accent color */
--primary-dark: #e57e00;
--primary-light: #ffa333;
--neutral-900: #1a1a1a;
--neutral-800: #333333;
--neutral-700: #4d4d4d; 
--neutral-600: #666666;
--neutral-500: #808080;
--neutral-400: #999999;
--neutral-300: #b3b3b3;
--neutral-200: #cccccc;
--neutral-100: #e6e6e6;
--neutral-50: #f5f5f5;
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;
```

### Typography

```css
/* Base font family */
font-family: "Roboto Condensed", sans-serif;

/* Font sizes */
--text-xs: 0.75rem;   /* 12px */
--text-sm: 0.875rem;  /* 14px */
--text-base: 1rem;    /* 16px */
--text-lg: 1.125rem;  /* 18px */
--text-xl: 1.25rem;   /* 20px */
--text-2xl: 1.5rem;   /* 24px */
--text-3xl: 1.875rem; /* 30px */
--text-4xl: 2.25rem;  /* 36px */
```

### Spacing

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
```

### Borders & Shadows

```css
--radius-sm: 0.125rem; /* 2px */
--radius-md: 0.25rem;  /* 4px */
--radius-lg: 0.5rem;   /* 8px */
--radius-xl: 1rem;     /* 16px */

--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
```

## Tailwind Configuration

The component library is implemented using Tailwind CSS. Below is the configuration to align with our design system:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ff8d00',
          dark: '#e57e00',
          light: '#ffa333',
        },
        neutral: {
          50: '#f5f5f5',
          100: '#e6e6e6',
          200: '#cccccc',
          300: '#b3b3b3',
          400: '#999999',
          500: '#808080',
          600: '#666666',
          700: '#4d4d4d',
          800: '#333333',
          900: '#1a1a1a',
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },
      fontFamily: {
        sans: ['"Roboto Condensed"', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
```

## Core Components

### 1. Button

Buttons provide clear interactive elements for user actions.

#### Usage

```tsx
<Button variant="primary" size="md" onClick={handleSubmit}>
  Submit Time Entry
</Button>
```

#### Variants

- **Primary**: Used for main actions, uses the #ff8d00 accent color.
- **Secondary**: Used for secondary actions, lighter variant.
- **Outline**: Border only for less emphasis.
- **Ghost**: Text only buttons for minimal visual impact.
- **Danger**: For destructive actions like delete.

#### Tailwind Implementation

```tsx
// components/Button.tsx
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-dark",
        secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
        outline: "border border-neutral-300 bg-transparent hover:bg-neutral-100",
        ghost: "bg-transparent hover:bg-neutral-100",
        danger: "bg-error text-white hover:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps 
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

### 2. Input

Form inputs for data collection aligned with our design system.

#### Usage

```tsx
<Input 
  label="Hours Worked" 
  type="number" 
  placeholder="0.00" 
  required 
  error={errors.hours} 
/>
```

#### Tailwind Implementation

```tsx
// components/Input.tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  id?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;
    
    return (
      <div className="space-y-2">
        {label && (
          <label 
            htmlFor={inputId} 
            className="block text-sm font-medium text-neutral-700"
          >
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-md border border-neutral-300 px-3 py-2 text-neutral-900
            placeholder:text-neutral-500 focus:border-primary focus:outline-none
            focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed 
            disabled:opacity-50 ${error ? 'border-error focus:border-error focus:ring-error/20' : ''}
            ${className}
          `}
          ref={ref}
          {...props}
        />
        {error && <p className="text-error text-sm">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
```

### 3. Card

Container component for grouping related content.

#### Usage

```tsx
<Card>
  <Card.Header>
    <Card.Title>Weekly Time Summary</Card.Title>
    <Card.Description>Your time entries for the current week</Card.Description>
  </Card.Header>
  <Card.Content>
    {/* Time entry content */}
  </Card.Content>
  <Card.Footer>
    <Button>Submit for Approval</Button>
  </Card.Footer>
</Card>
```

#### Tailwind Implementation

```tsx
// components/Card.tsx
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = ({ className, ...props }: CardProps) => {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  );
};

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={`p-6 ${className}`} {...props} />;
};

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
  return <h3 className={`text-lg font-medium ${className}`} {...props} />;
};

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => {
  return <p className={`text-sm text-neutral-600 ${className}`} {...props} />;
};

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={`p-6 pt-0 ${className}`} {...props} />;
};

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={`flex items-center p-6 pt-0 ${className}`}
      {...props}
    />
  );
};

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export { Card };
```

### 4. Table

For displaying structured data like time entries and reports.

#### Usage

```tsx
<Table>
  <Table.Header>
    <Table.Row>
      <Table.Head>Date</Table.Head>
      <Table.Head>Project</Table.Head>
      <Table.Head>Hours</Table.Head>
      <Table.Head>Status</Table.Head>
      <Table.Head>Actions</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {timeEntries.map((entry) => (
      <Table.Row key={entry.id}>
        <Table.Cell>{formatDate(entry.date)}</Table.Cell>
        <Table.Cell>{entry.project}</Table.Cell>
        <Table.Cell>{entry.hours}</Table.Cell>
        <Table.Cell>
          <Badge variant={getBadgeVariant(entry.status)}>
            {entry.status}
          </Badge>
        </Table.Cell>
        <Table.Cell>
          <Button variant="ghost" size="sm">Edit</Button>
        </Table.Cell>
      </Table.Row>
    ))}
  </Table.Body>
</Table>
```

#### Tailwind Implementation

```tsx
// components/Table.tsx
import React from 'react';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => {
    return (
      <div className="w-full overflow-auto">
        <table
          ref={ref}
          className={`w-full caption-bottom border-collapse ${className}`}
          {...props}
        />
      </div>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={`${className}`} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={`${className}`}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={`border-b border-neutral-200 transition-colors hover:bg-neutral-50 ${className}`}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={`h-12 px-4 text-left align-middle font-medium text-neutral-700 [&:has([role=checkbox])]:pr-0 ${className}`}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${className}`}
    {...props}
  />
));
TableCell.displayName = "TableCell";

Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Head = TableHead;
Table.Cell = TableCell;

export { Table };
```

### 5. Badge

For displaying status indicators like approval state.

#### Usage

```tsx
<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Rejected</Badge>
```

#### Tailwind Implementation

```tsx
// components/Badge.tsx
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-neutral-100 text-neutral-800",
        primary: "bg-primary/10 text-primary-dark",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-error/10 text-error",
        info: "bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={badgeVariants({ variant, className })} {...props} />
  );
}

export { Badge, badgeVariants };
```

### 6. DatePicker

Critical for the time tracking application.

#### Usage

```tsx
<DatePicker 
  label="Date" 
  value={date} 
  onChange={setDate} 
  required 
/>
```

#### Tailwind Implementation

```tsx
// components/DatePicker.tsx
import React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Button } from './Button';
import { Calendar } from './Calendar';

interface DatePickerProps {
  label?: string;
  value?: Date;
  onChange: (date: Date | undefined) => void;
  required?: boolean;
  error?: string;
}

export function DatePicker({ label, value, onChange, required, error }: DatePickerProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`w-full justify-start text-left font-normal ${
              !value && "text-neutral-500"
            } ${error ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP") : "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {error && <p className="text-error text-sm">{error}</p>}
    </div>
  );
}
```

### 7. Select

Dropdown menus for project selection and filtering.

#### Usage

```tsx
<Select 
  label="Project" 
  options={projects} 
  value={selectedProject} 
  onChange={setSelectedProject} 
  required 
/>
```

#### Tailwind Implementation

```tsx
// components/Select.tsx
import React from 'react';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  required,
  error,
  disabled,
}: SelectProps) {
  const id = React.useId();
  
  return (
    <div className="space-y-2">
      {label && (
        <label 
          htmlFor={id}
          className="block text-sm font-medium text-neutral-700"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`
          w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900
          focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
          disabled:cursor-not-allowed disabled:opacity-50
          ${error ? 'border-error focus:border-error focus:ring-error/20' : ''}
        `}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-error text-sm">{error}</p>}
    </div>
  );
}
```

### 8. Alert

For notifications and feedback messages.

#### Usage

```tsx
<Alert variant="success">
  <AlertTitle>Success</AlertTitle>
  <AlertDescription>
    Your time entries have been submitted for approval.
  </AlertDescription>
</Alert>
```

#### Tailwind Implementation

```tsx
// components/Alert.tsx
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const alertVariants = cva(
  "relative w-full rounded-lg border p-4",
  {
    variants: {
      variant: {
        default: "bg-white border-neutral-200 text-neutral-900",
        success: "bg-success/10 border-success/20 text-success",
        warning: "bg-warning/10 border-warning/20 text-warning",
        danger: "bg-error/10 border-error/20 text-error",
        info: "bg-info/10 border-info/20 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={alertVariants({ variant, className })}
        {...props}
      />
    );
  }
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={`mb-1 font-medium leading-none tracking-tight ${className}`}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`text-sm [&_p]:leading-relaxed ${className}`}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

Alert.Title = AlertTitle;
Alert.Description = AlertDescription;

export { Alert };
```

## Specialized Time Tracking Components

### 1. TimeEntryForm

A specialized component for recording time entries.

```tsx
// components/TimeEntryForm.tsx
import React from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { DatePicker } from './DatePicker';
import { Checkbox } from './Checkbox';
import { Textarea } from './Textarea';

interface TimeEntryFormProps {
  onSubmit: (data: TimeEntryFormData) => void;
  projects: { label: string; value: string }[];
  loading?: boolean;
  initialValues?: Partial<TimeEntryFormData>;
}

interface TimeEntryFormData {
  date: Date;
  projectId: string;
  hours: number;
  description: string;
  isTimeOff: boolean;
}

export function TimeEntryForm({
  onSubmit,
  projects,
  loading = false,
  initialValues,
}: TimeEntryFormProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    initialValues?.date || new Date()
  );
  const [projectId, setProjectId] = React.useState<string>(
    initialValues?.projectId || ''
  );
  const [hours, setHours] = React.useState<string>(
    initialValues?.hours?.toString() || ''
  );
  const [description, setDescription] = React.useState<string>(
    initialValues?.description || ''
  );
  const [isTimeOff, setIsTimeOff] = React.useState<boolean>(
    initialValues?.isTimeOff || false
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Record<string, string> = {};
    
    if (!date) newErrors.date = "Date is required";
    if (!projectId) newErrors.projectId = "Project is required";
    if (!hours) {
      newErrors.hours = "Hours are required";
    } else if (isNaN(parseFloat(hours)) || parseFloat(hours) <= 0) {
      newErrors.hours = "Hours must be a positive number";
    } else if (parseFloat(hours) > 24) {
      newErrors.hours = "Hours cannot exceed 24";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    onSubmit({
      date: date!,
      projectId,
      hours: parseFloat(hours),
      description,
      isTimeOff,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DatePicker
          label="Date"
          value={date}
          onChange={setDate}
          required
          error={errors.date}
        />
        
        <Select
          label="Project"
          options={projects}
          value={projectId}
          onChange={setProjectId}
          required
          error={errors.projectId}
          disabled={isTimeOff}
        />
      </div>
      
      <Input
        label="Hours"
        type="number"
        step="0.25"
        min="0.25"
        max="24"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        required
        error={errors.hours}
      />
      
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What did you work on?"
      />
      
      <Checkbox
        label="This is time off (vacation, sick, etc.)"
        checked={isTimeOff}
        onChange={(checked) => {
          setIsTimeOff(checked);
          if (checked) setProjectId('');
        }}
      />
      
      <div className="flex justify-end">
        <Button type="submit" isLoading={loading}>
          Save Time Entry
        </Button>
      </div>
    </form>
  );
}
```

### 2. WeeklyTimeSheet

A weekly view for time entries.

```tsx
// components/WeeklyTimeSheet.tsx
import React from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Card } from './Card';
import { Table } from './Table';
import { Badge } from './Badge';
import { Button } from './Button';

interface TimeEntry {
  id: string;
  date: Date;
  projectName: string;
  hours: number;
  description: string;
  isTimeOff: boolean;
  status: 'pending' | 'approved' | 'rejected';
}

interface WeeklyTimeSheetProps {
  startDate: Date;
  timeEntries: TimeEntry[];
  onAddEntry: (date: Date) => void;
  onEditEntry: (id: string) => void;
  onSubmitForApproval: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
}

export function WeeklyTimeSheet({
  startDate,
  timeEntries,
  onAddEntry,
  onEditEntry,
  onSubmitForApproval,
  isSubmitting,
  canSubmit,
}: WeeklyTimeSheetProps) {
  const weekStart = startOfWeek(startDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Group time entries by day
  const entriesByDay = weekDays.map(day => ({
    date: day,
    entries: timeEntries.filter(entry => isSameDay(entry.date, day)),
    totalHours: timeEntries
      .filter(entry => isSameDay(entry.date, day))
      .reduce((sum, entry) => sum + entry.hours, 0),
  }));
  
  const totalWeekHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  
  return (
    <Card className="shadow-md">
      <Card.Header>
        <div className="flex items-center justify-between">
          <Card.Title>Weekly Timesheet</Card.Title>
          <div className="text-sm text-neutral-500">
            Week of {format(weekStart, 'MMM d, yyyy')}
          </div>
        </div>
        <Card.Description className="flex justify-between items-center mt-2">
          <span>Total Hours: <span className="font-bold">{totalWeekHours}</span></span>
          <Button 
            onClick={onSubmitForApproval} 
            isLoading={isSubmitting}
            disabled={!canSubmit}
          >
            Submit for Approval
          </Button>
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {entriesByDay.map(({ date, entries, totalHours }) => (
          <div key={date.toISOString()} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">
                {format(date, 'EEEE, MMM d')}
                <span className="ml-2 text-sm text-neutral-500">
                  ({totalHours} hours)
                </span>
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddEntry(date)}
              >
                Add Entry
              </Button>
            </div>
            
            {entries.length > 0 ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Project</Table.Head>
                    <Table.Head>Hours</Table.Head>
                    <Table.Head>Description</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head className="w-24"></Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {entries.map((entry) => (
                    <Table.Row key={entry.id}>
                      <Table.Cell>
                        {entry.isTimeOff ? (
                          <span className="italic">Time Off</span>
                        ) : (
                          entry.projectName
                        )}
                      </Table.Cell>
                      <Table.Cell>{entry.hours}</Table.Cell>
                      <Table.Cell className="max-w-sm truncate">
                        {entry.description || "-"}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          variant={
                            entry.status === "approved"
                              ? "success"
                              : entry.status === "rejected"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {entry.status === "approved"
                            ? "Approved"
                            : entry.status === "rejected"
                            ? "Rejected"
                            : "Pending"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditEntry(entry.id)}
                          disabled={entry.status === "approved"}
                        >
                          Edit
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <div className="text-center py-8 bg-neutral-50 rounded-md border border-dashed border-neutral-200">
                <p className="text-neutral-500">No time entries for this day</p>
              </div>
            )}
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
```

## Responsive Design Guidelines

The UI components are designed to be fully responsive across all device sizes:

1. **Mobile-First Approach**: 
   - All components are designed for mobile first and scale up to larger screens
   - Default styling targets small screens, with breakpoints for larger screens

2. **Breakpoints**:
   - sm: 640px (small devices)
   - md: 768px (medium devices)
   - lg: 1024px (large devices)
   - xl: 1280px (extra-large devices)
   - 2xl: 1536px (wide screens)

3. **Component Adaptations**:
   - Tables become scrollable on small screens
   - Forms stack vertically on mobile and use grid layouts on larger screens
   - Navigation condenses to a hamburger menu on mobile screens

## Accessibility Guidelines

1. **Keyboard Navigation**:
   - All interactive elements are navigable via keyboard
   - Visible focus states on all interactive elements
   - Logical tabbing order preserved

2. **Screen Reader Support**:
   - ARIA attributes used appropriately
   - Semantic HTML elements for proper structure
   - Descriptive labels for form inputs

3. **Color Contrast**:
   - Text meets WCAG AA standards (min 4.5:1 for regular text, 3:1 for large text)
   - Interactive elements have sufficient contrast
   - Color not used as the only means of conveying information

## Implementation Guide

1. **Component Library Setup**:
   ```bash
   # Install required dependencies
   npm install class-variance-authority lucide-react date-fns
   
   # For form validation (optional)
   npm install react-hook-form zod
   ```

2. **Global Styles**:
   ```jsx
   // app/styles/globals.css
   @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;500;600;700&display=swap');
   
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   
   :root {
     --primary: #ff8d00;
     --primary-dark: #e57e00;
     --primary-light: #ffa333;
     /* Add other design tokens here */
   }
   
   html, body {
     font-family: "Roboto Condensed", sans-serif;
   }
   ```

3. **Component Export**:
   ```jsx
   // components/index.ts
   export * from './Alert';
   export * from './Badge';
   export * from './Button';
   export * from './Card';
   export * from './DatePicker';
   export * from './Input';
   export * from './Select';
   export * from './Table';
   export * from './TimeEntryForm';
   export * from './WeeklyTimeSheet';
   // export other components
   ```

## Conclusion

This UI Component Library provides a consistent, accessible, and visually appealing user interface for the Time Tracking System. By following the design foundations and using the provided Tailwind implementations, developers can quickly build screens that match the design system and maintain consistency between the admin and hours portals. The library uses the specified accent color (#ff8d00) and font family ("Roboto Condensed") to keep visual consistency across all components.
