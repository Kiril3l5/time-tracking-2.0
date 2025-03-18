import { Link } from 'react-router-dom';

/**
 * Sidebar navigation component for the Admin application
 */
export const Sidebar = () => {
  return (
    <div className="w-64 h-full bg-gray-800 text-white">
      <div className="p-4">
        <h1 className="text-xl font-bold">Time Tracking Admin</h1>
      </div>
      <nav className="mt-6">
        <ul>
          <li>
            <Link 
              to="/" 
              className="flex items-center px-4 py-2 hover:bg-gray-700"
            >
              <span className="ml-2">Dashboard</span>
            </Link>
          </li>
          <li>
            <Link 
              to="/team" 
              className="flex items-center px-4 py-2 hover:bg-gray-700"
            >
              <span className="ml-2">Team Management</span>
            </Link>
          </li>
          <li>
            <Link 
              to="/approvals" 
              className="flex items-center px-4 py-2 hover:bg-gray-700"
            >
              <span className="ml-2">Time Approvals</span>
            </Link>
          </li>
          <li>
            <Link 
              to="/reports" 
              className="flex items-center px-4 py-2 hover:bg-gray-700"
            >
              <span className="ml-2">Reports</span>
            </Link>
          </li>
          <li>
            <Link 
              to="/settings" 
              className="flex items-center px-4 py-2 hover:bg-gray-700"
            >
              <span className="ml-2">Settings</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}; 