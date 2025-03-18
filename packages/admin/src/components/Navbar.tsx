import { useAuth } from '@common';

/**
 * Navbar component for the Admin application
 */
export const Navbar = () => {
  const { user, signOut } = useAuth();
  
  return (
    <header className="bg-white border-b border-gray-200 h-16">
      <div className="px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Admin Dashboard</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
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