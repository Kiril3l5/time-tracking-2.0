/**
 * TimeEntryPage
 * 
 * Hours portal page for time entry, optimized for mobile.
 * 
 * NOTE: For these imports to work correctly, tsconfig.json needs path aliases configured.
 * This is a demo file that will have import errors until path aliases are set up.
 */
import React, { useState } from 'react';
// In a real implementation you would use path aliases:
// import MobileLayout from '../layouts/MobileHoursLayout';
// import MobileHeader from '@common/components/navigation/MobileHeader';

// For now, using relative imports for demonstration
import MobileLayout from '../layouts/MobileHoursLayout';
import MobileHeader from '../../../common/src/components/navigation/MobileHeader';

/**
 * Example time entry screen
 * 
 * Demonstrates a mobile-optimized UI for entering time
 */
const TimeEntryPage = () => {
  // Mock projects data - would come from API in real app
  const projects = [
    { id: 1, name: 'Website Redesign' },
    { id: 2, name: 'Mobile App Development' },
    { id: 3, name: 'Backend API Integration' },
    { id: 4, name: 'Client Presentations' },
  ];

  // State for time entry form
  const [timeEntries, setTimeEntries] = useState([
    { id: 1, date: '2023-06-12', project: 1, hours: 2, description: 'Home page redesign', saved: true },
    { id: 2, date: '2023-06-12', project: 3, hours: 1.5, description: 'API testing', saved: true },
  ]);
  
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    project: 1,
    hours: 0,
    description: '',
  });

  // Add a new time entry
  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setTimeEntries([
      ...timeEntries,
      { 
        id: timeEntries.length + 1, 
        date: newEntry.date, 
        project: newEntry.project, 
        hours: newEntry.hours, 
        description: newEntry.description,
        saved: true,
      }
    ]);
    
    // Reset form
    setNewEntry({
      ...newEntry,
      hours: 0,
      description: '',
    });
  };

  return (
    <MobileLayout activeRoute="/time-entry">
      <MobileHeader title="Time Entry" />
      
      <div className="mt-4 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h2 className="text-lg font-medium mb-4">Add Time Entry</h2>
          
          <form onSubmit={handleAddEntry}>
            <div className="mb-3">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date
              </label>
              <input
                type="date"
                id="date"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700"
                value={newEntry.date}
                onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                required
              />
            </div>
            
            <div className="mb-3">
              <label htmlFor="project" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <select
                id="project"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700"
                value={newEntry.project}
                onChange={(e) => setNewEntry({ ...newEntry, project: Number(e.target.value) })}
                required
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="mb-3">
              <label htmlFor="hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hours
              </label>
              <input
                type="number"
                id="hours"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700"
                min="0.5"
                step="0.5"
                value={newEntry.hours || ''}
                onChange={(e) => setNewEntry({ ...newEntry, hours: Number(e.target.value) })}
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="description"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700"
                rows={2}
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
              ></textarea>
            </div>
            
            <button
              type="submit"
              className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Add Time Entry
            </button>
          </form>
        </div>
        
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2">Today's Entries</h2>
          
          <div className="space-y-3">
            {timeEntries.map(entry => (
              <div 
                key={entry.id} 
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-primary-500"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">
                      {projects.find(p => p.id === entry.project)?.name}
                    </h3>
                    <p className="text-sm text-gray-500">{entry.description}</p>
                  </div>
                  <div className="text-lg font-semibold">
                    {entry.hours}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default TimeEntryPage; 