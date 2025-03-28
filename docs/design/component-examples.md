# Component Examples

*Last updated: May 2024*

This document provides practical examples of components built using our design system. These examples demonstrate how to apply the design principles and utility classes to create consistent UIs across both the `/hours` and `/admin` portals.

## Basic Components

### Buttons

Buttons follow a consistent pattern with different variants based on importance.

#### Button Variants

```html
<!-- Primary Button (Amber) -->
<button class="btn btn-primary">
  Submit
</button>

<!-- Secondary Button (Cool Gray) -->
<button class="btn btn-secondary">
  Cancel
</button>

<!-- Outline Button -->
<button class="btn btn-outline">
  View Details
</button>

<!-- Ghost Button -->
<button class="btn btn-ghost">
  Skip
</button>
```

**CSS Classes:**

```css
.btn {
  @apply px-4 py-2 rounded-md font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-500;
}

.btn-secondary {
  @apply bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500;
}

.btn-outline {
  @apply border border-primary-500 text-primary-600 hover:bg-primary-50 focus:ring-primary-500;
}

.btn-ghost {
  @apply text-secondary-600 hover:bg-secondary-100 focus:ring-secondary-400;
}
```

#### Button Sizes

```html
<!-- Small Button -->
<button class="btn btn-primary btn-sm">
  Small
</button>

<!-- Default Button -->
<button class="btn btn-primary">
  Default
</button>

<!-- Large Button -->
<button class="btn btn-primary btn-lg">
  Large
</button>
```

**CSS Classes:**

```css
.btn-sm {
  @apply px-3 py-1 text-sm;
}

.btn {
  /* Default size styles are in the base .btn class */
}

.btn-lg {
  @apply px-6 py-3 text-lg;
}
```

#### Button with Icon

```html
<!-- Button with leading icon -->
<button class="btn btn-primary inline-flex items-center">
  <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
    <!-- SVG path -->
  </svg>
  Save
</button>

<!-- Button with trailing icon -->
<button class="btn btn-primary inline-flex items-center">
  Next
  <svg class="w-5 h-5 ml-2" fill="currentColor" viewBox="0 0 20 20">
    <!-- SVG path -->
  </svg>
</button>

<!-- Icon-only button -->
<button class="btn btn-primary p-2">
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <!-- SVG path -->
  </svg>
</button>
```

### Cards

Cards are used to group related content.

#### Basic Card

```html
<div class="card">
  <div class="card-body">
    <h3 class="card-title">Card Title</h3>
    <p class="card-text">This is a basic card with some content. Cards are used to group related information.</p>
    <button class="btn btn-primary mt-4">Action</button>
  </div>
</div>
```

**CSS Classes:**

```css
.card {
  @apply bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden;
}

.card-body {
  @apply p-6;
}

.card-title {
  @apply text-lg font-semibold text-neutral-900 mb-2;
}

.card-text {
  @apply text-neutral-700;
}
```

#### Card with Header

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-header-title">Team Members</h3>
  </div>
  <div class="card-body">
    <ul class="card-list">
      <li class="card-list-item">
        <div class="flex items-center">
          <img src="avatar.jpg" alt="User avatar" class="h-10 w-10 rounded-full mr-3">
          <div>
            <p class="font-medium">Jane Smith</p>
            <p class="text-sm text-neutral-500">Product Manager</p>
          </div>
        </div>
      </li>
      <li class="card-list-item">
        <div class="flex items-center">
          <img src="avatar.jpg" alt="User avatar" class="h-10 w-10 rounded-full mr-3">
          <div>
            <p class="font-medium">John Doe</p>
            <p class="text-sm text-neutral-500">Developer</p>
          </div>
        </div>
      </li>
    </ul>
  </div>
  <div class="card-footer">
    <button class="btn btn-outline">View All</button>
  </div>
</div>
```

**CSS Classes:**

```css
.card-header {
  @apply px-6 py-4 border-b border-neutral-200 bg-neutral-50;
}

.card-header-title {
  @apply text-lg font-medium text-neutral-900;
}

.card-list {
  @apply divide-y divide-neutral-200;
}

.card-list-item {
  @apply py-3;
}

.card-footer {
  @apply px-6 py-4 bg-neutral-50 border-t border-neutral-200;
}
```

#### Interactive Card

```html
<div class="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow duration-200">
  <h3 class="text-heading-4 mb-2">Interactive Card</h3>
  <p class="text-body-sm text-neutral-600 mb-4">
    This card has hover and active states to indicate interactivity.
  </p>
  <div class="flex justify-between items-center">
    <span class="text-primary-500">View details</span>
    <svg class="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
      <!-- Arrow icon SVG path -->
    </svg>
  </div>
</div>
```

## Form Elements

### Text Input

```html
<!-- Default Input -->
<div class="form-group">
  <label for="name" class="form-label">Name</label>
  <input type="text" id="name" class="form-input" placeholder="Enter your name">
</div>

<!-- Input with Error -->
<div class="form-group">
  <label for="email" class="form-label">Email</label>
  <input type="email" id="email" class="form-input form-input-error" value="invalid-email">
  <p class="form-error">Please enter a valid email address</p>
</div>
```

**CSS Classes:**

```css
.form-group {
  @apply mb-4;
}

.form-label {
  @apply block text-sm font-medium text-neutral-700 mb-1;
}

.form-input {
  @apply block w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm placeholder-neutral-400
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500;
}

.form-input-error {
  @apply border-error-500 focus:ring-error-500 focus:border-error-500;
}

.form-error {
  @apply mt-1 text-sm text-error-600;
}
```

### Select Box

```html
<div class="form-group">
  <label for="country" class="form-label">Country</label>
  <select id="country" class="form-select">
    <option value="">Select a country</option>
    <option value="us">United States</option>
    <option value="ca">Canada</option>
    <option value="mx">Mexico</option>
  </select>
</div>
```

**CSS Classes:**

```css
.form-select {
  @apply block w-full px-3 py-2 border border-neutral-300 bg-white rounded-md shadow-sm 
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500;
}
```

### Checkbox and Radio

```html
<!-- Checkbox -->
<div class="form-checkbox-group">
  <input type="checkbox" id="notifications" class="form-checkbox">
  <label for="notifications" class="form-checkbox-label">
    Receive email notifications
  </label>
</div>

<!-- Radio Button -->
<div class="form-radio-group">
  <input type="radio" id="weekly" name="digest" class="form-radio">
  <label for="weekly" class="form-radio-label">
    Weekly digest
  </label>
</div>
<div class="form-radio-group">
  <input type="radio" id="daily" name="digest" class="form-radio">
  <label for="daily" class="form-radio-label">
    Daily digest
  </label>
</div>
```

**CSS Classes:**

```css
.form-checkbox-group, .form-radio-group {
  @apply flex items-start mb-2;
}

.form-checkbox, .form-radio {
  @apply h-4 w-4 text-primary-600 border-neutral-300 focus:ring-primary-500 mt-1 mr-2;
}

.form-checkbox {
  @apply rounded;
}

.form-radio {
  @apply rounded-full;
}

.form-checkbox-label, .form-radio-label {
  @apply text-sm text-neutral-700;
}
```

### Textarea

```html
<div class="form-group">
  <label for="description" class="form-label">Description</label>
  <textarea id="description" class="form-textarea" rows="3" placeholder="Enter a description"></textarea>
</div>
```

**CSS Classes:**

```css
.form-textarea {
  @apply block w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm placeholder-neutral-400
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500;
}
```

## Application-Specific Components

### Time Entry Card (Hours Portal)

```html
<div class="time-entry-card">
  <div class="time-entry-card-header">
    <div>
      <h3 class="time-entry-card-title">Project Alpha</h3>
      <p class="time-entry-card-subtitle">Development</p>
    </div>
    <div class="time-entry-card-time">
      <p class="time-entry-card-duration">3:45</p>
      <span class="badge badge-success">Billable</span>
    </div>
  </div>
  <div class="time-entry-card-content">
    <p class="time-entry-card-description">
      Working on new features for the dashboard interface including data visualization components.
    </p>
  </div>
  <div class="time-entry-card-footer">
    <div class="time-entry-card-date">May 15, 2024</div>
    <div class="time-entry-card-actions">
      <button class="btn-icon">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>
      <button class="btn-icon text-error-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
</div>
```

**CSS Classes:**

```css
.time-entry-card {
  @apply bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden mb-4;
}

.time-entry-card-header {
  @apply px-6 py-4 flex justify-between items-center;
}

.time-entry-card-title {
  @apply text-lg font-medium text-neutral-900;
}

.time-entry-card-subtitle {
  @apply text-sm text-neutral-500;
}

.time-entry-card-time {
  @apply flex flex-col items-end;
}

.time-entry-card-duration {
  @apply text-lg font-semibold text-primary-600;
}

.time-entry-card-content {
  @apply px-6 py-3 border-t border-b border-neutral-200;
}

.time-entry-card-description {
  @apply text-sm text-neutral-700;
}

.time-entry-card-footer {
  @apply px-6 py-3 flex justify-between items-center;
}

.time-entry-card-date {
  @apply text-sm text-neutral-500;
}

.time-entry-card-actions {
  @apply flex space-x-2;
}
```

### User Management Table (Admin Portal)

```html
<div class="table-container">
  <div class="table-header">
    <h2 class="table-title">Users</h2>
    <button class="btn btn-primary">Add User</button>
  </div>
  <table class="table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Last Active</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="table-user-cell">
          <img src="avatar.jpg" alt="User avatar" class="h-10 w-10 rounded-full mr-3">
          <div>
            <p class="font-medium">John Doe</p>
            <p class="text-xs text-neutral-500">ID: 12345</p>
          </div>
        </td>
        <td>john.doe@example.com</td>
        <td>Admin</td>
        <td>Today at 2:30 PM</td>
        <td><span class="badge badge-success">Active</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon btn-icon-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
              </svg>
            </button>
            <button class="btn-icon btn-icon-sm">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button class="btn-icon btn-icon-sm text-error-600">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      <!-- Additional rows would be here -->
    </tbody>
  </table>
</div>
```

**CSS Classes:**

```css
.table-header {
  @apply px-6 py-4 flex justify-between items-center border-b border-neutral-200;
}

.table-title {
  @apply text-lg font-medium text-neutral-900;
}

.table-user-cell {
  @apply flex items-center;
}

.table-actions {
  @apply flex space-x-2;
}
```

## Status and Feedback Elements

### Alert Messages

```html
<!-- Success alert -->
<div class="bg-success-50 border-l-4 border-success-500 p-4 mb-4">
  <div class="flex">
    <div class="flex-shrink-0">
      <svg class="h-5 w-5 text-success-500" viewBox="0 0 20 20" fill="currentColor">
        <!-- Success icon -->
      </svg>
    </div>
    <div class="ml-3">
      <p class="text-body-sm font-medium text-success-700">
        Time entry successfully saved.
      </p>
    </div>
  </div>
</div>

<!-- Warning alert -->
<div class="bg-warning-50 border-l-4 border-warning-500 p-4 mb-4">
  <div class="flex">
    <div class="flex-shrink-0">
      <svg class="h-5 w-5 text-warning-500" viewBox="0 0 20 20" fill="currentColor">
        <!-- Warning icon -->
      </svg>
    </div>
    <div class="ml-3">
      <p class="text-body-sm font-medium text-warning-700">
        Please complete your timesheet before the end of the month.
      </p>
    </div>
  </div>
</div>

<!-- Error alert -->
<div class="bg-error-50 border-l-4 border-error-500 p-4 mb-4">
  <div class="flex">
    <div class="flex-shrink-0">
      <svg class="h-5 w-5 text-error-500" viewBox="0 0 20 20" fill="currentColor">
        <!-- Error icon -->
      </svg>
    </div>
    <div class="ml-3">
      <p class="text-body-sm font-medium text-error-700">
        Failed to submit timesheet. Please try again.
      </p>
    </div>
  </div>
</div>

<!-- Info alert -->
<div class="bg-info-50 border-l-4 border-info-500 p-4 mb-4">
  <div class="flex">
    <div class="flex-shrink-0">
      <svg class="h-5 w-5 text-info-500" viewBox="0 0 20 20" fill="currentColor">
        <!-- Info icon -->
      </svg>
    </div>
    <div class="ml-3">
      <p class="text-body-sm font-medium text-info-700">
        Remember to submit your timesheet by Friday.
      </p>
    </div>
  </div>
</div>
```

### Badges/Pills

```html
<!-- Standard badge -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
  Badge
</span>

<!-- Success badge -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-700">
  Completed
</span>

<!-- Warning badge -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-700">
  Pending
</span>

<!-- Error badge -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-error-100 text-error-700">
  Failed
</span>

<!-- Info badge -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-info-100 text-info-700">
  New
</span>
```

## Navigation Components

### Tabs

```html
<div class="tabs">
  <div class="tabs-list">
    <button class="tabs-item tabs-item-active">Overview</button>
    <button class="tabs-item">Analytics</button>
    <button class="tabs-item">Settings</button>
    <button class="tabs-item">Notifications</button>
  </div>
  <div class="tabs-content">
    <div class="tabs-panel">
      <div class="p-4">
        <h3 class="text-lg font-medium text-neutral-900">Overview Panel</h3>
        <p class="mt-2 text-neutral-700">
          This is the overview tab content. You can put any content here.
        </p>
      </div>
    </div>
  </div>
</div>
```

**CSS Classes:**

```css
.tabs {
  @apply border border-neutral-200 rounded-lg overflow-hidden;
}

.tabs-list {
  @apply flex border-b border-neutral-200;
}

.tabs-item {
  @apply px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700 focus:outline-none whitespace-nowrap;
}

.tabs-item-active {
  @apply text-primary-600 border-b-2 border-primary-500;
}

.tabs-content {
  @apply bg-white;
}

.tabs-panel {
  @apply p-4;
}
```

### Breadcrumbs

```html
<nav class="flex" aria-label="Breadcrumb">
  <ol class="flex items-center space-x-4">
    <li>
      <div>
        <a href="#" class="text-neutral-500 hover:text-neutral-700">
          <svg class="flex-shrink-0 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <!-- Home icon -->
          </svg>
          <span class="sr-only">Home</span>
        </a>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <svg class="flex-shrink-0 h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <!-- Chevron right icon -->
        </svg>
        <a href="#" class="ml-4 text-body-sm text-neutral-500 hover:text-neutral-700">Projects</a>
      </div>
    </li>
    <li>
      <div class="flex items-center">
        <svg class="flex-shrink-0 h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <!-- Chevron right icon -->
        </svg>
        <span class="ml-4 text-body-sm text-neutral-700 font-medium" aria-current="page">Project Alpha</span>
      </div>
    </li>
  </ol>
</nav>
```

## Responsive Patterns

### Responsive Card Grid

```html
<div class="responsive-grid">
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Card 1</h3>
      <p class="card-text">Content for card 1</p>
    </div>
  </div>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Card 2</h3>
      <p class="card-text">Content for card 2</p>
    </div>
  </div>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Card 3</h3>
      <p class="card-text">Content for card 3</p>
    </div>
  </div>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Card 4</h3>
      <p class="card-text">Content for card 4</p>
    </div>
  </div>
</div>
```

**CSS Classes:**

```css
.responsive-grid {
  @apply grid gap-6;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
```

### Mobile Navigation Menu

```html
<div class="mobile-nav-container">
  <div class="mobile-nav-header">
    <button class="mobile-nav-toggle">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <div class="mobile-nav-logo">
      <img src="logo.svg" alt="Company Logo" class="h-8">
    </div>
    <div class="mobile-nav-actions">
      <button class="btn-icon">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>
    </div>
  </div>
  <div class="mobile-nav-menu hidden">
    <ul class="mobile-nav-list">
      <li class="mobile-nav-item mobile-nav-item-active">
        <a href="#" class="mobile-nav-link">
          Dashboard
        </a>
      </li>
      <li class="mobile-nav-item">
        <a href="#" class="mobile-nav-link">
          Projects
        </a>
      </li>
      <li class="mobile-nav-item">
        <a href="#" class="mobile-nav-link">
          Time Entries
        </a>
      </li>
      <li class="mobile-nav-item">
        <a href="#" class="mobile-nav-link">
          Reports
        </a>
      </li>
      <li class="mobile-nav-item">
        <a href="#" class="mobile-nav-link">
          Settings
        </a>
      </li>
    </ul>
  </div>
</div>
```

**CSS Classes:**

```css
.mobile-nav-container {
  @apply bg-white shadow;
}

.mobile-nav-header {
  @apply flex items-center justify-between p-4;
}

.mobile-nav-toggle {
  @apply text-neutral-500;
}

.mobile-nav-logo {
  @apply flex-1 flex justify-center;
}

.mobile-nav-actions {
  @apply flex;
}

.mobile-nav-menu {
  @apply border-t border-neutral-200;
}

.mobile-nav-list {
  @apply divide-y divide-neutral-200;
}

.mobile-nav-item {
  @apply block;
}

.mobile-nav-link {
  @apply block px-4 py-3 text-neutral-600 hover:bg-neutral-50;
}

.mobile-nav-item-active .mobile-nav-link {
  @apply text-primary-600 bg-primary-50;
}
```

## Best Practices

1. **Maintain Consistency**: Always use the design tokens and components defined in the design system.
2. **Responsive Design**: Test all components across different screen sizes.
3. **Accessibility**: Ensure proper contrast ratios, focus states, and semantic HTML.
4. **Component Composition**: Build complex components by composing simpler ones.
5. **Contextual Usage**: Consider the portal context (Hours vs Admin) when implementing components.

This document will be regularly updated as the design system evolves. 