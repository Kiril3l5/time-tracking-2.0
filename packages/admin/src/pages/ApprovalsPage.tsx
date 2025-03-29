/**
 * ApprovalsPage
 * 
 * Admin page for managing time entry approvals, optimized for mobile.
 * 
 * NOTE: For these imports to work correctly, tsconfig.json needs path aliases configured.
 * This is a demo file that will have import errors until path aliases are set up.
 */
import { useState } from 'react';
// In a real implementation you would use path aliases:
// import MobileLayout from '../layouts/MobileAdminLayout';
// import MobileHeader from '@common/components/navigation/MobileHeader';

// For now, using relative imports for demonstration
import MobileLayout from '../layouts/MobileAdminLayout';
import MobileHeader from '../../../common/src/components/navigation/MobileHeader';

/**
 * Example time sheet approvals screen
 * 
 * Demonstrates a mobile-optimized UI for approving time entries
 */
const ApprovalsPage = () => {
  // Mock approvals data - would come from API in real app
  const [approvals, setApprovals] = useState([
    { id: 1, employee: 'Jane Smith', date: '2023-06-12', hours: 8, status: 'pending' },
    { id: 2, employee: 'John Doe', date: '2023-06-12', hours: 7.5, status: 'pending' },
    { id: 3, employee: 'Alice Johnson', date: '2023-06-11', hours: 8, status: 'pending' },
    { id: 4, employee: 'Bob Williams', date: '2023-06-11', hours: 4, status: 'pending' },
    { id: 5, employee: 'Carlos Rodriguez', date: '2023-06-10', hours: 6, status: 'pending' }
  ]);

  // Approve a time entry
  const handleApprove = (id: number) => {
    setApprovals(approvals.map(approval => 
      approval.id === id 
        ? { ...approval, status: 'approved' } 
        : approval
    ));
  };

  // Reject a time entry
  const handleReject = (id: number) => {
    setApprovals(approvals.map(approval => 
      approval.id === id 
        ? { ...approval, status: 'rejected' } 
        : approval
    ));
  };

  return (
    <MobileLayout activeRoute="/approvals">
      <MobileHeader title="Approvals" />
      
      <div className="mt-4">
        <h2 className="text-lg font-medium px-4 mb-2">Pending Approvals</h2>
        
        <div className="space-y-3">
          {approvals.map(approval => (
            <div 
              key={approval.id} 
              className={`
                bg-white dark:bg-gray-800 rounded-lg shadow p-4 mx-4
                ${approval.status === 'approved' ? 'border-l-4 border-green-500' : ''}
                ${approval.status === 'rejected' ? 'border-l-4 border-red-500' : ''}
              `}
            >
              <div className="flex justify-between">
                <div>
                  <h3 className="font-medium">{approval.employee}</h3>
                  <p className="text-sm text-gray-500">{approval.date}</p>
                </div>
                <div className="text-lg font-semibold">
                  {approval.hours}h
                </div>
              </div>
              
              {approval.status === 'pending' ? (
                <div className="mt-3 flex space-x-2 justify-end">
                  <button 
                    onClick={() => handleReject(approval.id)}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => handleApprove(approval.id)}
                    className="px-3 py-1 bg-primary-600 text-white rounded-md text-sm"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-right">
                  <span className={`
                    text-sm font-medium px-2 py-1 rounded-full
                    ${approval.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                    ${approval.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                  `}>
                    {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </MobileLayout>
  );
};

export default ApprovalsPage; 