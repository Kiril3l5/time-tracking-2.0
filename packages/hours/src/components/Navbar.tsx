import { Link } from 'react-router-dom';
import { useAuth } from '@common';

/**
 * Navbar component for the Hours application
 */
export const Navbar = () => {
  const { user, signOut } = useAuth();
  
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-bold text-gray-800">
            Time Tracking
          </Link>
          
          <nav className="hidden md:flex items-center space-x-4">
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <Link to="/time-entries" className="text-gray-600 hover:text-gray-900">
              Time Entries
            </Link>
            <Link to="/reports" className="text-gray-600 hover:text-gray-900">
              Reports
            </Link>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 hidden md:inline">
            {user?.email}
          </span>
          
          <button
            onClick={signOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}; 